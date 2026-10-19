import type { SupabaseClient } from '@supabase/supabase-js'
import { lendemain } from './requisitionsStock.service'

// Réquisitions — analyses : consommation par service receveur, par service
// préparateur et par produit, en quantité et en valeur HT (prix figés à la
// livraison), sur les bons livrés d'une période (commandes et sorties
// directes).

type Bon = {
  id: string
  numero: number
  type: string
  service_demandeur_id: string
  service_preparateur_id: string
  stock: string
  livree_at: string
}
type Ligne = {
  requisition_id: string
  ingredient_id: string | null
  article_id: string | null
  nom: string
  unite: string
  quantite_livree: number | string | null
  valeur: number | string | null
}
type Service = { id: string; nom: string; emoji: string | null }

const arrondi = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d

// ── Agrégation pure (testée dans lib/__tests__/requisitionsAnalyses.test.ts) ──

export function agregerAnalyses(bons: Bon[], lignes: Ligne[], services: Service[], filtreService?: string | null) {
  const nomService = new Map(services.map((s) => [s.id, s]))
  const retenus = filtreService ? bons.filter((b) => b.service_demandeur_id === filtreService) : bons
  const parBon = new Map(retenus.map((b) => [b.id, b]))

  const receveurs = new Map<string, { valeur: number; bons: Set<string>; lignes: number }>()
  const preparateurs = new Map<string, { valeur: number; bons: Set<string> }>()
  const produits = new Map<string, { nom: string; unite: string; stock: string; quantite: number; valeur: number; parService: Map<string, number> }>()
  let total = 0
  let nbLignes = 0

  for (const l of lignes) {
    const b = parBon.get(l.requisition_id)
    if (!b) continue
    const q = Number(l.quantite_livree) || 0
    const v = Number(l.valeur) || 0
    if (q === 0 && v === 0) continue
    total += v
    nbLignes++

    const r = receveurs.get(b.service_demandeur_id) ?? { valeur: 0, bons: new Set<string>(), lignes: 0 }
    r.valeur += v; r.bons.add(b.id); r.lignes++
    receveurs.set(b.service_demandeur_id, r)

    const p = preparateurs.get(b.service_preparateur_id) ?? { valeur: 0, bons: new Set<string>() }
    p.valeur += v; p.bons.add(b.id)
    preparateurs.set(b.service_preparateur_id, p)

    // Même produit, même unité : quantités additionnables.
    const cle = `${l.ingredient_id || l.article_id || l.nom}|${l.unite}`
    const pr = produits.get(cle) ?? { nom: l.nom, unite: l.unite, stock: b.stock, quantite: 0, valeur: 0, parService: new Map<string, number>() }
    pr.quantite += q; pr.valeur += v
    pr.parService.set(b.service_demandeur_id, (pr.parService.get(b.service_demandeur_id) ?? 0) + q)
    produits.set(cle, pr)
  }

  const libelle = (id: string) => ({ service_id: id, nom: nomService.get(id)?.nom ?? '—', emoji: nomService.get(id)?.emoji ?? null })
  const part = (v: number) => (total > 0 ? arrondi((v / total) * 100, 1) : 0)

  return {
    totaux: { valeur: arrondi(total), bons: new Set(lignes.filter((l) => parBon.has(l.requisition_id)).map((l) => l.requisition_id)).size, lignes: nbLignes },
    par_service: [...receveurs].map(([id, r]) => ({ ...libelle(id), valeur: arrondi(r.valeur), bons: r.bons.size, lignes: r.lignes, part: part(r.valeur) }))
      .sort((a, b) => b.valeur - a.valeur || a.nom.localeCompare(b.nom)),
    par_preparateur: [...preparateurs].map(([id, p]) => ({ ...libelle(id), valeur: arrondi(p.valeur), bons: p.bons.size, part: part(p.valeur) }))
      .sort((a, b) => b.valeur - a.valeur || a.nom.localeCompare(b.nom)),
    par_produit: [...produits.values()].map((p) => ({
      nom: p.nom, unite: p.unite, stock: p.stock,
      quantite: arrondi(p.quantite, 3), valeur: arrondi(p.valeur), part: part(p.valeur),
      par_service: Object.fromEntries([...p.parService].map(([id, q]) => [id, arrondi(q, 3)])),
    })).sort((a, b) => b.valeur - a.valeur || a.nom.localeCompare(b.nom)),
  }
}

// ── Lecture (paginée : PostgREST plafonne à 1000 lignes par requête) ────────

const PAGE = 1000
const LOT_IDS = 150

async function tout<T>(requete: (de: number, a: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let de = 0; ; de += PAGE) {
    const { data, error } = await requete(de, de + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

export async function analysesRequisitions(
  db: SupabaseClient,
  clientId: string,
  debut: string,
  fin: string,
  serviceId?: string | null,
) {
  const [bons, { data: services, error: sErr }] = await Promise.all([
    tout<Bon>((de, a) => db.from('requisitions')
      .select('id, numero, type, service_demandeur_id, service_preparateur_id, stock, livree_at')
      .eq('client_id', clientId).eq('statut', 'livree')
      .gte('livree_at', debut).lt('livree_at', lendemain(fin))
      .order('livree_at').range(de, a)),
    db.from('services_internes').select('id, nom, emoji').eq('client_id', clientId).order('ordre').order('nom'),
  ])
  if (sErr) throw new Error(sErr.message)

  const ids = bons.filter((b) => !serviceId || b.service_demandeur_id === serviceId).map((b) => b.id)
  const lignes: Ligne[] = []
  for (let i = 0; i < ids.length; i += LOT_IDS) {
    const lot = ids.slice(i, i + LOT_IDS)
    lignes.push(...await tout<Ligne>((de, a) => db.from('requisition_lignes')
      .select('requisition_id, ingredient_id, article_id, nom, unite, quantite_livree, valeur')
      .eq('client_id', clientId).in('requisition_id', lot).order('id').range(de, a)))
  }

  return {
    periode: { debut, fin },
    services: (services ?? []) as Service[],
    ...agregerAnalyses(bons, lignes, (services ?? []) as Service[], serviceId),
  }
}
