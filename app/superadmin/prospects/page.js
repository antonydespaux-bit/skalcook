'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { isSuperadminEmail } from '../../../lib/superadmin'
import { useRouter } from 'next/navigation'
import ChefLoader from '../../../components/ChefLoader'

const STATUTS = [
  { id: 'nouveau', label: 'Nouveau', color: '#6366F1', bg: '#EEF2FF' },
  { id: 'contacte', label: 'Contacté', color: '#D97706', bg: '#FEF3C7' },
  { id: 'en_cours', label: 'En cours', color: '#2563EB', bg: '#DBEAFE' },
  { id: 'signe', label: 'Signé', color: '#16A34A', bg: '#DCFCE7' },
  { id: 'perdu', label: 'Perdu', color: '#DC2626', bg: '#FEE2E2' },
]

const LANGUES = { fr: '🇫🇷', en: '🇬🇧', es: '🇪🇸', it: '🇮🇹' }

export default function ProspectsPage() {
  const [prospects, setProspects] = useState([])
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [filtre, setFiltre] = useState('tous')
  const [recherche, setRecherche] = useState('')
  const [selected, setSelected] = useState(null)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const router = useRouter()

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
    const { data, error } = await supabase
      .from('prospects')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading prospects:', error)
      setProspects([])
      setLoading(false)
      return
    }

    setProspects(data || [])
    setLoading(false)
  }

  const updateStatut = async (id, statut) => {
    await supabase.from('prospects').update({ statut }).eq('id', id)
    setProspects(prev => prev.map(p => p.id === id ? { ...p, statut } : p))
    if (selected?.id === id) setSelected(prev => ({ ...prev, statut }))
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

  const filtres = prospects.reduce((acc, p) => {
    acc[p.statut] = (acc[p.statut] || 0) + 1
    return acc
  }, {})

  const prospectsFiltres = prospects.filter(p => {
    const matchFiltre = filtre === 'tous' || p.statut === filtre
    const matchRecherche = !recherche ||
      p.nom?.toLowerCase().includes(recherche.toLowerCase()) ||
      p.email?.toLowerCase().includes(recherche.toLowerCase()) ||
      p.nom_etablissement?.toLowerCase().includes(recherche.toLowerCase())
    return matchFiltre && matchRecherche
  })

  const statutInfo = (id) => STATUTS.find(s => s.id === id) || STATUTS[0]

  if (!authorized || loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F4F5' }}>
      <ChefLoader />
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
          <button onClick={() => router.push('/superadmin')} style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer' }}>← Établissements</button>
          <button onClick={() => router.push('/dashboard')} style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer' }}>App →</button>
        </div>
      </div>

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

          {/* Cards prospects */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {prospectsFiltres.map(p => {
              const st = statutInfo(p.statut)
              const isSelected = selected?.id === p.id
              return (
                <div key={p.id}
                  onClick={() => ouvrirDetail(p)}
                  style={{
                    background: 'white', borderRadius: '12px',
                    border: `0.5px solid ${isSelected ? '#6366F1' : '#E4E4E7'}`,
                    padding: '18px 20px', cursor: 'pointer',
                    transition: 'all 0.15s',
                    boxShadow: isSelected ? '0 0 0 2px rgba(99,102,241,0.15)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '600', color: '#6366F1', flexShrink: 0 }}>
                          {p.nom?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: '500', color: '#18181B' }}>{p.nom}</div>
                          <div style={{ fontSize: '12px', color: '#71717A' }}>{p.email}</div>
                        </div>
                        <span style={{ fontSize: '16px', marginLeft: '4px' }}>{LANGUES[p.langue] || '🌍'}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {p.nom_etablissement && (
                          <span style={{ fontSize: '12px', color: '#71717A' }}>🏨 {p.nom_etablissement}</span>
                        )}
                        {p.telephone && (
                          <span style={{ fontSize: '12px', color: '#71717A' }}>📞 {p.telephone}</span>
                        )}
                        <span style={{ fontSize: '12px', color: '#71717A' }}>
                          🏢 {p.nb_etablissements === 11 ? '10+' : p.nb_etablissements === 6 ? '6-10' : p.nb_etablissements === 2 ? '2-5' : '1'} établissement{p.nb_etablissements > 1 ? 's' : ''}
                        </span>
                        <span style={{ fontSize: '12px', color: '#71717A' }}>
                          📅 {new Date(p.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      {p.message && (
                        <div style={{ marginTop: '8px', fontSize: '12px', color: '#71717A', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '400px' }}>
                          "{p.message}"
                        </div>
                      )}
                    </div>

                    {/* Statut selector */}
                    <div onClick={e => e.stopPropagation()}>
                      <select
                        value={p.statut}
                        onChange={e => updateStatut(p.id, e.target.value)}
                        style={{
                          padding: '6px 10px', borderRadius: '20px',
                          border: `0.5px solid ${st.color}40`,
                          background: st.bg, color: st.color,
                          fontSize: '12px', fontWeight: '500', cursor: 'pointer',
                          outline: 'none', fontFamily: 'inherit'
                        }}
                      >
                        {STATUTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )
            })}

            {prospectsFiltres.length === 0 && (
              <div style={{ background: 'white', borderRadius: '12px', border: '0.5px solid #E4E4E7', padding: '60px', textAlign: 'center', color: '#71717A', fontSize: '14px' }}>
                {recherche ? 'Aucun prospect trouvé pour cette recherche.' : 'Aucun prospect pour ce filtre.'}
              </div>
            )}
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
                {selected.nom?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '500', color: '#18181B' }}>{selected.nom}</div>
                <div style={{ fontSize: '12px', color: '#71717A' }}>{LANGUES[selected.langue] || '🌍'} {selected.langue?.toUpperCase()}</div>
              </div>
            </div>

            {/* Infos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {[
                { label: 'Email', value: selected.email, icon: '📧' },
                { label: 'Téléphone', value: selected.telephone, icon: '📞' },
                { label: 'Établissement', value: selected.nom_etablissement, icon: '🏨' },
                { label: 'Nb établissements', value: selected.nb_etablissements === 11 ? '10+' : selected.nb_etablissements === 6 ? '6-10' : selected.nb_etablissements === 2 ? '2-5' : '1', icon: '🏢' },
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
              <a href={`mailto:${selected.email}`} style={{
                flex: 1, padding: '10px', borderRadius: '8px',
                background: '#F4F4F5', color: '#18181B', textDecoration: 'none',
                fontSize: '13px', fontWeight: '500', textAlign: 'center',
                border: '0.5px solid #E4E4E7', display: 'block'
              }}>📧 Email</a>
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
    </div>
  )
}
