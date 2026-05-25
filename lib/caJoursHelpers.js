// Helpers partagés pour la résolution des jours d'ouverture / d'événement
// en fonction des overrides budgétaires par lieu (table ca_budget_jours_override).
//
// Cas d'usage type : "Privat" chez Joia n'est ouvert que 1 mardi par mois
// (privatisations). L'override stocke `nb_jours = 1` pour (mardi, soir, Privat).
// On veut alors que le budget de cette cellule soit AFFECTÉ à un seul mardi
// du mois (par défaut le dernier), pas réparti sur tous les mardis.
//
// Pourquoi le "dernier" ? Faute de calendrier précis des évènements, on
// choisit la convention qui rend la coloration jour-par-jour la moins
// trompeuse : les mardis sans privat affichent 0 (et le CA réel ~0 → Δ ≈ 0),
// le mardi élu porte le budget complet (et recevra le CA réel le moment venu).
//
// Note : ce module ne traite QUE les overrides par lieu. Les overrides
// service ou globaux (lieu_service_id null) représentent des fermetures
// exceptionnelles → comportement existant (ratio nb_jours/calendaire) conservé
// dans les pages qui en ont besoin.

// Compte le nombre d'occurrences d'un jour-de-semaine ISO (1=lun .. 7=dim)
// dans le mois donné (mois 1-12).
export function countIsoJdsInMonth(annee, mois, isoJds) {
  const daysInMonth = new Date(annee, mois, 0).getDate()
  let count = 0
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(annee, mois - 1, d).getDay()
    const iso = dow === 0 ? 7 : dow
    if (iso === isoJds) count++
  }
  return count
}

// Retourne les ISO dates des N dernières occurrences d'un jour-de-semaine ISO
// dans le mois (mois 1-12). Si n >= nb occurrences calendaires, retourne
// toutes les occurrences. Tri chronologique croissant.
//
// Exemples (mai 2026 = jeudi 1er, donc 4 mardis : 05, 12, 19, 26) :
//   pickLastNOccurrencesOfDow(2026, 5, 2, 1) → ['2026-05-26']
//   pickLastNOccurrencesOfDow(2026, 5, 2, 2) → ['2026-05-19', '2026-05-26']
//   pickLastNOccurrencesOfDow(2026, 5, 2, 4) → ['2026-05-05', '2026-05-12', '2026-05-19', '2026-05-26']
//   pickLastNOccurrencesOfDow(2026, 5, 2, 10) → idem (cap à toutes les dates)
export function pickLastNOccurrencesOfDow(annee, mois, isoJds, n) {
  const daysInMonth = new Date(annee, mois, 0).getDate()
  const moisStr = String(mois).padStart(2, '0')
  const matches = []
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(annee, mois - 1, d).getDay()
    const iso = dow === 0 ? 7 : dow
    if (iso === isoJds) {
      matches.push(`${annee}-${moisStr}-${String(d).padStart(2, '0')}`)
    }
  }
  if (n == null || n >= matches.length) return matches
  if (n <= 0) return []
  return matches.slice(-n)
}

// Construit un index "dates élues" à partir des overrides par lieu.
// Retourne Map<`${annee}_${mois}_${jds}_${svc}_${lieuId}`, Set<isoDate>>.
// Ne traite QUE les rows avec lieu_service_id défini. Les autres overrides
// (lieu null) sont à gérer ailleurs (ratio).
export function buildElectedDatesMap(joursOverrideRows) {
  const out = new Map()
  for (const o of (joursOverrideRows || [])) {
    if (!o.lieu_service_id) continue
    const annee = Number(o.annee)
    const mois = Number(o.mois)
    const jds = Number(o.jour_semaine)
    const svc = o.service
    const nb = Number(o.nb_jours)
    if (!Number.isFinite(annee) || !Number.isFinite(mois) || !Number.isFinite(jds) || !Number.isFinite(nb)) continue
    if (!svc) continue
    const dates = pickLastNOccurrencesOfDow(annee, mois, jds, nb)
    const key = `${annee}_${mois}_${jds}_${svc}_${o.lieu_service_id}`
    out.set(key, new Set(dates))
  }
  return out
}

// Pour une cellule budget (jour_semaine, service, lieu_service_id) et une
// date iso d'un mois donné, retourne true si la cellule doit être comptée
// pour cette date.
// - Cellule sans lieu_service_id ou sans override pour ce (mois, jds, svc, lieu)
//   → toujours true (comportement calendaire classique conservé).
// - Cellule avec override par lieu → true uniquement si la date fait partie
//   des N dates élues du mois.
//
// `cell.lieu_service_id_source` est consulté en priorité s'il existe : la
// page rapport-hebdo (et le panel comparaison) remappent lieu_service_id
// vers le parent pour les agrégations analytiques, mais l'override est
// stocké en DB avec le lieu enfant (ex : Privat sous Joia). Conserver
// l'id source permet de matcher l'override sur le bon enfant.
export function isCellElectedForDate(cell, isoDate, annee, mois, electedDatesMap) {
  if (!cell) return true
  if (!electedDatesMap || electedDatesMap.size === 0) return true
  const lieuId = cell.lieu_service_id_source || cell.lieu_service_id
  if (!lieuId) return true
  const key = `${annee}_${mois}_${cell.jour_semaine}_${cell.service}_${lieuId}`
  const elected = electedDatesMap.get(key)
  if (!elected) return true
  return elected.has(isoDate)
}
