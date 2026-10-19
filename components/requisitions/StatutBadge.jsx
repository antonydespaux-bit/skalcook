'use client'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../../lib/useTheme'

// Pastille du statut d'une réquisition (libellé traduit, couleur sémantique).
export default function StatutBadge({ statut }) {
  const { t } = useTranslation()
  const { c } = useTheme()
  const couleurs = {
    a_valider:      [c.orangeClair, c.orange],
    a_preparer:     [c.accentClair, c.accent],
    en_preparation: [c.accentClair, c.accent],
    livree:         [c.vertClair, c.vert],
    refusee:        [c.rougeClair, c.rouge],
    annulee:        [c.fond, c.texteMuted],
  }
  const [fond, texte] = couleurs[statut] || [c.fond, c.texteMuted]
  return (
    <span style={{ fontSize: '11px', fontWeight: '500', background: fond, color: texte, borderRadius: '20px', padding: '3px 10px', whiteSpace: 'nowrap' }}>
      {t(`requisitions.statuts.${statut}`, { defaultValue: statut })}
    </span>
  )
}
