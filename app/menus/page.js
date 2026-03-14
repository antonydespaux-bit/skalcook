'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../lib/theme.jsx'

export default function MenusPage() {
  const [menus, setMenus] = useState([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const c = theme.couleurs

  useEffect(() => {
    checkUser()
    loadMenus()
  }, [])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

  const loadMenus = async () => {
    const { data } = await supabase
      .from('menus')
      .select(`
        *,
        menu_fiches (
          id,
          service,
          fiches (id, nom, categorie, cout_portion)
        )
      `)
      .order('created_at', { ascending: false })
    setMenus(data || [])
    setLoading(false)
  }

  const calculerCoutMenu = (menu) => {
    if (!menu.menu_fiches) return 0
    return menu.menu_fiches.reduce((total, mf) => {
      return total + (mf.fiches?.cout_portion || 0)
    }, 0)
  }

  const foodCostMenu = (menu) => {
    const cout = calculerCoutMenu(menu)
    if (!menu.prix_vente || !cout) return null
    const prixHT = menu.prix_vente / 1.10
    return (cout / prixHT * 100).toFixed(1)
  }

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce menu ?')) return
    await supabase.from('menus').delete().eq('id', id)
    loadMenus()
  }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

      <div style={{
        background: c.principal,
        borderBottom: `0.5px solid ${c.accent}40`,
        padding: '0 24px',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px'
      }}>
        <Logo height={30} couleur="white" onClick={() => router.push('/fiches')} />
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => router.push('/fiches')} style={{
            background: 'transparent', color: 'rgba(255,255,255,0.7)',
            border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer'
          }}>← Fiches</button>
          <button onClick={() => router.push('/menus/nouveau')} style={{
            background: c.accent, color: c.principal, border: 'none',
            borderRadius: '8px', padding: '8px 16px', fontSize: '13px',
            fontWeight: '600', cursor: 'pointer'
          }}>+ Nouveau menu</button>
        </div>
      </div>

      <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: c.texteMuted }}>Chargement...</div>
        ) : menus.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px', background: 'white',
            borderRadius: '12px', border: `0.5px solid ${c.bordure}`
          }}>
            <div style={{ fontSize: '14px', color: c.texteMuted, marginBottom: '16px' }}>
              Aucun menu pour le moment
            </div>
            <button onClick={() => router.push('/menus/nouveau')} style={{
              background: c.accent, color: c.principal, border: 'none',
              borderRadius: '8px', padding: '10px 20px', fontSize: '13px',
              cursor: 'pointer', fontWeight: '600'
            }}>Créer le premier menu</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
            {menus.map(menu => {
              const cout = calculerCoutMenu(menu)
              const fc = foodCostMenu(menu)
              return (
                <div key={menu.id} style={{
                  background: 'white', borderRadius: '12px', padding: '20px',
                  border: `0.5px solid ${c.bordure}`
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: '500', color: c.texte }}>{menu.nom}</div>
                      {menu.saison && (
                        <span style={{
                          background: c.accentClair, color: c.principal,
                          borderRadius: '20px', padding: '2px 10px',
                          fontSize: '11px', fontWeight: '500', marginTop: '4px', display: 'inline-block'
                        }}>{menu.saison}</span>
                      )}
                    </div>
                    {menu.prix_vente && (
                      <div style={{
                        background: c.principal, color: c.accent,
                        borderRadius: '8px', padding: '6px 12px', textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '10px', opacity: 0.7 }}>Prix TTC</div>
                        <div style={{ fontSize: '16px', fontWeight: '500' }}>{Number(menu.prix_vente).toFixed(2)} €</div>
                      </div>
                    )}
                  </div>

                  <div style={{ borderTop: `0.5px solid ${c.bordure}`, paddingTop: '12px', marginBottom: '12px' }}>
                    {['Entrée', 'Plat', 'Dessert'].map(service => {
                      const fiche = menu.menu_fiches?.find(mf => mf.service === service)
                      return (
                        <div key={service} style={{
                          display: 'flex', justifyContent: 'space-between',
                          alignItems: 'center', marginBottom: '6px'
                        }}>
                          <span style={{ fontSize: '12px', color: c.texteMuted, width: '60px' }}>{service}</span>
                          <span style={{ fontSize: '13px', color: c.texte, flex: 1, paddingLeft: '8px' }}>
                            {fiche ? fiche.fiches?.nom : <span style={{ color: '#ccc', fontStyle: 'italic' }}>Non défini</span>}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                    <div style={{ flex: 1, background: c.fond, borderRadius: '8px', padding: '10px', textAlign: 'center' }}>
                      <div style={{ fontSize: '10px', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Coût matière</div>
                      <div style={{ fontSize: '16px', fontWeight: '500', color: c.texte, marginTop: '2px' }}>{cout.toFixed(2)} €</div>
                    </div>
                    {fc && (
                      <div style={{
                        flex: 1, borderRadius: '8px', padding: '10px', textAlign: 'center',
                        background: fc < 30 ? '#EAF3DE' : fc < 40 ? '#FAEEDA' : '#FCEBEB'
                      }}>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: fc < 30 ? '#3B6D11' : fc < 40 ? '#854F0B' : '#A32D2D' }}>Food cost</div>
                        <div style={{ fontSize: '16px', fontWeight: '500', marginTop: '2px', color: fc < 30 ? '#3B6D11' : fc < 40 ? '#854F0B' : '#A32D2D' }}>{fc} %</div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => router.push(`/menus/${menu.id}`)} style={{
                      flex: 1, padding: '8px', background: c.accentClair, color: c.principal,
                      border: 'none', borderRadius: '8px', fontSize: '12px',
                      cursor: 'pointer', fontWeight: '500'
                    }}>Voir / Modifier</button>
                    <button onClick={() => window.print()} style={{
                      padding: '8px 12px', background: c.principal, color: 'white',
                      border: 'none', borderRadius: '8px', fontSize: '12px', cursor: 'pointer'
                    }}>Imprimer</button>
                    <button onClick={() => handleDelete(menu.id)} style={{
                      padding: '8px 12px', background: 'transparent', color: '#A32D2D',
                      border: `0.5px solid #ddd`, borderRadius: '8px', fontSize: '12px', cursor: 'pointer'
                    }}>×</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}