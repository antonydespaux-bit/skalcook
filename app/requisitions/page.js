'use client'
export const dynamic = 'force-dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { getClientId } from '../../lib/supabase'
import { appelApiRequisitions } from '../../lib/requisitions/apiClient'
import { useTheme } from '../../lib/useTheme'
import { useIsMobile } from '../../lib/useIsMobile'
import { texteSurAccent } from '../../lib/theme.jsx'
import Navbar from '../../components/Navbar'
import ChefLoader from '../../components/ChefLoader'
import StatutBadge from '../../components/requisitions/StatutBadge'

// Réquisitions : bons de mes services (« Mes demandes ») et, pour la
// direction et l'administration, tous les bons de l'établissement.

export default function RequisitionsPage() {
  const { t, i18n } = useTranslation()
  const { c } = useTheme()
  const isMobile = useIsMobile()
  const router = useRouter()
  const surAccent = texteSurAccent(c)

  const [contexte, setContexte] = useState(null)
  const [vue, setVue] = useState('mes_demandes')
  const [liste, setListe] = useState({ services: [], requisitions: [] })
  const [chargement, setChargement] = useState(true)
  const [erreur, setErreur] = useState('')

  const recuperer = useCallback(async (v) => {
    const id = await getClientId()
    if (!id) return null
    const q = `client_id=${encodeURIComponent(id)}`
    const [ctx, l] = await Promise.all([
      appelApiRequisitions(`/api/requisitions/contexte?${q}`),
      appelApiRequisitions(`/api/requisitions?${q}&vue=${v}`),
    ])
    return { ctx, l }
  }, [])

  useEffect(() => {
    let annule = false
    recuperer(vue)
      .then((r) => {
        if (annule || !r) return
        setContexte(r.ctx)
        setListe(r.l)
        setErreur('')
      })
      .catch((e) => { if (!annule) setErreur(e.message || t('requisitions.liste.loadError')) })
      .finally(() => { if (!annule) setChargement(false) })
    return () => { annule = true }
  }, [recuperer, vue, t])

  const services = useMemo(() => new Map(liste.services.map((s) => [s.id, s])), [liste.services])
  const nomService = (id) => {
    const s = services.get(id)
    return s ? `${s.emoji || '🛎️'} ${s.nom}` : '—'
  }
  const formatDate = (iso) => new Date(iso).toLocaleString(i18n.language || 'fr', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  const peutDemander = !!contexte?.peut_commander && (contexte?.demandeurs?.length ?? 0) > 0
  // Responsable d'au moins un service (ou administration) : onglet « À valider ».
  const valideur = !!contexte?.peut_commander && (contexte?.valide_pour?.length ?? 0) > 0
  // Membre d'un service qui prépare (ou administration) : onglet « À préparer » et sorties directes.
  const preparateur = !!contexte?.peut_commander && (contexte?.prepare_pour?.length ?? 0) > 0

  const onglet = (id, label) => {
    const actif = vue === id
    return (
      <button key={id} onClick={() => { setChargement(true); setVue(id) }} style={{
        padding: '8px 16px', borderRadius: '7px', fontSize: '13px', border: 'none', cursor: 'pointer',
        fontWeight: actif ? '500' : '400', background: actif ? c.accent : 'transparent', color: actif ? surAccent : c.texteMuted,
      }}>{label}</button>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ padding: isMobile ? '14px' : '24px', maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '600', color: c.texte, margin: 0, flex: '1 1 auto' }}>{t('requisitions.liste.title')}</h1>
          {preparateur && (
            <button onClick={() => router.push('/requisitions/sortie')} style={{
              padding: '10px 18px', borderRadius: '10px', border: `0.5px solid ${c.bordure}`, background: c.blanc, color: c.texte,
              fontSize: '14px', cursor: 'pointer',
            }}>{t('requisitions.liste.directExit')}</button>
          )}
          {peutDemander && (
            <button onClick={() => router.push('/requisitions/nouvelle')} style={{
              padding: '10px 18px', borderRadius: '10px', border: 'none', background: c.accent, color: surAccent,
              fontSize: '14px', fontWeight: '500', cursor: 'pointer',
            }}>+ {t('requisitions.liste.new')}</button>
          )}
        </div>

        {(contexte?.voit_tout || valideur || preparateur) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', background: c.blanc, padding: '4px', borderRadius: '10px', border: `0.5px solid ${c.bordure}`, width: 'fit-content' }}>
            {onglet('mes_demandes', t('requisitions.liste.mine'))}
            {preparateur && onglet('a_preparer', t('requisitions.liste.toPrepare'))}
            {valideur && onglet('a_valider', t('requisitions.liste.toValidate'))}
            {contexte?.voit_tout && onglet('toutes', t('requisitions.liste.all'))}
          </div>
        )}

        {erreur && <div role="alert" style={{ padding: '12px 16px', borderRadius: '10px', fontSize: '13px', background: c.rougeClair, color: c.rouge }}>{erreur}</div>}

        {contexte && !peutDemander && contexte.mes_services.length === 0 && !contexte.voit_tout && (
          <div style={{ background: c.blanc, borderRadius: '12px', padding: '16px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', color: c.texteMuted }}>
            {t('requisitions.liste.noService')}
          </div>
        )}

        {chargement ? <ChefLoader /> : (
          <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
            {liste.requisitions.length === 0 ? (
              <div style={{ padding: '20px', fontSize: '13px', color: c.texteMuted, fontStyle: 'italic' }}>
                {vue === 'a_valider' ? t('requisitions.liste.emptyToValidate')
                  : vue === 'a_preparer' ? t('requisitions.liste.emptyToPrepare')
                  : t('requisitions.liste.empty')}
              </div>
            ) : liste.requisitions.map((r) => (
              <button key={r.id} onClick={() => router.push(`/requisitions/${r.id}`)} style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: isMobile ? '6px 12px' : '16px', width: '100%',
                textAlign: 'left', background: 'transparent', border: 'none', borderBottom: `0.5px solid ${c.bordure}`,
                padding: '12px 16px', cursor: 'pointer', fontSize: '13px', color: c.texte,
              }}>
                <span style={{ fontWeight: '600', minWidth: '56px' }}>R-{r.numero}</span>
                {r.type === 'sortie_directe' && <span style={{ fontSize: '11px', color: c.texteMuted }}>{t('requisitions.liste.directExitBadge')}</span>}
                <span style={{ color: c.texteMuted, minWidth: '96px' }}>{formatDate(r.envoyee_at)}</span>
                <span style={{ flex: '1 1 260px' }}>
                  {r.type === 'sortie_directe'
                    ? <>{nomService(r.service_preparateur_id)} → {nomService(r.service_demandeur_id)}</>
                    : <>{nomService(r.service_demandeur_id)} → {nomService(r.service_preparateur_id)}</>}
                  {r.date_souhaitee && <span style={{ color: c.texteMuted }}> · {t('requisitions.liste.wantedOn', { date: new Date(`${r.date_souhaitee}T12:00:00`).toLocaleDateString(i18n.language || 'fr', { day: '2-digit', month: '2-digit' }) })}</span>}
                </span>
                <span style={{ color: c.texteMuted }}>{t('requisitions.liste.lines', { count: r.nb_lignes })}</span>
                {r.demandeur_nom && <span style={{ color: c.texteMuted }}>{r.demandeur_nom}</span>}
                <StatutBadge statut={r.statut} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
