'use client'
import { useRouter } from 'next/navigation'
import { formatSaison } from '../../lib/saison'

const calculerCouts = (carte, baseOnly = false) => {
  let coutMatiere = 0, totalSuppPrix = 0
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
      if (g.ous.length === 0) {
        coutMatiere += etCost
      } else {
        const ouAvecSupp = g.ous.find(o => Number(o.supplement) > 0)
        if (ouAvecSupp) {
          if (baseOnly) {
            coutMatiere += etCost
          } else {
            coutMatiere += (ouAvecSupp.fiches?.cout_portion || 0)
            totalSuppPrix += Number(ouAvecSupp.supplement)
          }
        } else {
          const costs = [etCost, ...g.ous.map(o => o.fiches?.cout_portion || 0)]
          coutMatiere += costs.reduce((a, b) => a + b, 0) / costs.length
        }
      }
    }
  }
  return { coutMatiere, totalSuppPrix }
}

const getRatio = (carte, baseOnly = false) => {
  const { coutMatiere, totalSuppPrix } = calculerCouts(carte, baseOnly)
  const prixTotal = (Number(carte.prix_base) || 0) + totalSuppPrix
  if (!prixTotal || !coutMatiere) return null
  return (coutMatiere / (prixTotal / 1.10) * 100).toFixed(1)
}

const fcColor = (fc) => {
  if (!fc) return {}
  const n = parseFloat(fc)
  if (n < 30) return { bg: '#EAF3DE', color: '#3B6D11' }
  if (n < 40) return { bg: '#FAEEDA', color: '#854F0B' }
  return { bg: '#FCEBEB', color: '#A32D2D' }
}

export default function CartesGrid({ c, isMobile, cartes, onDelete, onCreateClick }) {
  const router = useRouter()

  if (cartes.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '60px', background: 'white',
        borderRadius: '12px', border: `0.5px solid ${c.bordure}`
      }}>
        <div style={{ fontSize: '14px', color: c.texteMuted, marginBottom: '16px' }}>Aucune carte pour le moment</div>
        <button onClick={onCreateClick} style={{
          background: c.accent, color: 'white', border: 'none',
          borderRadius: '8px', padding: '10px 20px', fontSize: '13px',
          cursor: 'pointer', fontWeight: '600'
        }}>Créer la première carte</button>
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))',
      gap: isMobile ? '10px' : '16px'
    }}>
      {cartes.map(carte => {
        const { coutMatiere, totalSuppPrix } = calculerCouts(carte, false)
        const ratioFull = getRatio(carte, false)
        const ratioBase = getRatio(carte, true)
        const hasSupp = totalSuppPrix > 0
        const ratio = ratioFull
        const rc = fcColor(ratio)

        return (
          <div key={carte.id} style={{
            background: 'white', borderRadius: '12px', padding: '18px',
            border: `0.5px solid ${c.bordure}`
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: isMobile ? '15px' : '16px', fontWeight: '500', color: c.texte }}>{carte.nom}</div>
                {(carte.saison || carte.annee) && (
                  <span style={{
                    background: c.accentClair, color: c.principal,
                    borderRadius: '20px', padding: '2px 10px',
                    fontSize: '11px', fontWeight: '500', marginTop: '4px', display: 'inline-block'
                  }}>{formatSaison(carte.saison, carte.annee)}</span>
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

            {(ratioBase || ratioFull) && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                {hasSupp ? (
                  <>
                    {ratioBase && (() => { const rb = fcColor(ratioBase); return (
                      <div style={{ flex: 1, borderRadius: '8px', padding: '8px', textAlign: 'center', background: rb.bg }}>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', color: rb.color }}>Ratio base</div>
                        <div style={{ fontSize: '14px', fontWeight: '500', color: rb.color }}>{ratioBase} %</div>
                      </div>
                    )})()}
                    {ratioFull && (() => { const rf = fcColor(ratioFull); return (
                      <div style={{ flex: 1, borderRadius: '8px', padding: '8px', textAlign: 'center', background: rf.bg }}>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', color: rf.color }}>Ratio + suppl.</div>
                        <div style={{ fontSize: '14px', fontWeight: '500', color: rf.color }}>{ratioFull} %</div>
                      </div>
                    )})()}
                  </>
                ) : (
                  <>
                    <div style={{ flex: 1, borderRadius: '8px', padding: '8px', textAlign: 'center', background: rc.bg }}>
                      <div style={{ fontSize: '10px', textTransform: 'uppercase', color: rc.color }}>Ratio</div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: rc.color }}>{ratio} %</div>
                    </div>
                    {coutMatiere > 0 && (
                      <div style={{ flex: 1, borderRadius: '8px', padding: '8px', textAlign: 'center', background: c.fond }}>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', color: c.texteMuted }}>Coût matière</div>
                        <div style={{ fontSize: '14px', fontWeight: '500', color: c.texte }}>{coutMatiere.toFixed(2)} €</div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => router.push(`/cartes/${carte.id}`)} style={{
                flex: 1, padding: '8px', background: c.accentClair, color: c.principal,
                border: 'none', borderRadius: '8px', fontSize: '12px',
                cursor: 'pointer', fontWeight: '500'
              }}>Voir / Modifier</button>
              <button onClick={() => onDelete(carte.id)} style={{
                padding: '8px 12px', background: 'transparent', color: '#A32D2D',
                border: `0.5px solid ${c.bordure}`, borderRadius: '8px', fontSize: '12px', cursor: 'pointer'
              }}>×</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
