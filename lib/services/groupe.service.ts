/**
 * Service layer pour la vue groupe (consolidation multi-établissements).
 *
 * Un groupe (table `groupes`) rassemble des établissements (`clients.groupe_id`).
 * Le groupe ne donne AUCUN accès : la synthèse ne porte que sur les
 * établissements du groupe auxquels l'utilisateur a déjà accès
 * (acces_clients) avec un rôle admin ou directeur, et qui ont le module
 * « groupe » actif. Superadmin : tous les établissements du groupe ayant le
 * module.
 *
 * Les montants bruts viennent de la fonction SQL `groupe_indicateurs` ; les
 * conversions HT et ratios sont calculés ici (mêmes règles que
 * lib/caAnalyses.js et foodCost.service.ts).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { GroupeSyntheseInput } from '../validators/groupe.schema'
import { ForbiddenError, NotFoundError } from '../errors'
import { TVA_FOOD, TVA_BEV_20, TVA_BEV_10, TVA_AUTRE } from '../caAnalyses'
import { isSuperadminEmail } from '../superadmin'
import { normUnite } from '../constants'
import { normDesignation } from './achats.service'

export const MODULE_GROUPE = 'groupe'
/** Rôles qui voient la vue groupe (CA, marges) — comme les pages d'analyses. */
export const ROLES_VUE_GROUPE = ['admin', 'directeur']

export type Statut = 'vert' | 'orange' | 'rouge' | null

export interface IndicateursBruts {
  client_id: string
  ca_food_ttc: number | string
  ca_bev_20_ttc: number | string
  ca_bev_10_ttc: number | string
  ca_autre_ttc: number | string
  couverts: number | string
  achats_cuisine_ht: number | string
  achats_bar_ht: number | string
  nb_factures: number | string
  stock_cuisine_ht: number | string | null
  stock_cuisine_date: string | null
  stock_bar_ht: number | string | null
  stock_bar_date: string | null
}

export interface EtablissementMeta {
  id: string
  nom_etablissement: string | null
  nom: string | null
  seuil_vert_cuisine: number | null
  seuil_orange_cuisine: number | null
  seuil_vert_boissons: number | null
  seuil_orange_boissons: number | null
}

export interface IndicateursEtablissement {
  clientId: string
  nom: string
  caHt: number
  caFoodHt: number
  caBoissonsHt: number
  couverts: number
  ticketMoyenTtc: number | null
  achatsCuisineHt: number
  achatsBarHt: number
  nbFactures: number
  /** Achats cuisine HT / CA food HT, en %. null si pas de CA food. */
  ratioCuisine: number | null
  /** Achats bar HT / CA boissons HT, en %. null si pas de CA boissons. */
  ratioBoissons: number | null
  statutCuisine: Statut
  statutBoissons: Statut
  stockCuisineHt: number | null
  stockCuisineDate: string | null
  stockBarHt: number | null
  stockBarDate: string | null
}

export interface TotauxGroupe {
  caHt: number
  caFoodHt: number
  caBoissonsHt: number
  couverts: number
  ticketMoyenTtc: number | null
  achatsCuisineHt: number
  achatsBarHt: number
  nbFactures: number
  ratioCuisine: number | null
  ratioBoissons: number | null
}

const n = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}
const nOrNull = (v: unknown): number | null => (v == null ? null : n(v))
// Pas d'achats sur la section = rien de saisi (ex. achats bar classés en
// cuisine), pas un ratio parfait : on renvoie null plutôt que 0 %.
const ratio = (num: number, den: number): number | null => (den > 0 && num !== 0 ? (num / den) * 100 : null)

/** Statut couleur d'un ratio selon les seuils de l'établissement (≤ vert, ≤ orange, sinon rouge). */
export function statutRatio(valeur: number | null, seuilVert: number | null, seuilOrange: number | null): Statut {
  if (valeur == null || seuilVert == null || seuilOrange == null) return null
  if (valeur <= seuilVert) return 'vert'
  if (valeur <= seuilOrange) return 'orange'
  return 'rouge'
}

/** Convertit les montants bruts d'un établissement en indicateurs comparables. */
export function calculerIndicateurs(brut: IndicateursBruts, meta: EtablissementMeta): IndicateursEtablissement {
  const food = n(brut.ca_food_ttc)
  const bev20 = n(brut.ca_bev_20_ttc)
  const bev10 = n(brut.ca_bev_10_ttc)
  const autre = n(brut.ca_autre_ttc)
  const couverts = n(brut.couverts)

  const caFoodHt = food / TVA_FOOD
  const caBoissonsHt = bev20 / TVA_BEV_20 + bev10 / TVA_BEV_10
  const caHt = caFoodHt + caBoissonsHt + autre / TVA_AUTRE
  const caTtc = food + bev20 + bev10 + autre

  const achatsCuisineHt = n(brut.achats_cuisine_ht)
  const achatsBarHt = n(brut.achats_bar_ht)
  const ratioCuisine = ratio(achatsCuisineHt, caFoodHt)
  const ratioBoissons = ratio(achatsBarHt, caBoissonsHt)

  return {
    clientId: brut.client_id,
    nom: meta.nom_etablissement || meta.nom || '—',
    caHt,
    caFoodHt,
    caBoissonsHt,
    couverts,
    ticketMoyenTtc: couverts > 0 ? caTtc / couverts : null,
    achatsCuisineHt,
    achatsBarHt,
    nbFactures: n(brut.nb_factures),
    ratioCuisine,
    ratioBoissons,
    statutCuisine: statutRatio(ratioCuisine, meta.seuil_vert_cuisine, meta.seuil_orange_cuisine),
    statutBoissons: statutRatio(ratioBoissons, meta.seuil_vert_boissons, meta.seuil_orange_boissons),
    stockCuisineHt: nOrNull(brut.stock_cuisine_ht),
    stockCuisineDate: brut.stock_cuisine_date,
    stockBarHt: nOrNull(brut.stock_bar_ht),
    stockBarDate: brut.stock_bar_date,
  }
}

/** Totaux du groupe : sommes, et ratios recalculés sur les sommes (pondérés par le CA). */
export function calculerTotaux(etabs: IndicateursEtablissement[]): TotauxGroupe {
  const sum = (k: keyof IndicateursEtablissement) => etabs.reduce((s, e) => s + n(e[k]), 0)
  const caFoodHt = sum('caFoodHt')
  const caBoissonsHt = sum('caBoissonsHt')
  const achatsCuisineHt = sum('achatsCuisineHt')
  const achatsBarHt = sum('achatsBarHt')
  const couverts = sum('couverts')
  const caTtc = etabs.reduce((s, e) => s + (e.ticketMoyenTtc != null ? e.ticketMoyenTtc * e.couverts : 0), 0)
  return {
    caHt: sum('caHt'),
    caFoodHt,
    caBoissonsHt,
    couverts,
    ticketMoyenTtc: couverts > 0 ? caTtc / couverts : null,
    achatsCuisineHt,
    achatsBarHt,
    nbFactures: sum('nbFactures'),
    ratioCuisine: ratio(achatsCuisineHt, caFoodHt),
    ratioBoissons: ratio(achatsBarHt, caBoissonsHt),
  }
}

async function estSuperadmin(db: SupabaseClient, user: { id: string; email?: string }) {
  if (isSuperadminEmail((user.email || '').toLowerCase().trim())) return true
  const { data } = await db.from('profils').select('is_superadmin').eq('id', user.id).maybeSingle()
  return !!(data as { is_superadmin?: boolean } | null)?.is_superadmin
}

/**
 * Établissements du groupe visibles par l'utilisateur : rattachés au groupe,
 * module « groupe » actif, et accessibles via acces_clients avec un rôle
 * admin ou directeur (sauf superadmin).
 * `db` est le client service_role : c'est CE filtre qui fait l'isolation.
 */
export async function etablissementsAccessibles(
  db: SupabaseClient,
  user: { id: string; email?: string },
  groupeId: string,
): Promise<EtablissementMeta[]> {
  const { data: clients, error } = await db
    .from('clients')
    .select('id, nom, nom_etablissement, modules_actifs, seuil_vert_cuisine, seuil_orange_cuisine, seuil_vert_boissons, seuil_orange_boissons')
    .eq('groupe_id', groupeId)
    .eq('actif', true)
  if (error) throw new Error(error.message)

  const avecModule = (clients ?? []).filter((c) =>
    Array.isArray((c as { modules_actifs: unknown }).modules_actifs)
    && ((c as { modules_actifs: string[] }).modules_actifs).includes(MODULE_GROUPE),
  ) as (EtablissementMeta & { modules_actifs: string[] })[]
  if (avecModule.length === 0) return []

  if (await estSuperadmin(db, user)) return avecModule

  const { data: acces, error: accErr } = await db
    .from('acces_clients')
    .select('client_id, role')
    .eq('user_id', user.id)
    .in('client_id', avecModule.map((c) => c.id))
    .in('role', ROLES_VUE_GROUPE)
  if (accErr) throw new Error(accErr.message)
  const autorises = new Set((acces ?? []).map((a) => (a as { client_id: string }).client_id))
  return avecModule.filter((c) => autorises.has(c.id))
}

export async function getSyntheseGroupe(
  db: SupabaseClient,
  user: { id: string; email?: string },
  input: GroupeSyntheseInput,
) {
  const { groupeId, debut, fin } = input

  const { data: groupe, error: gErr } = await db
    .from('groupes')
    .select('id, nom')
    .eq('id', groupeId)
    .maybeSingle()
  if (gErr) throw new Error(gErr.message)
  if (!groupe) throw new NotFoundError('Groupe introuvable.')

  const etabs = await etablissementsAccessibles(db, user, groupeId)
  // Même réponse que « introuvable » côté contenu : on ne révèle rien du
  // groupe à quelqu'un qui n'a accès à aucun de ses établissements.
  if (etabs.length === 0) throw new ForbiddenError('Aucun établissement de ce groupe accessible avec la vue groupe.')

  const { data: bruts, error: rpcErr } = await db.rpc('groupe_indicateurs', {
    p_client_ids: etabs.map((e) => e.id),
    p_debut: debut,
    p_fin: fin,
  })
  if (rpcErr) throw new Error(rpcErr.message)

  const metaById = new Map(etabs.map((e) => [e.id, e]))
  const etablissements = ((bruts ?? []) as IndicateursBruts[])
    .filter((b) => metaById.has(b.client_id))
    .map((b) => calculerIndicateurs(b, metaById.get(b.client_id)!))
    .sort((a, b) => b.caHt - a.caHt)

  return {
    groupe: { id: (groupe as { id: string }).id, nom: (groupe as { nom: string }).nom },
    periode: { debut, fin },
    etablissements,
    totaux: calculerTotaux(etablissements),
  }
}

/** Groupes dont l'utilisateur voit au moins un établissement (pour le sélecteur). */
export async function listGroupesAccessibles(db: SupabaseClient, user: { id: string; email?: string }) {
  const superadmin = await estSuperadmin(db, user)
  let query = db.from('clients').select('groupe_id, modules_actifs').not('groupe_id', 'is', null).eq('actif', true)
  if (!superadmin) {
    const { data: acces, error } = await db.from('acces_clients').select('client_id')
      .eq('user_id', user.id).in('role', ROLES_VUE_GROUPE)
    if (error) throw new Error(error.message)
    const ids = (acces ?? []).map((a) => (a as { client_id: string }).client_id)
    if (ids.length === 0) return { groupes: [] }
    query = query.in('id', ids)
  }
  const { data: clients, error: cErr } = await query
  if (cErr) throw new Error(cErr.message)
  const groupeIds = [...new Set((clients ?? [])
    .filter((c) => Array.isArray((c as { modules_actifs: unknown }).modules_actifs)
      && (c as { modules_actifs: string[] }).modules_actifs.includes(MODULE_GROUPE))
    .map((c) => (c as { groupe_id: string }).groupe_id))]
  if (groupeIds.length === 0) return { groupes: [] }
  const { data: groupes, error: gErr } = await db.from('groupes').select('id, nom').in('id', groupeIds).order('nom')
  if (gErr) throw new Error(gErr.message)
  return { groupes: groupes ?? [] }
}

// ── Comparaison des prix d'un même produit entre établissements ────────────

export interface PrixProduitBrut {
  client_id: string
  ingredient_id: string
  nom: string
  unite: string | null
  qte: number | string
  montant: number | string
  nb_achats: number | string
  dernier_achat: string | null
  /** Détail par fournisseur (nom saisi sur la facture), montant décroissant. */
  fournisseurs?: { fournisseur: string; qte: number | string; montant: number | string }[]
}

export interface PrixFournisseur {
  fournisseur: string
  prix: number
  qte: number
}

export interface PrixEtablissement {
  clientId: string
  nom: string
  ingredientNom: string
  prixMoyen: number
  qte: number
  montant: number
  nbAchats: number
  dernierAchat: string | null
  /** Surcoût vs le meilleur prix du groupe : (prix − min) × quantité achetée. */
  surcout: number
  /** Fournisseur chez qui l'établissement achète le plus ce produit (en €). */
  fournisseurPrincipal: string | null
  /** Prix moyen par fournisseur, du moins cher au plus cher. */
  fournisseurs: PrixFournisseur[]
}

export interface ProduitCompare {
  cle: string
  nom: string
  unite: string
  prixMin: number
  prixMax: number
  /** (max − min) / min, en %. */
  ecartPct: number
  /** Σ des surcoûts : ce que le groupe aurait économisé au meilleur prix. */
  economiePotentielle: number
  /** Écart si grand qu'il trahit souvent une erreur de conditionnement ou d'unité. */
  aVerifier: boolean
  /** Meilleur prix observé dans le groupe, tous fournisseurs confondus. */
  meilleurFournisseur: { clientId: string; etablissement: string; fournisseur: string; prix: number } | null
  etablissements: PrixEtablissement[]
}

/** Au-delà, l'écart est signalé « à vérifier » (conditionnement, unité, qualité différente). */
export const SEUIL_ECART_A_VERIFIER = 150

// Lignes fourre-tout des factures (« Divers 20 % », frais de port…) : leur
// nom ne désigne pas un produit, les comparer n'a pas de sens.
const NOM_GENERIQUE = /^(divers|frais|transport|port|livraison|consigne|remise|emballage|taxe|eco)\b/

/** Clé de rapprochement : nom normalisé (sans accents, casse, ponctuation) + unité canonique. */
export function cleProduit(nom: string | null | undefined, unite: string | null | undefined): string {
  return `${normDesignation(nom)}|${normUnite(unite)}`
}

/**
 * Rapproche les ingrédients de plusieurs établissements par nom + unité et
 * garde les produits achetés par au moins deux établissements. Tri par
 * économie potentielle décroissante.
 */
export function comparerPrix(bruts: PrixProduitBrut[], nomsEtab: Map<string, string>): ProduitCompare[] {
  type Cumul = { noms: string[]; unite: string; qte: number; montant: number; nb: number; dernier: string | null; fourn: Map<string, { nom: string; qte: number; montant: number }> }
  const parCle = new Map<string, Map<string, Cumul>>()
  for (const b of bruts) {
    const qte = n(b.qte), montant = n(b.montant)
    if (qte <= 0 || montant <= 0 || !normDesignation(b.nom) || NOM_GENERIQUE.test(normDesignation(b.nom))) continue
    const cle = cleProduit(b.nom, b.unite)
    if (!parCle.has(cle)) parCle.set(cle, new Map())
    const parEtab = parCle.get(cle)!
    // Un établissement peut avoir deux fiches ingrédient au même nom : on cumule.
    const cur: Cumul = parEtab.get(b.client_id) ?? { noms: [], unite: normUnite(b.unite), qte: 0, montant: 0, nb: 0, dernier: null, fourn: new Map() }
    cur.noms.push(b.nom)
    for (const f of b.fournisseurs ?? []) {
      const k = cleFournisseur(f.fournisseur)
      const fc = cur.fourn.get(k) ?? { nom: f.fournisseur, qte: 0, montant: 0 }
      fc.qte += n(f.qte)
      fc.montant += n(f.montant)
      cur.fourn.set(k, fc)
    }
    cur.qte += qte
    cur.montant += montant
    cur.nb += n(b.nb_achats)
    if (b.dernier_achat && (!cur.dernier || b.dernier_achat > cur.dernier)) cur.dernier = b.dernier_achat
    parEtab.set(b.client_id, cur)
  }

  const produits: ProduitCompare[] = []
  for (const [cle, parEtab] of parCle) {
    if (parEtab.size < 2) continue
    const lignes = [...parEtab.entries()].map(([clientId, v]) => ({ clientId, ...v, prix: v.montant / v.qte }))
    const prixMin = Math.min(...lignes.map((l) => l.prix))
    const prixMax = Math.max(...lignes.map((l) => l.prix))
    const etablissements: PrixEtablissement[] = lignes
      .map((l) => ({
        clientId: l.clientId,
        nom: nomsEtab.get(l.clientId) ?? '—',
        ingredientNom: l.noms[0],
        prixMoyen: l.prix,
        qte: l.qte,
        montant: l.montant,
        nbAchats: l.nb,
        dernierAchat: l.dernier,
        surcout: (l.prix - prixMin) * l.qte,
        fournisseurPrincipal: [...l.fourn.values()].sort((a, b) => b.montant - a.montant)[0]?.nom ?? null,
        fournisseurs: [...l.fourn.values()]
          .filter((f) => f.qte > 0 && f.montant > 0)
          .map((f) => ({ fournisseur: f.nom, prix: f.montant / f.qte, qte: f.qte }))
          .sort((a, b) => a.prix - b.prix),
      }))
      .sort((a, b) => a.prixMoyen - b.prixMoyen)
    const meilleur = etablissements
      .flatMap((e) => e.fournisseurs.map((f) => ({ clientId: e.clientId, etablissement: e.nom, fournisseur: f.fournisseur, prix: f.prix })))
      .sort((a, b) => a.prix - b.prix)[0] ?? null
    produits.push({
      cle,
      nom: etablissements[0].ingredientNom,
      unite: lignes[0].unite,
      prixMin,
      prixMax,
      ecartPct: prixMin > 0 ? ((prixMax - prixMin) / prixMin) * 100 : 0,
      economiePotentielle: etablissements.reduce((s, e) => s + e.surcout, 0),
      aVerifier: prixMin > 0 && ((prixMax - prixMin) / prixMin) * 100 > SEUIL_ECART_A_VERIFIER,
      meilleurFournisseur: meilleur,
      etablissements,
    })
  }
  return produits.sort((a, b) => b.economiePotentielle - a.economiePotentielle)
}

// ── Fournisseurs du groupe ─────────────────────────────────────────────────

export interface FournisseurBrut {
  client_id: string
  fournisseur: string
  montant: number | string
  nb_factures: number | string
  dernier_achat: string | null
}

export interface FournisseurGroupe {
  cle: string
  nom: string
  montantTotal: number
  nbEtablissements: number
  etablissements: { clientId: string; nom: string; montant: number; nbFactures: number; dernierAchat: string | null }[]
}

// Formes juridiques et mots vides retirés pour rapprocher « ECREVISSE SAS » et
// « Ecrevisse », « FOOD FLOW » et « FOODFLOW ».
const MOTS_JURIDIQUES = /\b(sas|sasu|sarl|eurl|sa|snc|sca|ets|etablissements|societe|ste|cie|et|fils)\b/g

/** Clé de rapprochement d'un fournisseur : nom sans accents, casse, ponctuation, forme juridique ni espaces. */
export function cleFournisseur(nom: string | null | undefined): string {
  const base = normDesignation(nom).replace(MOTS_JURIDIQUES, ' ').replace(/\s+/g, '')
  return base || normDesignation(nom).replace(/\s+/g, '')
}

/**
 * Regroupe les achats par fournisseur (rapproché par nom) et par établissement.
 * Les fournisseurs communs à plusieurs établissements passent en premier
 * (levier de négociation), puis par montant total.
 */
export function fournisseursGroupe(bruts: FournisseurBrut[], nomsEtab: Map<string, string>): FournisseurGroupe[] {
  const parCle = new Map<string, { noms: Map<string, number>; parEtab: Map<string, { montant: number; nb: number; dernier: string | null }> }>()
  for (const b of bruts) {
    const montant = n(b.montant)
    const cle = cleFournisseur(b.fournisseur)
    if (!cle || montant === 0) continue
    const g = parCle.get(cle) ?? { noms: new Map(), parEtab: new Map() }
    g.noms.set(b.fournisseur, (g.noms.get(b.fournisseur) ?? 0) + montant)
    const e = g.parEtab.get(b.client_id) ?? { montant: 0, nb: 0, dernier: null }
    e.montant += montant
    e.nb += n(b.nb_factures)
    if (b.dernier_achat && (!e.dernier || b.dernier_achat > e.dernier)) e.dernier = b.dernier_achat
    g.parEtab.set(b.client_id, e)
    parCle.set(cle, g)
  }
  return [...parCle.entries()]
    .map(([cle, g]) => {
      const etablissements = [...g.parEtab.entries()]
        .map(([clientId, e]) => ({ clientId, nom: nomsEtab.get(clientId) ?? '—', montant: e.montant, nbFactures: e.nb, dernierAchat: e.dernier }))
        .sort((a, b) => b.montant - a.montant)
      return {
        cle,
        // Orthographe la plus utilisée (en €) parmi les variantes saisies.
        nom: [...g.noms.entries()].sort((a, b) => b[1] - a[1])[0][0],
        montantTotal: etablissements.reduce((s, e) => s + e.montant, 0),
        nbEtablissements: etablissements.length,
        etablissements,
      }
    })
    .filter((f) => f.montantTotal > 0)
    .sort((a, b) => (Number(b.nbEtablissements > 1) - Number(a.nbEtablissements > 1)) || b.montantTotal - a.montantTotal)
}

export async function getPrixGroupe(
  db: SupabaseClient,
  user: { id: string; email?: string },
  input: GroupeSyntheseInput,
) {
  const { groupeId, debut, fin } = input
  const etabs = await etablissementsAccessibles(db, user, groupeId)
  if (etabs.length === 0) throw new ForbiddenError('Aucun établissement de ce groupe accessible avec la vue groupe.')

  const args = { p_client_ids: etabs.map((e) => e.id), p_debut: debut, p_fin: fin }
  const [{ data, error }, { data: dataFourn, error: errFourn }] = await Promise.all([
    db.rpc('groupe_prix_produits', args),
    db.rpc('groupe_fournisseurs', args),
  ])
  if (error) throw new Error(error.message)
  if (errFourn) throw new Error(errFourn.message)

  const autorises = new Set(etabs.map((e) => e.id))
  const bruts = ((data ?? []) as PrixProduitBrut[]).filter((b) => autorises.has(b.client_id))
  const nomsEtab = new Map(etabs.map((e) => [e.id, e.nom_etablissement || e.nom || '—']))
  const produits = comparerPrix(bruts, nomsEtab)
  const fournisseurs = fournisseursGroupe(
    ((dataFourn ?? []) as FournisseurBrut[]).filter((f) => autorises.has(f.client_id)),
    nomsEtab,
  )
  const communs = fournisseurs.filter((f) => f.nbEtablissements > 1)

  return {
    periode: { debut, fin },
    nbEtablissements: etabs.length,
    nbProduitsCompares: produits.length,
    economieTotale: produits.reduce((s, p) => s + p.economiePotentielle, 0),
    // Les 200 premiers suffisent à l'écran ; le total reste juste.
    produits: produits.slice(0, 200),
    nbFournisseurs: fournisseurs.length,
    nbFournisseursCommuns: communs.length,
    montantFournisseursCommuns: communs.reduce((s, f) => s + f.montantTotal, 0),
    fournisseurs: fournisseurs.slice(0, 200),
  }
}
