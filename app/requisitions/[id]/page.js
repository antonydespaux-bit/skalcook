'use client'
export const dynamic = 'force-dynamic'
import { useCallback, useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { getClientId } from '../../../lib/supabase'
import { appelApiRequisitions } from '../../../lib/requisitions/apiClient'
import { useTheme } from '../../../lib/useTheme'
import { useIsMobile } from '../../../lib/useIsMobile'
import Navbar from '../../../components/Navbar'
import ChefLoader from '../../../components/ChefLoader'
import BackButton from '../../../components/BackButton'
import StatutBadge from '../../../components/requisitions/StatutBadge'

// Détail d'une réquisition : services, statut, lignes, et annulation par le
// demandeur tant que la préparation n'a pas commencé.

const fmtQte = (v, langue) => (v == null ? '—' : new Intl.NumberFormat(langue, { maximumFractionDigits: 3 }).format(v))

export default function RequisitionDetailPage() {
  const { t, i18n } = useTranslation()
  const { c } = useTheme()
  const isMobile = useIsMobile()
  const { id } = useParams()
  const searchParams = useSearchParams()
  const langue = i18n.language || 'fr'

  const [clientId, setClientId] = useState(null)
  const [d, setD] = useState(null)
  const [erreur, setErreur] = useState('')
  const [info, setInfo] = useState(searchParams.get('envoyee') ? 'sent' : '')
  const [occupe, setOccupe] = useState(false)

  const recuperer = useCallback(async () => {
    const cid = await getClientId()
    if (!cid) return null
    const r = await appelApiRequisitions(`/api/requisitions/detail?client_id=${encodeURIComponent(cid)}&id=${encodeURIComponent(id)}`)
    return { cid, r }
  }, [id])

  useEffect(() => {
    let annule = false
    recuperer()
      .then((x) => { if (!annule && x) { setClientId(x.cid); setD(x.r) } })
      .catch((e) => { if (!annule) setErreur(e.message) })
    return () => { annule = true }
  }, [recuperer])

  const annuler = async () => {
    if (!window.confirm(t('requisitions.detail.confirmCancel', { numero: d.requisition.numero }))) return
    setOccupe(true)
    setErreur('')
    try {
      await appelApiRequisitions('/api/requisitions/annuler', { method: 'POST', body: { client_id: clientId, id } })
      const x = await recuperer()
      if (x) setD(x.r)
      setInfo('cancelled')
    } catch (e) {
      setErreur(e.message)
    } finally {
      setOccupe(false)
    }
  }

  const page = (contenu) => (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ padding: isMobile ? '14px' : '24px', maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <BackButton fallback="/requisitions" label={t('requisitions.back')} />
        {erreur && <div role="alert" style={{ padding: '12px 16px', borderRadius: '10px', fontSize: '13px', background: c.rougeClair, color: c.rouge }}>{erreur}</div>}
        {contenu}
      </div>
    </div>
  )

  if (!d) return page(erreur ? null : <ChefLoader />)

  const r = d.requisition
  const service = (sid) => d.services.find((s) => s.id === sid)
  const nom = (sid) => { const s = service(sid); return s ? `${s.emoji || '🛎️'} ${s.nom}` : '—' }
  const dateHeure = (iso) => (iso ? new Date(iso).toLocaleString(langue, { dateStyle: 'medium', timeStyle: 'short' }) : null)
  const carte = { background: c.blanc, borderRadius: '12px', padding: isMobile ? '14px' : '20px', border: `0.5px solid ${c.bordure}` }
  const ligneInfo = (libelle, valeur) => valeur ? (
    <div style={{ display: 'flex', gap: '8px', fontSize: '13px' }}>
      <span style={{ color: c.texteMuted, minWidth: '130px' }}>{libelle}</span>
      <span style={{ color: c.texte }}>{valeur}</span>
    </div>
  ) : null
  const livree = r.statut === 'livree'

  return page(
    <>
      {info && (
        <div role="status" style={{ padding: '12px 16px', borderRadius: '10px', fontSize: '13px', fontWeight: '500', background: c.vertClair, color: c.vert }}>
          {info === 'sent'
            ? (r.statut === 'a_valider' ? t('requisitions.detail.sentForValidation') : t('requisitions.detail.sent', { service: service(r.service_preparateur_id)?.nom || '' }))
            : t('requisitions.detail.cancelled')}
        </div>
      )}

      <div style={carte}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
          <h1 style={{ fontSize: isMobile ? '20px' : '22px', fontWeight: '600', color: c.texte, margin: 0 }}>
            {t('requisitions.detail.title', { numero: r.numero })}
          </h1>
          <StatutBadge statut={r.statut} />
          <span style={{ flex: '1 1 auto' }} />
          {r.peut_annuler && (
            <button onClick={annuler} disabled={occupe} style={{
              padding: '8px 14px', borderRadius: '8px', border: `0.5px solid ${c.rouge}`, background: 'transparent',
              color: c.rouge, fontSize: '13px', cursor: occupe ? 'wait' : 'pointer',
            }}>{t('requisitions.detail.cancel')}</button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {ligneInfo(t('requisitions.detail.from'), nom(r.service_demandeur_id))}
          {ligneInfo(t('requisitions.detail.to'), nom(r.service_preparateur_id))}
          {ligneInfo(t('requisitions.detail.requestedBy'), r.demandeur_nom)}
          {ligneInfo(t('requisitions.detail.sentAt'), dateHeure(r.envoyee_at))}
          {ligneInfo(t('requisitions.detail.wantedDate'), r.date_souhaitee ? new Date(`${r.date_souhaitee}T12:00:00`).toLocaleDateString(langue, { dateStyle: 'medium' }) : null)}
          {ligneInfo(t('requisitions.detail.deliveredAt'), dateHeure(r.livree_at))}
          {ligneInfo(t('requisitions.detail.cancelledAt'), dateHeure(r.annulee_at))}
          {ligneInfo(t('requisitions.detail.refusalReason'), r.motif_refus)}
          {ligneInfo(t('requisitions.detail.comment'), r.commentaire)}
        </div>
      </div>

      <div style={{ ...carte, padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: livree ? '2fr 1fr 1fr' : '2fr 1fr', gap: '8px', padding: '10px 16px', fontSize: '11px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `0.5px solid ${c.bordure}` }}>
          <span>{t('requisitions.detail.product')}</span>
          <span style={{ textAlign: 'right' }}>{t('requisitions.detail.requested')}</span>
          {livree && <span style={{ textAlign: 'right' }}>{t('requisitions.detail.delivered')}</span>}
        </div>
        {d.lignes.map((l) => (
          <div key={l.id} style={{ display: 'grid', gridTemplateColumns: livree ? '2fr 1fr 1fr' : '2fr 1fr', gap: '8px', padding: '10px 16px', fontSize: '13px', color: c.texte, borderBottom: `0.5px solid ${c.bordure}` }}>
            <span>
              {l.nom}
              {l.ajoutee_par_preparateur && <span style={{ color: c.texteMuted, fontSize: '11px' }}> · {t('requisitions.detail.addedByPreparer')}</span>}
              {l.commentaire && <span style={{ display: 'block', color: c.texteMuted, fontSize: '12px' }}>{l.commentaire}</span>}
            </span>
            <span style={{ textAlign: 'right' }}>{fmtQte(l.quantite_demandee, langue)} {l.unite}</span>
            {livree && <span style={{ textAlign: 'right', fontWeight: '500' }}>{fmtQte(l.quantite_livree, langue)} {l.unite}</span>}
          </div>
        ))}
      </div>
    </>
  )
}
