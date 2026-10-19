'use client'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { appelApiRequisitions } from '../../lib/requisitions/apiClient'
import { useTheme } from '../../lib/useTheme'

// Recherche dans le catalogue servi par un service préparateur (ingrédients
// cuisine/bar ou articles), via /api/requisitions/catalogue. Cliquer sur un
// résultat l'ajoute (onAjouter) ; les produits déjà présents sont grisés.
export default function RechercheProduits({ clientId, serviceId, dejaIds, onAjouter, onErreur, autoFocus = false }) {
  const { t } = useTranslation()
  const { c } = useTheme()
  const [recherche, setRecherche] = useState('')
  const [resultats, setResultats] = useState([])
  const [cherche, setCherche] = useState(false)

  // Recherche différée pendant la frappe.
  useEffect(() => {
    if (!clientId || !serviceId) return
    let annule = false
    const minuteur = setTimeout(async () => {
      setCherche(true)
      try {
        const q = new URLSearchParams({ client_id: clientId, service_id: serviceId, q: recherche.trim() })
        const d = await appelApiRequisitions(`/api/requisitions/catalogue?${q}`)
        if (!annule) setResultats(d.produits || [])
      } catch (e) {
        if (!annule) { setResultats([]); onErreur?.(e.message) }
      } finally {
        if (!annule) setCherche(false)
      }
    }, 250)
    return () => { annule = true; clearTimeout(minuteur) }
  }, [clientId, serviceId, recherche, onErreur])

  const champ = { padding: '9px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc, width: '100%', boxSizing: 'border-box' }

  return (
    <div>
      <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} autoFocus={autoFocus}
        placeholder={t('requisitions.nouvelle.searchPlaceholder')} aria-label={t('requisitions.nouvelle.searchPlaceholder')} style={champ} />
      <div style={{ marginTop: '8px', maxHeight: '220px', overflowY: 'auto', border: `0.5px solid ${c.bordure}`, borderRadius: '8px' }}>
        {cherche && resultats.length === 0 ? (
          <div style={{ padding: '10px 12px', fontSize: '13px', color: c.texteMuted }}>…</div>
        ) : resultats.length === 0 ? (
          <div style={{ padding: '10px 12px', fontSize: '13px', color: c.texteMuted, fontStyle: 'italic' }}>{t('requisitions.nouvelle.noResult')}</div>
        ) : resultats.map((p) => {
          const deja = dejaIds?.has(p.id)
          return (
            <button key={p.id} type="button" onClick={() => onAjouter(p)} disabled={deja} style={{
              display: 'flex', width: '100%', justifyContent: 'space-between', gap: '10px', textAlign: 'left',
              padding: '9px 12px', border: 'none', borderBottom: `0.5px solid ${c.bordure}`, background: deja ? c.fond : 'transparent',
              color: deja ? c.texteMuted : c.texte, fontSize: '13px', cursor: deja ? 'default' : 'pointer',
            }}>
              <span>{p.nom}{p.categorie ? <span style={{ color: c.texteMuted }}> · {p.categorie}</span> : null}</span>
              <span style={{ color: c.texteMuted }}>{deja ? '✓' : `+ ${p.unite || 'u'}`}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
