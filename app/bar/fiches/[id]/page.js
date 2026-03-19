'use client'
import { useState, useEffect } from 'react'
import { supabase, getParametres } from '../../../../lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { theme, Logo } from '../../../../lib/theme.jsx'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { useTheme } from '../../../../lib/useTheme'
import { useRole } from '../../../../lib/useRole'
import { log } from '../../../../lib/useLog'
import { ALLERGENES } from '../../../../lib/allergenes'

const LOGO_URL = 'https://uvmslpdcywephdneciwd.supabase.co/storage/v1/object/public/fiches-photos/logo-la-fantaisie.png'

export default function BarFicheDetail() {
  const [fiche, setFiche] = useState(null)
  const [ingredients, setIngredients] = useState([])
  const [params, setParams] = useState({})
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const params_route = useParams()
  const isMobile = useIsMobile()
  const { c } = useTheme()
  const { role } = useRole()

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
      .from('fiches_bar').select('*').eq('id', params_route.id).single()
    if (!ficheData) { router.push('/bar/fiches'); return }
    setFiche(ficheData)

    // Modification ici : on récupère les ingrédients classiques ET les liens vers d'autres fiches (sous-fiches)
    const { data: ingsData } = await supabase
      .from('fiche_bar_ingredients')
      .select(`
        quantite, 
        unite, 
        ingredients_bar (id, nom, prix_kg, unite),
        sous_fiche_id,
        fiches_bar!sous_fiche_id (id, nom, cout_portion, unite_production)
      `)
      .eq('fiche_bar_id', params_route.id)
    
    setIngredients(ingsData || [])
    setLoading(false)
  }

  const calculerCout = () => {
    return ingredients.reduce((total, item) => {
      // Cas 1 : Ingrédient classique
      if (item.ingredients_bar?.prix_kg && item.quantite) {
        return total + (item.ingredients_bar.prix_kg * item.quantite)
      }
      // Cas 2 : Sous-fiche bar
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
    const tva = 1 + parseFloat(params['tva_restauration'] || 10) / 100
    return (coutPortion / seuil * tva).toFixed(2)
  }

  const handleDelete = async () => {
    if (!confirm('Supprimer définitivement cette fiche ?')) return
    await log({
      action: 'SUPPRESSION', entite: 'fiche_bar', entite_id: params_route.id,
      entite_nom: fiche.nom, section: 'bar',
      details: `Catégorie: ${fiche.categorie}`
    })
    if (fiche.photo_url) {
      const path = fiche.photo_url.split('/').pop()
      await supabase.storage.from('fiches-photos').remove([path])
    }
    await supabase.from('fiches_bar').delete().eq('id', params_route.id)
    router.push('/bar/fiches')
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>
      <div style={{ fontSize: '14px', color: c.texteMuted }}>Chargement...</div>
    </div>
  )

  const cout = calculerCout()
  const fc = foodCost()
  const prixIndic = prixIndicatif()
  const seuilVert = parseFloat(params['seuil_vert_boissons'] || 22)
  const seuilOrange = parseFloat(params['seuil_orange_boissons'] || 28)
  const peutModifier = role === 'admin' || role === 'bar'
  const today = new Date().toLocaleDateString('fr-FR')

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      {/* ... (Header inchangé) ... */}
      <div className="no-print" style={{
        background: '#3C3489', borderBottom: '0.5px solid #7F77DD40',
        padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Logo height={28} couleur="white" onClick={() => router.push('/bar/dashboard')} />
          <button onClick={() => router.push('/bar/fiches')} style={{
            background: 'transparent', border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '6px 10px', fontSize: '13px', cursor: 'pointer', color: 'rgba(255,255,255,0.7)'
          }}>← {!isMobile && 'Retour'}</button>
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
        </div>
      </div>

      <div className="no-print" style={{ padding: isMobile ? '12px' : '24px', maxWidth: '800px', margin: '0 auto' }}>
        {/* ... (Infos fiche inchangées) ... */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
          {fiche.photo_url && (
            <img src={fiche.photo_url} alt={fiche.nom} style={{ width: '100%', height: isMobile ? '200px' : '250px', objectFit: 'cover', borderRadius: '8px', marginBottom: '16px' }} />
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '500', marginBottom: '8px', color: c.texte }}>{fiche.nom}</h1>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {fiche.categorie && <span style={{ background: '#EEEDFE', color: '#3C3489', borderRadius: '20px', padding: '3px 12px', fontSize: '12px', fontWeight: '500' }}>{fiche.categorie}</span>}
                {fiche.saison && <span style={{ background: c.fond, color: c.texteMuted, borderRadius: '20px', padding: '3px 12px', fontSize: '12px', border: `0.5px solid ${c.bordure}` }}>{fiche.saison}</span>}
              </div>
            </div>
            <div style={{ background: '#3C3489', color: '#C4956A', borderRadius: '10px', padding: '8px 14px', textAlign: 'center', flexShrink: 0, marginLeft: '12px' }}>
              <div style={{ fontSize: '10px', opacity: 0.7 }}>Portions</div>
              <div style={{ fontSize: '20px', fontWeight: '500' }}>{fiche.nb_portions || '—'}</div>
            </div>
          </div>
        </div>

        {/* Tableau Ingrédients Modifié pour gérer les Sous-fiches */}
        <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: `0.5px solid ${c.bordure}`, fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ingrédients & Préparations</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: c.fond }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', color: c.texteMuted }}>Désignation</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '11px', color: c.texteMuted }}>Quantité</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '11px', color: c.texteMuted }}>Prix Unit.</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '11px', color: c.texteMuted }}>Coût</th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map((item, i) => {
                const isSF = !!item.sous_fiche_id
                const nom = isSF ? item.fiches_bar?.nom : item.ingredients_bar?.nom
                const prixUnit = isSF ? item.fiches_bar?.cout_portion : item.ingredients_bar?.prix_kg
                const uniteDisplay = item.unite
                const coutLigne = prixUnit && item.quantite ? prixUnit * item.quantite : 0

                return (
                  <tr key={i} style={{ borderBottom: `0.5px solid ${c.bordure}` }}>
                    <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isSF && <span style={{ background: c.violet, color: 'white', borderRadius: '4px', padding: '1px 5px', fontSize: '9px' }}>SF</span>}
                        <span style={{ fontWeight: isSF ? '600' : '400' }}>{nom}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px' }}>{item.quantite} {uniteDisplay}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', color: c.texteMuted }}>{prixUnit ? `${Number(prixUnit).toFixed(2)} €` : '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '14px', fontWeight: '500' }}>{coutLigne.toFixed(2)} €</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ... (Le reste du code financier est identique) ... */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '20px', border: `0.5px solid ${c.bordure}`, display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
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
          {fc && (
            <div style={{ background: fc < seuilVert ? '#EAF3DE' : fc < seuilOrange ? '#FAEEDA' : '#FCEBEB', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', color: fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D' }}>Food cost</div>
              <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D' }}>{fc} %</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
