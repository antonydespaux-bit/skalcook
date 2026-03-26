'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../../lib/theme.jsx'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import { useRole } from '../../../lib/useRole'
import NavbarCuisine from '../../../components/NavbarCuisine'
import ChefLoader from '../../../components/ChefLoader'

export default function LogsPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtre, setFiltre] = useState('tous')
  const [filtreSection, setFiltreSection] = useState('tous')
  const [recherche, setRecherche] = useState('')
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()
  const { role, loading: roleLoading } = useRole()

  useEffect(() => {
    if (!roleLoading && role !== 'admin') router.push('/dashboard')
  }, [role, roleLoading])

  useEffect(() => {
    loadLogs()
  }, [])

  const loadLogs = async () => {
    const { data } = await supabase
      .from('logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    setLogs(data || [])
    setLoading(false)
  }

  const logsFiltres = logs.filter(l => {
    const matchAction = filtre === 'tous' || l.action === filtre
    const matchSection = filtreSection === 'tous' || l.section === filtreSection
    const matchRecherche = recherche === '' ||
      l.user_nom?.toLowerCase().includes(recherche.toLowerCase()) ||
      l.entite_nom?.toLowerCase().includes(recherche.toLowerCase())
    return matchAction && matchSection && matchRecherche
  })

  const actionColor = (action) => {
    switch (action) {
      case 'CREATION': return { bg: '#EAF3DE', color: '#3B6D11' }
      case 'MODIFICATION': return { bg: '#FAEEDA', color: '#854F0B' }
      case 'SUPPRESSION': return { bg: '#FCEBEB', color: '#A32D2D' }
      case 'IMPORT': return { bg: '#EEEDFE', color: '#3C3489' }
      case 'CONNEXION': return { bg: '#F0E8E0', color: '#2C1810' }
      default: return { bg: c.fond, color: c.texteMuted }
    }
  }

  const sectionColor = (section) => {
    switch (section) {
      case 'cuisine': return { bg: '#F0E8E0', color: '#2C1810' }
      case 'bar': return { bg: '#EEEDFE', color: '#3C3489' }
      case 'admin': return { bg: '#EAF3DE', color: '#3B6D11' }
      default: return { bg: c.fond, color: c.texteMuted }
    }
  }

  const formatDate = (date) => {
    return new Date(date).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    })
  }

  const statsParUser = () => {
    const stats = {}
    logs.forEach(l => {
      if (!stats[l.user_nom]) stats[l.user_nom] = { nom: l.user_nom, role: l.user_role, total: 0, creation: 0, modification: 0, suppression: 0 }
      stats[l.user_nom].total++
      if (l.action === 'CREATION') stats[l.user_nom].creation++
      if (l.action === 'MODIFICATION') stats[l.user_nom].modification++
      if (l.action === 'SUPPRESSION') stats[l.user_nom].suppression++
    })
    return Object.values(stats).sort((a, b) => b.total - a.total)
  }

  if (roleLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>
      <ChefLoader />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

      <NavbarCuisine />

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '1100px', margin: '0 auto' }}>

        {/* Stats par utilisateur */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '12px', fontWeight: '500' }}>
            Activité par utilisateur
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
            {statsParUser().map(user => (
              <div key={user.nom} style={{ background: c.blanc, borderRadius: '12px', padding: '16px', border: `0.5px solid ${c.bordure}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: c.texte }}>{user.nom}</div>
                    <span style={{
                      background: user.role === 'admin' ? '#F0E8E0' : user.role === 'cuisine' ? '#EAF3DE' : user.role === 'bar' ? '#EEEDFE' : '#FAEEDA',
                      color: user.role === 'admin' ? '#2C1810' : user.role === 'cuisine' ? '#3B6D11' : user.role === 'bar' ? '#3C3489' : '#854F0B',
                      borderRadius: '20px', padding: '2px 8px', fontSize: '10px', fontWeight: '500'
                    }}>
                      {user.role}
                    </span>
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: '500', color: c.texte }}>{user.total}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                  <div style={{ background: '#EAF3DE', borderRadius: '6px', padding: '6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: '#3B6D11' }}>{user.creation}</div>
                    <div style={{ fontSize: '9px', color: '#3B6D11', textTransform: 'uppercase' }}>Créations</div>
                  </div>
                  <div style={{ background: '#FAEEDA', borderRadius: '6px', padding: '6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: '#854F0B' }}>{user.modification}</div>
                    <div style={{ fontSize: '9px', color: '#854F0B', textTransform: 'uppercase' }}>Modifs</div>
                  </div>
                  <div style={{ background: '#FCEBEB', borderRadius: '6px', padding: '6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: '#A32D2D' }}>{user.suppression}</div>
                    <div style={{ fontSize: '9px', color: '#A32D2D', textTransform: 'uppercase' }}>Suppres.</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Filtres */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <input type="text" placeholder="Rechercher un utilisateur ou une fiche..."
            value={recherche} onChange={e => setRecherche(e.target.value)}
            style={{ flex: 1, minWidth: '200px', padding: '10px 14px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}
          />
          <select value={filtre} onChange={e => setFiltre(e.target.value)} style={{
            padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`,
            fontSize: '13px', background: c.blanc, outline: 'none', color: c.texte, cursor: 'pointer'
          }}>
            <option value="tous">Toutes les actions</option>
            <option value="CREATION">Créations</option>
            <option value="MODIFICATION">Modifications</option>
            <option value="SUPPRESSION">Suppressions</option>
            <option value="IMPORT">Imports</option>
          </select>
          <select value={filtreSection} onChange={e => setFiltreSection(e.target.value)} style={{
            padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`,
            fontSize: '13px', background: c.blanc, outline: 'none', color: c.texte, cursor: 'pointer'
          }}>
            <option value="tous">Cuisine + Bar</option>
            <option value="cuisine">Cuisine</option>
            <option value="bar">Bar</option>
            <option value="admin">Admin</option>
          </select>
          <button onClick={loadLogs} style={{
            padding: '10px 14px', background: c.accentClair, color: c.principal,
            border: `0.5px solid ${c.bordure}`, borderRadius: '8px', fontSize: '13px', cursor: 'pointer'
          }}>🔄 {!isMobile && 'Actualiser'}</button>
        </div>

        <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '12px' }}>
          {logsFiltres.length} action{logsFiltres.length > 1 ? 's' : ''}
        </div>

        {/* Liste des logs */}
        {loading ? (
          <ChefLoader size={120} message="Chargement des logs..." />
        ) : logsFiltres.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}` }}>
            <div style={{ fontSize: '14px', color: c.texteMuted }}>Aucune activité pour le moment</div>
          </div>
        ) : isMobile ? (
          <div>
            {logsFiltres.map(log => {
              const ac = actionColor(log.action)
              const sc = sectionColor(log.section)
              return (
                <div key={log.id} style={{ background: c.blanc, borderRadius: '10px', padding: '14px', border: `0.5px solid ${c.bordure}`, marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <span style={{ background: ac.bg, color: ac.color, borderRadius: '20px', padding: '2px 8px', fontSize: '11px', fontWeight: '600' }}>{log.action}</span>
                      <span style={{ background: sc.bg, color: sc.color, borderRadius: '20px', padding: '2px 8px', fontSize: '11px', fontWeight: '500' }}>{log.section}</span>
                    </div>
                    <span style={{ fontSize: '11px', color: c.texteMuted }}>{formatDate(log.created_at)}</span>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '500', color: c.texte, marginBottom: '4px' }}>
                    {log.entite_nom || '—'}
                  </div>
                  <div style={{ fontSize: '12px', color: c.texteMuted }}>
                    Par <strong>{log.user_nom}</strong> — {log.details || '—'}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: c.principal }}>
                  {['Date', 'Utilisateur', 'Action', 'Section', 'Fiche / Élément', 'Détails'].map((h, i) => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '11px', color: c.accent, fontWeight: '500', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logsFiltres.map((log, i) => {
                  const ac = actionColor(log.action)
                  const sc = sectionColor(log.section)
                  return (
                    <tr key={log.id} style={{ borderBottom: i < logsFiltres.length - 1 ? `0.5px solid ${c.bordure}` : 'none', background: c.blanc }}
                      onMouseEnter={e => e.currentTarget.style.background = c.fond}
                      onMouseLeave={e => e.currentTarget.style.background = c.blanc}
                    >
                      <td style={{ padding: '10px 16px', color: c.texteMuted, fontSize: '12px', whiteSpace: 'nowrap' }}>{formatDate(log.created_at)}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '500', color: c.texte }}>{log.user_nom}</div>
                        <div style={{ fontSize: '11px', color: c.texteMuted }}>{log.user_role}</div>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ background: ac.bg, color: ac.color, borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: '600' }}>{log.action}</span>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ background: sc.bg, color: sc.color, borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: '500' }}>{log.section}</span>
                      </td>
                      <td style={{ padding: '10px 16px', fontWeight: '500', color: c.texte }}>{log.entite_nom || '—'}</td>
                      <td style={{ padding: '10px 16px', color: c.texteMuted, fontSize: '12px' }}>{log.details || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
