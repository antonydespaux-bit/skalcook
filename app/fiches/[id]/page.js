'use client'
import { useState, useEffect } from 'react'
import { supabase, getParametres } from '../../../lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { theme, Logo } from '../../../lib/theme.jsx'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'

const LOGO_URL = 'https://uvmslpdcywephdneciwd.supabase.co/storage/v1/object/public/fiches-photos/logo-la-fantaisie.png'

const ALLERGENES = [
  { id: 'arachides', label: 'Arachides', emoji: '🥜' },
  { id: 'soja', label: 'Soja', emoji: '🫘' },
  { id: 'lait', label: 'Lait', emoji: '🥛' },
  { id: 'fruits_a_coque', label: 'Fruits à coque', emoji: '🌰' },
  { id: 'celeri', label: 'Céleri', emoji: '🥬' },
  { id: 'moutarde', label: 'Moutarde', emoji: '🌿' },
  { id: 'sesame', label: 'Graines de sésame', emoji: '🌾' },
  { id: 'sulfites', label: 'Anhydride sulfureux', emoji: '🍷' },
  { id: 'lupin', label: 'Lupin', emoji: '🌼' },
  { id: 'mollusques', label: 'Mollusques', emoji: '🦪' },
]

export default function FicheDetail() {
  const [fiche, setFiche] = useState(null)
  const [ingredients, setIngredients] = useState([])
  const [params, setParams] = useState({})
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const params_route = useParams()
  const isMobile = useIsMobile()
  const { c } = useTheme()

  useEffect(() => {
    checkUser()
    loadFiche()
    loadParams()
  }, [])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

  const loadParams = async () => {
    const p = await getParametres()
    setParams(p)
  }

  const loadFiche = async () => {
    const { data: ficheData } = await supabase
      .from('fiches').select('*').eq('id', params_route.id).single()
    if (!ficheData) { router.push('/fiches'); return }
    setFiche(ficheData)

    const { data: ingsData } = await supabase
      .from('fiche_ingredients')
      .select(`quantite, unite, ingredients (id, nom, prix_kg, unite)`)
      .eq('fiche_id', params_route.id)
    setIngredients(ingsData || [])
    setLoading(false)
  }

  const calculerCout = () => {
    return ingredients.reduce((total, ing) => {
      if (ing.ingredients?.prix_kg && ing.quantite) {
        return total + (ing.ingredients.prix_kg * ing.quantite)
      }
      return total
    }, 0)
  }

  const foodCost = () => {
    const cout = calculerCout()
    if (!fiche?.prix_ttc || !cout || !fiche?.nb_portions) return null
    const coutParPortion = cout / fiche.nb_portions
    const prixHT = fiche.prix_ttc / 1.10
    return (coutParPortion / prixHT * 100).toFixed(1)
  }

  const prixIndicatif = () => {
    const cout = calculerCout()
    if (!cout || !fiche?.nb_portions) return null
    const coutPortion = cout / fiche.nb_portions
    const seuil = parseFloat(params['seuil_vert_cuisine'] || 28) / 100
    const tva = 1 + parseFloat(params['tva_restauration'] || 10) / 100
    return (coutPortion / seuil * tva).toFixed(2)
  }

  const handleDelete = async () => {
    if (!confirm('Supprimer définitivement cette fiche ?')) return
    if (fiche.photo_url) {
      const path = fiche.photo_url.split('/').pop()
      await supabase.storage.from('fiches-photos').remove([path])
    }
    await supabase.from('fiches').delete().eq('id', params_route.id)
    router.push('/fiches')
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>
      <div style={{ fontSize: '14px', color: c.texteMuted }}>Chargement...</div>
    </div>
  )

  const cout = calculerCout()
  const fc = foodCost()
  const prixIndic = prixIndicatif()
  const seuilVert = parseFloat(params['seuil_vert_cuisine'] || 28)
  const seuilOrange = parseFloat(params['seuil_orange_cuisine'] || 35)
  const today = new Date().toLocaleDateString('fr-FR')

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

      {/* Barre navigation — cachée à l'impression */}
      <div className="no-print" style={{
        background: c.principal, borderBottom: `0.5px solid ${c.accent}40`,
        padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Logo height={28} couleur="white" onClick={() => router.push('/dashboard')} />
          <button onClick={() => router.push('/fiches')} style={{
            background: 'transparent', border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '6px 10px', fontSize: '13px', cursor: 'pointer', color: 'rgba(255,255,255,0.7)'
          }}>← {!isMobile && 'Retour'}</button>
          {!isMobile && <span style={{ fontSize: '15px', fontWeight: '500', color: 'white' }}>{fiche.nom}</span>}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => window.print()} style={{
            background: c.accent, color: c.principal, border: 'none',
            borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
          }}>{isMobile ? '🖨️' : '🖨️ Imprimer'}</button>
          <button onClick={() => router.push(`/fiches/${params_route.id}/modifier`)} style={{
            background: 'transparent', color: 'rgba(255,255,255,0.7)',
            border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '8px 12px', fontSize: '13px', cursor: 'pointer'
          }}>{isMobile ? '✏️' : 'Modifier'}</button>
          {!isMobile && (
            <button onClick={handleDelete} style={{
              background: 'transparent', color: '#F09595',
              border: '0.5px solid rgba(255,255,255,0.2)',
              borderRadius: '8px', padding: '8px 12px', fontSize: '13px', cursor: 'pointer'
            }}>Supprimer</button>
          )}
        </div>
      </div>

      {/* Vue normale (écran) */}
      <div className="no-print" style={{ padding: isMobile ? '12px' : '24px', maxWidth: '800px', margin: '0 auto' }}>

        <div style={{
          background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px',
          border: `0.5px solid ${c.bordure}`, marginBottom: '12px'
        }}>
          {fiche.photo_url && (
            <img src={fiche.photo_url} alt={fiche.nom}
              style={{ width: '100%', height: isMobile ? '200px' : '250px', objectFit: 'cover', borderRadius: '8px', marginBottom: '16px' }}
            />
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '500', marginBottom: '8px', color: c.texte }}>{fiche.nom}</h1>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {fiche.categorie && (
                  <span style={{ background: c.accentClair, color: c.principal, borderRadius: '20px', padding: '3px 12px', fontSize: '12px', fontWeight: '500' }}>{fiche.categorie}</span>
                )}
                {fiche.saison && (
                  <span style={{ background: c.fond, color: c.texteMuted, borderRadius: '20px', padding: '3px 12px', fontSize: '12px', border: `0.5px solid ${c.bordure}` }}>{fiche.saison}</span>
                )}
              </div>
            </div>
            <div style={{ background: c.principal, color: c.accent, borderRadius: '10px', padding: '8px 14px', textAlign: 'center', flexShrink: 0, marginLeft: '12px' }}>
              <div style={{ fontSize: '10px', opacity: 0.7 }}>Portions</div>
              <div style={{ fontSize: '20px', fontWeight: '500' }}>{fiche.nb_portions || '—'}</div>
            </div>
          </div>

          {fiche.description && (
            <div style={{ background: c.fond, borderRadius: '8px', padding: '12px', fontSize: '13px', color: c.texteMuted, lineHeight: '1.6' }}>
              {fiche.description}
            </div>
          )}

          {fiche.allergenes && fiche.allergenes.length > 0 && (
            <div style={{ background: '#FCEBEB', borderRadius: '8px', padding: '12px', marginTop: '12px', border: '0.5px solid #F09595' }}>
              <div style={{ fontSize: '11px', color: '#A32D2D', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>Allergènes présents</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {fiche.allergenes.map(id => {
                  const allergene = ALLERGENES.find(a => a.id === id)
                  if (!allergene) return null
                  return (
                    <span key={id} style={{ background: 'white', color: '#A32D2D', border: '0.5px solid #F09595', borderRadius: '20px', padding: '4px 10px', fontSize: '12px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {allergene.emoji} {allergene.label}
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {isMobile && (
            <button onClick={handleDelete} style={{ marginTop: '12px', width: '100%', padding: '10px', background: 'transparent', color: '#A32D2D', border: '0.5px solid #F09595', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
              Supprimer cette fiche
            </button>
          )}
        </div>

        {/* Ingrédients écran */}
        <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: `0.5px solid ${c.bordure}`, fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Ingrédients
          </div>
          {isMobile ? (
            <div style={{ padding: '12px' }}>
              {ingredients.map((ing, i) => {
                const coutLigne = ing.ingredients?.prix_kg && ing.quantite ? ing.ingredients.prix_kg * ing.quantite : null
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < ingredients.length - 1 ? `0.5px solid ${c.bordure}` : 'none' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: c.texte }}>{ing.ingredients?.nom || '—'}</div>
                      <div style={{ fontSize: '12px', color: c.texteMuted, marginTop: '2px' }}>{ing.quantite} {ing.unite}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {coutLigne && <div style={{ fontSize: '14px', fontWeight: '500', color: c.texte }}>{coutLigne.toFixed(2)} €</div>}
                      {ing.ingredients?.prix_kg && <div style={{ fontSize: '11px', color: c.texteMuted }}>{Number(ing.ingredients.prix_kg).toFixed(2)} €/kg</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: c.fond }}>
                  {['Ingrédient', 'Quantité', 'Unité', 'Prix unit.', 'Coût'].map((h, i) => (
                    <th key={i} style={{ padding: '10px 16px', textAlign: i === 0 ? 'left' : 'right', fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', borderBottom: `0.5px solid ${c.bordure}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ingredients.map((ing, i) => {
                  const coutLigne = ing.ingredients?.prix_kg && ing.quantite ? ing.ingredients.prix_kg * ing.quantite : null
                  return (
                    <tr key={i} style={{ borderBottom: i < ingredients.length - 1 ? `0.5px solid ${c.bordure}` : 'none', background: c.blanc }}>
                      <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '500', color: c.texte }}>{ing.ingredients?.nom || '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', textAlign: 'right', color: c.texte }}>{ing.quantite}</td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', textAlign: 'right', color: c.texteMuted }}>{ing.unite}</td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', textAlign: 'right', color: c.texteMuted }}>{ing.ingredients?.prix_kg ? `${Number(ing.ingredients.prix_kg).toFixed(2)} €` : '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', textAlign: 'right', fontWeight: '500', color: c.texte }}>{coutLigne ? `${coutLigne.toFixed(2)} €` : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Récapitulatif financier écran */}
        <div style={{
          background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '20px',
          border: `0.5px solid ${c.bordure}`,
          display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px'
        }}>
          <div style={{ background: c.fond, borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Coût total</div>
            <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{cout ? `${cout.toFixed(2)} €` : '—'}</div>
          </div>
          <div style={{ background: c.fond, borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Coût / portion</div>
            <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: c.texte }}>
              {cout && fiche.nb_portions ? `${(cout / fiche.nb_portions).toFixed(2)} €` : '—'}
            </div>
          </div>
          <div style={{ background: c.fond, borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Prix TTC</div>
            <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{fiche.prix_ttc ? `${Number(fiche.prix_ttc).toFixed(2)} €` : '—'}</div>
          </div>
          <div style={{ background: c.fond, borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Prix HT</div>
            <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{fiche.prix_ttc ? `${(fiche.prix_ttc / 1.10).toFixed(2)} €` : '—'}</div>
          </div>
          {prixIndic && (
            <div style={{ background: c.vertClair, borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', color: c.vert, fontWeight: '500', textTransform: 'uppercase' }}>Prix indicatif TTC</div>
              <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: c.vert }}>{prixIndic} €</div>
              <div style={{ fontSize: '10px', color: c.vert, opacity: 0.8, marginTop: '2px' }}>Basé sur {seuilVert}%</div>
            </div>
          )}
          {fc && (
            <div style={{ background: fc < seuilVert ? '#EAF3DE' : fc < seuilOrange ? '#FAEEDA' : '#FCEBEB', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', color: fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D' }}>Food cost</div>
              <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D' }}>{fc} %</div>
            </div>
          )}
        </div>
      </div>

      {/* ========== VERSION IMPRESSION ========== */}
      <div className="print-only" style={{
        fontFamily: 'Georgia, serif',
        color: '#1a1a1a',
        background: 'white',
        padding: '0',
        width: '100%'
      }}>

        {/* En-tête */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          borderBottom: '2px solid #2C1810', paddingBottom: '16px', marginBottom: '20px'
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '9px', letterSpacing: '3px', textTransform: 'uppercase', color: '#8B7355', marginBottom: '6px', fontFamily: 'sans-serif' }}>
              Fiche technique — {fiche.categorie || ''}
            </div>
            <h1 style={{ fontSize: '28px', fontWeight: '400', color: '#2C1810', marginBottom: '8px', letterSpacing: '1px' }}>
              {fiche.nom}
            </h1>
            <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: '#8B7355', fontFamily: 'sans-serif' }}>
              {fiche.saison && <span>Saison : {fiche.saison}</span>}
              {fiche.nb_portions && <span>Portions : {fiche.nb_portions}</span>}
              {params['chef_cuisine'] && <span>Chef : {params['chef_cuisine']}</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '20px' }}>
            <img src={LOGO_URL} alt="La Fantaisie" style={{ height: '80px', objectFit: 'contain' }} />
          </div>
        </div>

        {/* Photo + Description */}
        {(fiche.photo_url || fiche.description) && (
          <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
            {fiche.photo_url && (
              <img src={fiche.photo_url} alt={fiche.nom}
                style={{ width: '200px', height: '150px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }}
              />
            )}
            {fiche.description && (
              <div style={{ flex: 1, fontSize: '12px', color: '#555', lineHeight: '1.8', fontStyle: 'italic', paddingTop: '4px', fontFamily: 'Georgia, serif' }}>
                {fiche.description}
              </div>
            )}
          </div>
        )}

        {/* Tableau ingrédients */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '9px', letterSpacing: '3px', textTransform: 'uppercase', color: '#8B7355', marginBottom: '10px', fontFamily: 'sans-serif', fontWeight: '600' }}>
            Ingrédients
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'sans-serif' }}>
            <thead>
              <tr style={{ background: '#F0E8E0' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '600', color: '#2C1810', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', border: '0.5px solid #e8e4dc' }}>Ingrédient</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '600', color: '#2C1810', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', border: '0.5px solid #e8e4dc' }}>Quantité</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '600', color: '#2C1810', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', border: '0.5px solid #e8e4dc' }}>Unité</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '600', color: '#2C1810', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', border: '0.5px solid #e8e4dc' }}>Prix unit.</th>
                <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: '600', color: '#2C1810', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', border: '0.5px solid #e8e4dc' }}>Coût</th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map((ing, i) => {
                const coutLigne = ing.ingredients?.prix_kg && ing.quantite ? ing.ingredients.prix_kg * ing.quantite : null
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#FAF9F6' }}>
                    <td style={{ padding: '7px 12px', color: '#2C1810', fontWeight: '500', border: '0.5px solid #e8e4dc' }}>{ing.ingredients?.nom || '—'}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', color: '#2C1810', border: '0.5px solid #e8e4dc' }}>{ing.quantite}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', color: '#8B7355', border: '0.5px solid #e8e4dc' }}>{ing.unite}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', color: '#8B7355', border: '0.5px solid #e8e4dc' }}>
                      {ing.ingredients?.prix_kg ? `${Number(ing.ingredients.prix_kg).toFixed(2)} €` : '—'}
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: '600', color: '#2C1810', border: '0.5px solid #e8e4dc' }}>
                      {coutLigne ? `${coutLigne.toFixed(2)} €` : '—'}
                    </td>
                  </tr>
                )
              })}
              {/* Total */}
              <tr style={{ background: '#2C1810' }}>
                <td colSpan={4} style={{ padding: '8px 12px', color: '#C4956A', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', border: '0.5px solid #2C1810' }}>
                  Coût total
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#C4956A', fontWeight: '700', fontSize: '14px', border: '0.5px solid #2C1810' }}>
                  {cout.toFixed(2)} €
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Récapitulatif financier */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
          {[
            { label: 'Coût / portion', value: cout && fiche.nb_portions ? `${(cout / fiche.nb_portions).toFixed(2)} €` : '—' },
            { label: 'Prix HT', value: fiche.prix_ttc ? `${(fiche.prix_ttc / 1.10).toFixed(2)} €` : '—' },
            { label: 'Prix TTC', value: fiche.prix_ttc ? `${Number(fiche.prix_ttc).toFixed(2)} €` : '—' },
            { label: 'Food cost', value: fc ? `${fc} %` : '—', highlight: fc ? (fc < seuilVert ? '#EAF3DE' : fc < seuilOrange ? '#FAEEDA' : '#FCEBEB') : null, color: fc ? (fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D') : '#2C1810' }
          ].map((item, i) => (
            <div key={i} style={{ background: item.highlight || '#F0E8E0', borderRadius: '6px', padding: '10px 12px', border: '0.5px solid #e8e4dc' }}>
              <div style={{ fontSize: '9px', color: '#8B7355', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'sans-serif', marginBottom: '4px' }}>{item.label}</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: item.color || '#2C1810', fontFamily: 'sans-serif' }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Allergènes */}
        {fiche.allergenes && fiche.allergenes.length > 0 && (
          <div style={{ background: '#FCEBEB', borderRadius: '6px', padding: '12px', marginBottom: '20px', border: '0.5px solid #F09595' }}>
            <div style={{ fontSize: '9px', color: '#A32D2D', textTransform: 'uppercase', letterSpacing: '2px', fontFamily: 'sans-serif', fontWeight: '600', marginBottom: '8px' }}>
              ⚠ Allergènes présents
            </div>
            <div style={{ fontSize: '11px', color: '#A32D2D', fontFamily: 'sans-serif', fontWeight: '500' }}>
              {fiche.allergenes.map(id => {
                const allergene = ALLERGENES.find(a => a.id === id)
                return allergene ? `${allergene.emoji} ${allergene.label}` : null
              }).filter(Boolean).join('  •  ')}
            </div>
          </div>
        )}

        {/* Pied de page */}
        <div style={{
          borderTop: '1px solid #e8e4dc', paddingTop: '12px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: '9px', color: '#8B7355', fontFamily: 'sans-serif'
        }}>
          <span>{params['nom_etablissement'] || 'La Fantaisie'} — {params['adresse'] || '24 Rue Cadet, Paris 9ème'}</span>
          <span>{fiche.nom} — {fiche.saison || ''} — Imprimé le {today}</span>
        </div>
      </div>
    </div>
  )
}
