// Export Excel de la base clients du CRM (/crm/clients).
//
// Les lignes viennent de la fonction SQL crm_clients_recherche (filtres de la
// page appliqués). Pas d'allergies ni de notes : elles ne sont pas importées
// (RGPD). La colonne « Contactable » dit si le client peut être démarché
// (accord newsletter TheFork, ou contact professionnel, et pas de
// désinscription).
//
// Comme lib/groupeExport.js, ce module ne fait QUE construire le workbook :
// l'écriture du fichier (XLSX.writeFile) est faite par la page.

import * as XLSX from 'xlsx'

const date = (v) => (v ? new Date(v).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : '')
const ouiNon = (v) => (v ? 'Oui' : 'Non')

export function estContactable(c) {
  return !c.desinscrit_at && (!!c.contactable || c.type === 'entreprise')
}

/**
 * @param {Array<object>} clients  lignes de crm_clients_recherche
 * @param {Record<string,string>} maisons  client_id → nom de la maison
 */
export function buildClientsRows(clients = [], maisons = {}) {
  return clients.map((c) => {
    const champs = c.champs_thefork && typeof c.champs_thefork === 'object' ? c.champs_thefork : {}
    return {
      'Type': c.type === 'entreprise' ? 'Entreprise' : 'Particulier',
      'Société': c.raison_sociale || '',
      'Nom': c.nom || '',
      'Prénom': c.prenom || '',
      'E-mail': c.email || '',
      'Téléphone': c.telephone || '',
      'Adresse': c.adresse || '',
      'Code postal': c.code_postal || '',
      'Ville': c.ville || '',
      'Langue': c.langue || '',
      'Maison': maisons[c.client_id] || '',
      'Contactable': ouiNon(estContactable(c)),
      'Désinscrit le': date(c.desinscrit_at),
      'VIP': ouiNon(c.vip),
      'À relancer': ouiNon(c.perdu),
      'Prescripteur': ouiNon(c.prescripteur),
      'Rang TheFork': c.rang || '',
      'Visites (total)': Number(c.visites) || 0,
      'Visites (période VIP)': Number(c.visites_periode) || 0,
      'Dernière visite': date(c.derniere_visite),
      'Prochaine réservation': date(c.prochaine_reservation),
      'Préférences': c.preferences || '',
      'Tags': (c.tags || []).join(', '),
      ...Object.fromEntries(Object.entries(champs).map(([k, v]) => [`TheFork · ${k}`, typeof v === 'boolean' ? ouiNon(v) : String(v ?? '')])),
      'Source': c.source === 'thefork' ? 'TheFork' : (c.source || ''),
      'Créé le': date(c.created_at),
    }
  })
}

export function buildClientsWorkbook(clients, maisons, { filtres = '', generatedAt = new Date() } = {}) {
  const wb = XLSX.utils.book_new()
  const rows = buildClientsRows(clients, maisons)
  const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Info: 'Aucun client pour ces filtres' }])
  sheet['!cols'] = Object.keys(rows[0] || { Info: '' }).map((k) => ({ wch: Math.min(Math.max(k.length + 2, 12), 40) }))
  XLSX.utils.book_append_sheet(wb, sheet, 'Clients')
  const info = XLSX.utils.json_to_sheet([
    { Champ: 'Généré le', Valeur: generatedAt.toLocaleString('fr-FR') },
    { Champ: 'Clients', Valeur: rows.length },
    { Champ: 'Filtres', Valeur: filtres || 'aucun' },
    { Champ: 'Rappel', Valeur: 'Données personnelles : ne démarcher que les clients « Contactable = Oui », ne pas diffuser ce fichier, le supprimer après usage.' },
  ])
  info['!cols'] = [{ wch: 14 }, { wch: 110 }]
  XLSX.utils.book_append_sheet(wb, info, 'Infos')
  return wb
}

export function nomFichierClients(generatedAt = new Date()) {
  return `clients-crm-${generatedAt.toISOString().slice(0, 10)}.xlsx`
}
