'use client'
import { useState, useEffect } from 'react'
import { supabase, getClientId } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { useTheme } from '../../lib/useTheme'
import { useRole } from '../../lib/useRole'
import { useIsMobile } from '../../lib/useIsMobile'
import { Logo } from '../../lib/theme.jsx'
import ChefLoader from '../../components/ChefLoader'

const TABS = [
  { id: 'profil',        label: 'Mon Profil' },
  { id: 'etablissement', label: 'Mon Établissement' },
  { id: 'abonnement',    label: 'Abonnement' },
  { id: 'donnees',       label: 'Données & Confidentialité' },
]

export default function MonCompte() {
  const router    = useRouter()
  const { c, nomEtablissement } = useTheme()
  const { role }  = useRole()
  const isMobile  = useIsMobile()
  const isAdmin   = role === 'admin'

  const [tab,        setTab]        = useState('profil')
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [toast,      setToast]      = useState(null)
  const [clientId,   setClientId]   = useState(null)

  const [profil,     setProfil]     = useState({ nom: '', email: '', telephone: '' })
  const [editProfil, setEditProfil] = useState({})
  const [pwdSent,    setPwdSent]    = useState(false)

  const [client,     setClient]     = useState({})
  const [editClient, setEditClient] = useState({})

  const [showResil,  setShowResil]  = useState(false)
  const [resilConf,  setResilConf]  = useState('')

  const [importing,  setImporting]  = useState(false)

  function showToast(type, msg) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { router.push('/'); return }

        const { data: profilData } = await supabase
          .from('profils')
          .select('nom, email, telephone')
          .eq('id', session.user.id)
          .maybeSingle()

        const p = { nom: profilData?.nom || '', email: session.user.email || '', telephone: profilData?.telephone || '' }
        setProfil(p)
        setEditProfil(p)

        const cId = await getClientId()
        if (!cId) { setLoading(false); return }
        setClientId(cId)

        const { data: clientData } = await supabase
          .from('clients')
          .select('nom, nom_etablissement, adresse_siege, siret, num_tva, code_naf, email_contact, telephone_contact, modules_actifs, created_at, date_cgu, version_cgu, demande_resiliation')
          .eq('id', cId)
          .maybeSingle()

        if (clientData) {
          setClient(clientData)
          setEditClient({
            siret:             clientData.siret || '',
            num_tva:           clientData.num_tva || '',
            adresse_siege:     clientData.adresse_siege || '',
            code_naf:          clientData.code_naf || '',
            email_contact:     clientData.email_contact || '',
            telephone_contact: clientData.telephone_contact || '',
          })
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const saveProfil = async () => {
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { error } = await supabase
        .from('profils')
        .update({ nom: editProfil.nom.trim(), telephone: editProfil.telephone.trim() })
        .eq('id', session.user.id)
      if (error) throw error
      setProfil({ ...profil, nom: editProfil.nom.trim(), telephone: editProfil.telephone.trim() })
      showToast('ok', 'Profil mis à jour.')
    } catch (err) {
      showToast('err', err.message || 'Erreur lors de la sauvegarde.')
    } finally {
      setSaving(false)
    }
  }

  const sendResetPassword = async () => {
    try {
      await supabase.auth.resetPasswordForEmail(profil.email)
      setPwdSent(true)
      showToast('ok', `Email envoyé à ${profil.email}`)
    } catch {
      showToast('err', 'Erreur envoi email.')
    }
  }

  const saveEtablissement = async () => {
    if (!clientId) return
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/client/update-legal', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body:    JSON.stringify({ client_id: clientId, ...editClient }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erreur mise à jour.')
      setClient({ ...client, ...json.client })
      showToast('ok', 'Informations légales mises à jour.')
    } catch (err) {
      showToast('err', err.message)
    } finally {
      setSaving(false)
    }
  }

  const exportData = async () => {
    if (!clientId) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/export-data?client_id=${clientId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) { showToast('err', 'Erreur export.'); return }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `skalcook-export-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      showToast('err', "Erreur lors de l'export.")
    }
  }

  const importData = async (e) => {
    const fichier = e.target.files?.[0]
    e.target.value = ''
    if (!fichier || !clientId) return
    if (!window.confirm("Importer ce fichier ? Les lignes existantes (même id) seront écrasées.")) return
    setImporting(true)
    try {
      const text = await fichier.text()
      let payload
      try {
        payload = JSON.parse(text)
      } catch {
        showToast('err', 'Fichier JSON invalide.')
        setImporting(false)
        return
      }
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/import-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ client_id: clientId, payload }),
      })
      const json = await res.json()
      if (!res.ok) {
        showToast('err', json.error || "Erreur lors de l'import.")
      } else if (json.total_errors > 0) {
        showToast('err', `Import partiel : ${json.total_upserted} lignes importées, ${json.total_errors} erreurs.`)
      } else {
        showToast('ok', `Import réussi : ${json.total_upserted} lignes restaurées.`)
      }
    } catch {
      showToast('err', "Erreur lors de l'import.")
    } finally {
      setImporting(false)
    }
  }

  const confirmerResiliation = async () => {
    if (!clientId) return
    if (resilConf.trim().toLowerCase() !== 'résilier') {
      showToast('err', 'Tapez "résilier" pour confirmer.')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase
        .from('clients')
        .update({ demande_resiliation: true })
        .eq('id', clientId)
      if (error) throw error
      setClient({ ...client, demande_resiliation: true })
      setShowResil(false)
      showToast('ok', 'Demande de résiliation enregistrée. Notre équipe vous contactera sous 48h.')
    } catch (err) {
      showToast('err', err.message || 'Erreur.')
    } finally {
      setSaving(false)
    }
  }

  const supprimerCompte = async () => {
    if (!confirm("Supprimer définitivement votre compte ? Vos accès seront révoqués immédiatement. Les données de l'établissement seront conservées.")) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await supabase.from('acces_clients').delete().eq('user_id', session.user.id)
      await supabase.from('profils').delete().eq('id', session.user.id)
      await supabase.auth.signOut()
      router.push('/')
    } catch (err) {
      showToast('err', err.message || 'Erreur suppression.')
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>
      <ChefLoader />
    </div>
  )

  const inputStyle = {
    width: '100%', padding: '9px 12px', fontSize: '14px',
    border: `0.5px solid ${c.bordure}`, borderRadius: '8px',
    background: c.blanc, color: c.texte, outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle = { fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px', display: 'block' }
  const fieldStyle = { marginBottom: '16px' }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <div style={{
        background: c.principal, borderBottom: `0.5px solid ${c.accent}40`,
        padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Logo height={28} couleur="white" nom={nomEtablissement} onClick={() => router.push('/dashboard')} />
          <button onClick={() => router.back()} style={{
            background: 'transparent', border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '6px 10px', fontSize: '13px', cursor: 'pointer', color: 'rgba(255,255,255,0.7)',
          }}>← Retour</button>
          {!isMobile && <span style={{ fontSize: '15px', fontWeight: '500', color: 'white' }}>Mon Compte</span>}
        </div>
      </div>

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '720px', margin: '0 auto' }}>
        {toast && (
          <div style={{
            padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', fontSize: '13px', fontWeight: '500',
            background: toast.type === 'ok' ? '#EAF3DE' : '#FCEBEB',
            color:      toast.type === 'ok' ? '#3B6D11'  : '#A32D2D',
            border:     `0.5px solid ${toast.type === 'ok' ? '#A8D878' : '#F09595'}`,
          }}>{toast.msg}</div>
        )}

        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '4px' }}>
          {TABS.filter(t => isAdmin || t.id === 'profil' || t.id === 'donnees').map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '8px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
              cursor: 'pointer', whiteSpace: 'nowrap', border: 'none',
              background: tab === t.id ? c.accent : c.blanc,
              color:      tab === t.id ? 'white'  : c.texteMuted,
              boxShadow:  tab === t.id ? 'none'   : `0 0 0 0.5px ${c.bordure}`,
            }}>{isMobile && t.id === 'donnees' ? 'Données' : t.label}</button>
          ))}
        </div>

        {tab === 'profil' && (
          <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}` }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: c.texte, marginBottom: '20px' }}>Mon Profil</h2>
            <div style={fieldStyle}>
              <label style={labelStyle}>Nom complet</label>
              <input style={inputStyle} value={editProfil.nom} onChange={e => setEditProfil({ ...editProfil, nom: e.target.value })} placeholder="Votre nom" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Adresse e-mail</label>
              <input style={{ ...inputStyle, background: c.fond, color: c.texteMuted }} value={profil.email} readOnly />
              <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px' }}>L'e-mail ne peut pas être modifié directement. Contactez le support.</div>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Téléphone</label>
              <input style={inputStyle} value={editProfil.telephone} onChange={e => setEditProfil({ ...editProfil, telephone: e.target.value })} placeholder="+33 6 00 00 00 00" />
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
              <button onClick={saveProfil} disabled={saving} style={{ background: c.accent, color: 'white', border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Enregistrer</button>
              <button onClick={sendResetPassword} disabled={pwdSent} style={{ background: 'transparent', color: c.accent, border: `0.5px solid ${c.accent}`, borderRadius: '8px', padding: '9px 18px', fontSize: '13px', cursor: 'pointer' }}>{pwdSent ? 'Email envoyé ✓' : 'Changer mon mot de passe'}</button>
            </div>
          </div>
        )}

        {tab === 'etablissement' && isAdmin && (
          <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}` }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: c.texte, marginBottom: '4px' }}>Informations légales de l'établissement</h2>
            <p style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '20px' }}>Ces informations apparaissent sur vos factures et documents officiels.</p>
            {[
              { key: 'siret',             label: 'SIRET',                     placeholder: '12345678901234 (14 chiffres)' },
              { key: 'num_tva',           label: 'N° TVA intracommunautaire',  placeholder: 'FR12345678901' },
              { key: 'adresse_siege',     label: 'Adresse du siège social',    placeholder: '12 rue de la Paix, 75001 Paris' },
              { key: 'code_naf',          label: 'Code NAF / APE',             placeholder: '5610A' },
              { key: 'email_contact',     label: 'E-mail de contact',          placeholder: 'contact@monrestaurant.fr' },
              { key: 'telephone_contact', label: 'Téléphone de contact',       placeholder: '+33 1 00 00 00 00' },
            ].map(({ key, label, placeholder }) => (
              <div key={key} style={fieldStyle}>
                <label style={labelStyle}>{label}</label>
                <input style={inputStyle} value={editClient[key] || ''} onChange={e => setEditClient({ ...editClient, [key]: e.target.value })} placeholder={placeholder} />
              </div>
            ))}
            <button onClick={saveEtablissement} disabled={saving} style={{ background: c.accent, color: 'white', border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', marginTop: '8px' }}>Enregistrer</button>
          </div>
        )}

        {tab === 'abonnement' && isAdmin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}` }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: c.texte, marginBottom: '16px' }}>Mon abonnement</h2>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
                <div style={{ background: c.fond, borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '10px', color: c.texteMuted, textTransform: 'uppercase', fontWeight: '500' }}>Plan actif</div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: c.texte, marginTop: '4px' }}>{client.modules_actifs?.length ? `${client.modules_actifs.length} modules` : 'Standard'}</div>
                </div>
                <div style={{ background: c.fond, borderRadius: '8px', padding: '12px' }}>
                  <div style={{ fontSize: '10px', color: c.texteMuted, textTransform: 'uppercase', fontWeight: '500' }}>Client depuis</div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: c.texte, marginTop: '4px' }}>{client.created_at ? new Date(client.created_at).toLocaleDateString('fr-FR') : '—'}</div>
                </div>
              </div>
              {client.demande_resiliation && (
                <div style={{ marginTop: '16px', padding: '12px', background: '#FCEBEB', borderRadius: '8px', border: '0.5px solid #F09595', fontSize: '13px', color: '#A32D2D' }}>
                  ⚠ Une demande de résiliation est en cours de traitement par notre équipe.
                </div>
              )}
            </div>
            <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}` }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: c.texte, marginBottom: '16px' }}>Documents contractuels</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { label: "Conditions générales d'utilisation (CGU)", href: '/cgu' },
                  { label: 'Mentions légales', href: '/mentions-legales' },
                  { label: 'Politique de confidentialité (RGPD)', href: '/politique-confidentialite' },
                ].map(({ label, href }) => (
                  <a key={href} href={href} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '8px', background: c.fond, color: c.texte, textDecoration: 'none', fontSize: '13px', fontWeight: '500', border: `0.5px solid ${c.bordure}` }}>
                    {label}<span style={{ color: c.accent, fontSize: '12px' }}>Consulter →</span>
                  </a>
                ))}
              </div>
              {client.date_cgu && (
                <div style={{ marginTop: '12px', fontSize: '12px', color: c.texteMuted }}>
                  CGU acceptées le {new Date(client.date_cgu).toLocaleDateString('fr-FR')} (version {client.version_cgu || '1.0'})
                </div>
              )}
            </div>
            {!client.demande_resiliation && (
              <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}` }}>
                <h2 style={{ fontSize: '16px', fontWeight: '600', color: c.texte, marginBottom: '8px' }}>Résilier mon abonnement</h2>
                <p style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '16px' }}>Conformément à la loi du 16 août 2022 (résiliation en ligne), vous pouvez résilier votre abonnement à tout moment. Notre équipe traitera votre demande sous 48h.</p>
                {!showResil ? (
                  <button onClick={() => setShowResil(true)} style={{ background: 'transparent', color: '#A32D2D', border: '0.5px solid #F09595', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', cursor: 'pointer' }}>Résilier mon abonnement</button>
                ) : (
                  <div style={{ background: '#FCEBEB', borderRadius: '10px', padding: '16px', border: '0.5px solid #F09595' }}>
                    <p style={{ fontSize: '13px', color: '#A32D2D', marginBottom: '12px', fontWeight: '500' }}>Tapez <strong>résilier</strong> pour confirmer votre demande.</p>
                    <input style={{ ...inputStyle, border: '0.5px solid #F09595', marginBottom: '12px' }} value={resilConf} onChange={e => setResilConf(e.target.value)} placeholder='Tapez "résilier"' />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={confirmerResiliation} disabled={saving} style={{ background: '#A32D2D', color: 'white', border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Confirmer la résiliation</button>
                      <button onClick={() => { setShowResil(false); setResilConf('') }} style={{ background: 'transparent', color: '#A32D2D', border: '0.5px solid #F09595', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', cursor: 'pointer' }}>Annuler</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'donnees' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}` }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: c.texte, marginBottom: '8px' }}>Portabilité des données</h2>
              <p style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '16px', lineHeight: '1.6' }}>Conformément au RGPD (article 20), vous pouvez télécharger l'ensemble des données de votre établissement au format JSON{isAdmin ? ', et les restaurer depuis un export' : ''}.</p>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button onClick={exportData} style={{ background: c.accent, color: 'white', border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Télécharger mes données (JSON)</button>
                {isAdmin && (
                  <label style={{ background: c.blanc, color: c.accent, border: `0.5px solid ${c.accent}`, borderRadius: '8px', padding: '9px 18px', fontSize: '13px', fontWeight: '600', cursor: importing ? 'not-allowed' : 'pointer', opacity: importing ? 0.6 : 1 }}>
                    {importing ? 'Import en cours…' : 'Importer un fichier JSON'}
                    <input type="file" accept="application/json,.json" onChange={importData} disabled={importing} style={{ display: 'none' }} />
                  </label>
                )}
              </div>
            </div>
            <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}` }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: c.texte, marginBottom: '8px' }}>Responsable du traitement</h2>
              <div style={{ fontSize: '13px', color: c.texteMuted, lineHeight: '1.8' }}>
                <div><strong style={{ color: c.texte }}>Éditeur :</strong> Skalcook SAS</div>
                <div><strong style={{ color: c.texte }}>Contact DPO :</strong> <a href="mailto:contact@skalcook.fr" style={{ color: c.accent }}>contact@skalcook.fr</a></div>
                <div><strong style={{ color: c.texte }}>Délai de réponse :</strong> 30 jours maximum (RGPD)</div>
              </div>
              <a href="/politique-confidentialite" target="_blank" rel="noopener noreferrer" style={{ color: c.accent, fontSize: '13px', textDecoration: 'none', fontWeight: '500', display: 'inline-block', marginTop: '12px' }}>Politique de confidentialité →</a>
            </div>
            <div style={{ background: '#FCEBEB', borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: '0.5px solid #F09595' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: '#A32D2D', marginBottom: '8px' }}>Supprimer mon compte</h2>
              <p style={{ fontSize: '13px', color: '#A32D2D', marginBottom: '16px', lineHeight: '1.6', opacity: 0.85 }}>Conformément au RGPD (article 17), vous pouvez supprimer votre compte. Vos accès seront révoqués immédiatement. Les données de l'établissement restent accessibles aux autres administrateurs.</p>
              <button onClick={supprimerCompte} style={{ background: 'transparent', color: '#A32D2D', border: '0.5px solid #F09595', borderRadius: '8px', padding: '9px 18px', fontSize: '13px', cursor: 'pointer' }}>Supprimer mon compte</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
