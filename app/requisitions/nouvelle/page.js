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

// Nouvelle réquisition : le service demandeur (reconnu par l'appartenance de
// l'utilisateur), le service destinataire, puis les produits de son
// catalogue avec les quantités — comme les ingrédients d'une fiche.

const parseQuantite = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

export default function NouvelleRequisitionPage() {
  const { t } = useTranslation()
  const { c } = useTheme()
  const isMobile = useIsMobile()
  const router = useRouter()
  const surAccent = texteSurAccent(c)

  const [clientId, setClientId] = useState(null)
  const [ctx, setCtx] = useState(null)
  const [erreur, setErreur] = useState('')
  const [demandeurId, setDemandeurId] = useState('')
  const [preparateurId, setPreparateurId] = useState('')
  const [dateSouhaitee, setDateSouhaitee] = useState('')
  const [commentaire, setCommentaire] = useState('')
  const [lignes, setLignes] = useState([])        // { produit_id, nom, unite, quantite, commentaire }
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
        // Un seul service demandeur possible : choisi d'office.
        if (d.demandeurs.length === 1) setDemandeurId(d.demandeurs[0])
      } catch (e) {
        if (!annule) setErreur(e.message)
      }
    })()
    return () => { annule = true }
  }, [])

  const services = useMemo(() => new Map((ctx?.services || []).map((s) => [s.id, s])), [ctx])
  const demandeurs = (ctx?.demandeurs || []).map((id) => services.get(id)).filter(Boolean)
  const destinataires = (ctx?.destinataires || []).filter((id) => id !== demandeurId).map((id) => services.get(id)).filter(Boolean)
  const preparateur = services.get(preparateurId) || null

  const surErreur = useCallback((m) => setErreur(m), [])

  const changerDestinataire = (id) => {
    if (id === preparateurId) return
    if (lignes.length > 0 && !window.confirm(t('requisitions.nouvelle.confirmChangeTarget'))) return
    setPreparateurId(id)
    setLignes([])
  }

  const ajouter = (p) => {
    setLignes((ls) => ls.some((l) => l.produit_id === p.id) ? ls : [...ls, { produit_id: p.id, nom: p.nom, unite: p.unite || 'u', quantite: '1', commentaire: '' }])
  }
  const modifierLigne = (id, champ, valeur) => setLignes((ls) => ls.map((l) => (l.produit_id === id ? { ...l, [champ]: valeur } : l)))
  const retirer = (id) => setLignes((ls) => ls.filter((l) => l.produit_id !== id))

  const lignesValides = lignes.length > 0 && lignes.every((l) => parseQuantite(l.quantite) > 0)
  const pret = !!demandeurId && !!preparateurId && lignesValides && !envoi

  const envoyer = async () => {
    if (!pret) return
    setEnvoi(true)
    setErreur('')
    try {
      const d = await appelApiRequisitions('/api/requisitions', {
        method: 'POST',
        body: {
          client_id: clientId,
          service_demandeur_id: demandeurId,
          service_preparateur_id: preparateurId,
          date_souhaitee: dateSouhaitee || null,
          commentaire: commentaire.trim() || null,
          lignes: lignes.map((l) => ({ produit_id: l.produit_id, quantite: parseQuantite(l.quantite), commentaire: l.commentaire.trim() || null })),
        },
      })
      router.push(`/requisitions/${d.id}?envoyee=1`)
    } catch (e) {
      setErreur(e.message)
      setEnvoi(false)
    }
  }

  // ── Styles ───────────────────────────────────────────────────────────────
  const carte = { background: c.blanc, borderRadius: '12px', padding: isMobile ? '14px' : '20px', border: `0.5px solid ${c.bordure}` }
  const titreCarte = { fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '12px' }
  const champ = { padding: '9px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc, width: '100%', boxSizing: 'border-box' }
  const label = { fontSize: '12px', color: c.texteMuted, display: 'block', marginBottom: '6px' }
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
          <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '600', color: c.texte, margin: 0 }}>{t('requisitions.nouvelle.title')}</h1>
        </div>

        {erreur && <div role="alert" style={{ padding: '12px 16px', borderRadius: '10px', fontSize: '13px', background: c.rougeClair, color: c.rouge }}>{erreur}</div>}

        {ctx && (ctx.demandeurs.length === 0 || !ctx.peut_commander) ? (
          <div style={{ ...carte, fontSize: '13px', color: c.texteMuted }}>{t('requisitions.nouvelle.noRequester')}</div>
        ) : ctx && (
          <>
            {/* De : service demandeur */}
            <div style={carte}>
              <div style={titreCarte}>{t('requisitions.nouvelle.from')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {demandeurs.map((s) => (
                  <button key={s.id} onClick={() => { setDemandeurId(s.id); if (s.id === preparateurId) changerDestinataire('') }} style={puce(s.id === demandeurId)}>
                    {s.emoji || '🛎️'} {s.nom}
                  </button>
                ))}
              </div>
            </div>

            {/* À : service destinataire */}
            <div style={carte}>
              <div style={titreCarte}>{t('requisitions.nouvelle.to')}</div>
              {destinataires.length === 0 ? (
                <div style={{ fontSize: '13px', color: c.texteMuted }}>{t('requisitions.nouvelle.noTarget')}</div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {destinataires.map((s) => (
                    <button key={s.id} onClick={() => changerDestinataire(s.id)} style={puce(s.id === preparateurId)}>
                      {s.emoji || '📦'} {s.nom}
                    </button>
                  ))}
                </div>
              )}
              {ctx.validation && <div style={{ fontSize: '12px', color: c.texteMuted, marginTop: '10px' }}>{t('requisitions.nouvelle.validationNotice')}</div>}
            </div>

            {/* Produits */}
            {preparateur && (
              <div style={carte}>
                <div style={titreCarte}>{t('requisitions.nouvelle.products', { service: preparateur.nom })}</div>
                <RechercheProduits key={preparateurId} clientId={clientId} serviceId={preparateurId} autoFocus onErreur={surErreur}
                  dejaIds={new Set(lignes.map((l) => l.produit_id))} onAjouter={ajouter} />

                {/* Lignes du bon */}
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {lignes.length === 0 && <div style={{ fontSize: '13px', color: c.texteMuted, fontStyle: 'italic' }}>{t('requisitions.nouvelle.noLine')}</div>}
                  {lignes.map((l) => {
                    const invalide = !(parseQuantite(l.quantite) > 0)
                    return (
                      <div key={l.produit_id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 90px 36px' : '2fr 110px 1.5fr 36px', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '14px', color: c.texte }}>{l.nom} <span style={{ color: c.texteMuted, fontSize: '12px' }}>({l.unite})</span></span>
                        <input type="text" inputMode="decimal" value={l.quantite} aria-label={t('requisitions.nouvelle.quantity', { nom: l.nom })}
                          onChange={(e) => modifierLigne(l.produit_id, 'quantite', e.target.value)}
                          style={{ ...champ, textAlign: 'right', borderColor: invalide ? c.rouge : c.bordure }} />
                        {!isMobile && (
                          <input type="text" value={l.commentaire} maxLength={300} placeholder={t('requisitions.nouvelle.lineComment')}
                            onChange={(e) => modifierLigne(l.produit_id, 'commentaire', e.target.value)} style={{ ...champ, fontSize: '13px' }} />
                        )}
                        <button onClick={() => retirer(l.produit_id)} aria-label={t('requisitions.nouvelle.remove', { nom: l.nom })} style={{
                          border: `0.5px solid ${c.bordure}`, background: 'transparent', borderRadius: '8px', height: '36px', cursor: 'pointer', color: c.rouge,
                        }}>✕</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Infos et envoi */}
            {preparateur && (
              <div style={carte}>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '200px 1fr', gap: '12px' }}>
                  <div>
                    <label style={label} htmlFor="req-date">{t('requisitions.nouvelle.wantedDate')}</label>
                    <input id="req-date" type="date" value={dateSouhaitee} onChange={(e) => setDateSouhaitee(e.target.value)} style={champ} />
                  </div>
                  <div>
                    <label style={label} htmlFor="req-com">{t('requisitions.nouvelle.comment')}</label>
                    <input id="req-com" type="text" value={commentaire} maxLength={1000} onChange={(e) => setCommentaire(e.target.value)}
                      placeholder={t('requisitions.nouvelle.commentPlaceholder')} style={champ} />
                  </div>
                </div>
                <button onClick={envoyer} disabled={!pret} style={{
                  marginTop: '16px', width: '100%', padding: '14px', borderRadius: '10px', border: 'none', fontSize: '15px', fontWeight: '500',
                  background: pret ? c.accent : c.bordure, color: pret ? surAccent : c.texteMuted, cursor: pret ? 'pointer' : 'not-allowed',
                }}>
                  {envoi ? t('requisitions.nouvelle.sending') : t('requisitions.nouvelle.send', { count: lignes.length })}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
