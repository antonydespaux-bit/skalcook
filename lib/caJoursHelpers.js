// Helpers partagés pour la résolution des jours d'ouverture / d'événement
// en fonction des overrides budgétaires (table ca_budget_jours_override).
//
// DEUX MÉCANISMES selon le type d'override :
//
// 1. Override PAR LIEU (lieu_service_id défini) → modèle "dates élues"
//    Cas d'usage : "Privat" chez Joia n'est ouvert que 1 mardi par mois
//    (privatisations). L'override stocke `nb_jours = 1` pour (mardi, soir, Privat).
//    Le budget est AFFECTÉ à un seul mardi du mois (par défaut le dernier),
//    pas réparti sur tous les mardis. Les autres mardis affichent 0 pour cette
//    cellule → le cumul mensuel reste juste et la coloration jour-par-jour
//    reste fiable.
//    Voir buildElectedDatesMap + isCellElectedForDate.
//
// 2. Override GLOBAL ou SERVICE (lieu_service_id null) → modèle "ratio"
//    Cas d'usage : "ce mois j'ai 4 vendredis effectifs au lieu de 5 calendaires"
//    (un vendredi férié, par exemple). L'override stocke nb_jours=4 pour
//    (vendredi, service ou null, null). On applique un ratio nb_jours/naturel
//    à TOUTES les cellules vendredi → leur somme totale donne 4 vendredis
//    équivalents au lieu de 5. Le ratio est lissé, ce qui est l'approximation
//    correcte sur un total mensuel quand on ne sait pas QUEL vendredi est fermé.
//    Voir ratioOverrideForCell.
//
// Les deux mécanismes coexistent : pour une cellule donnée on applique l'un
// OU l'autre, jamais les deux. Une cellule avec override par lieu (Privat)
// est traitée en "dates élues" et N'EST PAS soumise au ratio (skip ratio).

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

// Compte le nombre d'occurrences naturel d'un jour-de-semaine ISO (1..7)
// dans le mois calendaire entier. Utilisé pour calculer le ratio override.
// Doublon de la fonction du même nom déjà exportée plus haut ? NON : la version
// ci-dessus est appelée par pickLastNOccurrencesOfDow. On la garde unique.

// ── Ratio override (mécanisme 2 : global / service) ────────────────────────
//
// Construit un Map<key, nb_jours> indexable par (annee, mois, jds, service,
// lieu) avec priorité décroissante (lieu, svc) > (NULL, svc) > (NULL, NULL).
// Pour les overrides PAR LIEU, on stocke aussi mais la valeur n'est lue que
// si un caller appelle ratioOverrideForCell avec un lieu spécifique. En
// pratique, les pages qui utilisent le ratio passent `null` comme lieu pour
// les cellules dont l'override par lieu est déjà géré via dates élues.
export function buildOverridesRatioMap(joursOverrideRows) {
  const out = new Map()
  for (const o of (joursOverrideRows || [])) {
    const annee = Number(o.annee)
    const mois = Number(o.mois)
    const jds = Number(o.jour_semaine)
    const nb = Number(o.nb_jours)
    if (!Number.isFinite(annee) || !Number.isFinite(mois) || !Number.isFinite(jds) || !Number.isFinite(nb)) continue
    const svcKey = o.service ?? '__all__'
    const lieuKey = o.lieu_service_id ?? '__all__'
    out.set(`${annee}_${mois}_${jds}_${svcKey}_${lieuKey}`, nb)
  }
  return out
}

// Lookup ratio nb_jours/naturel pour une cellule donnée. Priorité décroissante :
//   1. override spécifique au lieu + service
//   2. override service-only (lieu = null)
//   3. override jds-only (service = null, lieu = null)
//   4. ratio = 1 (pas d'override applicable)
//
// `lieu` peut être null pour ne pas tenter la priorité 1 (utile quand l'override
// par lieu est déjà géré par dates élues ailleurs et qu'on veut juste appliquer
// le ratio global/service ici).
export function ratioOverrideForCell(overridesMap, annee, mois, jds, lieu, service) {
  if (!overridesMap) return 1
  const prefix = `${annee}_${mois}_${jds}_`
  const lieuKey = lieu ?? '__all__'
  const keys = [
    `${prefix}${service}_${lieuKey}`,
    `${prefix}${service}_${'__all__'}`,
    `${prefix}${'__all__'}_${'__all__'}`,
  ]
  let nbJours = null
  for (const k of keys) {
    if (overridesMap.has(k)) { nbJours = overridesMap.get(k); break }
  }
  if (nbJours == null) return 1
  const naturel = countIsoJdsInMonth(annee, mois, jds)
  return naturel > 0 ? nbJours / naturel : 1
}
