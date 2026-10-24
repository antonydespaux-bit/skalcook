// Visites d'un client CRM d'après ses réservations (crm_reservations) et les
// seuils de son groupe (groupes.crm_vip_visites / crm_vip_mois /
// crm_perdu_mois, défauts 5 visites sur 12 mois, perdu après 6 mois).
//
// Une visite = réservation dont le repas est passé et qui n'a pas été
// annulée, refusée ou non honorée (statuts TheFork en majuscules).

export const SEUILS_DEFAUT = { vipVisites: 5, vipMois: 12, perduMois: 6 }

const STATUTS_NON_VENUS = new Set(['CANCELED', 'CANCELLED', 'NO_SHOW', 'NOSHOW', 'REFUSED', 'REJECTED'])

export const LIBELLES_STATUT_RESA = {
  RECORDED: 'Enregistrée',
  CONFIRMED: 'Confirmée',
  ARRIVED: 'Arrivé',
  SEATED: 'Installé',
  PARTIALLY_ARRIVED: 'En partie arrivé',
  LEFT: 'Parti',
  CANCELED: 'Annulée',
  NO_SHOW: 'Non venu',
  REFUSED: 'Refusée',
}

function moinsMois(date, mois) {
  const d = new Date(date)
  d.setMonth(d.getMonth() - mois)
  return d
}

/**
 * @param {Array<{date_repas: string|null, statut: string|null}>} reservations
 * @param {{vipVisites?: number, vipMois?: number, perduMois?: number}} seuils
 * @param {boolean} vipTheFork  statut VIP posé dans TheFork
 * @param {Date} maintenant
 */
export function statsVisites(reservations, seuils = {}, vipTheFork = false, maintenant = new Date()) {
  const s = { ...SEUILS_DEFAUT, ...Object.fromEntries(Object.entries(seuils).filter(([, v]) => v)) }
  const visites = (reservations || [])
    .filter((r) => r.date_repas && new Date(r.date_repas) <= maintenant && !STATUTS_NON_VENUS.has(String(r.statut || '').toUpperCase()))
    .map((r) => new Date(r.date_repas))
    .sort((a, b) => b - a)
  const depuis = moinsMois(maintenant, s.vipMois)
  const visitesPeriode = visites.filter((d) => d >= depuis).length
  const derniereVisite = visites[0] || null
  const aVenir = (reservations || []).filter((r) => r.date_repas && new Date(r.date_repas) > maintenant
    && !STATUTS_NON_VENUS.has(String(r.statut || '').toUpperCase())).length
  return {
    visites: visites.length,
    visitesPeriode,
    derniereVisite,
    aVenir,
    vip: vipTheFork || visitesPeriode >= s.vipVisites,
    // Perdu : déjà venu, plus revenu depuis perduMois, et rien de réservé
    perdu: !!derniereVisite && derniereVisite < moinsMois(maintenant, s.perduMois) && aVenir === 0,
    seuils: s,
  }
}
