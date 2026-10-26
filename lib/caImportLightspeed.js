/**
 * Import du CA journalier depuis Lightspeed K-Series.
 *
 * Deux exports :
 *  - « tickets » (Rapport des reçus) : une ligne par ticket avec l'heure
 *    d'ouverture (→ jour et service), le profil (→ lieu), les couverts, le
 *    total TTC et la taxe par taux (« TVA 10%:263.33|TVA 20%:95.45 »).
 *    Suffit pour le CA et les couverts de chaque jour × lieu × service.
 *  - « départements » (Rapport de la gamme de produits › Départements), une
 *    journée : sépare, à taux de TVA égal, Food / softs (10 %) et alcool /
 *    divers (20 %). Sans lui, tout le 10 % va en Food, tout le 20 % en Bev 20.
 *
 * Tous les calculs se font en centimes entiers ; la répartition garde le
 * total de chaque groupe de tickets exact (plus forts restes).
 */

import { normalizeHeader, parseNumberLoose } from './csvImport'

export const COLONNES_CA = ['ca_food', 'ca_bev_20', 'ca_bev_10', 'ca_autre']

export const REGLAGES_DEFAUT = { coupure_jour: '05:30', fin_midi: '18:30', lieux: {}, departements: {} }

const TAUX_CONNUS = [0, 2.1, 5.5, 10, 20]

export function cle(libelle) {
  return normalizeHeader(libelle)
}

const centimes = (n) => Math.round(Number(n || 0) * 100)

function colonne(headers, nom) {
  const n = headers.map(normalizeHeader)
  return n.indexOf(nom)
}

/** 'tickets' | 'departements' | null, d'après la ligne d'en-tête. */
export function detecterTypeFichier(headers) {
  const n = new Set(headers.map(normalizeHeader))
  if (n.has('taxname') && n.has('opendate') && n.has('profil') && n.has('total')) return 'tickets'
  if (n.has('departement') && n.has('montant brut de la transaction')) return 'departements'
  return null
}

/** Période du nom de fichier Lightspeed (…_20261024_20261025.csv). */
export function periodeDuNomFichier(nom) {
  const m = String(nom || '').match(/(\d{4})(\d{2})(\d{2})_(\d{4})(\d{2})(\d{2})(?!\d)/)
  if (!m) return null
  return { debut: `${m[1]}-${m[2]}-${m[3]}`, fin: `${m[4]}-${m[5]}-${m[6]}` }
}

/** « 24/10/26 16:09 » ou « 24/10/2026 16:09 » → composantes. */
function lireDateHeure(s) {
  const m = String(s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})/)
  if (!m) return null
  const annee = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  return { annee, mois: Number(m[2]), jour: Number(m[1]), h: Number(m[4]), min: Number(m[5]) }
}

export function minutesDe(hhmm) {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

const iso = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

/**
 * Journée et service d'un ticket. La journée court de la coupure (05:30) à
 * la coupure du lendemain : un ticket ouvert à 00:26 reste sur la veille.
 * Midi = de la coupure à fin_midi (18:30), soir = le reste.
 */
export function jourEtService(dh, reglages = REGLAGES_DEFAUT) {
  const coupure = minutesDe(reglages.coupure_jour)
  const finMidi = minutesDe(reglages.fin_midi)
  const minutes = dh.h * 60 + dh.min
  const d = new Date(Date.UTC(dh.annee, dh.mois - 1, dh.jour))
  if (minutes < coupure) d.setUTCDate(d.getUTCDate() - 1)
  const service = minutes >= coupure && minutes < finMidi ? 'lunch' : 'dinner'
  return { jour: iso(d), service }
}

/** « TVA 10%:263.33|TVA 20%:95.45 » → { '10': 26333, '20': 9545 } (taxe, centimes). */
function lireTaxes(s) {
  const out = {}
  for (const part of String(s || '').split('|')) {
    const i = part.lastIndexOf(':')
    if (i < 0) continue
    const m = part.slice(0, i).match(/(\d+(?:[.,]\d+)?)\s*%/)
    if (!m) continue
    const taux = String(Number(m[1].replace(',', '.')))
    out[taux] = (out[taux] || 0) + centimes(parseNumberLoose(part.slice(i + 1)))
  }
  return out
}

/**
 * TTC par taux d'un ticket, à partir des taxes : TTC = taxe × (100 + t) / t.
 * L'écart d'arrondi avec le total va au plus gros taux ; un ticket sans taxe
 * part en taux 0.
 */
export function ttcParTaux(totalCentimes, taxes) {
  const out = {}
  let somme = 0
  for (const [taux, taxe] of Object.entries(taxes)) {
    const t = Number(taux)
    if (!(t > 0)) continue
    const ttc = Math.round((taxe * (100 + t)) / t)
    out[taux] = ttc
    somme += ttc
  }
  const reste = totalCentimes - somme
  const cles = Object.keys(out)
  if (cles.length === 0) {
    if (totalCentimes !== 0) out['0'] = totalCentimes
  } else if (reste !== 0) {
    const plusGros = cles.reduce((a, b) => (Math.abs(out[b]) > Math.abs(out[a]) ? b : a))
    out[plusGros] += reste
  }
  return out
}

/** Lignes de l'export tickets → tickets normalisés. */
export function lireTickets(headers, rows) {
  const i = {
    id: colonne(headers, 'identifier'),
    total: colonne(headers, 'total'),
    taxes: colonne(headers, 'taxname'),
    couverts: colonne(headers, 'couverts'),
    type: colonne(headers, 'type'),
    nom: colonne(headers, 'consommateur'),
    table: colonne(headers, 'accountname'),
    profil: colonne(headers, 'profil'),
    paiement: colonne(headers, 'paiement'),
    ouverture: colonne(headers, 'opendate'),
  }
  const tickets = []
  const erreurs = []
  rows.forEach((r, n) => {
    const dh = lireDateHeure(r[i.ouverture])
    const total = parseNumberLoose(r[i.total])
    if (!dh || !Number.isFinite(total)) {
      erreurs.push(n + 2)
      return
    }
    const totalC = centimes(total)
    tickets.push({
      id: r[i.id] || '',
      dh,
      profil: (r[i.profil] || '').trim(),
      table: (r[i.table] || '').trim(),
      nom: (r[i.nom] || '').trim(),
      paiement: (r[i.paiement] || '').trim(),
      type: (r[i.type] || '').trim(),
      couverts: Math.round(parseNumberLoose(r[i.couverts]) || 0),
      total: totalC,
      parTaux: ttcParTaux(totalC, lireTaxes(r[i.taxes])),
    })
  })
  return { tickets, erreurs }
}

/**
 * Regroupe les tickets par journée × service × profil Lightspeed.
 * Annulations (VOID, montants négatifs) et rappels (RECALL) s'additionnent
 * simplement : le solde est le CA réel.
 */
export function regrouperTickets(tickets, reglages = REGLAGES_DEFAUT) {
  const groupes = new Map()
  for (const t of tickets) {
    const { jour, service } = jourEtService(t.dh, reglages)
    const profilCle = cle(t.profil)
    const k = `${jour}|${service}|${profilCle}`
    let g = groupes.get(k)
    if (!g) {
      g = { cle: k, jour, service, profil: t.profil, profilCle, total: 0, couverts: 0, parTaux: {}, tickets: [] }
      groupes.set(k, g)
    }
    g.total += t.total
    g.couverts += t.couverts
    for (const [taux, v] of Object.entries(t.parTaux)) g.parTaux[taux] = (g.parTaux[taux] || 0) + v
    g.tickets.push(t)
  }
  return [...groupes.values()].sort((a, b) =>
    a.jour.localeCompare(b.jour) || (a.service === b.service ? 0 : a.service === 'lunch' ? -1 : 1) || a.profil.localeCompare(b.profil))
}

function tauxConnu(t) {
  if (!Number.isFinite(t)) return null
  const proche = TAUX_CONNUS.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a))
  return Math.abs(proche - t) <= 0.6 ? proche : null
}

/** Lignes de l'export Départements → [{ libelle, cle, montant (centimes, TTC après rabais), taux }]. */
export function lireDepartements(headers, rows) {
  const iNom = colonne(headers, 'departement')
  const iBrut = colonne(headers, 'montant brut de la transaction')
  const iNet = colonne(headers, 'montant net de la transaction')
  const out = []
  for (const r of rows) {
    const libelle = (r[iNom] || '').trim()
    if (!libelle) continue
    const brut = parseNumberLoose(r[iBrut]) || 0
    const net = parseNumberLoose(r[iNet]) || 0
    const taux = net > 0 ? tauxConnu((brut / net - 1) * 100) : null
    out.push({ libelle, cle: cle(libelle), montant: centimes(brut), taux })
  }
  return out
}

/** Colonne proposée pour un département inconnu (à confirmer à l'import). */
export function devinerColonne(libelle, taux) {
  const n = cle(libelle)
  if (/sans alcool|soft|\beaux?\b|\bjus\b|caf|\bthe\b|infusion/.test(n)) return 'ca_bev_10'
  if (/alcool|\bvins?\b|biere|spiritueux|champagne|cocktail|\bbar\b/.test(n)) return 'ca_bev_20'
  if (/divers|autre|boutique|location|privat/.test(n)) return taux != null && taux >= 19 ? 'ca_autre' : 'ca_food'
  return taux != null && taux >= 19 ? 'ca_bev_20' : 'ca_food'
}

/** Lieu proposé pour un profil Lightspeed inconnu : même nom, sinon aucun. */
export function devinerLieu(profil, lieux) {
  const p = cle(profil)
  if (!p) return null
  const exact = lieux.find((l) => cle(l.nom) === p)
  if (exact) return exact.id
  const proche = lieux.find((l) => cle(l.nom).includes(p) || p.includes(cle(l.nom)))
  return proche ? proche.id : null
}

/**
 * Parts de chaque colonne du CA, par taux, pour une journée :
 * { '10': { ca_food: 1981500, ca_bev_10: 77000 }, '20': { ca_bev_20: …, ca_autre: … } }.
 * Les départements sans taux lisible (montant nul) sont ignorés.
 */
export function partsParTaux(departements, correspondances) {
  const out = {}
  for (const d of departements) {
    if (d.taux == null || d.montant === 0) continue
    const col = correspondances[d.cle]
    if (!col || col === 'ignorer') continue
    const t = String(d.taux)
    out[t] = out[t] || {}
    out[t][col] = (out[t][col] || 0) + d.montant
  }
  return out
}

/** Répartit `montant` (centimes) selon des poids, en gardant la somme exacte. */
function repartir(montant, poids) {
  const cles = Object.keys(poids).filter((k) => poids[k] > 0)
  const somme = cles.reduce((s, k) => s + poids[k], 0)
  if (cles.length === 0 || somme === 0) return null
  const parts = cles.map((k) => {
    const brut = (montant * poids[k]) / somme
    return { k, v: Math.trunc(brut), reste: brut - Math.trunc(brut) }
  })
  let ecart = montant - parts.reduce((s, p) => s + p.v, 0)
  const pas = ecart > 0 ? 1 : -1
  parts.sort((a, b) => (pas > 0 ? b.reste - a.reste : a.reste - b.reste))
  for (let j = 0; ecart !== 0; j = (j + 1) % parts.length) {
    parts[j].v += pas
    ecart -= pas
  }
  return Object.fromEntries(parts.map((p) => [p.k, p.v]))
}

/** Colonne par défaut d'un taux sans export Départements. */
export function colonneParDefaut(taux) {
  return Number(taux) >= 19 ? 'ca_bev_20' : 'ca_food'
}

/** Montants (centimes) d'un groupe de tickets par colonne du CA. */
export function colonnesDuGroupe(groupe, partsDuJour) {
  const out = { ca_food: 0, ca_bev_20: 0, ca_bev_10: 0, ca_autre: 0 }
  for (const [taux, montant] of Object.entries(groupe.parTaux)) {
    const r = (partsDuJour && partsDuJour[taux] && repartir(montant, partsDuJour[taux])) || { [colonneParDefaut(taux)]: montant }
    for (const [col, v] of Object.entries(r)) out[col] += v
  }
  return out
}

/**
 * Cellules du suivi CA (jour × lieu × service), en euros.
 * destinations : { [groupe.cle]: lieu_service_id } ; un groupe sans lieu est
 * ignoré (l'écran bloque la validation dans ce cas).
 * partsParJour : { [jour]: partsParTaux(...) }.
 */
export function construireCellules(groupes, destinations, partsParJour = {}) {
  const cellules = new Map()
  for (const g of groupes) {
    const lieu = destinations[g.cle]
    if (!lieu) continue
    const k = `${g.jour}|${lieu}|${g.service}`
    let c = cellules.get(k)
    if (!c) {
      c = { jour: g.jour, lieu_service_id: lieu, service: g.service, couverts: 0, ca_food: 0, ca_bev_20: 0, ca_bev_10: 0, ca_autre: 0 }
      cellules.set(k, c)
    }
    c.couverts += g.couverts
    const cols = colonnesDuGroupe(g, partsParJour[g.jour])
    for (const col of COLONNES_CA) c[col] += cols[col]
  }
  return [...cellules.values()].map((c) => ({
    ...c,
    ca_food: c.ca_food / 100,
    ca_bev_20: c.ca_bev_20 / 100,
    ca_bev_10: c.ca_bev_10 / 100,
    ca_autre: c.ca_autre / 100,
  }))
}
