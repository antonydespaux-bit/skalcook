// Helpers partagés pour la résolution des jours d'ouverture / d'événement
// en fonction des overrides budgétaires (table ca_budget_jours_override).
//
// MODÈLE UNIQUE : "dates élues" pour TOUS les types d'overrides.
//
// Pour chaque override "(annee, mois, jour-de-semaine, service?, lieu?) =
// nb_jours", on désigne les N DERNIÈRES occurrences du jour-de-semaine dans
// le mois comme étant "ouvertes". Les autres occurrences sont "fermées"
// (budget 0 pour les cellules concernées).
//
// Exemples Joia mai 2026 :
//
// 1) Override PAR LIEU : "Privat 1 mardi/mois"
//    → nb_jours=1, lieu_service_id=Privat, jds=2
//    → 1 dernier mardi = 26 mai = ouvert pour Privat
//    → mardis 5, 12, 19 = Privat fermé (budget 0)
//
// 2) Override SERVICE/GLOBAL : "vendredi 4/5 (1 férié)"
//    → nb_jours=4, lieu_service_id=null, jds=5
//    → 4 derniers vendredis = 8, 15, 22, 29 = ouverts (toutes cellules vendredi)
//    → vendredi 1er = fermé (budget 0 pour toutes cellules vendredi)
//
// 3) Override "lundi=0" (fermeture totale)
//    → nb_jours=0 → 0 dates élues → toutes cellules lundi à 0
//
// Pourquoi "N derniers" ? Faute de calendrier précis des fermetures, c'est
// la convention par défaut. Pour les fermetures début-de-mois (ex : 1er mai
// férié), elle colle naturellement. Pour les privats, elles ont tendance à
// se concentrer en fin de mois.
//
// LOOKUP HIÉRARCHIQUE pour une cellule (lieu, svc) sur une date :
//   1. override spécifique (lieu, svc)
//   2. override service-only (NULL, svc)
//   3. override global (NULL, NULL)
//   4. pas d'override → toujours élue
// Premier match gagne. Si match : élue ssi la date est dans le Set.

// ── Helpers de date ────────────────────────────────────────────────────────

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
// toutes les occurrences. Si n <= 0, retourne []. Tri chronologique croissant.
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

// ── Dates élues (modèle unique) ────────────────────────────────────────────

// Construit un index Map<`${annee}_${mois}_${jds}_${svc|__all__}_${lieu|__all__}`, Set<isoDate>>
// avec les dates "ouvertes" (élues) pour chaque override. Une cellule est
// élue pour une date donnée si elle est dans le Set correspondant à l'override
// le plus spécifique applicable (cf. isCellElectedForDate).
//
// Accepte TOUS les overrides : par lieu, par service, global. Avant on ne
// gérait que les overrides par lieu via ce mécanisme (les autres passaient
// par un ratio) — désormais on unifie sur dates élues.
export function buildElectedDatesMap(joursOverrideRows) {
  const out = new Map()
  for (const o of (joursOverrideRows || [])) {
    const annee = Number(o.annee)
    const mois = Number(o.mois)
    const jds = Number(o.jour_semaine)
    const nb = Number(o.nb_jours)
    if (!Number.isFinite(annee) || !Number.isFinite(mois) || !Number.isFinite(jds) || !Number.isFinite(nb)) continue
    const svcKey = o.service ?? '__all__'
    const lieuKey = o.lieu_service_id ?? '__all__'
    const dates = pickLastNOccurrencesOfDow(annee, mois, jds, nb)
    const key = `${annee}_${mois}_${jds}_${svcKey}_${lieuKey}`
    out.set(key, new Set(dates))
  }
  return out
}

// Pour une cellule budget et une date iso, retourne true si la cellule doit
// être comptée pour cette date.
//
// Lookup hiérarchique (priorité décroissante) :
//   1. (lieu, svc) — override spécifique au lieu + service
//   2. (NULL, svc) — override service-only
//   3. (NULL, NULL) — override global
//
// Premier match gagne. Si trouvé : élue ssi la date est dans le Set.
// Pas d'override applicable : toujours élue.
//
// `cell.lieu_service_id_source` est consulté en priorité s'il existe : la
// page rapport-hebdo (et ComparaisonPanel) remappent lieu_service_id vers
// le parent pour les agrégations analytiques, mais l'override est stocké
// en DB avec le lieu enfant (ex : Privat sous Joia, ou ici 2 lieux top-level
// distincts). Conserver l'id source permet de matcher l'override sur le bon
// enfant.
export function isCellElectedForDate(cell, isoDate, annee, mois, electedDatesMap) {
  if (!cell) return true
  if (!electedDatesMap || electedDatesMap.size === 0) return true
  const lieuId = cell.lieu_service_id_source || cell.lieu_service_id
  const prefix = `${annee}_${mois}_${cell.jour_semaine}_`
  const candidates = []
  if (lieuId && cell.service) candidates.push(`${prefix}${cell.service}_${lieuId}`)
  if (cell.service) candidates.push(`${prefix}${cell.service}___all__`)
  candidates.push(`${prefix}__all_____all__`)
  for (const key of candidates) {
    const elected = electedDatesMap.get(key)
    if (elected) return elected.has(isoDate)
  }
  return true
}

// ── Compat : ratio (déprécié, sera supprimé) ───────────────────────────────
//
// Gardé temporairement pour les callers qui ne sont pas encore migrés vers
// le modèle dates élues. À supprimer une fois tous les callers migrés.
// NB : le mécanisme ratio donne des résultats DIFFÉRENTS du mécanisme dates
// élues sur les périodes partielles (cumul mensuel identique, mais répartition
// jour par jour différente).
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
