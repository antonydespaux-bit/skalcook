import type { SupabaseClient } from '@supabase/supabase-js'
import { convertirUnite } from '../constants'

// Réquisitions — effets sur le stock et le food cost.
//
// Une réquisition livrée depuis le stock cuisine (ou bar) est une SORTIE :
//   * stock théorique : elle se retranche, comme une consommation, des
//     ingrédients servis depuis le dernier inventaire validé ;
//   * food cost (cuisine) : c'est une CESSION interne — la marchandise quitte
//     la cuisine pour un autre service (étages, spa, bar…). Sa valeur HT
//     figée à la livraison est retirée du coût matière de la cuisine.
// Un bon entre deux services qui servent le même stock (ex. Cuisine →
// Pâtisserie, tous deux « cuisine ») est un mouvement interne : ni sortie ni
// cession.

type Section = 'cuisine' | 'bar'

type BonLivre = { id: string; service_demandeur_id: string }
type LigneLivree = { requisition_id: string; ingredient_id: string | null; unite: string; quantite_livree: number | string | null; valeur: number | string | null }

/** Jour suivant une date ISO (AAAA-MM-JJ), en UTC. */
export function lendemain(jour: string): string {
  const d = new Date(`${jour}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

// ── Règles pures (testées dans lib/__tests__/requisitionsStock.test.ts) ──

/** Bons qui font vraiment sortir la marchandise du stock (receveur hors de ce stock). */
export function bonsSortants(bons: BonLivre[], stockParService: Map<string, string>, section: Section): Set<string> {
  return new Set(bons.filter((b) => stockParService.get(b.service_demandeur_id) !== section).map((b) => b.id))
}

/** Quantités sorties par ingrédient, converties dans l'unité de l'ingrédient. */
export function cumulerSorties(
  lignes: LigneLivree[],
  sortants: Set<string>,
  uniteIngredient: Map<string, string>,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const l of lignes) {
    if (!l.ingredient_id || !sortants.has(l.requisition_id)) continue
    const qte = Number(l.quantite_livree) || 0
    if (qte === 0) continue
    const cible = uniteIngredient.get(l.ingredient_id)
    let q = qte
    if (cible && l.unite !== cible) {
      const c = convertirUnite(qte, l.unite, cible)
      if (c != null) q = c
    }
    out[l.ingredient_id] = (out[l.ingredient_id] || 0) + q
  }
  return out
}

/** Valeur HT cumulée des lignes des bons sortants. */
export function sommeCessions(lignes: LigneLivree[], sortants: Set<string>): number {
  const total = lignes.reduce((s, l) => s + (sortants.has(l.requisition_id) ? Number(l.valeur) || 0 : 0), 0)
  return Math.round(total * 100) / 100
}

// ── Accès aux données ──────────────────────────────────────────────────────

// Tables des réquisitions absentes (code déployé avant la migration) : on
// calcule sans les réquisitions plutôt que de casser inventaires et food cost.
const tableAbsente = (e: { code?: string } | null) => !!e && (e.code === '42P01' || e.code === 'PGRST205')

async function chargerLivraisons(
  db: SupabaseClient,
  clientId: string,
  section: Section,
  depuis: string | null,
  jusqua: string | null,
) {
  let req = db.from('requisitions').select('id, service_demandeur_id')
    .eq('client_id', clientId).eq('stock', section).eq('statut', 'livree')
  if (depuis) req = req.gte('livree_at', depuis)
  if (jusqua) req = req.lt('livree_at', jusqua)
  const [{ data: bons, error }, { data: services, error: sErr }] = await Promise.all([
    req,
    db.from('services_internes').select('id, stock').eq('client_id', clientId),
  ])
  if (tableAbsente(error) || tableAbsente(sErr)) return { sortants: new Set<string>(), lignes: [] as LigneLivree[] }
  if (error) throw new Error(error.message)
  if (sErr) throw new Error(sErr.message)

  const stockParService = new Map((services ?? []).map((s) => [s.id as string, s.stock as string]))
  const sortants = bonsSortants((bons ?? []) as BonLivre[], stockParService, section)
  if (sortants.size === 0) return { sortants, lignes: [] as LigneLivree[] }

  const { data: lignes, error: lErr } = await db.from('requisition_lignes')
    .select('requisition_id, ingredient_id, unite, quantite_livree, valeur')
    .eq('client_id', clientId).in('requisition_id', [...sortants])
  if (lErr) throw new Error(lErr.message)
  return { sortants, lignes: (lignes ?? []) as LigneLivree[] }
}

/**
 * Sorties par ingrédient depuis le dernier inventaire validé (exclu : les
 * livraisons du jour de l'inventaire sont supposées comptées, comme les
 * achats datés de ce jour).
 */
export async function sortiesRequisitions(
  db: SupabaseClient,
  clientId: string,
  section: Section,
  dateInventaire: string | null,
  ingredients: { id: string; unite: string }[],
): Promise<Record<string, number>> {
  const { sortants, lignes } = await chargerLivraisons(db, clientId, section, dateInventaire ? lendemain(dateInventaire) : null, null)
  return cumulerSorties(lignes, sortants, new Map(ingredients.map((i) => [i.id, i.unite])))
}

/** Cessions internes HT de la cuisine sur une période [debut, fin] (dates incluses). */
export async function cessionsInternesHt(db: SupabaseClient, clientId: string, debut: string, fin: string): Promise<number> {
  const { sortants, lignes } = await chargerLivraisons(db, clientId, 'cuisine', debut, lendemain(fin))
  return sommeCessions(lignes, sortants)
}
