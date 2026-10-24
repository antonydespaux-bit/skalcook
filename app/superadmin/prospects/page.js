'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { isSuperadminEmail } from '../../../lib/superadmin'
import { useRouter } from 'next/navigation'
import ChefLoader from '../../../components/ChefLoader'
import { useIsMobile } from '../../../lib/useIsMobile'

const STATUTS = [
  { id: 'nouveau', label: 'Nouveau', color: '#6366F1', bg: '#EEF2FF' },
  { id: 'contacte', label: 'Contacté', color: '#D97706', bg: '#FEF3C7' },
  { id: 'en_cours', label: 'En cours', color: '#2563EB', bg: '#DBEAFE' },
  { id: 'signe', label: 'Signé', color: '#16A34A', bg: '#DCFCE7' },
  { id: 'perdu', label: 'Perdu', color: '#DC2626', bg: '#FEE2E2' },
]

const LANGUES = { fr: '🇫🇷', en: '🇬🇧', es: '🇪🇸', it: '🇮🇹' }

const SOURCES = [
  { id: 'formulaire', label: 'Formulaire', color: '#0891B2', bg: '#CFFAFE' },
  { id: 'prospection', label: 'Prospection', color: '#9333EA', bg: '#F3E8FF' },
]

const aujourdhui = () => new Date().toISOString().slice(0, 10)

// Relance due : date passée ou du jour, sur un prospect encore ouvert.
const relanceDue = (p) =>
  !!p.date_relance && p.date_relance <= aujourdhui() && !['signe', 'perdu'].includes(p.statut)

const nomAffiche = (p) => p.nom_etablissement || p.nom || p.contact_nom || 'Prospect'

const labelStyle = { fontSize: '11px', fontWeight: '600', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }
const champStyle = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '0.5px solid #E4E4E7', fontSize: '13px', outline: 'none', fontFamily: 'inherit', color: '#18181B', background: '#FAFAFA' }

function BadgeSource({ source }) {
  const s = SOURCES.find(x => x.id === source) || SOURCES[0]
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: '999px', padding: '2px 8px', fontSize: '11px', fontWeight: 600 }}>{s.label}</span>
  )
}

// Accroche + brouillon d'e-mail + date de relance : les champs remplis par la
// prospection. Le brouillon est éditable et sauvegardé à la sortie du champ.
// Monté avec key={prospect.id} : l'état local repart à zéro à chaque prospect.
function BlocProspection({ prospect, onUpdate }) {
  const [objet, setObjet] = useState(prospect.brouillon_objet || '')
  const [corps, setCorps] = useState(prospect.brouillon_email || '')
  const [copie, setCopie] = useState(false)

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(objet ? `Objet : ${objet}\n\n${corps}` : corps)
      setCopie(true)
      setTimeout(() => setCopie(false), 2000)
    } catch {}
  }

  const mailto = prospect.email
    ? `mailto:${prospect.email}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`
    : null

  return (
    <>
      {prospect.accroche && (
        <div style={{ marginBottom: '20px' }}>
          <div style={labelStyle}>Accroche</div>
          <div style={{ padding: '12px', background: '#F3E8FF', borderRadius: '8px', fontSize: '13px', color: '#18181B', lineHeight: '1.6' }}>
            {prospect.accroche}
          </div>
        </div>
      )}

      <div style={{ marginBottom: '20px' }}>
        <div style={labelStyle}>Prochaine relance</div>
        <input
          type="date"
          value={prospect.date_relance || ''}
          onChange={e => onUpdate(prospect.id, { date_relance: e.target.value || null })}
          style={{ ...champStyle, borderColor: relanceDue(prospect) ? '#F59E0B' : '#E4E4E7' }}
        />
      </div>

      {(prospect.source === 'prospection' || corps) && (
        <div style={{ marginBottom: '20px' }}>
          <div style={labelStyle}>Brouillon d’e-mail</div>
          <input
            value={objet}
            onChange={e => setObjet(e.target.value)}
            onBlur={() => objet !== (prospect.brouillon_objet || '') && onUpdate(prospect.id, { brouillon_objet: objet })}
            placeholder="Objet"
            style={{ ...champStyle, marginBottom: '6px', fontWeight: 500 }}
          />
          <textarea
            value={corps}
            onChange={e => setCorps(e.target.value)}
            onBlur={() => corps !== (prospect.brouillon_email || '') && onUpdate(prospect.id, { brouillon_email: corps })}
            placeholder="Texte de l'e-mail..."
            style={{ ...champStyle, resize: 'vertical', minHeight: '180px', lineHeight: '1.5' }}
          />
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button onClick={copier} disabled={!corps} style={{
              flex: 1, padding: '9px', borderRadius: '8px', border: '0.5px solid #D8B4FE',
              background: copie ? '#9333EA' : '#F3E8FF', color: copie ? 'white' : '#7E22CE',
              fontSize: '12px', fontWeight: 600, cursor: corps ? 'pointer' : 'not-allowed', fontFamily: 'inherit'
            }}>
              {copie ? '✓ Copié' : '📋 Copier'}
            </button>
            {mailto && (
              <a href={mailto} style={{
                flex: 1, padding: '9px', borderRadius: '8px', border: '0.5px solid #E4E4E7',
                background: '#F4F4F5', color: '#18181B', fontSize: '12px', fontWeight: 600,
                textAlign: 'center', textDecoration: 'none'
              }}>📧 Ouvrir dans ma messagerie</a>
            )}
          </div>
        </div>
      )}
    </>
  )
}

export default function ProspectsPage() {
  const [prospects, setProspects] = useState([])
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [filtre, setFiltre] = useState('tous')
  const [filtreSource, setFiltreSource] = useState('toutes')
  const [recherche, setRecherche] = useState('')
  const [selected, setSelected] = useState(null)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [isNavigating, setIsNavigating] = useState(false)
  const router = useRouter()
  const isMobile = useIsMobile()

  useEffect(() => { checkAuth() }, [])

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/'); return }

    const sessionEmail = (session?.user?.email || '').toLowerCase().trim()
    if (isSuperadminEmail(sessionEmail)) {
      setAuthorized(true)
      loadProspects()
      return
    }

    const { data: profil } = await supabase
      .from('profils')
      .select('is_superadmin')
      .eq('id', session.user.id)
      .single()

    if (!profil?.is_superadmin) { router.push('/dashboard'); return }
    setAuthorized(true)
    loadProspects()
  }

  const loadProspects = async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) {
      setProspects([])
      setLoading(false)
      return
    }

    const res = await fetch('/api/superadmin/list-prospects', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const json = await res.json()

    if (!res.ok) {
      console.error('Error loading prospects:', json)
      setProspects([])
      setLoading(false)
      return
    }

    setProspects(json.prospects || [])
    setLoading(false)
  }

  const updateStatut = async (id, statut) => {
    await supabase.from('prospects').update({ statut }).eq('id', id)
    setProspects(prev => prev.map(p => p.id === id ? { ...p, statut } : p))
    if (selected?.id === id) setSelected(prev => ({ ...prev, statut }))
  }

  const updateChamps = async (id, champs) => {
    await supabase.from('prospects').update(champs).eq('id', id)
    setProspects(prev => prev.map(p => p.id === id ? { ...p, ...champs } : p))
    if (selected?.id === id) setSelected(prev => ({ ...prev, ...champs }))
  }

  const saveNotes = async () => {
    if (!selected) return
    setSavingNotes(true)
    await supabase.from('prospects').update({ notes }).eq('id', selected.id)
    setProspects(prev => prev.map(p => p.id === selected.id ? { ...p, notes } : p))
    setSavingNotes(false)
  }

  const ouvrirDetail = (prospect) => {
    setSelected(prospect)
    setNotes(prospect.notes || '')
  }

  const convertirEnClient = async (prospect) => {
    if (!prospect?.id) return
    await updateStatut(prospect.id, 'signe')
  }

  const supprimerProspect = async (prospect) => {
    if (!prospect?.id) return
    const ok = window.confirm(`Supprimer le prospect "${prospect.nom || prospect.email || prospect.id}" ?`)
    if (!ok) return
    setDeletingId(prospect.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      const res = await fetch('/api/superadmin/delete-prospect', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ id: prospect.id })
      })

      if (!res.ok) return
      setProspects((prev) => prev.filter((p) => p.id !== prospect.id))
      if (selected?.id === prospect.id) {
        setSelected(null)
        setNotes('')
      }
    } finally {
      setDeletingId(null)
    }
  }

  const filtres = prospects.reduce((acc, p) => {
    acc[p.statut] = (acc[p.statut] || 0) + 1
    return acc
  }, {})

  const sources = prospects.reduce((acc, p) => {
    const s = p.source || 'formulaire'
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})
  const nbRelances = prospects.filter(relanceDue).length

  const q = recherche.toLowerCase()
  const prospectsFiltres = prospects.filter(p => {
    const matchFiltre = filtre === 'tous'
      || (filtre === 'a_relancer' ? relanceDue(p) : p.statut === filtre)
    const matchSource = filtreSource === 'toutes' || (p.source || 'formulaire') === filtreSource
    const matchRecherche = !recherche ||
      [p.nom, p.email, p.nom_etablissement, p.contact_nom, p.arrondissement, p.type_cuisine]
        .some(v => v?.toLowerCase().includes(q))
    return matchFiltre && matchSource && matchRecherche
  })
    // Relances dues en tête, le reste garde l'ordre d'arrivée.
    .sort((a, b) => Number(relanceDue(b)) - Number(relanceDue(a)))

  const statutInfo = (id) => STATUTS.find(s => s.id === id) || STATUTS[0]
  const handleNavigation = (url) => {
    setIsNavigating(true)
    router.push(url)
  }

  if (!authorized || loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F4F5' }}>
      <ChefLoader />
    </div>
  )
  if (isNavigating) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F4F5' }}>
      <ChefLoader message="Navigation en cours..." />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#F4F4F5', display: 'flex', flexDirection: 'column' }}>

      {/* Navbar */}
      <div style={{
        background: '#18181B', borderBottom: '0.5px solid rgba(255,255,255,0.06)',
        padding: '0 24px', height: '56px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>⚡</div>
          <span style={{ fontSize: '14px', fontWeight: '600', color: 'white' }}>Super Admin</span>
          <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>
          <span style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)' }}>CRM Prospects</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => handleNavigation('/superadmin')}
            style={{ background: 'rgba(99,102,241,0.2)', color: '#A5B4FC', border: '0.5px solid rgba(99,102,241,0.3)', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer' }}
          >
            ← Retour SuperAdmin
          </button>
        </div>
      </div>

      {isMobile ? (
        <div style={{ padding: '14px' }}>
          <div style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <input
              type="text"
              placeholder="Rechercher un prospect..."
              value={recherche}
              onChange={e => setRecherche(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '0.5px solid #E4E4E7', fontSize: '14px', outline: 'none', background: 'white' }}
            />
            <div style={{ fontSize: '13px', color: '#71717A' }}>{prospectsFiltres.length} prospect{prospectsFiltres.length > 1 ? 's' : ''}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {prospectsFiltres.map((p) => {
              const st = statutInfo(p.statut)
              return (
                <div
                  key={p.id}
                  style={{
                    background: 'white',
                    borderRadius: '12px',
                    border: '0.5px solid #E4E4E7',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.04)',
                    padding: '14px'
                  }}
                >
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#18181B', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {nomAffiche(p)} <BadgeSource source={p.source} />
                    {relanceDue(p) && <span style={{ fontSize: '11px', color: '#B45309', fontWeight: 600 }}>⏰ À relancer</span>}
                  </div>
                  {(p.arrondissement || p.type_cuisine) && (
                    <div style={{ fontSize: '12px', color: '#71717A', marginBottom: '4px' }}>
                      {[p.arrondissement, p.type_cuisine].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  <div style={{ fontSize: '13px', color: '#334155', marginBottom: '4px' }}>
                    📧 {p.email || '-'}
                  </div>
                  <div style={{ fontSize: '13px', color: '#334155', marginBottom: '10px' }}>
                    📞 {p.telephone ? <a href={`tel:${p.telephone}`} style={{ color: '#334155', textDecoration: 'underline' }}>{p.telephone}</a> : '-'}
                  </div>
                  <div style={{ marginBottom: '10px' }}>
                    <span style={{ background: st.bg, color: st.color, border: `0.5px solid ${st.color}33`, borderRadius: '999px', padding: '4px 10px', fontSize: '12px', fontWeight: 600 }}>
                      {st.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button
                      onClick={() => ouvrirDetail(p)}
                      style={{ width: '100%', padding: '9px 10px', borderRadius: '8px', border: '0.5px solid #CBD5E1', background: 'white', color: '#334155', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => convertirEnClient(p)}
                      style={{ width: '100%', padding: '9px 10px', borderRadius: '8px', border: '0.5px solid #86EFAC', background: '#DCFCE7', color: '#166534', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Convertir en Client
                    </button>
                    <button
                      onClick={() => supprimerProspect(p)}
                      disabled={deletingId === p.id}
                      style={{ width: '100%', padding: '9px 10px', borderRadius: '8px', border: '0.5px solid #FCA5A5', background: '#FEE2E2', color: '#B91C1C', fontSize: '12px', fontWeight: 600, cursor: deletingId === p.id ? 'not-allowed' : 'pointer' }}
                    >
                      {deletingId === p.id ? 'Suppression...' : 'Supprimer'}
                    </button>
                  </div>
                </div>
              )
            })}
            {prospectsFiltres.length === 0 && (
              <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '40px', textAlign: 'center', color: '#71717A', fontSize: '14px' }}>
                {recherche ? 'Aucun prospect trouvé pour cette recherche.' : 'Aucun prospect pour ce filtre.'}
              </div>
            )}
          </div>

          {selected && (
            <div style={{ marginTop: '12px', background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '14px' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#18181B', marginBottom: '14px' }}>{nomAffiche(selected)}</div>
              <BlocProspection key={selected.id} prospect={selected} onUpdate={updateChamps} />
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#71717A', textTransform: 'uppercase', marginBottom: '8px' }}>
                Notes internes
              </div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ajouter des notes sur ce prospect..."
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '0.5px solid #E4E4E7', fontSize: '13px', outline: 'none', resize: 'vertical', minHeight: '90px', fontFamily: 'inherit', color: '#18181B', background: '#FAFAFA', lineHeight: '1.5' }}
              />
              <button onClick={saveNotes} disabled={savingNotes} style={{
                width: '100%', marginTop: '8px', padding: '10px',
                background: savingNotes ? '#A5B4FC' : '#6366F1', color: 'white',
                border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
                cursor: savingNotes ? 'not-allowed' : 'pointer', fontFamily: 'inherit'
              }}>
                {savingNotes ? 'Sauvegarde...' : '💾 Sauvegarder les notes'}
              </button>
            </div>
          )}
        </div>
      ) : (
      <div style={{ display: 'flex', flex: 1 }}>

        {/* SIDEBAR GAUCHE */}
        <div style={{ width: '280px', background: 'white', borderRight: '0.5px solid #E4E4E7', padding: '24px', flexShrink: 0, position: 'sticky', top: '56px', height: 'calc(100vh - 56px)', overflowY: 'auto' }}>

          {/* Stats rapides */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Résumé</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div style={{ background: '#F4F4F5', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: '600', color: '#18181B' }}>{prospects.length}</div>
                <div style={{ fontSize: '11px', color: '#71717A' }}>Total</div>
              </div>
              <div style={{ background: '#EEF2FF', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: '600', color: '#6366F1' }}>{filtres['nouveau'] || 0}</div>
                <div style={{ fontSize: '11px', color: '#6366F1' }}>Nouveaux</div>
              </div>
              <div style={{ background: '#DCFCE7', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: '600', color: '#16A34A' }}>{filtres['signe'] || 0}</div>
                <div style={{ fontSize: '11px', color: '#16A34A' }}>Signés</div>
              </div>
              <div style={{ background: '#FEE2E2', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '22px', fontWeight: '600', color: '#DC2626' }}>{filtres['perdu'] || 0}</div>
                <div style={{ fontSize: '11px', color: '#DC2626' }}>Perdus</div>
              </div>
            </div>
          </div>

          {/* Filtres par statut */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Filtrer par statut</div>
            <button onClick={() => setFiltre('tous')} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              width: '100%', padding: '9px 12px', border: 'none', borderRadius: '8px',
              background: filtre === 'tous' ? '#F4F4F5' : 'transparent',
              cursor: 'pointer', marginBottom: '4px', fontSize: '13px',
              fontWeight: filtre === 'tous' ? '500' : '400', color: '#18181B'
            }}>
              <span>Tous</span>
              <span style={{ fontSize: '11px', background: '#E4E4E7', color: '#71717A', padding: '2px 7px', borderRadius: '20px' }}>{prospects.length}</span>
            </button>
            {STATUTS.map(s => (
              <button key={s.id} onClick={() => setFiltre(s.id)} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                width: '100%', padding: '9px 12px', border: 'none', borderRadius: '8px',
                background: filtre === s.id ? s.bg : 'transparent',
                cursor: 'pointer', marginBottom: '4px', fontSize: '13px',
                fontWeight: filtre === s.id ? '500' : '400', color: filtre === s.id ? s.color : '#18181B'
              }}>
                <span>{s.label}</span>
                <span style={{ fontSize: '11px', background: s.bg, color: s.color, padding: '2px 7px', borderRadius: '20px' }}>{filtres[s.id] || 0}</span>
              </button>
            ))}
            <button onClick={() => setFiltre('a_relancer')} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              width: '100%', padding: '9px 12px', border: 'none', borderRadius: '8px',
              background: filtre === 'a_relancer' ? '#FEF3C7' : 'transparent',
              cursor: 'pointer', marginBottom: '4px', fontSize: '13px',
              fontWeight: filtre === 'a_relancer' ? '500' : '400', color: filtre === 'a_relancer' ? '#B45309' : '#18181B'
            }}>
              <span>⏰ À relancer</span>
              <span style={{ fontSize: '11px', background: '#FEF3C7', color: '#B45309', padding: '2px 7px', borderRadius: '20px' }}>{nbRelances}</span>
            </button>
          </div>

          {/* Filtres par source */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '11px', fontWeight: '600', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>Source</div>
            {[{ id: 'toutes', label: 'Toutes', color: '#18181B', bg: '#F4F4F5' }, ...SOURCES].map(s => (
              <button key={s.id} onClick={() => setFiltreSource(s.id)} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                width: '100%', padding: '9px 12px', border: 'none', borderRadius: '8px',
                background: filtreSource === s.id ? s.bg : 'transparent',
                cursor: 'pointer', marginBottom: '4px', fontSize: '13px',
                fontWeight: filtreSource === s.id ? '500' : '400', color: filtreSource === s.id ? s.color : '#18181B'
              }}>
                <span>{s.label}</span>
                <span style={{ fontSize: '11px', background: s.bg, color: s.color, padding: '2px 7px', borderRadius: '20px' }}>
                  {s.id === 'toutes' ? prospects.length : (sources[s.id] || 0)}
                </span>
              </button>
            ))}
          </div>

          {/* Taux de conversion */}
          {prospects.length > 0 && (
            <div style={{ background: '#F4F4F5', borderRadius: '10px', padding: '14px' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>Conversion</div>
              <div style={{ fontSize: '24px', fontWeight: '600', color: '#16A34A', marginBottom: '4px' }}>
                {Math.round((filtres['signe'] || 0) / prospects.length * 100)}%
              </div>
              <div style={{ fontSize: '12px', color: '#71717A' }}>{filtres['signe'] || 0} signé{(filtres['signe'] || 0) > 1 ? 's' : ''} sur {prospects.length}</div>
            </div>
          )}
        </div>

        {/* LISTE PROSPECTS */}
        <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>

          {/* Recherche */}
          <div style={{ marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <input
              type="text" placeholder="Rechercher un prospect..."
              value={recherche} onChange={e => setRecherche(e.target.value)}
              style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: '0.5px solid #E4E4E7', fontSize: '14px', outline: 'none', background: 'white' }}
            />
            <div style={{ fontSize: '13px', color: '#71717A' }}>{prospectsFiltres.length} prospect{prospectsFiltres.length > 1 ? 's' : ''}</div>
          </div>

          {/* Tableau prospects */}
          <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', boxShadow: '0 4px 14px rgba(0,0,0,0.04)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                <thead>
                  <tr style={{ background: '#FAFAFA', borderBottom: '0.5px solid #E4E4E7' }}>
                    <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#71717A', textTransform: 'uppercase' }}>Établissement</th>
                    <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#71717A', textTransform: 'uppercase' }}>Contact</th>
                    <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#71717A', textTransform: 'uppercase' }}>Statut</th>
                    <th style={{ textAlign: 'left', padding: '12px', fontSize: '11px', color: '#71717A', textTransform: 'uppercase' }}>Date</th>
                    <th style={{ textAlign: 'right', padding: '12px', fontSize: '11px', color: '#71717A', textTransform: 'uppercase' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {prospectsFiltres.map((p) => {
                    const st = statutInfo(p.statut)
                    const isSelected = selected?.id === p.id
                    return (
                      <tr key={p.id} onClick={() => ouvrirDetail(p)} style={{ borderBottom: '0.5px solid #E4E4E7', cursor: 'pointer', background: isSelected ? '#EEF2FF44' : 'white' }}>
                        <td style={{ padding: '12px' }}>
                          <div style={{ fontSize: '14px', fontWeight: 700, color: '#18181B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {nomAffiche(p)} <BadgeSource source={p.source} />
                          </div>
                          <div style={{ fontSize: '12px', color: '#71717A', marginTop: '3px' }}>
                            {p.source === 'prospection'
                              ? [p.arrondissement, p.type_cuisine].filter(Boolean).join(' · ') || '-'
                              : `${p.nb_etablissements === 11 ? '10+' : p.nb_etablissements === 6 ? '6-10' : p.nb_etablissements === 2 ? '2-5' : '1'} établissement${p.nb_etablissements > 1 ? 's' : ''}`}
                          </div>
                        </td>
                        <td style={{ padding: '12px' }}>
                          {p.contact_nom && <div style={{ fontSize: '13px', color: '#18181B', fontWeight: 500, marginBottom: '3px' }}>{p.contact_nom}{p.contact_role ? ` — ${p.contact_role}` : ''}</div>}
                          <div style={{ fontSize: '13px', color: '#334155' }}>{p.email || '-'}</div>
                          <div style={{ fontSize: '13px', color: '#334155', marginTop: '3px' }}>
                            {p.telephone ? <a href={`tel:${p.telephone}`} style={{ color: '#334155', textDecoration: 'underline' }}>{p.telephone}</a> : '-'}
                          </div>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <span style={{ background: st.bg, color: st.color, border: `0.5px solid ${st.color}33`, borderRadius: '999px', padding: '4px 10px', fontSize: '12px', fontWeight: 600 }}>{st.label}</span>
                        </td>
                        <td style={{ padding: '12px', fontSize: '12px', color: '#71717A' }}>
                          {new Date(p.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {p.date_relance && (
                            <div style={{ marginTop: '3px', color: relanceDue(p) ? '#B45309' : '#71717A', fontWeight: relanceDue(p) ? 600 : 400 }}>
                              ⏰ {new Date(p.date_relance + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'inline-flex', gap: '8px' }}>
                            <button onClick={() => ouvrirDetail(p)} style={{ border: '0.5px solid #CBD5E1', background: 'white', color: '#334155', borderRadius: '8px', padding: '7px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Modifier</button>
                            <button onClick={() => convertirEnClient(p)} style={{ border: '0.5px solid #86EFAC', background: '#DCFCE7', color: '#166534', borderRadius: '8px', padding: '7px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Convertir</button>
                            <button onClick={() => supprimerProspect(p)} disabled={deletingId === p.id} style={{ border: '0.5px solid #FCA5A5', background: '#FEE2E2', color: '#B91C1C', borderRadius: '8px', padding: '7px 10px', fontSize: '12px', fontWeight: 600, cursor: deletingId === p.id ? 'not-allowed' : 'pointer' }}>{deletingId === p.id ? 'Suppression...' : 'Supprimer'}</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  {prospectsFiltres.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#71717A', fontSize: '14px' }}>
                        {recherche ? 'Aucun prospect trouvé pour cette recherche.' : 'Aucun prospect pour ce filtre.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* DETAIL PANEL DROIT */}
        {selected && (
          <div style={{ width: '320px', background: 'white', borderLeft: '0.5px solid #E4E4E7', padding: '24px', flexShrink: 0, position: 'sticky', top: '56px', height: 'calc(100vh - 56px)', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#18181B' }}>Détail prospect</h3>
              <button onClick={() => setSelected(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#71717A', fontSize: '18px' }}>×</button>
            </div>

            {/* Avatar + nom */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', padding: '16px', background: '#F4F4F5', borderRadius: '10px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: '600', color: '#6366F1', flexShrink: 0 }}>
                {(selected.nom || selected.contact_nom || selected.nom_etablissement)?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '500', color: '#18181B' }}>{selected.nom || selected.contact_nom || selected.nom_etablissement}</div>
                <div style={{ fontSize: '12px', color: '#71717A', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                  <BadgeSource source={selected.source} />
                  {selected.source !== 'prospection' && <span>{LANGUES[selected.langue] || '🌍'} {selected.langue?.toUpperCase()}</span>}
                </div>
              </div>
            </div>

            {/* Infos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {[
                { label: 'Contact', value: selected.contact_nom && `${selected.contact_nom}${selected.contact_role ? ` — ${selected.contact_role}` : ''}`, icon: '👤' },
                { label: 'Email', value: selected.email, icon: '📧' },
                { label: 'Téléphone', value: selected.telephone, icon: '📞' },
                { label: 'Établissement', value: selected.nom_etablissement, icon: '🏨' },
                { label: 'Adresse', value: selected.adresse, icon: '📍' },
                { label: 'Cuisine', value: selected.type_cuisine, icon: '🍽️' },
                { label: 'Site web', value: selected.site_web && <a href={selected.site_web} target="_blank" rel="noopener noreferrer" style={{ color: '#6366F1' }}>{selected.site_web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>, icon: '🌐' },
                { label: 'Nb établissements', value: selected.source === 'prospection' ? null : selected.nb_etablissements === 11 ? '10+' : selected.nb_etablissements === 6 ? '6-10' : selected.nb_etablissements === 2 ? '2-5' : '1', icon: '🏢' },
                { label: 'Date', value: new Date(selected.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }), icon: '📅' },
              ].filter(item => item.value).map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', padding: '10px 12px', background: '#F4F4F5', borderRadius: '8px' }}>
                  <span style={{ fontSize: '14px', flexShrink: 0 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontSize: '10px', color: '#71717A', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{item.label}</div>
                    <div style={{ fontSize: '13px', color: '#18181B', marginTop: '2px' }}>{item.value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Message */}
            {selected.message && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Message</div>
                <div style={{ padding: '12px', background: '#F4F4F5', borderRadius: '8px', fontSize: '13px', color: '#18181B', lineHeight: '1.6', fontStyle: 'italic' }}>
                  "{selected.message}"
                </div>
              </div>
            )}

            {/* Statut */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Statut</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {STATUTS.map(s => (
                  <button key={s.id} onClick={() => updateStatut(selected.id, s.id)} style={{
                    padding: '6px 12px', borderRadius: '20px', border: 'none', cursor: 'pointer',
                    background: selected.statut === s.id ? s.color : s.bg,
                    color: selected.statut === s.id ? 'white' : s.color,
                    fontSize: '12px', fontWeight: '500', fontFamily: 'inherit',
                    transition: 'all 0.15s'
                  }}>{s.label}</button>
                ))}
              </div>
            </div>

            <BlocProspection key={selected.id} prospect={selected} onUpdate={updateChamps} />

            {/* Notes */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Notes internes</div>
              <textarea
                value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Ajouter des notes sur ce prospect..."
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '0.5px solid #E4E4E7', fontSize: '13px', outline: 'none', resize: 'vertical', minHeight: '100px', fontFamily: 'inherit', color: '#18181B', background: '#FAFAFA', lineHeight: '1.5' }}
              />
              <button onClick={saveNotes} disabled={savingNotes} style={{
                width: '100%', marginTop: '8px', padding: '10px',
                background: savingNotes ? '#A5B4FC' : '#6366F1', color: 'white',
                border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
                cursor: savingNotes ? 'not-allowed' : 'pointer', fontFamily: 'inherit'
              }}>
                {savingNotes ? 'Sauvegarde...' : '💾 Sauvegarder les notes'}
              </button>
            </div>

            {/* Actions rapides */}
            <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
              {selected.email && (
                <a href={`mailto:${selected.email}`} style={{
                  flex: 1, padding: '10px', borderRadius: '8px',
                  background: '#F4F4F5', color: '#18181B', textDecoration: 'none',
                  fontSize: '13px', fontWeight: '500', textAlign: 'center',
                  border: '0.5px solid #E4E4E7', display: 'block'
                }}>📧 Email</a>
              )}
              {selected.telephone && (
                <a href={`tel:${selected.telephone}`} style={{
                  flex: 1, padding: '10px', borderRadius: '8px',
                  background: '#F4F4F5', color: '#18181B', textDecoration: 'none',
                  fontSize: '13px', fontWeight: '500', textAlign: 'center',
                  border: '0.5px solid #E4E4E7', display: 'block'
                }}>📞 Appel</a>
              )}
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  )
}
