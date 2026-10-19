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
import RechercheProduits from '../../../components/requisitions/RechercheProduits'

// Détail d'une réquisition : services, statut, lignes ; annulation par le
// demandeur, validation par le responsable, et préparation / livraison par
// le service préparateur (quantités servies, produits ajoutés à la voix).

const parseQuantite = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

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
  const [refus, setRefus] = useState(null)   // motif en cours de saisie, null = fermé
  const [saisie, setSaisie] = useState({})    // ligne id → quantité livrée saisie
  const [ajouts, setAjouts] = useState([])    // produits ajoutés : { produit_id, nom, unite, quantite }

  // Détail reçu : quantités livrées pré-remplies avec les quantités demandées.
  const appliquer = useCallback((r) => {
    setD(r)
    setSaisie(Object.fromEntries((r.lignes || []).map((l) => [l.id, String(l.quantite_livree ?? l.quantite_demandee ?? 0)])))
    setAjouts([])
  }, [])

  const recuperer = useCallback(async () => {
    const cid = await getClientId()
    if (!cid) return null
    const r = await appelApiRequisitions(`/api/requisitions/detail?client_id=${encodeURIComponent(cid)}&id=${encodeURIComponent(id)}`)
    return { cid, r }
  }, [id])

  useEffect(() => {
    let annule = false
    recuperer()
      .then((x) => { if (!annule && x) { setClientId(x.cid); appliquer(x.r) } })
      .catch((e) => { if (!annule) setErreur(e.message) })
    return () => { annule = true }
  }, [recuperer, appliquer])

  const annuler = async () => {
    if (!window.confirm(t('requisitions.detail.confirmCancel', { numero: d.requisition.numero }))) return
    setOccupe(true)
    setErreur('')
    try {
      await appelApiRequisitions('/api/requisitions/annuler', { method: 'POST', body: { client_id: clientId, id } })
      const x = await recuperer()
      if (x) appliquer(x.r)
      setInfo('cancelled')
    } catch (e) {
      setErreur(e.message)
    } finally {
      setOccupe(false)
    }
  }

  // Validation, refus, prise en charge et livraison.
  const agir = async (chemin, body, infoApres) => {
    setOccupe(true)
    setErreur('')
    try {
      await appelApiRequisitions(chemin, { method: 'POST', body: { client_id: clientId, id, ...body } })
      const x = await recuperer()
      if (x) appliquer(x.r)
      setRefus(null)
      setInfo(infoApres)
    } catch (e) {
      setErreur(e.message)
    } finally {
      setOccupe(false)
    }
  }
  const valider = () => agir('/api/requisitions/valider', {}, 'validated')
  const refuser = () => {
    if (!refus?.trim()) return
    agir('/api/requisitions/refuser', { motif: refus.trim() }, 'refused')
  }
  const prendreEnCharge = () => agir('/api/requisitions/prendre-en-charge', {}, 'taken')
  const surErreur = useCallback((m) => setErreur(m), [])

  const ajouterProduit = (p) => setAjouts((as) => (as.some((a) => a.produit_id === p.id) ? as : [...as, { produit_id: p.id, nom: p.nom, unite: p.unite || 'u', quantite: '1' }]))
  const saisieValide = d && Object.values(saisie).every((v) => parseQuantite(v) >= 0) && ajouts.every((a) => parseQuantite(a.quantite) > 0)
  const livrer = () => {
    if (!saisieValide) return
    if (!window.confirm(t('requisitions.preparation.confirmDeliver', { numero: d.requisition.numero }))) return
    agir('/api/requisitions/livrer', {
      lignes: d.lignes.map((l) => ({ id: l.id, quantite_livree: parseQuantite(saisie[l.id]) })),
      ajouts: ajouts.map((a) => ({ produit_id: a.produit_id, quantite_livree: parseQuantite(a.quantite) })),
    }, 'delivered')
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
            : info === 'validated' ? t('requisitions.detail.validated', { service: service(r.service_preparateur_id)?.nom || '' })
            : info === 'refused' ? t('requisitions.detail.refused')
            : info === 'taken' ? t('requisitions.preparation.taken')
            : info === 'delivered' ? t('requisitions.preparation.delivered')
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
          {r.peut_valider && (
            <>
              <button onClick={valider} disabled={occupe} style={{
                padding: '8px 14px', borderRadius: '8px', border: `0.5px solid ${c.vert}`, background: c.vertClair, color: c.vert,
                fontSize: '13px', fontWeight: '600', cursor: occupe ? 'wait' : 'pointer',
              }}>✓ {t('requisitions.detail.validate')}</button>
              <button onClick={() => setRefus(refus === null ? '' : null)} disabled={occupe} style={{
                padding: '8px 14px', borderRadius: '8px', border: `0.5px solid ${c.rouge}`, background: 'transparent',
                color: c.rouge, fontSize: '13px', cursor: 'pointer',
              }}>{t('requisitions.detail.refuse')}</button>
            </>
          )}
          {r.peut_preparer && r.statut === 'a_preparer' && (
            <button onClick={prendreEnCharge} disabled={occupe} style={{
              padding: '8px 14px', borderRadius: '8px', border: `0.5px solid ${c.accent}`, background: c.accentClair, color: c.accent,
              fontSize: '13px', fontWeight: '600', cursor: occupe ? 'wait' : 'pointer',
            }}>{t('requisitions.preparation.take')}</button>
          )}
          {r.peut_preparer && !r.peut_valider && (
            <button onClick={() => setRefus(refus === null ? '' : null)} disabled={occupe} style={{
              padding: '8px 14px', borderRadius: '8px', border: `0.5px solid ${c.rouge}`, background: 'transparent',
              color: c.rouge, fontSize: '13px', cursor: 'pointer',
            }}>{t('requisitions.detail.refuse')}</button>
          )}
          {r.peut_annuler && (
            <button onClick={annuler} disabled={occupe} style={{
              padding: '8px 14px', borderRadius: '8px', border: `0.5px solid ${c.rouge}`, background: 'transparent',
              color: c.rouge, fontSize: '13px', cursor: occupe ? 'wait' : 'pointer',
            }}>{t('requisitions.detail.cancel')}</button>
          )}
        </div>
        {refus !== null && (r.peut_valider || r.peut_preparer) && (
          <div style={{ marginBottom: '14px', padding: '12px', borderRadius: '10px', background: c.rougeClair }}>
            <label htmlFor="req-motif" style={{ fontSize: '12px', color: c.rouge, display: 'block', marginBottom: '6px', fontWeight: '500' }}>{t('requisitions.detail.refusalReasonLabel')}</label>
            <textarea id="req-motif" value={refus} maxLength={500} rows={2} autoFocus onChange={(e) => setRefus(e.target.value)}
              placeholder={t('requisitions.detail.refusalPlaceholder')}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', color: c.texte, background: c.blanc, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button onClick={refuser} disabled={occupe || !refus.trim()} style={{
                padding: '8px 14px', borderRadius: '8px', border: 'none', background: refus.trim() ? c.rouge : c.bordure,
                color: refus.trim() ? 'white' : c.texteMuted, fontSize: '13px', fontWeight: '500', cursor: refus.trim() ? 'pointer' : 'not-allowed',
              }}>{t('requisitions.detail.confirmRefuse')}</button>
              <button onClick={() => setRefus(null)} style={{ padding: '8px 14px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, background: c.blanc, color: c.texte, fontSize: '13px', cursor: 'pointer' }}>
                {t('requisitions.detail.close')}
              </button>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {r.type === 'sortie_directe' ? (
            <>
              {ligneInfo(t('requisitions.detail.type'), t('requisitions.liste.directExitBadge'))}
              {ligneInfo(t('requisitions.detail.exitFrom'), nom(r.service_preparateur_id))}
              {ligneInfo(t('requisitions.detail.exitTo'), nom(r.service_demandeur_id))}
            </>
          ) : (
            <>
              {ligneInfo(t('requisitions.detail.from'), nom(r.service_demandeur_id))}
              {ligneInfo(t('requisitions.detail.to'), nom(r.service_preparateur_id))}
            </>
          )}
          {ligneInfo(t('requisitions.detail.requestedBy'), r.demandeur_nom)}
          {ligneInfo(t('requisitions.detail.sentAt'), dateHeure(r.envoyee_at))}
          {ligneInfo(t('requisitions.detail.wantedDate'), r.date_souhaitee ? new Date(`${r.date_souhaitee}T12:00:00`).toLocaleDateString(langue, { dateStyle: 'medium' }) : null)}
          {ligneInfo(t('requisitions.detail.validatedBy'), r.validee_at ? `${r.valideur_nom || '—'} · ${dateHeure(r.validee_at)}` : null)}
          {ligneInfo(t('requisitions.detail.refusedBy'), r.refusee_at ? `${r.refusee_par_nom || '—'} · ${dateHeure(r.refusee_at)}` : null)}
          {ligneInfo(t('requisitions.preparation.preparedBy'), r.preparateur_nom)}
          {ligneInfo(t('requisitions.detail.deliveredAt'), dateHeure(r.livree_at))}
          {ligneInfo(t('requisitions.detail.cancelledAt'), dateHeure(r.annulee_at))}
          {ligneInfo(t('requisitions.detail.refusalReason'), r.motif_refus)}
          {ligneInfo(t('requisitions.detail.comment'), r.commentaire)}
        </div>
      </div>

      {r.peut_preparer ? (
        <div style={carte}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
            {t('requisitions.preparation.title')}
          </div>
          <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '12px' }}>{t('requisitions.preparation.help')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {d.lignes.map((l) => {
              const invalide = !(parseQuantite(saisie[l.id]) >= 0)
              return (
                <div key={l.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 100px' : '2fr 1fr 130px', gap: '8px', alignItems: 'center', fontSize: '13px', color: c.texte }}>
                  <span>
                    {l.nom}
                    {l.commentaire && <span style={{ display: 'block', color: c.texteMuted, fontSize: '12px' }}>{l.commentaire}</span>}
                    {isMobile && <span style={{ display: 'block', color: c.texteMuted, fontSize: '12px' }}>{t('requisitions.detail.requested')} : {fmtQte(l.quantite_demandee, langue)} {l.unite}</span>}
                  </span>
                  {!isMobile && <span style={{ color: c.texteMuted, textAlign: 'right' }}>{t('requisitions.detail.requested')} : {fmtQte(l.quantite_demandee, langue)} {l.unite}</span>}
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input type="text" inputMode="decimal" value={saisie[l.id] ?? ''} aria-label={t('requisitions.preparation.deliveredQty', { nom: l.nom })}
                      onChange={(e) => setSaisie((s0) => ({ ...s0, [l.id]: e.target.value }))}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: `0.5px solid ${invalide ? c.rouge : c.bordure}`, fontSize: '14px', textAlign: 'right', color: c.texte, background: c.blanc, boxSizing: 'border-box' }} />
                    <span style={{ color: c.texteMuted, fontSize: '12px' }}>{l.unite}</span>
                  </span>
                </div>
              )
            })}
            {ajouts.map((a) => (
              <div key={a.produit_id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 100px 36px' : '2fr 1fr 130px 36px', gap: '8px', alignItems: 'center', fontSize: '13px', color: c.texte }}>
                <span>{a.nom} <span style={{ color: c.accent, fontSize: '11px' }}>· {t('requisitions.preparation.added')}</span></span>
                {!isMobile && <span />}
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input type="text" inputMode="decimal" value={a.quantite} aria-label={t('requisitions.preparation.deliveredQty', { nom: a.nom })}
                    onChange={(e) => setAjouts((as) => as.map((x) => (x.produit_id === a.produit_id ? { ...x, quantite: e.target.value } : x)))}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: `0.5px solid ${parseQuantite(a.quantite) > 0 ? c.bordure : c.rouge}`, fontSize: '14px', textAlign: 'right', color: c.texte, background: c.blanc, boxSizing: 'border-box' }} />
                  <span style={{ color: c.texteMuted, fontSize: '12px' }}>{a.unite}</span>
                </span>
                <button onClick={() => setAjouts((as) => as.filter((x) => x.produit_id !== a.produit_id))} aria-label={t('requisitions.nouvelle.remove', { nom: a.nom })}
                  style={{ border: `0.5px solid ${c.bordure}`, background: 'transparent', borderRadius: '8px', height: '34px', cursor: 'pointer', color: c.rouge }}>✕</button>
              </div>
            ))}
          </div>

          <details style={{ marginTop: '14px' }}>
            <summary style={{ fontSize: '13px', color: c.accent, cursor: 'pointer' }}>+ {t('requisitions.preparation.addProduct')}</summary>
            <div style={{ marginTop: '10px' }}>
              <RechercheProduits clientId={clientId} serviceId={r.service_preparateur_id} onErreur={surErreur} onAjouter={ajouterProduit}
                dejaIds={new Set([...d.lignes.map((l) => l.ingredient_id || l.article_id), ...ajouts.map((a) => a.produit_id)])} />
            </div>
          </details>

          <button onClick={livrer} disabled={occupe || !saisieValide} style={{
            marginTop: '16px', width: '100%', padding: '14px', borderRadius: '10px', border: 'none', fontSize: '15px', fontWeight: '600',
            background: saisieValide ? c.vertClair : c.bordure, color: saisieValide ? c.vert : c.texteMuted,
            outline: saisieValide ? `1px solid ${c.vert}` : 'none', cursor: saisieValide && !occupe ? 'pointer' : 'not-allowed',
          }}>✓ {t('requisitions.preparation.deliver')}</button>
          <div style={{ fontSize: '12px', color: c.texteMuted, marginTop: '8px', textAlign: 'center' }}>{t('requisitions.preparation.deliverHelp')}</div>
        </div>
      ) : (
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
      )}
    </>
  )
}
