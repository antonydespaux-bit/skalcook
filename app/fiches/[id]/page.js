'use client'
import { useState, useEffect } from 'react'
import { supabase, getParametres, getClientId } from '../../../lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { Logo } from '../../../lib/theme.jsx'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import { useRole } from '../../../lib/useRole'
import { log } from '../../../lib/useLog'
import { ALLERGENES } from '../../../lib/allergenes'
import FichePhoto, { FicheHeaderInfo, FicheHeaderInfoStyles } from '../../../components/FichePhoto'
import { AllergenesBlock, FicheDetailNavbar } from '../../../components/FicheDetailShared'
import ChefLoader from '../../../components/ChefLoader'
import BackButton from '../../../components/BackButton'

export default function FicheDetail() {
  const [fiche, setFiche] = useState(null)
  const [ingredients, setIngredients] = useState([])
  const [params, setParams] = useState({})
  const [loading, setLoading] = useState(true)
  const [clientId, setClientId] = useState(null)
  const [photoPath, setPhotoPath] = useState(null)
  const [signedUrl, setSignedUrl] = useState(null)
  const [allergenesCascade, setAllergenesCascade] = useState([])
  const router = useRouter()
  const params_route = useParams()
  const isMobile = useIsMobile()
  const { c, logoUrl, nomEtablissement } = useTheme()
  const { role } = useRole()

  const peutModifier = role === 'admin' || role === 'cuisine'

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
      const cId = await getClientId()
      if (!cId) { router.push('/'); return }
      setClientId(cId)

      const { data: ficheData, error } = await supabase
        .from('fiches')
        .select('*')
        .eq('id', params_route.id)
        .eq('client_id', cId)
        .single()

      if (error || !ficheData) { router.push('/fiches'); return }

      setFiche(ficheData)
      setPhotoPath(ficheData.photo_url || null)

      // Chargement ingrédients SANS filtre client_id sur la table de jointure
      const { data: ingsData, error: errIngs } = await supabase
        .from('fiche_ingredients')
        .select(`quantite, unite, ingredients (id, nom, prix_kg, unite, est_sous_fiche, fiche_id)`)
        .eq('fiche_id', params_route.id)
        .eq('client_id', cId)

      if (errIngs) console.error('Ingrédients error:', errIngs)
      setIngredients(ingsData || [])

      const sousFicheIds = (ingsData || [])
        .filter(ing => ing.ingredients?.est_sous_fiche && ing.ingredients?.fiche_id)
        .map(ing => ing.ingredients.fiche_id)
      if (sousFicheIds.length > 0) {
        const { data: sfFiches } = await supabase
          .from('fiches')
          .select('allergenes')
          .in('id', sousFicheIds)
          .eq('client_id', cId)
        const sfAllergs = (sfFiches || []).flatMap(sf => sf.allergenes || [])
        setAllergenesCascade([...new Set(sfAllergs)])
      }
    } catch (err) {
      console.error('Load fiche error:', err)
      router.push('/fiches')
    } finally {
      setLoading(false)
    }
  }

  const calculerCout = () => {
    return ingredients.reduce((total, ing) => {
      if (ing.ingredients?.prix_kg && ing.quantite) {
        const coef = (ing.unite === 'g' || ing.unite === 'ml') ? 0.001 : (ing.unite === 'cl' ? 0.01 : 1)
        return total + (ing.ingredients.prix_kg * ing.quantite * coef)
      }
      return total
    }, 0)
  }

  const foodCost = () => {
    const cout = calculerCout()
    if (!fiche?.prix_ttc || !cout || !fiche?.nb_portions) return null
    const tva = 1 + parseFloat(params['tva_restauration'] || 10) / 100
    return (cout / fiche.nb_portions / (fiche.prix_ttc / tva) * 100).toFixed(1)
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
    try {
      const cId = await getClientId()
      await log({
        action: 'SUPPRESSION', entite: 'fiche', entite_id: params_route.id,
        entite_nom: fiche.nom, section: 'cuisine',
        details: `Catégorie: ${fiche.categorie}, Saison: ${fiche.saison}`
      })
      if (photoPath) {
        await supabase.storage.from('fiches-photos').remove([photoPath])
      }
      await supabase.from('fiches').delete().eq('id', params_route.id).eq('client_id', cId)
      router.push('/fiches')
    } catch (err) { console.error('Delete error:', err) }
  }

  const getUniteLabel = () => {
    if (!fiche?.unite_production || fiche.unite_production === 'portions') return 'Portions'
    return fiche.unite_production
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>
      <ChefLoader />
    </div>
  )

  const cout = calculerCout()
  const fc = foodCost()
  const prixIndic = prixIndicatif()
  const seuilVert = parseFloat(params['seuil_vert_cuisine'] || 28)
  const seuilOrange = parseFloat(params['seuil_orange_cuisine'] || 35)
  const today = new Date().toLocaleDateString('fr-FR')
  const uniteLabel = getUniteLabel()

  const showHeaderInfoBlock =
    Boolean(fiche.description) || Boolean(photoPath) || peutModifier

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <FicheHeaderInfoStyles />

      {/* ── NAVBAR ── */}
      <div className="no-print" style={{
        background: c.principal, borderBottom: `0.5px solid ${c.accent}40`,
        padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Logo height={28} couleur="white" nom={nomEtablissement} onClick={() => router.push("/dashboard")} />
          <BackButton fallback="/fiches" label={isMobile ? '←' : '← Retour'} />
          {!isMobile && <span style={{ fontSize: '15px', fontWeight: '500', color: 'white' }}>{fiche.nom}</span>}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => window.print()} style={{
            background: c.accent, color: 'white', border: 'none',
            borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
          }}>{isMobile ? '🖨️' : '🖨️ Imprimer'}</button>
          {peutModifier && (
            <button onClick={() => router.push(`/fiches/${params_route.id}/modifier`)} style={{
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
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
          <h1 style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '500', marginBottom: '10px', color: c.texte, width: '100%' }}>{fiche.nom}</h1>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: '1 1 auto', minWidth: 0 }}>
              {fiche.categorie && <span style={{ background: c.accentClair, color: c.accent, borderRadius: '20px', padding: '3px 12px', fontSize: '12px', fontWeight: '500' }}>{fiche.categorie}</span>}
              {fiche.saison && <span style={{ background: c.fond, color: c.texteMuted, borderRadius: '20px', padding: '3px 12px', fontSize: '12px', border: `0.5px solid ${c.bordure}` }}>{fiche.saison}</span>}
            </div>
            <div style={{ background: c.principal, color: c.accent, borderRadius: '10px', padding: '8px 14px', textAlign: 'center', flexShrink: 0, minWidth: '70px' }}>
              <div style={{ fontSize: '10px', opacity: 0.7, textTransform: 'capitalize' }}>{uniteLabel}</div>
              <div style={{ fontSize: '20px', fontWeight: '500' }}>{fiche.nb_portions != null ? fiche.nb_portions : '—'}</div>
            </div>
          </div>

          {showHeaderInfoBlock && clientId && (
            <FicheHeaderInfo
              description={
                fiche.description ? (
                  <div style={{ background: c.fond, borderRadius: '8px', padding: '12px', fontSize: '13px', color: c.texteMuted, lineHeight: '1.6' }}>
                    {fiche.description}
                  </div>
                ) : null
              }
            >
              {(photoPath || peutModifier) && (
                <FichePhoto
                  ficheId={params_route.id}
                  clientId={clientId}
                  photoPath={photoPath}
                  peutModifier={peutModifier}
                  onPhotoChange={setPhotoPath}
                  onSignedUrlChange={setSignedUrl}
                  c={c}
                  embeddedInHeader
                />
              )}
            </FicheHeaderInfo>
          )}

          <AllergenesBlock allergenes={fiche.allergenes} allergenesCascade={allergenesCascade} c={c} />
          {peutModifier && isMobile && (
            <button onClick={handleDelete} style={{ marginTop: '12px', width: '100%', padding: '10px', background: 'transparent', color: '#A32D2D', border: '0.5px solid #F09595', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>
              Supprimer cette fiche
            </button>
          )}
        </div>

        {/* Ingrédients */}
        <div className="fiche-ingredients-after-header" style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: `0.5px solid ${c.bordure}`, fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ingrédients</div>
          {isMobile ? (
            <div style={{ padding: '12px' }}>
              {ingredients.map((ing, i) => {
                const coef = (ing.unite === 'g' || ing.unite === 'ml') ? 0.001 : (ing.unite === 'cl' ? 0.01 : 1)
                const coutLigne = ing.ingredients?.prix_kg && ing.quantite ? ing.ingredients.prix_kg * ing.quantite * coef : null
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < ingredients.length - 1 ? `0.5px solid ${c.bordure}` : 'none' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: c.texte }}>{ing.ingredients?.nom || '—'}</div>
                      <div style={{ fontSize: '12px', color: c.texteMuted, marginTop: '2px' }}>{ing.quantite} {ing.unite}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {coutLigne && <div style={{ fontSize: '14px', fontWeight: '500', color: c.texte }}>{coutLigne.toFixed(2)} €</div>}
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
                  const coef = (ing.unite === 'g' || ing.unite === 'ml') ? 0.001 : (ing.unite === 'cl' ? 0.01 : 1)
                  const coutLigne = ing.ingredients?.prix_kg && ing.quantite ? ing.ingredients.prix_kg * ing.quantite * coef : null
                  return (
                    <tr key={i} style={{ borderBottom: i < ingredients.length - 1 ? `0.5px solid ${c.bordure}` : 'none' }}>
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

        {/* Récap financier */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '20px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px', display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
          <div style={{ background: c.fond, borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Coût total</div>
            <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{cout ? `${cout.toFixed(2)} €` : '—'}</div>
          </div>
          <div style={{ background: c.fond, borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Coût / {uniteLabel.slice(0, -1)}</div>
            <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{cout && fiche.nb_portions ? `${(cout / fiche.nb_portions).toFixed(2)} €` : '—'}</div>
          </div>
          <div style={{ background: c.fond, borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Prix TTC</div>
            <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{fiche.prix_ttc ? `${Number(fiche.prix_ttc).toFixed(2)} €` : '—'}</div>
          </div>
          <div style={{ background: c.fond, borderRadius: '8px', padding: '12px' }}>
            <div style={{ fontSize: '10px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Prix HT</div>
            <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{fiche.prix_ttc ? `${(fiche.prix_ttc / (1 + parseFloat(params['tva_restauration'] || 10) / 100)).toFixed(2)} €` : '—'}</div>
          </div>
          {prixIndic && !fiche.categorie?.includes('Sous-fiche') && (
            <div style={{ background: c.vertClair, borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', color: c.vert, fontWeight: '500', textTransform: 'uppercase' }}>Prix indicatif TTC</div>
              <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: c.vert }}>{prixIndic} €</div>
              <div style={{ fontSize: '10px', color: c.vert, opacity: 0.8, marginTop: '2px' }}>Basé sur {seuilVert}%</div>
            </div>
          )}
          {fc && !fiche.categorie?.includes('Sous-fiche') && (
            <div style={{ background: fc < seuilVert ? '#EAF3DE' : fc < seuilOrange ? '#FAEEDA' : '#FCEBEB', borderRadius: '8px', padding: '12px' }}>
              <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', color: fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D' }}>Food cost</div>
              <div style={{ fontSize: '18px', fontWeight: '500', marginTop: '4px', color: fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D' }}>{fc} %</div>
            </div>
          )}
        </div>

        {/* Instructions écran — après récap */}
        {fiche.instructions && (
          <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: `0.5px solid ${c.bordure}`, fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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

      {/* ── VERSION IMPRESSION CUISINE ── */}
      <div className="print-only" style={{ fontFamily: 'Georgia, serif', color: '#1a1a1a', background: 'white', padding: '0', width: '100%' }}>

        {/* En-tête */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #2C1810', paddingBottom: '16px', marginBottom: '16px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '9px', letterSpacing: '3px', textTransform: 'uppercase', color: '#8B7355', marginBottom: '6px', fontFamily: 'sans-serif' }}>Fiche technique — {fiche.categorie || ''}</div>
            <h1 style={{ fontSize: '28px', fontWeight: '400', color: '#2C1810', marginBottom: '10px', letterSpacing: '1px', width: '100%' }}>{fiche.nom}</h1>
            <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: '#8B7355', fontFamily: 'sans-serif' }}>
              {fiche.saison && <span>Saison : {fiche.saison}</span>}
              {fiche.nb_portions && <span>{uniteLabel} : {fiche.nb_portions}</span>}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '20px' }}>
            {logoUrl
              ? <img src={logoUrl} alt={nomEtablissement} style={{ height: '60px', objectFit: 'contain' }} />
              : <div style={{ fontSize: '16px', fontWeight: '700', color: '#2C1810' }}>{nomEtablissement}</div>
            }
          </div>
        </div>

        {(fiche.description || signedUrl) && (
          <FicheHeaderInfo
            description={
              fiche.description ? (
                <div style={{ fontSize: '12px', color: '#555', lineHeight: '1.8', fontStyle: 'italic' }}>{fiche.description}</div>
              ) : null
            }
          >
            {signedUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={signedUrl}
                  alt="Photo de la fiche"
                  className="fiche-photo"
                  style={{ display: 'block', border: '0.5px solid #e8e4dc' }}
                />
              </>
            ) : null}
          </FicheHeaderInfo>
        )}

        {/* Ingrédients */}
        <div className="fiche-ingredients-after-header" style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '9px', letterSpacing: '3px', textTransform: 'uppercase', color: '#8B7355', marginBottom: '10px', fontFamily: 'sans-serif', fontWeight: '600' }}>Ingrédients</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'sans-serif' }}>
            <thead>
              <tr style={{ background: '#F0E8E0' }}>
                {['Ingrédient', 'Quantité', 'Unité', 'Prix unit.', 'Coût'].map((h, i) => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: i === 0 ? 'left' : 'right', fontWeight: '600', color: '#2C1810', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', border: '0.5px solid #e8e4dc' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ingredients.map((ing, i) => {
                const coef = (ing.unite === 'g' || ing.unite === 'ml') ? 0.001 : (ing.unite === 'cl' ? 0.01 : 1)
                const coutLigne = ing.ingredients?.prix_kg && ing.quantite ? ing.ingredients.prix_kg * ing.quantite * coef : null
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#FAF9F6' }}>
                    <td style={{ padding: '7px 12px', color: '#2C1810', fontWeight: '500', border: '0.5px solid #e8e4dc' }}>{ing.ingredients?.nom || '—'}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', color: '#2C1810', border: '0.5px solid #e8e4dc' }}>{ing.quantite}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', color: '#8B7355', border: '0.5px solid #e8e4dc' }}>{ing.unite}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', color: '#8B7355', border: '0.5px solid #e8e4dc' }}>{ing.ingredients?.prix_kg ? `${Number(ing.ingredients.prix_kg).toFixed(2)} €` : '—'}</td>
                    <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: '600', color: '#2C1810', border: '0.5px solid #e8e4dc' }}>{coutLigne ? `${coutLigne.toFixed(2)} €` : '—'}</td>
                  </tr>
                )
              })}
              <tr style={{ background: '#2C1810' }}>
                <td colSpan={4} style={{ padding: '8px 12px', color: '#C4956A', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', border: '0.5px solid #2C1810' }}>Coût total</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#C4956A', fontWeight: '700', fontSize: '14px', border: '0.5px solid #2C1810' }}>{cout.toFixed(2)} €</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── RÉCAP FINANCIER — avant instructions ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
          {[
            { label: `Coût / ${uniteLabel.slice(0, -1)}`, value: cout && fiche.nb_portions ? `${(cout / fiche.nb_portions).toFixed(2)} €` : '—' },
            { label: 'Prix HT', value: fiche.prix_ttc ? `${(fiche.prix_ttc / (1 + parseFloat(params['tva_restauration'] || 10) / 100)).toFixed(2)} €` : '—' },
            { label: 'Prix TTC', value: fiche.prix_ttc ? `${Number(fiche.prix_ttc).toFixed(2)} €` : '—' },
            {
              label: 'Food cost', value: fc ? `${fc} %` : '—',
              highlight: fc ? (fc < seuilVert ? '#EAF3DE' : fc < seuilOrange ? '#FAEEDA' : '#FCEBEB') : null,
              color: fc ? (fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D') : '#2C1810'
            }
          ].map((item, i) => (
            <div key={i} style={{ background: item.highlight || '#F0E8E0', borderRadius: '6px', padding: '10px 12px', border: '0.5px solid #e8e4dc' }}>
              <div style={{ fontSize: '9px', color: '#8B7355', textTransform: 'uppercase', letterSpacing: '1px', fontFamily: 'sans-serif', marginBottom: '4px' }}>{item.label}</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: item.color || '#2C1810', fontFamily: 'sans-serif' }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Allergènes — sur la même page que le récap */}
        {((fiche.allergenes && fiche.allergenes.length > 0) || allergenesCascade.length > 0) && (
          <div style={{ background: '#FCEBEB', borderRadius: '6px', padding: '12px', marginBottom: '16px', border: '0.5px solid #F09595' }}>
            <div style={{ fontSize: '9px', color: '#A32D2D', textTransform: 'uppercase', letterSpacing: '2px', fontFamily: 'sans-serif', fontWeight: '600', marginBottom: '8px' }}>⚠ Allergènes présents</div>
            {fiche.allergenes && fiche.allergenes.length > 0 && (
              <div style={{ fontSize: '11px', color: '#A32D2D', fontFamily: 'sans-serif', fontWeight: '500', marginBottom: allergenesCascade.filter(id => !(fiche.allergenes || []).includes(id)).length > 0 ? '6px' : '0' }}>
                {fiche.allergenes.map(id => { const a = ALLERGENES.find(a => a.id === id); return a ? `${a.emoji} ${a.label}` : null }).filter(Boolean).join('  •  ')}
              </div>
            )}
            {allergenesCascade.filter(id => !(fiche.allergenes || []).includes(id)).length > 0 && (
              <>
                <div style={{ fontSize: '8px', color: '#A32D2D', opacity: 0.7, marginBottom: '4px', fontFamily: 'sans-serif' }}>Issus des sous-fiches</div>
                <div style={{ fontSize: '11px', color: '#A32D2D', fontFamily: 'sans-serif', fontWeight: '500', opacity: 0.85 }}>
                  {allergenesCascade.filter(id => !(fiche.allergenes || []).includes(id)).map(id => { const a = ALLERGENES.find(a => a.id === id); return a ? `${a.emoji} ${a.label}` : null }).filter(Boolean).join('  •  ')}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── INSTRUCTIONS — page séparée ── */}
        {fiche.instructions && (
          <div className="print-instructions" style={{ marginBottom: '20px', pageBreakBefore: 'always', marginTop: '0' }}>
            <div style={{ fontSize: '9px', letterSpacing: '3px', textTransform: 'uppercase', color: '#8B7355', marginBottom: '10px', fontFamily: 'sans-serif', fontWeight: '600' }}>Instructions de préparation</div>
            <div style={{
              border: '0.5px solid #e8e4dc', borderRadius: '4px', padding: '14px 16px',
              fontSize: '12px', fontFamily: 'sans-serif', color: '#2C1810',
              lineHeight: '1.9', whiteSpace: 'pre-wrap'
            }}>
              {fiche.instructions}
            </div>
          </div>
        )}

        {/* Pied de page */}
        <div style={{ borderTop: '1px solid #e8e4dc', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '9px', color: '#8B7355', fontFamily: 'sans-serif' }}>
          <span>{nomEtablissement || params['nom_etablissement'] || ''} — {params['adresse'] || ''}</span>
          <span>{fiche.nom} — {fiche.saison || ''} — Imprimé le {today}</span>
        </div>
      </div>
    </div>
  )
}
