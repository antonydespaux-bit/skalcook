// Constantes partagées du module CRM.

export const STATUTS = [
  { key: 'demande',      label: 'Demande',       couleur: '#6366F1' }, // bleu
  { key: 'devis_envoye', label: 'Devis envoyé',  couleur: '#8B5CF6' }, // violet
  { key: 'degustation',  label: 'Dégustation',   couleur: '#EC4899' }, // rose
  { key: 'negociation',  label: 'Négociation',   couleur: '#F59E0B' }, // amber
  { key: 'acompte',      label: 'Acompte reçu',  couleur: '#F97316' }, // orange
  { key: 'confirme',     label: 'Confirmé',      couleur: '#10B981' }, // emeraude
  { key: 'realise',      label: 'Réalisé',       couleur: '#14B8A6' }, // teal
  { key: 'facture',      label: 'Facturé',       couleur: '#0EA5E9' }, // sky
  { key: 'paye',         label: 'Payé',          couleur: '#16A34A' }, // vert
  { key: 'annule',       label: 'Annulé',        couleur: '#6B7280' }, // gris
  { key: 'perdu',        label: 'Perdu',         couleur: '#DC2626' }, // rouge
]

export const STATUTS_MAP = Object.fromEntries(STATUTS.map((s) => [s.key, s]))

// Statuts affichés dans le kanban principal (exclut clos négatifs par défaut).
export const KANBAN_STATUTS = STATUTS.filter((s) => !['annule', 'perdu'].includes(s.key))

// Statuts considérés comme "perdus / clos" pour les stats.
export const STATUTS_PERDUS = ['annule', 'perdu']

// Statuts considérés comme "gagnés / engagés" pour le CA prévisionnel.
export const STATUTS_ENGAGES = ['acompte', 'confirme', 'realise', 'facture', 'paye']

export const TYPES_PRESTATION = [
  { key: 'mariage',    label: 'Mariage' },
  { key: 'cocktail',   label: 'Cocktail dînatoire' },
  { key: 'buffet',     label: 'Buffet' },
  { key: 'livraison',  label: 'Livraison' },
  { key: 'seminaire',  label: 'Séminaire' },
  { key: 'anniversaire', label: 'Anniversaire' },
  { key: 'autre',      label: 'Autre' },
]

export const TYPES_PRESTATION_MAP = Object.fromEntries(TYPES_PRESTATION.map((t) => [t.key, t]))

export const LIEUX_TYPES = [
  { key: 'sur_place', label: 'Sur place' },
  { key: 'livraison', label: 'Livraison' },
  { key: 'externe',   label: 'Prestation externe' },
]

export const LIEUX_TYPES_MAP = Object.fromEntries(LIEUX_TYPES.map((l) => [l.key, l]))

export const SOURCES = [
  'Site web',
  'Instagram',
  'Facebook',
  'Bouche-à-oreille',
  'Annuaire',
  'Mariages.net',
  'Salon professionnel',
  'Ancien client',
  'Autre',
]

export function formatMontant(n) {
  if (n === null || n === undefined || n === '') return '—'
  const v = Number(n)
  if (Number.isNaN(v)) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v)
}

export function formatDateFr(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return '—'
  }
}

export function clientDisplayName(client) {
  if (!client) return '—'
  if (client.type === 'entreprise') {
    return client.raison_sociale || [client.prenom, client.nom].filter(Boolean).join(' ') || '—'
  }
  return [client.prenom, client.nom].filter(Boolean).join(' ') || '—'
}

// ─── Devis ────────────────────────────────────────────────────────────────
export const STATUTS_DEVIS = [
  { key: 'brouillon', label: 'Brouillon', couleur: '#6B7280' }, // gris
  { key: 'envoye',    label: 'Envoyé',    couleur: '#8B5CF6' }, // violet
  { key: 'accepte',   label: 'Accepté',   couleur: '#10B981' }, // emeraude
  { key: 'refuse',    label: 'Refusé',    couleur: '#DC2626' }, // rouge
  { key: 'expire',    label: 'Expiré',    couleur: '#F59E0B' }, // amber
]

export const STATUTS_DEVIS_MAP = Object.fromEntries(STATUTS_DEVIS.map((s) => [s.key, s]))

// Taux de TVA usuels en restauration (% appliqué au HT).
export const TAUX_TVA = [
  { key: 10,  label: '10 % (sur place)' },
  { key: 20,  label: '20 % (alcool / standard)' },
  { key: 5.5, label: '5,5 % (vente à emporter)' },
  { key: 0,   label: '0 % (hors champ)' },
]

export const CONDITIONS_PAIEMENT = [
  '30 % d\'acompte à la commande, solde le jour de la prestation',
  '50 % d\'acompte à la commande, solde le jour de la prestation',
  'Acompte de 30 %, solde à réception de facture',
  'Paiement comptant à réception',
  'Paiement à 30 jours fin de mois',
]

// Formate un numéro de devis : DEV-2026-042
export function formatDevisNumero(prefix, annee, sequence) {
  if (!prefix || !annee || !sequence) return '—'
  return `${prefix}-${annee}-${String(sequence).padStart(3, '0')}`
}

// Calcule les totaux d'une ligne (arrondis à 2 décimales).
export function calcLigneTotaux(ligne) {
  const qte = Number(ligne?.quantite) || 0
  const pu = Number(ligne?.prix_unitaire_ht) || 0
  const remise = Number(ligne?.remise_pct) || 0
  const tva = Number(ligne?.tva_taux) || 0
  const brut = qte * pu
  const totalHt = brut * (1 - remise / 100)
  const totalTva = totalHt * (tva / 100)
  const totalTtc = totalHt + totalTva
  return {
    total_ht: Math.round(totalHt * 100) / 100,
    total_tva: Math.round(totalTva * 100) / 100,
    total_ttc: Math.round(totalTtc * 100) / 100,
  }
}

// Agrège les totaux d'un devis à partir de ses lignes.
export function calcDevisTotaux(lignes) {
  const init = { total_ht: 0, total_tva: 0, total_ttc: 0 }
  return (lignes || []).reduce((acc, l) => {
    const t = calcLigneTotaux(l)
    acc.total_ht += t.total_ht
    acc.total_tva += t.total_tva
    acc.total_ttc += t.total_ttc
    return acc
  }, init)
}

export function hexToRgba(hex, alpha = 1) {
  if (!hex) return `rgba(0,0,0,${alpha})`
  const m = hex.replace('#', '')
  const bigint = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16)
  const r = (bigint >> 16) & 255
  const g = (bigint >> 8) & 255
  const b = bigint & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
