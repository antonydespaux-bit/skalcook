'use client'
import { useState, useEffect } from 'react'
import { supabase, getClientId } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { useIsMobile } from '../../lib/useIsMobile'
import { useTheme } from '../../lib/useTheme'
import Navbar from '../../components/Navbar'

export default function CartesPage() {
  const [cartes, setCartes] = useState([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()

  useEffect(() => {
    checkUser()
    loadCartes()
  }, [])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

  const loadCartes = async () => {
    const clientId = await getClientId()
    if (!clientId) { setLoading(false); router.push('/'); return }
    const { data } = await supabase
      .from('cartes')
      .select(`*, carte_sections(id, titre, ordre, carte_items(id, nom, supplement, fiche_id, fiches(id, nom, cout_portion)))`)
      .eq('client_id', clientId)
      .eq('archive', false)
      .order('created_at', { ascending: false })
    setCartes(data || [])
    setLoading(false)
  }

  const getAllItems = (carte) =>
    (carte.carte_sections || []).flatMap(s => s.carte_items || [])

  const coutBase = (carte) => {
    const items = getAllItems(carte)
    return items
      .filter(i => !i.supplement || Number(i.supplement) === 0)
      .reduce((s, i) => s + (i.fiches?.cout_portion || 0), 0)
  }

  const coutTotal = (carte) => {
    const items = getAllItems(carte)
    return items.reduce((s, i) => s + (i.fiches?.cout_portion || 0), 0)
  }

  const totalSupplements = (carte) => {
    const items = getAllItems(carte)
    return items.reduce((s, i) => s + (Number(i.supplement) || 0), 0)
  }

  const fcBase = (carte) => {
    const cb = coutBase(carte)
    if (!carte.prix_base || !cb) return null
    return (cb / (carte.prix_base / 1.10) * 100).toFixed(1)
  }

  const fcAvecSupp = (carte) => {
    const ct = coutTotal(carte)
    const ts = totalSupplements(carte)
    const prixTotal = (Number(carte.prix_base) || 0) + ts
    if (!prixTotal || !ct) return null
    return (ct / (prixTotal / 1.10) * 100).toFixed(1)
  }

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette carte ?')) return
    const clientId = await getClientId()
    if (!clientId) return
    await supabase.from('cartes').delete().eq('id', id).eq('client_id', clientId)
    loadCartes()
  }

  const fcColor = (fc) => {
    if (!fc) return {}
    const n = parseFloat(fc)
    if (n < 30) return { bg: '#EAF3DE', color: '#3B6D11' }
    if (n < 40) return { bg: '#FAEEDA', color: '#854F0B' }
    return { bg: '#FCEBEB', color: '#A32D2D' }
  }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '1000px', margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', color: c.texteMuted, letterSpacing: '2px', textTransform: 'uppercase' }}>
            Cartes ({cartes.length})
          </div>
          <button onClick={() => router.push('/cartes/nouveau')} style={{
            background: c.accent, color: 'white', border: 'none',
            borderRadius: '8px', padding: '8px 16px', fontSize: '12px',
            cursor: 'pointer', fontWeight: '600'
          }}>+ Nouvelle carte</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: c.texteMuted }}>Chargement...</div>
        ) : cartes.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px', background: 'white',
            borderRadius: '12px', border: `0.5px solid ${c.bordure}`
          }}>
            <div style={{ fontSize: '14px', color: c.texteMuted, marginBottom: '16px' }}>Aucune carte pour le moment</div>
            <button onClick={() => router.push('/cartes/nouveau')} style={{
              background: c.accent, color: 'white', border: 'none',
              borderRadius: '8px', padding: '10px 20px', fontSize: '13px',
              cursor: 'pointer', fontWeight: '600'
            }}>Cr&eacute;er la premi&egrave;re carte</button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: isMobile ? '10px' : '16px'
          }}>
            {cartes.map(carte => {
              const fc1 = fcBase(carte)
              const fc2 = fcAvecSupp(carte)
              const ts = totalSupplements(carte)
              const nbSections = (carte.carte_sections || []).length
              const nbItems = getAllItems(carte).length
              const c1 = fcColor(fc1)
              const c2 = fcColor(fc2)

              return (
                <div key={carte.id} style={{
                  background: 'white', borderRadius: '12px', padding: '18px',
                  border: `0.5px solid ${c.bordure}`
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div>
                      <div style={{ fontSize: isMobile ? '15px' : '16px', fontWeight: '500', color: c.texte }}>{carte.nom}</div>
                      {carte.saison && (
                        <span style={{
                          background: c.accentClair, color: c.principal,
                          borderRadius: '20px', padding: '2px 10px',
                          fontSize: '11px', fontWeight: '500', marginTop: '4px', display: 'inline-block'
                        }}>{carte.saison}</span>
                      )}
                    </div>
                    {carte.prix_base && (
                      <div style={{
                        background: c.principal, color: c.accent,
                        borderRadius: '8px', padding: '6px 12px', textAlign: 'center', flexShrink: 0
                      }}>
                        <div style={{ fontSize: '10px', opacity: 0.7 }}>Prix base</div>
                        <div style={{ fontSize: '15px', fontWeight: '500' }}>{Number(carte.prix_base).toFixed(0)} &euro;</div>
                      </div>
                    )}
                  </div>

                  <div style={{ borderTop: `0.5px solid ${c.bordure}`, paddingTop: '10px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '4px' }}>
                      {nbSections} section{nbSections > 1 ? 's' : ''} &middot; {nbItems} plat{nbItems > 1 ? 's' : ''}
                      {ts > 0 && <span style={{ color: c.accent }}> &middot; {ts.toFixed(0)} &euro; de suppl.</span>}
                    </div>
                    {(carte.carte_sections || [])
                      .sort((a, b) => a.ordre - b.ordre)
                      .slice(0, 4)
                      .map(s => (
                        <div key={s.id} style={{ fontSize: '12px', color: c.texte, marginBottom: '2px' }}>
                          <span style={{ fontWeight: '500' }}>{s.titre}</span>
                          <span style={{ color: c.texteMuted }}> &mdash; {(s.carte_items || []).length} plat{(s.carte_items || []).length > 1 ? 's' : ''}</span>
                        </div>
                      ))}
                    {nbSections > 4 && <div style={{ fontSize: '11px', color: c.texteMuted, fontStyle: 'italic' }}>+{nbSections - 4} autres sections...</div>}
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    {fc1 && (
                      <div style={{ flex: 1, borderRadius: '8px', padding: '8px', textAlign: 'center', background: c1.bg }}>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', color: c1.color }}>FC base</div>
                        <div style={{ fontSize: '14px', fontWeight: '500', color: c1.color }}>{fc1} %</div>
                      </div>
                    )}
                    {fc2 && ts > 0 && (
                      <div style={{ flex: 1, borderRadius: '8px', padding: '8px', textAlign: 'center', background: c2.bg }}>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', color: c2.color }}>FC + suppl.</div>
                        <div style={{ fontSize: '14px', fontWeight: '500', color: c2.color }}>{fc2} %</div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => router.push(`/cartes/${carte.id}`)} style={{
                      flex: 1, padding: '8px', background: c.accentClair, color: c.principal,
                      border: 'none', borderRadius: '8px', fontSize: '12px',
                      cursor: 'pointer', fontWeight: '500'
                    }}>Voir / Modifier</button>
                    <button onClick={() => handleDelete(carte.id)} style={{
                      padding: '8px 12px', background: 'transparent', color: '#A32D2D',
                      border: `0.5px solid ${c.bordure}`, borderRadius: '8px', fontSize: '12px', cursor: 'pointer'
                    }}>&times;</button>
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
