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
const ratio = (num: number, den: number): number | null => (den > 0 ? (num / den) * 100 : null)

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
