'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { appelApiRequisitions } from '../../lib/requisitions/apiClient'
import { usePermissions } from '../../lib/usePermissions'
import { useTenant } from '../../lib/useTenant'
import { useTheme } from '../../lib/useTheme'

// Notifications des réquisitions : pop-up à la connexion (et à chaque
// nouvelle notification) listant les commandes qui attendent l'utilisateur,
// puis pastille en bas à droite une fois fermé. Monté une fois dans
// components/Providers.jsx ; n'apparaît que si le module est actif et que
// l'utilisateur a accès aux réquisitions.

const INTERVALLE_MS = 60_000

export default function NotificationsRequisitions() {
  const { t } = useTranslation()
  const { c } = useTheme()
  const router = useRouter()
  const pathname = usePathname()
  const { loading, peutVoir } = usePermissions()
  const tenant = useTenant()?.tenant
  const clientId = tenant?.id || null
  const actif = !loading && !!clientId && (tenant?.modules_actifs || []).includes('requisitions') && peutVoir('requisitions')

  const [notifs, setNotifs] = useState([])
  const [ouvert, setOuvert] = useState(false)
  const dejaVues = useRef(new Set())   // ids déjà présentés : le pop-up ne se rouvre que pour du nouveau

  const charger = useCallback(async () => {
    const d = await appelApiRequisitions(`/api/requisitions/notifications?client_id=${encodeURIComponent(clientId)}`)
    return (d.notifications || []).filter((n) => !n.lu_at)
  }, [clientId])

  useEffect(() => {
    if (!actif) return
    let annule = false
    const rafraichir = () => charger()
      .then((nonLues) => {
        if (annule) return
        setNotifs(nonLues)
        const nouvelles = nonLues.some((n) => !dejaVues.current.has(n.id))
        nonLues.forEach((n) => dejaVues.current.add(n.id))
        if (nouvelles) setOuvert(true)
      })
      .catch(() => { /* silencieux : la pastille réessaiera */ })
    rafraichir()
    const minuteur = setInterval(rafraichir, INTERVALLE_MS)
    return () => { annule = true; clearInterval(minuteur) }
  }, [actif, charger, pathname])

  if (!actif || notifs.length === 0) return null

  const marquer = async (ids) => {
    try {
      await appelApiRequisitions('/api/requisitions/notifications', { method: 'POST', body: { client_id: clientId, ...(ids ? { ids } : {}) } })
    } catch { /* l'état local suffit à masquer ; la base se resynchronisera */ }
    setNotifs((ns) => (ids ? ns.filter((n) => !ids.includes(n.id)) : []))
  }

  const ouvrir = async (n) => {
    await marquer([n.id])
    setOuvert(false)
    if (n.requisition_id) router.push(`/requisitions/${n.requisition_id}`)
  }

  const position = { position: 'fixed', right: '16px', bottom: '16px', zIndex: 9000 }

  if (!ouvert) {
    return (
      <button className="no-print" onClick={() => setOuvert(true)} aria-label={t('requisitions.notifications.show')} style={{
        ...position, display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 14px', borderRadius: '999px',
        border: `0.5px solid ${c.bordure}`, background: c.blanc, color: c.texte, fontSize: '13px', fontWeight: '600',
        boxShadow: '0 6px 20px rgba(0,0,0,0.15)', cursor: 'pointer',
      }}>
        🛎️ <span style={{ background: c.rouge, color: 'white', borderRadius: '999px', minWidth: '20px', padding: '1px 6px', fontSize: '12px', textAlign: 'center' }}>{notifs.length}</span>
      </button>
    )
  }

  return (
    <div className="no-print" role="dialog" aria-label={t('requisitions.notifications.title')} style={{
      ...position, width: 'min(360px, calc(100vw - 32px))', background: c.blanc, color: c.texte,
      border: `0.5px solid ${c.bordure}`, borderRadius: '14px', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 14px', borderBottom: `0.5px solid ${c.bordure}` }}>
        <span style={{ fontSize: '18px' }}>🛎️</span>
        <span style={{ flex: '1 1 auto' }}>
          <span style={{ display: 'block', fontSize: '14px', fontWeight: '600' }}>{t('requisitions.notifications.title')}</span>
          <span style={{ display: 'block', fontSize: '12px', color: c.texteMuted }}>{t('requisitions.notifications.summary', { count: notifs.length })}</span>
        </span>
        <button onClick={() => setOuvert(false)} aria-label={t('requisitions.notifications.close')} style={{
          border: 'none', background: 'transparent', fontSize: '18px', color: c.texteMuted, cursor: 'pointer', padding: '4px',
        }}>×</button>
      </div>
      <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
        {notifs.slice(0, 8).map((n) => (
          <button key={n.id} onClick={() => ouvrir(n)} style={{
            display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none',
            borderBottom: `0.5px solid ${c.bordure}`, background: 'transparent', color: c.texte, fontSize: '13px', cursor: 'pointer',
          }}>
            {t(`requisitions.notifications.types.${n.type}`, { ...(n.donnees || {}), defaultValue: n.type })}
            {n.donnees?.motif && <span style={{ display: 'block', fontSize: '12px', color: c.texteMuted }}>{n.donnees.motif}</span>}
          </button>
        ))}
      </div>
      <div style={{ padding: '10px 14px', textAlign: 'right' }}>
        <button onClick={() => { marquer(); setOuvert(false) }} style={{
          border: `0.5px solid ${c.bordure}`, background: 'transparent', borderRadius: '8px', padding: '6px 10px',
          fontSize: '12px', color: c.texte, cursor: 'pointer',
        }}>{t('requisitions.notifications.markAllRead')}</button>
      </div>
    </div>
  )
}
