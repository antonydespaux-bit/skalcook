'use client'
import { useState, useEffect } from 'react'
import { supabase, getClientId } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../lib/theme.jsx'
import { useIsMobile } from '../../lib/useIsMobile'
import { useTheme } from '../../lib/useTheme'
import NavbarCuisine from '../../components/NavbarCuisine'

export default function ArchivesPage() {
  const [fiches, setFiches] = useState([])
  const [menus, setMenus] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('fiches')
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()

  useEffect(() => {
    checkUser()
    loadData()
  }, [])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

  const loadData = async () => {
    const clientId = await getClientId()
    if (!clientId) { setLoading(false); return }
    const { data: fichesData } = await supabase
      .from('fiches').select('*').eq('client_id', clientId).eq('archive', true).order('nom')
    const { data: menusData } = await supabase
      .from('menus').select('*').eq('client_id', clientId).eq('archive', true).order('nom')
    setFiches(fichesData || [])
    setMenus(menusData || [])
    setLoading(false)
  }

  const restaurer = async (id, type) => {
    const clientId = await getClientId()
    if (!clientId) return
    if (type === 'fiche') await supabase.from('fiches').update({ archive: false }).eq('id', id).eq('client_id', clientId)
    else await supabase.from('menus').update({ archive: false }).eq('id', id).eq('client_id', clientId)
    loadData()
  }

  const supprimer = async (id, type) => {
    if (!confirm('Supprimer définitivement ? Cette action est irréversible.')) return
    const clientId = await getClientId()
    if (!clientId) return
    if (type === 'fiche') await supabase.from('fiches').delete().eq('id', id).eq('client_id', clientId)
    else await supabase.from('menus').delete().eq('id', id).eq('client_id', clientId)
    loadData()
  }

  const items = tab === 'fiches' ? fiches : menus

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

      <NavbarCuisine />

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '1000px', margin: '0 auto' }}>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {['fiches', 'menus'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '8px 20px', borderRadius: '8px', fontSize: '13px',
              fontWeight: tab === t ? '600' : '400', cursor: 'pointer',
              background: tab === t ? c.principal : c.blanc,
              color: tab === t ? c.accent : c.texteMuted,
              border: `0.5px solid ${tab === t ? c.principal : c.bordure}`
            }}>
              {t === 'fiches' ? `Fiches (${fiches.length})` : `Menus (${menus.length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: c.texteMuted }}>Chargement...</div>
        ) : items.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px', background: c.blanc,
            borderRadius: '12px', border: `0.5px solid ${c.bordure}`
          }}>
            <div style={{ fontSize: '14px', color: c.texteMuted }}>
              Aucun{tab === 'fiches' ? 'e fiche' : ' menu'} archivé{tab === 'fiches' ? 'e' : ''}
            </div>
          </div>
        ) : isMobile ? (
          <div>
            {items.map(item => (
              <div key={item.id} style={{
                background: c.blanc, borderRadius: '12px', padding: '16px',
                border: `0.5px solid ${c.bordure}`, marginBottom: '10px', opacity: 0.8
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ background: '#FAEEDA', color: '#633806', borderRadius: '4px', padding: '1px 6px', fontSize: '10px', fontWeight: '500' }}>ARCHIVÉ</span>
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: '500', color: c.texte }}>{item.nom}</div>
                    {item.categorie && <div style={{ fontSize: '12px', color: c.texteMuted, marginTop: '2px' }}>{item.categorie}</div>}
                    {item.saison && <div style={{ fontSize: '11px', color: c.texteMuted }}>{item.saison}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => restaurer(item.id, tab === 'fiches' ? 'fiche' : 'menu')} style={{
                    flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px',
                    cursor: 'pointer', fontWeight: '500',
                    background: c.vertClair, color: c.vert, border: `0.5px solid ${c.vert}40`
                  }}>Restaurer</button>
                  <button onClick={() => supprimer(item.id, tab === 'fiches' ? 'fiche' : 'menu')} style={{
                    padding: '10px 16px', borderRadius: '8px', fontSize: '13px',
                    cursor: 'pointer', background: 'transparent', color: '#A32D2D', border: '0.5px solid #ddd'
                  }}>Supprimer</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: c.principal }}>
                  {['Nom', 'Catégorie', 'Saison', 'Coût / portion', 'Prix TTC', 'Actions'].map((h, i) => (
                    <th key={h} style={{
                      padding: '12px 16px', textAlign: i === 0 ? 'left' : 'right',
                      fontSize: '11px', color: c.accent, fontWeight: '500', textTransform: 'uppercase'
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.id} style={{
                    borderBottom: i < items.length - 1 ? `0.5px solid ${c.bordure}` : 'none',
                    background: c.blanc, opacity: 0.8
                  }}>
                    <td style={{ padding: '12px 16px', fontWeight: '500', color: c.texte }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ background: '#FAEEDA', color: '#633806', borderRadius: '4px', padding: '1px 6px', fontSize: '10px', fontWeight: '500' }}>ARCHIVÉ</span>
                        {item.nom}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: c.texteMuted }}>{item.categorie || '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: c.texteMuted }}>{item.saison || '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: c.texte }}>
                      {item.cout_portion ? `${Number(item.cout_portion).toFixed(2)} €` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: c.texte }}>
                      {item.prix_ttc || item.prix_vente ? `${Number(item.prix_ttc || item.prix_vente).toFixed(2)} €` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button onClick={() => restaurer(item.id, tab === 'fiches' ? 'fiche' : 'menu')} style={{
                          padding: '5px 12px', borderRadius: '6px', fontSize: '12px',
                          cursor: 'pointer', fontWeight: '500',
                          background: c.vertClair, color: c.vert, border: `0.5px solid ${c.vert}40`
                        }}>Restaurer</button>
                        <button onClick={() => supprimer(item.id, tab === 'fiches' ? 'fiche' : 'menu')} style={{
                          padding: '5px 12px', borderRadius: '6px', fontSize: '12px',
                          cursor: 'pointer', background: 'transparent', color: '#A32D2D', border: '0.5px solid #ddd'
                        }}>Supprimer</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
