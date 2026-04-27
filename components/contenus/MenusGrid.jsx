'use client'
import { useRouter } from 'next/navigation'
import { formatSaison } from '../../lib/saison'

const calculerCoutMenu = (menu) => {
  if (!menu.menu_fiches) return 0
  return menu.menu_fiches.reduce((total, mf) => total + (mf.fiches?.cout_portion || 0), 0)
}

const foodCostMenu = (menu) => {
  const cout = calculerCoutMenu(menu)
  if (!menu.prix_vente || !cout) return null
  const prixHT = menu.prix_vente / 1.10
  return (cout / prixHT * 100).toFixed(1)
}

export default function MenusGrid({ c, isMobile, menus, onDelete, onCreateClick }) {
  const router = useRouter()

  if (menus.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '60px', background: c.blanc,
        borderRadius: '12px', border: `0.5px solid ${c.bordure}`
      }}>
        <div style={{ fontSize: '14px', color: c.texteMuted, marginBottom: '16px' }}>Aucun menu pour le moment</div>
        <button onClick={onCreateClick} style={{
          background: c.accent, color: c.principal, border: 'none',
          borderRadius: '8px', padding: '10px 20px', fontSize: '13px',
          cursor: 'pointer', fontWeight: '600'
        }}>Créer le premier menu</button>
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))',
      gap: isMobile ? '10px' : '16px'
    }}>
      {menus.map(menu => {
        const cout = calculerCoutMenu(menu)
        const fc = foodCostMenu(menu)
        return (
          <div key={menu.id} style={{
            background: c.blanc, borderRadius: '12px', padding: '18px',
            border: `0.5px solid ${c.bordure}`
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: isMobile ? '15px' : '16px', fontWeight: '500', color: c.texte }}>{menu.nom}</div>
                {(menu.saison || menu.annee) && (
                  <span style={{
                    background: c.accentClair, color: c.principal,
                    borderRadius: '20px', padding: '2px 10px',
                    fontSize: '11px', fontWeight: '500', marginTop: '4px', display: 'inline-block'
                  }}>{formatSaison(menu.saison, menu.annee)}</span>
                )}
              </div>
              {menu.prix_vente && (
                <div style={{
                  background: c.principal, color: c.accent,
                  borderRadius: '8px', padding: '6px 12px', textAlign: 'center', flexShrink: 0
                }}>
                  <div style={{ fontSize: '10px', opacity: 0.7 }}>Prix TTC</div>
                  <div style={{ fontSize: '15px', fontWeight: '500' }}>{Number(menu.prix_vente).toFixed(2)} €</div>
                </div>
              )}
            </div>

            <div style={{ borderTop: `0.5px solid ${c.bordure}`, paddingTop: '10px', marginBottom: '12px' }}>
              {['Entrée', 'Plat', 'Dessert'].map(service => {
                const fiche = menu.menu_fiches?.find(mf => mf.service === service)
                return (
                  <div key={service} style={{ display: 'flex', alignItems: 'center', marginBottom: '6px', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: c.texteMuted, width: '55px', fontWeight: '500' }}>{service}</span>
                    <span style={{ fontSize: '13px', color: c.texte, flex: 1 }}>
                      {fiche ? fiche.fiches?.nom : <span style={{ color: c.bordure, fontStyle: 'italic' }}>Non défini</span>}
                    </span>
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <div style={{ flex: 1, background: c.fond, borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: c.texteMuted, textTransform: 'uppercase' }}>Coût</div>
                <div style={{ fontSize: '14px', fontWeight: '500', color: c.texte }}>{cout.toFixed(2)} €</div>
              </div>
              {fc && (
                <div style={{
                  flex: 1, borderRadius: '8px', padding: '8px', textAlign: 'center',
                  background: fc < 30 ? '#EAF3DE' : fc < 40 ? '#FAEEDA' : '#FCEBEB'
                }}>
                  <div style={{ fontSize: '10px', textTransform: 'uppercase', color: fc < 30 ? '#3B6D11' : fc < 40 ? '#854F0B' : '#A32D2D' }}>Food cost</div>
                  <div style={{ fontSize: '14px', fontWeight: '500', color: fc < 30 ? '#3B6D11' : fc < 40 ? '#854F0B' : '#A32D2D' }}>{fc} %</div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => router.push(`/menus/${menu.id}`)} style={{
                flex: 1, padding: '8px', background: c.accentClair, color: c.principal,
                border: 'none', borderRadius: '8px', fontSize: '12px',
                cursor: 'pointer', fontWeight: '500'
              }}>Voir / Modifier</button>
              <button onClick={() => onDelete(menu.id)} style={{
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
