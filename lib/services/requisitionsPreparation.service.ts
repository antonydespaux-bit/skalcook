import type { SupabaseClient } from '@supabase/supabase-js'
import { ConflictError, ForbiddenError, ValidationError } from '../errors'
import type { NiveauxRequisitions } from '../requisitions/droits'
import {
  appartenances,
  chargerVisible,
  commandePourTous,
  peutPreparer,
  servicesEtablissement,
  sourceCatalogue,
  type StockProduit,
} from './requisitionsDemandes.service'

// Réquisitions — préparation : prise en charge, livraison (quantités servies,
// produits ajoutés « à la voix », prix figés) et sortie directe sans
// commande. La livraison est écrite par requisition_livrer (atomique).

export interface ProduitCatalogue {
  id: string
  nom: string
  unite: string | null
  prix: number | null
}

// ── Règles pures (testées dans lib/__tests__/requisitionsPreparation.test.ts) ──

/**
 * Lignes de livraison : chaque ligne du bon reçoit sa quantité servie et le
 * prix du produit à cet instant. Les produits ajoutés ne doivent pas déjà
 * figurer sur le bon (on modifie alors la ligne existante).
 */
export function construireLivraison(
  existantes: { id: string; ingredient_id: string | null; article_id: string | null }[],
  saisies: { id: string; quantite_livree: number }[],
  ajouts: { produit_id: string; quantite_livree: number; commentaire?: string | null }[],
  produits: Map<string, ProduitCatalogue>,
  colonne: 'ingredient_id' | 'article_id',
) {
  const parId = new Map(saisies.map((l) => [l.id, l.quantite_livree]))
  if (parId.size !== saisies.length) throw new ValidationError('Une ligne figure deux fois.')
  if (saisies.length !== existantes.length || existantes.some((l) => !parId.has(l.id))) {
    throw new ValidationError('Chaque ligne de la réquisition doit avoir une quantité livrée.')
  }
  const surLeBon = new Set(existantes.map((l) => l[colonne]).filter(Boolean) as string[])
  const vus = new Set<string>()

  const lignes = existantes.map((l) => {
    const pid = l[colonne]
    return {
      id: l.id,
      quantite_livree: parId.get(l.id)!,
      prix_unitaire: pid ? produits.get(pid)?.prix ?? null : null,
    }
  })
  const lignesAjoutees = ajouts.map((a) => {
    if (surLeBon.has(a.produit_id) || vus.has(a.produit_id)) {
      throw new ValidationError('Ce produit est déjà sur le bon : modifiez sa quantité livrée.')
    }
    vus.add(a.produit_id)
    const p = produits.get(a.produit_id)
    if (!p) throw new ValidationError('Un produit ajouté n\'est pas dans le catalogue du service.')
    return {
      [colonne]: p.id,
      nom: p.nom,
      unite: p.unite || 'u',
      quantite_livree: a.quantite_livree,
      prix_unitaire: p.prix,
      commentaire: a.commentaire || null,
    }
  })
  return { lignes, ajouts: lignesAjoutees }
}

/** Valeur HT d'une livraison (pour le journal et l'écran de confirmation). */
export function valeurLivraison(lignes: { quantite_livree: number; prix_unitaire: number | null }[]) {
  return Math.round(lignes.reduce((s, l) => s + l.quantite_livree * (l.prix_unitaire ?? 0), 0) * 100) / 100
}

// ── Accès aux données ──────────────────────────────────────────────────────

/** Produits (avec prix unitaire HT courant) du stock d'un service. */
export async function produitsDuStock(
  db: SupabaseClient,
  clientId: string,
  stock: StockProduit,
  serviceId: string,
  ids: string[],
): Promise<Map<string, ProduitCatalogue>> {
  if (ids.length === 0) return new Map()
  const { table } = sourceCatalogue(stock)
  // Ingrédients : prix_kg = prix par unité de l'ingrédient (prix du
  // conditionnement / conditionnement). Articles : prix_unitaire.
  const colonnes = table === 'articles' ? 'id, nom, unite, prix_unitaire' : 'id, nom, unite, prix_kg'
  let req = db.from(table).select(colonnes).eq('client_id', clientId).in('id', [...new Set(ids)])
  if (table === 'articles') req = req.eq('service_id', serviceId)
  const { data, error } = await req
  if (error) throw new Error(error.message)
  return new Map((data ?? []).map((p: Record<string, unknown>) => {
    const prix = (table === 'articles' ? p.prix_unitaire : p.prix_kg) as number | string | null
    return [p.id as string, {
      id: p.id as string,
      nom: p.nom as string,
      unite: (p.unite as string | null) ?? null,
      prix: prix == null || prix === '' ? null : Number(prix),
    }]
  }))
}

async function chargerAPreparer(db: SupabaseClient, clientId: string, userId: string, n: NiveauxRequisitions, id: string) {
  const { r, a } = await chargerVisible(db, clientId, userId, n, id)
  if (!peutPreparer(r, a.ids, n)) {
    if (r.statut === 'a_preparer' || r.statut === 'en_preparation') {
      throw new ForbiddenError('Seuls les membres du service préparateur servent cette réquisition.')
    }
    throw new ConflictError('Cette réquisition n\'est pas à préparer (déjà livrée, annulée, refusée ou en attente de validation).')
  }
  return r
}

/** Prise en charge : le bon passe « en préparation » (le demandeur ne peut plus l'annuler). */
export async function prendreEnCharge(db: SupabaseClient, clientId: string, userId: string, n: NiveauxRequisitions, id: string) {
  const r = await chargerAPreparer(db, clientId, userId, n, id)
  if (r.statut === 'en_preparation') return { id, numero: r.numero }
  const { data, error } = await db.from('requisitions')
    .update({ statut: 'en_preparation', preparateur_id: userId, prise_en_charge_at: new Date().toISOString() })
    .eq('client_id', clientId).eq('id', id).eq('statut', 'a_preparer')
    .select('id, numero')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) throw new ConflictError('Cette réquisition a changé entre-temps : rechargez la page.')
  return { id, numero: r.numero }
}

/** Livraison : quantités servies, produits ajoutés, prix figés, bon clôturé. */
export async function livrerRequisition(
  db: SupabaseClient,
  clientId: string,
  userId: string,
  n: NiveauxRequisitions,
  id: string,
  saisie: {
    lignes: { id: string; quantite_livree: number }[]
    ajouts: { produit_id: string; quantite_livree: number; commentaire?: string | null }[]
  },
) {
  const r = await chargerAPreparer(db, clientId, userId, n, id)
  const { colonne } = sourceCatalogue(r.stock)

  const { data: existantes, error } = await db.from('requisition_lignes')
    .select('id, ingredient_id, article_id').eq('client_id', clientId).eq('requisition_id', id)
  if (error) throw new Error(error.message)
  const lignesBon = (existantes ?? []) as { id: string; ingredient_id: string | null; article_id: string | null }[]

  const ids = [
    ...lignesBon.map((l) => l[colonne]).filter(Boolean) as string[],
    ...saisie.ajouts.map((a) => a.produit_id),
  ]
  const produits = await produitsDuStock(db, clientId, r.stock, r.service_preparateur_id, ids)
  const livraison = construireLivraison(lignesBon, saisie.lignes, saisie.ajouts, produits, colonne)

  const { data: numero, error: rpcErr } = await db.rpc('requisition_livrer', {
    p_client: clientId,
    p_id: id,
    p_preparateur: userId,
    p_lignes: livraison.lignes,
    p_ajouts: livraison.ajouts,
  })
  if (rpcErr) throw new Error(rpcErr.message)
  if (numero == null) throw new ConflictError('Cette réquisition a changé entre-temps (annulée ou déjà livrée) : rechargez la page.')

  return {
    id,
    numero: r.numero,
    valeur: valeurLivraison([...livraison.lignes, ...livraison.ajouts]),
    lignes: livraison.lignes.length,
    ajouts: livraison.ajouts.length,
    demandeur_id: r.demandeur_id,
  }
}

/** Sortie de stock sans commande, vers un service receveur. */
export async function sortieDirecte(
  db: SupabaseClient,
  clientId: string,
  userId: string,
  n: NiveauxRequisitions,
  d: {
    service_preparateur_id: string
    service_receveur_id: string
    commentaire?: string | null
    lignes: { produit_id: string; quantite: number; commentaire?: string | null }[]
  },
) {
  const [services, a] = await Promise.all([servicesEtablissement(db, clientId), appartenances(db, clientId, userId)])
  const preparateur = services.find((s) => s.id === d.service_preparateur_id)
  const receveur = services.find((s) => s.id === d.service_receveur_id)
  if (!preparateur || !preparateur.actif || !preparateur.peut_preparer || preparateur.stock === 'aucun') {
    throw new ValidationError('Service qui sort le stock invalide ou désactivé.')
  }
  if (!receveur || !receveur.actif) throw new ValidationError('Service receveur invalide ou désactivé.')
  if (preparateur.id === receveur.id) throw new ValidationError('Le service receveur doit être différent du service qui sort le stock.')
  if (n.requisitions !== 'modification' || !(commandePourTous(n) || a.ids.has(preparateur.id))) {
    throw new ForbiddenError('Seuls les membres du service font une sortie de son stock.')
  }

  const stock = preparateur.stock as StockProduit
  const { colonne } = sourceCatalogue(stock)
  const produits = await produitsDuStock(db, clientId, stock, preparateur.id, d.lignes.map((l) => l.produit_id))
  const lignes = d.lignes.map((l) => {
    const p = produits.get(l.produit_id)
    if (!p) throw new ValidationError('Un produit n\'est pas dans le catalogue du service.')
    return {
      [colonne]: p.id,
      nom: p.nom,
      unite: p.unite || 'u',
      quantite_demandee: null,
      quantite_livree: l.quantite,
      prix_unitaire: p.prix,
      ajoutee_par_preparateur: true,
      commentaire: l.commentaire || null,
    }
  })

  const maintenant = new Date().toISOString()
  const { data, error } = await db.rpc('requisition_creer', {
    p_entete: {
      client_id: clientId,
      type: 'sortie_directe',
      statut: 'livree',
      service_demandeur_id: receveur.id,
      service_preparateur_id: preparateur.id,
      stock,
      demandeur_id: userId,
      commentaire: d.commentaire || null,
      preparateur_id: userId,
      prise_en_charge_at: maintenant,
      livree_at: maintenant,
    },
    p_lignes: lignes,
  })
  if (error) throw new Error(error.message)
  const cree = (Array.isArray(data) ? data[0] : data) as { id: string; numero: number }
  return {
    id: cree.id,
    numero: cree.numero,
    preparateur,
    receveur,
    valeur: valeurLivraison(lignes.map((l) => ({ quantite_livree: l.quantite_livree, prix_unitaire: l.prix_unitaire }))),
  }
}
