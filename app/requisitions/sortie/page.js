'use client'
export const dynamic = 'force-dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { getClientId } from '../../../lib/supabase'
import { appelApiRequisitions } from '../../../lib/requisitions/apiClient'
import { useTheme } from '../../../lib/useTheme'
import { useIsMobile } from '../../../lib/useIsMobile'
import { texteSurAccent } from '../../../lib/theme.jsx'
import Navbar from '../../../components/Navbar'
import ChefLoader from '../../../components/ChefLoader'
import BackButton from '../../../components/BackButton'
import RechercheProduits from '../../../components/requisitions/RechercheProduits'

// Sortie directe : le service qui tient un stock sort des produits sans
// commande, vers un service receveur (ex. la cuisine sort des fruits pour
// les accueils chambre). Le bon est livré d'office et valorisé.

const parseQuantite = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

export default function SortieDirectePage() {
  const { t } = useTranslation()
  const { c } = useTheme()
  const isMobile = useIsMobile()
  const router = useRouter()
  const surAccent = texteSurAccent(c)

  const [clientId, setClientId] = useState(null)
  const [ctx, setCtx] = useState(null)
  const [erreur, setErreur] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [receveurId, setReceveurId] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [lignes, setLignes] = useState([])
  const [envoi, setEnvoi] = useState(false)

  useEffect(() => {
    let annule = false
    ;(async () => {
      try {
        const id = await getClientId()
        if (!id || annule) return
        const d = await appelApiRequisitions(`/api/requisitions/contexte?client_id=${encodeURIComponent(id)}`)
        if (annule) return
        setClientId(id)
        setCtx(d)
        if (d.prepare_pour.length === 1) setSourceId(d.prepare_pour[0])
      } catch (e) {
        if (!annule) setErreur(e.message)
      }
    })()
    return () => { annule = true }
  }, [])

  const services = useMemo(() => new Map((ctx?.services || []).map((s) => [s.id, s])), [ctx])
  const sources = (ctx?.prepare_pour || []).map((id) => services.get(id)).filter(Boolean)
  const receveurs = (ctx?.services || []).filter((s) => s.id !== sourceId)
  const source = services.get(sourceId) || null
  const surErreur = useCallback((m) => setErreur(m), [])

  const changerSource = (id) => {
    if (id === sourceId) return
    if (lignes.length > 0 && !window.confirm(t('requisitions.sortie.confirmChangeSource'))) return
    setSourceId(id)
    setLignes([])
    if (receveurId === id) setReceveurId('')
  }

  const ajouter = (p) => setLignes((ls) => (ls.some((l) => l.produit_id === p.id) ? ls : [...ls, { produit_id: p.id, nom: p.nom, unite: p.unite || 'u', quantite: '1' }]))
  const pret = !!sourceId && !!receveurId && lignes.length > 0 && lignes.every((l) => parseQuantite(l.quantite) > 0) && !envoi

  const enregistrer = async () => {
    if (!pret) return
    setEnvoi(true)
    setErreur('')
    try {
      const d = await appelApiRequisitions('/api/requisitions/sortie', {
        method: 'POST',
        body: {
          client_id: clientId,
          service_preparateur_id: sourceId,
          service_receveur_id: receveurId,
          commentaire: commentaire.trim() || null,
          lignes: lignes.map((l) => ({ produit_id: l.produit_id, quantite: parseQuantite(l.quantite) })),
        },
      })
      router.push(`/requisitions/${d.id}`)
    } catch (e) {
      setErreur(e.message)
      setEnvoi(false)
    }
  }

  const carte = { background: c.blanc, borderRadius: '12px', padding: isMobile ? '14px' : '20px', border: `0.5px solid ${c.bordure}` }
  const titreCarte = { fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '12px' }
  const champ = { padding: '9px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc, width: '100%', boxSizing: 'border-box' }
  const puce = (actif) => ({
    padding: '8px 14px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer',
    border: `0.5px solid ${actif ? c.accent : c.bordure}`, background: actif ? c.accent : c.blanc, color: actif ? surAccent : c.texte,
  })

  if (!ctx && !erreur) return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <ChefLoader />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ padding: isMobile ? '14px' : '24px', maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <BackButton fallback="/requisitions" label={t('requisitions.back')} />
          <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '600', color: c.texte, margin: 0 }}>{t('requisitions.sortie.title')}</h1>
        </div>
        <div style={{ fontSize: '13px', color: c.texteMuted }}>{t('requisitions.sortie.subtitle')}</div>

        {erreur && <div role="alert" style={{ padding: '12px 16px', borderRadius: '10px', fontSize: '13px', background: c.rougeClair, color: c.rouge }}>{erreur}</div>}

        {ctx && (sources.length === 0 || !ctx.peut_commander) ? (
          <div style={{ ...carte, fontSize: '13px', color: c.texteMuted }}>{t('requisitions.sortie.noSource')}</div>
        ) : ctx && (
          <>
            <div style={carte}>
              <div style={titreCarte}>{t('requisitions.sortie.from')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {sources.map((s) => <button key={s.id} onClick={() => changerSource(s.id)} style={puce(s.id === sourceId)}>{s.emoji || '📦'} {s.nom}</button>)}
              </div>
            </div>

            {source && (
              <div style={carte}>
                <div style={titreCarte}>{t('requisitions.sortie.to')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {receveurs.map((s) => <button key={s.id} onClick={() => setReceveurId(s.id)} style={puce(s.id === receveurId)}>{s.emoji || '🛎️'} {s.nom}</button>)}
                </div>
              </div>
            )}

            {source && (
              <div style={carte}>
                <div style={titreCarte}>{t('requisitions.nouvelle.products', { service: source.nom })}</div>
                <RechercheProduits key={sourceId} clientId={clientId} serviceId={sourceId} autoFocus onErreur={surErreur}
                  dejaIds={new Set(lignes.map((l) => l.produit_id))} onAjouter={ajouter} />
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {lignes.length === 0 && <div style={{ fontSize: '13px', color: c.texteMuted, fontStyle: 'italic' }}>{t('requisitions.sortie.noLine')}</div>}
                  {lignes.map((l) => (
                    <div key={l.produit_id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 36px', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', color: c.texte }}>{l.nom} <span style={{ color: c.texteMuted, fontSize: '12px' }}>({l.unite})</span></span>
                      <input type="text" inputMode="decimal" value={l.quantite} aria-label={t('requisitions.nouvelle.quantity', { nom: l.nom })}
                        onChange={(e) => setLignes((ls) => ls.map((x) => (x.produit_id === l.produit_id ? { ...x, quantite: e.target.value } : x)))}
                        style={{ ...champ, textAlign: 'right', borderColor: parseQuantite(l.quantite) > 0 ? c.bordure : c.rouge }} />
                      <button onClick={() => setLignes((ls) => ls.filter((x) => x.produit_id !== l.produit_id))} aria-label={t('requisitions.nouvelle.remove', { nom: l.nom })}
                        style={{ border: `0.5px solid ${c.bordure}`, background: 'transparent', borderRadius: '8px', height: '36px', cursor: 'pointer', color: c.rouge }}>✕</button>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '14px' }}>
                  <label htmlFor="sortie-com" style={{ fontSize: '12px', color: c.texteMuted, display: 'block', marginBottom: '6px' }}>{t('requisitions.nouvelle.comment')}</label>
                  <input id="sortie-com" type="text" value={commentaire} maxLength={1000} onChange={(e) => setCommentaire(e.target.value)}
                    placeholder={t('requisitions.sortie.commentPlaceholder')} style={champ} />
                </div>
                <button onClick={enregistrer} disabled={!pret} style={{
                  marginTop: '16px', width: '100%', padding: '14px', borderRadius: '10px', border: 'none', fontSize: '15px', fontWeight: '500',
                  background: pret ? c.accent : c.bordure, color: pret ? surAccent : c.texteMuted, cursor: pret ? 'pointer' : 'not-allowed',
                }}>{envoi ? t('requisitions.nouvelle.sending') : t('requisitions.sortie.save', { count: lignes.length })}</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
