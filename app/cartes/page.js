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
      .select(`*, carte_sections(id, titre, ordre, carte_items(id, nom, supplement, relation, ordre, fiche_id, fiches(id, nom, cout_portion)))`)
      .eq('client_id', clientId)
      .eq('archive', false)
      .order('created_at', { ascending: false })
    setCartes(data || [])
    setLoading(false)
  }

  const getAllItems = (carte) =>
    (carte.carte_sections || []).flatMap(s => s.carte_items || [])

  // Calcul des coûts par groupes (et + ou)
  const calculerCouts = (carte) => {
    let coutBase = 0, coutSupp = 0, totalSuppPrix = 0
    for (const section of (carte.carte_sections || []).sort((a, b) => a.ordre - b.ordre)) {
      const items = (section.carte_items || []).sort((a, b) => a.ordre - b.ordre)
      let groups = [], current = null
      for (const item of items) {
        if ((item.relation || 'et') === 'et') {
          if (current) groups.push(current)
          current = { et: item, ous: [] }
        } else if (current) {
          current.ous.push(item)
        }
      }
      if (current) groups.push(current)
      for (const g of groups) {
        const etCost = g.et.fiches?.cout_portion || 0
        coutBase += etCost
        if (g.ous.length === 0) {
          coutSupp += etCost
        } else {
          const ouAvecSupp = g.ous.find(o => Number(o.supplement) > 0)
          if (ouAvecSupp) {
            // ou avec supplément : remplace le coût du plat précédent
            coutSupp += (ouAvecSupp.fiches?.cout_portion || 0)
            totalSuppPrix += Number(ouAvecSupp.supplement)
          } else {
            // ou sans supplément : moyenne des plats liés
            const costs = [etCost, ...g.ous.map(o => o.fiches?.cout_portion || 0)]
            coutSupp += costs.reduce((a, b) => a + b, 0) / costs.length
          }
        }
      }
    }
    return { coutBase, coutSupp, totalSuppPrix }
  }

  const ratioBase = (carte) => {
    const { coutBase } = calculerCouts(carte)
    if (!carte.prix_base || !coutBase) return null
    return (coutBase / (carte.prix_base / 1.10) * 100).toFixed(1)
  }

  const ratioAvecSupp = (carte) => {
    const { coutSupp, totalSuppPrix } = calculerCouts(carte)
    const prixTotal = (Number(carte.prix_base) || 0) + totalSuppPrix
    if (!prixTotal || !coutSupp) return null
    return (coutSupp / (prixTotal / 1.10) * 100).toFixed(1)
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
            }}>Créer la première carte</button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: isMobile ? '10px' : '16px'
          }}>
            {cartes.map(carte => {
              const r1 = ratioBase(carte)
              const r2 = ratioAvecSupp(carte)
              const { totalSuppPrix } = calculerCouts(carte)
              const c1 = fcColor(r1)
              const c2 = fcColor(r2)
              const hasOu = getAllItems(carte).some(i => i.relation === 'ou')

              return (
                <div key={carte.id} style={{
                  background: 'white', borderRadius: '12px', padding: '18px',
                  border: `0.5px solid ${c.bordure}`
                }}>
                  {/* Header */}
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
                        <div style={{ fontSize: '15px', fontWeight: '500' }}>{Number(carte.prix_base).toFixed(0)} €</div>
                      </div>
                    )}
                  </div>

                  {/* Sections with items detail */}
                  <div style={{ borderTop: `0.5px solid ${c.bordure}`, paddingTop: '10px', marginBottom: '12px' }}>
                    {(carte.carte_sections || [])
                      .sort((a, b) => a.ordre - b.ordre)
                      .map(section => {
                        const items = (section.carte_items || []).sort((a, b) => a.ordre - b.ordre)
                        return (
                          <div key={section.id} style={{ marginBottom: '10px' }}>
                            <div style={{ fontSize: '11px', color: c.accent, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600', marginBottom: '4px' }}>
                              {section.titre}
                            </div>
                            {items.map((item, idx) => {
                              const isOu = item.relation === 'ou'
                              const hasSup = Number(item.supplement) > 0
                              return (
                                <div key={item.id}>
                                  {isOu && (
                                    <div style={{ fontSize: '10px', color: '#D97706', fontStyle: 'italic', paddingLeft: '8px', marginBottom: '1px' }}>ou</div>
                                  )}
                                  <div style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    padding: '3px 0', borderBottom: idx < items.length - 1 && items[idx + 1]?.relation !== 'ou' ? `0.5px solid ${c.bordure}20` : 'none'
                                  }}>
                                    <div style={{ fontSize: '13px', color: isOu ? c.texteMuted : c.texte, fontWeight: isOu ? '400' : '500' }}>
                                      {item.nom}
                                      {hasSup && <span style={{ color: '#D97706', fontSize: '11px', marginLeft: '6px' }}>(Suppl. {Number(item.supplement).toFixed(0)} €)</span>}
                                    </div>
                                    <div style={{ fontSize: '12px', color: c.texteMuted, flexShrink: 0 }}>
                                      {(item.fiches?.cout_portion || 0).toFixed(2)} €
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                  </div>

                  {/* Ratio */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    {r1 && (
                      <div style={{ flex: 1, borderRadius: '8px', padding: '8px', textAlign: 'center', background: c1.bg }}>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', color: c1.color }}>Ratio base</div>
                        <div style={{ fontSize: '14px', fontWeight: '500', color: c1.color }}>{r1} %</div>
                      </div>
                    )}
                    {r2 && hasOu && (
                      <div style={{ flex: 1, borderRadius: '8px', padding: '8px', textAlign: 'center', background: c2.bg }}>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', color: c2.color }}>Ratio + suppl.</div>
                        <div style={{ fontSize: '14px', fontWeight: '500', color: c2.color }}>{r2} %</div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => router.push(`/cartes/${carte.id}`)} style={{
                      flex: 1, padding: '8px', background: c.accentClair, color: c.principal,
                      border: 'none', borderRadius: '8px', fontSize: '12px',
                      cursor: 'pointer', fontWeight: '500'
                    }}>Voir / Modifier</button>
                    <button onClick={() => handleDelete(carte.id)} style={{
                      padding: '8px 12px', background: 'transparent', color: '#A32D2D',
                      border: `0.5px solid ${c.bordure}`, borderRadius: '8px', fontSize: '12px', cursor: 'pointer'
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
