'use client'
import { useState, useEffect } from 'react'
import { supabase, getParametres, getClientId } from '../../../../lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { Logo } from '../../../../lib/theme.jsx'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { useTheme } from '../../../../lib/useTheme'
import { useRole } from '../../../../lib/useRole'
import { log } from '../../../../lib/useLog'
import { ALLERGENES } from '../../../../lib/allergenes'
import { AllergenesBlock } from '../../../../components/FicheDetailShared'
import ChefLoader from '../../../../components/ChefLoader'
import BackButton from '../../../../components/BackButton'
import { Card , Badge } from '../../../../components/ui'

export default function BarFicheDetail() {
  const [fiche, setFiche] = useState(null)
  const [ingredients, setIngredients] = useState([])
  const [allergenesCascade, setAllergenesCascade] = useState([])
  const [params, setParams] = useState({})
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const params_route = useParams()
  const isMobile = useIsMobile()
  const { c, logoUrl, nomEtablissement } = useTheme()
  const { role } = useRole()

  const peutModifier = role === 'admin' || role === 'bar'

  useEffect(() => {
    const style = document.createElement('style')
    style.innerHTML = `
      @media print {
        .no-print { display: none !important; }
        .print-only { display: block !important; }
        .print-instructions { page-break-before: always; margin-top: 0 !important; }
        body { background: white !important; margin: 0; padding: 0; }
        @page { margin: 15mm 15mm 15mm 15mm; }
      }
      @media screen {
        .print-only { display: none !important; }
      }
    `
    document.head.appendChild(style)
    checkUser()
    loadFiche()
    loadParams()
    return () => document.head.removeChild(style)
  }, [])

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) router.push('/')
    } catch { router.push('/') }
  }

  const loadParams = async () => {
    try {
      const p = await getParametres()
      setParams(p)
    } catch (err) { console.error('Params error:', err) }
  }

const loadFiche = async () => {
  try {
    const clientId = await getClientId()
    if (!clientId) { router.push('/'); return }

    const { data: ficheData, error } = await supabase
      .from('fiches_bar')
      .select('*')
      .eq('id', params_route.id)
      .eq('client_id', clientId)
      .single()

    if (error || !ficheData) { router.push('/bar/fiches'); return }

    setFiche(ficheData)

    // Requête 1 — liens de jointure
    const { data: liens } = await supabase
      .from('fiche_bar_ingredients')
      .select('quantite, unite, ingredient_id, sous_fiche_id')
      .eq('fiche_bar_id', params_route.id)
      .eq('client_id', clientId)

    if (!liens || liens.length === 0) {
      setIngredients([])
      setLoading(false)
      return
    }

    // Requête 2 — ingrédients classiques
    const ingIds = liens.filter(l => l.ingredient_id && !l.sous_fiche_id).map(l => l.ingredient_id)
    const sfIds = liens.filter(l => l.sous_fiche_id).map(l => l.sous_fiche_id)

    const [{ data: ingsData }, { data: sfsData }] = await Promise.all([
      ingIds.length > 0
        ? supabase.from('ingredients_bar').select('id, nom, prix_kg, unite').eq('client_id', clientId).in('id', ingIds)
        : Promise.resolve({ data: [] }),
      sfIds.length > 0
        ? supabase.from('fiches_bar').select('id, nom, cout_portion, unite_production, allergenes').eq('client_id', clientId).in('id', sfIds)
        : Promise.resolve({ data: [] })
    ])

    // Assemblage manuel
    const ingsMap = Object.fromEntries((ingsData || []).map(i => [i.id, i]))
    const sfsMap = Object.fromEntries((sfsData || []).map(s => [s.id, s]))

    const result = liens.map(l => ({
      quantite: l.quantite,
      unite: l.unite,
      sous_fiche_id: l.sous_fiche_id,
      ingredients_bar: l.ingredient_id ? ingsMap[l.ingredient_id] || null : null,
      fiches_bar: l.sous_fiche_id ? sfsMap[l.sous_fiche_id] || null : null,
    }))

    setIngredients(result)

    // Cascade : union des allergènes de toutes les sous-fiches utilisées
    const sfAllergs = (sfsData || []).flatMap(sf => sf.allergenes || [])
    setAllergenesCascade([...new Set(sfAllergs)])
  } catch (err) {
    console.error('Load fiche error:', err)
    router.push('/bar/fiches')
  } finally {
    setLoading(false)
  }
}

  const calculerCout = () => {
    return ingredients.reduce((total, item) => {
      if (item.ingredients_bar?.prix_kg && item.quantite) {
        return total + (item.ingredients_bar.prix_kg * item.quantite)
      }
      if (item.fiches_bar?.cout_portion && item.quantite) {
        return total + (item.fiches_bar.cout_portion * item.quantite)
      }
      return total
    }, 0)
  }

  const TVA_BAR = () => {
    const categoriesAlcool = ['Cocktails', 'Vins', 'Champagnes', 'Bières', 'Spiritueux']
    return categoriesAlcool.includes(fiche?.categorie) ? 20 : 10
  }

  const foodCost = () => {
    const coutTotal = calculerCout()
    if (!fiche?.prix_ttc || !coutTotal || !fiche?.nb_portions) return null
    const tva = 1 + TVA_BAR() / 100
    return (coutTotal / fiche.nb_portions / (fiche.prix_ttc / tva) * 100).toFixed(1)
  }

  const prixIndicatif = () => {
    const coutTotal = calculerCout()
    if (!coutTotal || !fiche?.nb_portions) return null
    const coutPortion = coutTotal / fiche.nb_portions
    const seuil = parseFloat(params['seuil_vert_boissons'] || 22) / 100
    const tva = 1 + TVA_BAR() / 100
    return (coutPortion / seuil * tva).toFixed(2)
  }

  const handleDelete = async () => {
    if (!confirm('Supprimer définitivement cette fiche ?')) return
    try {
      const clientId = await getClientId()
      await log({
        action: 'SUPPRESSION', entite: 'fiche_bar', entite_id: params_route.id,
        entite_nom: fiche.nom, section: 'bar',
        details: `Catégorie: ${fiche.categorie}`
      })
      if (fiche.photo_url) {
        const path = fiche.photo_url.split('/').pop()
        await supabase.storage.from('fiches-photos').remove([path])
      }
      await supabase.from('fiches_bar').delete().eq('id', params_route.id).eq('client_id', clientId)
      router.push('/bar/fiches')
    } catch (err) { console.error('Delete error:', err) }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>
      <ChefLoader />
    </div>
  )

  const cout = calculerCout()
  const fc = foodCost()
  const prixIndic = prixIndicatif()
  const seuilVert = parseFloat(params['seuil_vert_boissons'] || 22)
  const seuilOrange = parseFloat(params['seuil_orange_boissons'] || 28)
  const today = new Date().toLocaleDateString('fr-FR')

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

      {/* ── NAVBAR ── */}
      <div className="no-print" style={{
        background: '#3C3489', borderBottom: '0.5px solid #7F77DD40',
        padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Logo height={28} couleur="white" nom={nomEtablissement} onClick={() => router.push("/bar/dashboard")} />
          <BackButton fallback="/bar/fiches" label={isMobile ? '←' : '← Retour'} />
          {!isMobile && <span style={{ fontSize: '15px', fontWeight: '500', color: 'white' }}>{fiche.nom}</span>}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => window.print()} style={{
            background: '#C4956A', color: '#3C3489', border: 'none',
            borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
          }}>{isMobile ? '🖨️' : '🖨️ Imprimer'}</button>
          {peutModifier && (
            <button onClick={() => router.push(`/bar/fiches/${params_route.id}/modifier`)} style={{
              background: 'transparent', color: 'rgba(255,255,255,0.7)',
              border: '0.5px solid rgba(255,255,255,0.2)',
              borderRadius: '8px', padding: '8px 12px', fontSize: '13px', cursor: 'pointer'
            }}>{isMobile ? '✏️' : 'Modifier'}</button>
          )}
          {peutModifier && !isMobile && (
            <button onClick={handleDelete} style={{
              background: 'transparent', color: '#F09595',
              border: '0.5px solid rgba(255,255,255,0.2)',
              borderRadius: '8px', padding: '8px 12px', fontSize: '13px', cursor: 'pointer'
            }}>Supprimer</button>
          )}
        </div>
      </div>

      {/* ── CONTENU ÉCRAN ── */}
      <div className="no-print" style={{ padding: isMobile ? '12px' : '24px', maxWidth: '800px', margin: '0 auto' }}>

        {/* Infos générales */}
        <Card c={c} style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '500', marginBottom: '8px', color: c.texte }}>{fiche.nom}</h1>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {fiche.categorie && <Badge bg={'#EEEDFE'} color={'#3C3489'}>{fiche.categorie}</Badge>}
                {fiche.saison && <Badge bg={c.fond} color={c.texteMuted} border={`0.5px solid ${c.bordure}`}>{fiche.saison}</Badge>}
              </div>
            </div>
            <div style={{ background: '#3C3489', color: '#C4956A', borderRadius: '10px', padding: '8px 14px', textAlign: 'center', flexShrink: 0, marginLeft: '12px' }}>
              <div style={{ fontSize: '10px', opacity: 0.7 }}>Portions</div>
              <div style={{ fontSize: '20px', fontWeight: '500' }}>{fiche.nb_portions || '—'}</div>
            </div>
          </div>
          {fiche.description && (
            <p style={{ fontSize: '14px', color: c.texteMuted, lineHeight: '1.6', marginTop: '8px' }}>{fiche.description}</p>
          )}
          <AllergenesBlock allergenes={fiche.allergenes} allergenesCascade={allergenesCascade} c={c} />
        </Card>

        {/* Ingrédients */}
        <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px', overflow: 'hidden' }}>
          <div className="sk-panel-header sk-label-muted" style={{ padding: '14px 16px', borderBottom: `0.5px solid ${c.bordure}`, color: c.texteMuted }}>
            Ingrédients & Préparations
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: c.fond }}>
                {['Désignation', 'Quantité', 'Prix Unit.', 'Coût'].map((h, i) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: i === 0 ? 'left' : 'right', fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ingredients.length === 0 ? (
                <tr><td colSpan={4} style={{ padding: '20px 16px', textAlign: 'center', color: c.texteMuted, fontSize: '13px' }}>Aucun ingrédient</td></tr>
              ) : ingredients.map((item, i) => {
                const isSF = !!item.sous_fiche_id
                const nom = isSF ? item.fiches_bar?.nom : item.ingredients_bar?.nom
                const prixUnit = isSF ? item.fiches_bar?.cout_portion : item.ingredients_bar?.prix_kg
                const coutLigne = prixUnit && item.quantite ? prixUnit * item.quantite : 0
                return (
                  <tr key={i} style={{ borderBottom: `0.5px solid ${c.bordure}` }}>
                    <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isSF && <span style={{ background: '#7C3AED', color: 'white', borderRadius: '4px', padding: '1px 5px', fontSize: '9px' }}>SF</span>}
                        <span style={{ fontWeight: isSF ? '600' : '400', color: c.texte }}>{nom || '—'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', color: c.texte }}>{item.quantite} {item.unite}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', color: c.texteMuted }}>{prixUnit ? `${Number(prixUnit).toFixed(2)} €` : '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', fontWeight: '500', color: c.texte }}>{coutLigne > 0 ? `${coutLigne.toFixed(2)} €` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Récap financier */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '20px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px', display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
          <div style={{ background: c.fond, borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Coût total</div>
            <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{cout ? `${cout.toFixed(2)} €` : '—'}</div>
          </div>
          <div style={{ background: c.fond, borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Coût / portion</div>
            <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{cout && fiche.nb_portions ? `${(cout / fiche.nb_portions).toFixed(2)} €` : '—'}</div>
          </div>
          <div style={{ background: c.fond, borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Prix TTC</div>
            <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{fiche.prix_ttc ? `${Number(fiche.prix_ttc).toFixed(2)} €` : '—'}</div>
          </div>
          {prixIndic && (
            <div style={{ background: '#DCFCE7', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', color: '#16A34A', fontWeight: '500', textTransform: 'uppercase' }}>Prix indicatif</div>
              <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: '#16A34A' }}>{prixIndic} €</div>
            </div>
          )}
          {fc && (
            <div style={{ background: fc < seuilVert ? '#EAF3DE' : fc < seuilOrange ? '#FAEEDA' : '#FCEBEB', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', color: fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D' }}>Bev cost</div>
              <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D' }}>{fc} %</div>
            </div>
          )}
        </div>

        {/* Instructions écran */}
        {fiche.instructions && (
          <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px', overflow: 'hidden' }}>
            <div className="sk-panel-header sk-label-muted" style={{ padding: '14px 16px', borderBottom: `0.5px solid ${c.bordure}`, color: c.texteMuted }}>
              📋 Instructions de préparation
            </div>
            <div style={{ padding: '16px 20px' }}>
              {fiche.instructions.split('\n').map((ligne, i) => (
                ligne.trim() === '' ? (
                  <div key={i} style={{ height: '10px' }} />
                ) : (
                  <div key={i} style={{ fontSize: '14px', color: c.texte, lineHeight: '1.8', marginBottom: '2px' }}>{ligne}</div>
                )
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── VERSION IMPRESSION BAR ── */}
      <div className="print-only" style={{ fontFamily: 'Georgia, serif', color: '#1a1a1a', background: 'white', padding: '0', width: '100%' }}>

        {/* En-tête */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #3C3489', paddingBottom: '16px', marginBottom: '20px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '9px', letterSpacing: '3px', textTransform: 'uppercase', color: '#7C3AED', marginBottom: '6px', fontFamily: 'sans-serif' }}>Fiche technique Bar — {fiche.categorie || ''}</div>
            <h1 style={{ fontSize: '26px', fontWeight: '400', color: '#3C3489', marginBottom: '8px', letterSpacing: '1px' }}>{fiche.nom}</h1>
            <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: '#7C3AED', fontFamily: 'sans-serif' }}>
              {fiche.saison && <span>Saison : {fiche.saison}</span>}
              {fiche.nb_portions && <span>Portions : {fiche.nb_portions}</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '20px' }}>
            {logoUrl
              ? <img src={logoUrl} alt={nomEtablissement} style={{ height: '60px', objectFit: 'contain' }} />
              : <div style={{ fontSize: '16px', fontWeight: '700', color: '#3C3489' }}>{nomEtablissement}</div>
            }
          </div>
        </div>

        {/* Description */}
        {fiche.description && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '12px', color: '#555', lineHeight: '1.8', fontStyle: 'italic' }}>{fiche.description}</div>
          </div>
        )}

        {/* Ingrédients */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '9px', letterSpacing: '3px', textTransform: 'uppercase', color: '#7C3AED', marginBottom: '10px', fontFamily: 'sans-serif', fontWeight: '600' }}>Ingrédients & Préparations</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'sans-serif' }}>
            <thead>
              <tr style={{ background: '#EEEDFE' }}>
                {['Désignation', 'Quantité', 'Prix unit.', 'Coût'].map((h, i) => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: i === 0 ? 'left' : 'right', fontWeight: '600', color: '#3C3489', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', border: '0.5px solid #DDD6FE' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ingredients.map((item, i) => {
                const isSF = !!item.sous_fiche_id
                const nom = isSF ? item.fiches_bar?.nom : item.ingredients_bar?.nom
                const prixUnit = isSF ? item.fiches_bar?.cout_portion : item.ingredients_bar?.prix_kg
                const coutLigne = prixUnit && item.quantite ? prixUnit * item.quantite : 0
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#F5F3FF' }}>
                    <td style={{ padding: '7px 12px', border: '0.5px solid #DDD6FE' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isSF && <span style={{ background: '#7C3AED', color: 'white', borderRadius: '3px', padding: '1px 4px', fontSize: '8px' }}>SF</span>}
                        <span style={{ color: '#3C3489', fontWeight: isSF ? '600' : '400' }}>{nom || '—'}</span>
                      </div>
                    </td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', color: '#3C3489', border: '0.5px solid #DDD6FE' }}>{item.quantite} {item.unite}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', color: '#7C3AED', border: '0.5px solid #DDD6FE' }}>{prixUnit ? `${Number(prixUnit).toFixed(2)} €` : '—'}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: '600', color: '#3C3489', border: '0.5px solid #DDD6FE' }}>{coutLigne > 0 ? `${coutLigne.toFixed(2)} €` : '—'}</td>
                  </tr>
                )
              })}
              <tr style={{ background: '#3C3489' }}>
                <td colSpan={3} style={{ padding: '8px 12px', color: '#C4956A', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', border: '0.5px solid #3C3489' }}>Coût total</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#C4956A', fontWeight: '700', fontSize: '14px', border: '0.5px solid #3C3489' }}>{cout.toFixed(2)} €</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── RÉCAP FINANCIER — avant instructions ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
          {[
            { label: 'Coût / portion', value: cout && fiche.nb_portions ? `${(cout / fiche.nb_portions).toFixed(2)} €` : '—' },
            { label: `TVA ${TVA_BAR()}%`, value: fiche.prix_ttc ? `${(fiche.prix_ttc / (1 + TVA_BAR() / 100)).toFixed(2)} €` : '—' },
            { label: 'Prix TTC', value: fiche.prix_ttc ? `${Number(fiche.prix_ttc).toFixed(2)} €` : '—' },
            {
              label: 'Bev cost', value: fc ? `${fc} %` : '—',
              highlight: fc ? (fc < seuilVert ? '#EAF3DE' : fc < seuilOrange ? '#FAEEDA' : '#FCEBEB') : null,
              color: fc ? (fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D') : '#3C3489'
            }
          ].map((item, i) => (
            <div key={i} style={{ background: item.highlight || '#EEEDFE', borderRadius: '6px', padding: '10px 12px', border: '0.5px solid #DDD6FE' }}>
              <div style={{ fontSize: '9px', color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'sans-serif', marginBottom: '4px' }}>{item.label}</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: item.color || '#3C3489', fontFamily: 'sans-serif' }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Allergènes — sur la même page que le récap */}
        {fiche.allergenes && fiche.allergenes.length > 0 && (
          <div style={{ background: '#FCEBEB', borderRadius: '6px', padding: '12px', marginBottom: '16px', border: '0.5px solid #F09595' }}>
            <div style={{ fontSize: '9px', color: '#A32D2D', textTransform: 'uppercase', letterSpacing: '2px', fontFamily: 'sans-serif', fontWeight: '600', marginBottom: '8px' }}>⚠ Allergènes présents</div>
            <div style={{ fontSize: '11px', color: '#A32D2D', fontFamily: 'sans-serif', fontWeight: '500' }}>
              {fiche.allergenes.map(id => { const a = ALLERGENES.find(a => a.id === id); return a ? `${a.emoji} ${a.label}` : null }).filter(Boolean).join('  •  ')}
            </div>
          </div>
        )}

        {/* ── INSTRUCTIONS — page séparée ── */}
        {fiche.instructions && (
          <div className="print-instructions" style={{ marginBottom: '20px', pageBreakBefore: 'always', marginTop: '0' }}>
            <div style={{ fontSize: '9px', letterSpacing: '3px', textTransform: 'uppercase', color: '#7C3AED', marginBottom: '10px', fontFamily: 'sans-serif', fontWeight: '600' }}>Instructions de préparation</div>
            <div style={{
              border: '0.5px solid #DDD6FE', borderRadius: '4px', padding: '14px 16px',
              fontSize: '12px', fontFamily: 'sans-serif', color: '#3C3489',
              lineHeight: '1.9', whiteSpace: 'pre-wrap'
            }}>
              {fiche.instructions}
            </div>
          </div>
        )}

        {/* Pied de page */}
        <div style={{ borderTop: '1px solid #DDD6FE', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px', color: '#7C3AED', fontFamily: 'sans-serif' }}>
          <span>{nomEtablissement || params['nom_etablissement'] || ''} — Bar</span>
          <span>{fiche.nom} — {fiche.saison || ''} — Imprimé le {today}</span>
        </div>
      </div>
    </div>
  )
}
