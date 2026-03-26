'use client'

import { useState, useEffect } from 'react'
import { supabase, getClientId } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { useTheme } from '../../../lib/useTheme'
import NavbarCuisine from '../../../components/NavbarCuisine'
import ChefLoader from '../../../components/ChefLoader'

export const dynamic = 'force-dynamic'
export default function ArdoisePage() {
  const router = useRouter()
  const { c } = useTheme()

  const ID_CAFE = '2aed576b-6a43-4d05-9adc-fd7dd047febc'
  const ID_RESTO = 'dc6b7c09-2bf1-4213-a48a-1c0d6b3c1c61'

  const [sites, setSites] = useState([])
  const [activeSiteId, setActiveSiteId] = useState(null)
  const [allSettings, setAllSettings] = useState([])
  const [loading, setLoading] = useState(true)
  const [modeVente, setModeVente] = useState('plat_seul')
  const [coutBoissonChaude, setCoutBoissonChaude] = useState(0)
  const [coutDessertFixe, setCoutDessertFixe] = useState(0)
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [panier, setPanier] = useState([])
  const [nomPlat, setNomPlat] = useState('')
  const [historique, setHistorique] = useState([])
  const [expandedId, setExpandedId] = useState(null)
  const [reserve, setReserve] = useState({ entree: null, plat: null })

  useEffect(() => { checkAuthAndInit() }, [])

  const checkAuthAndInit = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profils').select('role').eq('id', user?.id).single()
    if (!profile || !['admin', 'directeur', 'cuisine'].includes(profile.role)) { router.push('/'); return }
    const { data: sitesData } = await supabase.from('sites').select('*').order('nom')
    const { data: settingsData } = await supabase.from('site_settings').select('*')
    setSites(sitesData || [])
    setAllSettings(settingsData || [])
    if (sitesData && sitesData.length > 0) {
      setActiveSiteId(sitesData[0].id)
      setModeVente(sitesData[0].id === ID_RESTO ? 'formule_ep' : 'plat_seul')
      fetchHistorique(sitesData[0].id)
    }
    setLoading(false)
  }

  const fetchHistorique = async (id) => {
    const { data } = await supabase.from('journal_ardoise').select('*').eq('site_id', id).order('created_at', { ascending: false }).limit(10)
    setHistorique(data || [])
  }

  const getSetting = (cle) => parseFloat(allSettings.find(s => s.site_id === activeSiteId && s.cle === cle)?.valeur) || 0

  const getPrixVenteTTC = () => {
    if (activeSiteId === ID_CAFE) {
      if (modeVente === 'entree_seule') return 11
      if (modeVente.includes('formule')) return 21
      return 19
    }
    return 29
  }

  const ajouterIngredient = (ing) => {
    if (panier.find(i => i.id === ing.id)) return
    setPanier([...panier, { id: ing.id, nom: ing.nom, prix_u: parseFloat(ing.prix_kg) || 0, unite: ing.unite || 'unité', quantite: 0 }])
    setSearch(''); setResults([])
  }

  const mettreEnReserve = () => {
    if (panier.length === 0) return
    const type = modeVente.includes('entree') ? 'entree' : 'plat'
    setReserve({ ...reserve, [type]: { nom: nomPlat, ingredients: [...panier] } })
    alert(`${type.toUpperCase()} mis en mémoire !`)
  }

  const importerDepuisReserve = (type) => {
    const item = reserve[type]
    if (!item) return
    const nouveauxIng = item.ingredients.filter(ing => !panier.find(p => p.id === ing.id))
    setPanier([...panier, ...nouveauxIng])
    if (!nomPlat) setNomPlat('Formule du jour')
  }

  const validerArdoise = async () => {
    if (!nomPlat || (panier.length === 0 && coutDessertFixe === 0)) return alert('Contenu manquant')
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('journal_ardoise').insert([{
      site_id: activeSiteId,
      nom_plat: nomPlat,
      cout_total_matiere: totalCoutMatiere,
      prix_vente_ht: prixVenteHT,
      composition: panier,
      created_by: user.id
    }])
    if (!error) {
      alert('Enregistré !')
      setPanier([]); setNomPlat(''); setCoutDessertFixe(0); setCoutBoissonChaude(0)
      fetchHistorique(activeSiteId)
    }
  }

  const coutIngredients = panier.reduce((acc, ing) => acc + (parseFloat(ing.prix_u) * (parseFloat(ing.quantite) || 0)), 0)
  const fraisFixesBase = getSetting('cout_fixe_boisson') + getSetting('cout_fixe_dessert')
  const totalCoutMatiere = (panier.length > 0 || coutDessertFixe > 0)
    ? (coutIngredients + fraisFixesBase + parseFloat(coutBoissonChaude || 0) + parseFloat(coutDessertFixe || 0))
    : 0
  const prixVenteHT = getPrixVenteTTC() / 1.1
  const foodCost = prixVenteHT > 0 ? (totalCoutMatiere / prixVenteHT) * 100 : 0

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <ChefLoader />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <NavbarCuisine />

      <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif' }}>

        {/* SITES */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          {sites.map(s => (
            <button key={s.id} onClick={() => {
              setActiveSiteId(s.id); setPanier([])
              setModeVente(s.id === ID_RESTO ? 'formule_ep' : 'plat_seul')
              setCoutDessertFixe(0); setCoutBoissonChaude(0)
              fetchHistorique(s.id)
            }}
              style={{
                padding: '12px 24px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                backgroundColor: activeSiteId === s.id ? c.principal : '#E4E4E7',
                color: activeSiteId === s.id ? 'white' : '#71717A', fontWeight: 'bold'
              }}>
              {s.nom}
            </button>
          ))}
        </div>

        {/* MODES */}
        <div style={{ marginBottom: '30px', background: c.blanc, padding: '15px', borderRadius: '12px', border: `0.5px solid ${c.bordure}` }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {activeSiteId === ID_CAFE ? (
              ['entree_seule', 'plat_seul', 'formule_ep', 'formule_pd'].map(m => (
                <button key={m} onClick={() => { setModeVente(m); if (m !== 'formule_pd') setCoutDessertFixe(0) }}
                  style={{
                    padding: '10px 15px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    backgroundColor: modeVente === m ? c.principal : c.fond,
                    color: modeVente === m ? 'white' : '#71717A', fontWeight: 'bold'
                  }}>
                  {m === 'formule_ep' ? 'FORMULE E+P (21€)' : m === 'formule_pd' ? 'FORMULE P+D (21€)' : m.replace('_', ' ').toUpperCase()}
                </button>
              ))
            ) : (
              ['formule_ep', 'formule_pd'].map(m => (
                <button key={m} onClick={() => setModeVente(m)}
                  style={{
                    padding: '10px 15px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    backgroundColor: modeVente === m ? c.principal : c.fond,
                    color: modeVente === m ? 'white' : '#71717A', fontWeight: 'bold'
                  }}>
                  {m === 'formule_ep' ? 'E+P + BOISSON (29€)' : 'P+D + BOISSON (29€)'}
                </button>
              ))
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '30px' }}>
          <div>
            {/* ZONE DESSERT CAFÉ */}
            {activeSiteId === ID_CAFE && modeVente === 'formule_pd' && (
              <div style={{ background: '#EEF2FF', padding: '15px', borderRadius: '10px', marginBottom: '15px', border: `0.5px solid ${c.accent}40` }}>
                <span style={{ fontWeight: 'bold', fontSize: '0.9rem', marginRight: '15px' }}>DESSERT :</span>
                <button onClick={() => setCoutDessertFixe(0.76)}
                  style={{ marginRight: '10px', padding: '8px', borderRadius: '5px', border: `1px solid ${c.accent}`, backgroundColor: coutDessertFixe === 0.76 ? c.accent : 'white', color: coutDessertFixe === 0.76 ? 'white' : c.accent }}>
                  Churros (0,76€)
                </button>
                <button onClick={() => setCoutDessertFixe(0.78)}
                  style={{ padding: '8px', borderRadius: '5px', border: `1px solid ${c.accent}`, backgroundColor: coutDessertFixe === 0.78 ? c.accent : 'white', color: coutDessertFixe === 0.78 ? 'white' : c.accent }}>
                  Flan (0,78€)
                </button>
              </div>
            )}

            {/* RÉSERVE MÉMOIRE */}
            {modeVente.includes('formule') && (
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                {reserve.entree && modeVente === 'formule_ep' && (
                  <button onClick={() => importerDepuisReserve('entree')}
                    style={{ background: c.accentClair, border: `1px solid ${c.accent}`, padding: '8px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                    + Entrée ({reserve.entree.nom})
                  </button>
                )}
                {reserve.plat && (
                  <button onClick={() => importerDepuisReserve('plat')}
                    style={{ background: c.accentClair, border: `1px solid ${c.accent}`, padding: '8px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer' }}>
                    + Plat ({reserve.plat.nom})
                  </button>
                )}
              </div>
            )}

            <input type="text" placeholder="Nom du plat..." value={nomPlat} onChange={e => setNomPlat(e.target.value)}
              style={{ width: '100%', padding: '15px', borderRadius: '10px', border: `0.5px solid ${c.bordure}`, marginBottom: '15px', outline: 'none', fontSize: '14px' }}
            />

            {/* RECHERCHE INGRÉDIENTS */}
            <div style={{ position: 'relative', marginBottom: '20px' }}>
              <input type="text" placeholder="🔍 Chercher ingrédient..." value={search}
                onChange={async (e) => {
                  setSearch(e.target.value)
                  if (e.target.value.length > 1) {
                    const clientId = await getClientId()
                    if (!clientId) { setResults([]); return }
                    const { data } = await supabase
                      .from('ingredients')
                      .select('id, nom, prix_kg, unite')
                      .eq('client_id', clientId)
                      .ilike('nom', `%${e.target.value}%`)
                      .limit(5)
                    setResults(data || [])
                  } else {
                    setResults([])
                  }
                }}
                style={{ width: '100%', padding: '15px', borderRadius: '10px', border: `0.5px solid ${c.bordure}`, outline: 'none', fontSize: '14px' }}
              />
              {results.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: 'white', border: `0.5px solid ${c.bordure}`,
                  borderRadius: '10px', marginTop: '4px', overflow: 'hidden',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.1)'
                }}>
                  {results.map(ing => (
                    <div key={ing.id} onClick={() => ajouterIngredient(ing)}
                      style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: `0.5px solid ${c.bordure}`, fontSize: '14px' }}
                      onMouseEnter={e => e.currentTarget.style.background = c.fond}
                      onMouseLeave={e => e.currentTarget.style.background = 'white'}
                    >
                      {ing.nom} — {ing.prix_kg} €/{ing.unite}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* PANIER */}
            <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}` }}>
              {panier.map((ing, idx) => (
                <div key={ing.id} style={{ display: 'flex', gap: '15px', padding: '15px', borderBottom: `0.5px solid ${c.bordure}`, alignItems: 'center' }}>
                  <span style={{ flex: 1, fontWeight: '500', fontSize: '14px' }}>{ing.nom}</span>
                  <input type="number" value={ing.quantite || ''} onChange={e => {
                    const n = [...panier]; n[idx].quantite = e.target.value; setPanier(n)
                  }}
                    style={{ width: '80px', padding: '8px', borderRadius: '6px', border: `0.5px solid ${c.bordure}`, outline: 'none', textAlign: 'center' }}
                    placeholder="Qté"
                  />
                  <span style={{ width: '40px', fontSize: '12px', color: c.texteMuted }}>{ing.unite}</span>
                  <button onClick={() => setPanier(panier.filter(i => i.id !== ing.id))}
                    style={{ color: '#DC2626', border: 'none', background: 'none', cursor: 'pointer', fontSize: '18px' }}>✕</button>
                </div>
              ))}
              {panier.length === 0 && (
                <div style={{ padding: '30px', textAlign: 'center', color: c.texteMuted, fontSize: '13px' }}>
                  Recherchez des ingrédients ci-dessus
                </div>
              )}
            </div>

            {!modeVente.includes('formule') && panier.length > 0 && (
              <button onClick={mettreEnReserve}
                style={{ marginTop: '15px', background: 'none', border: `1px dashed ${c.accent}`, color: c.accent, padding: '10px', borderRadius: '8px', width: '100%', fontWeight: 'bold', cursor: 'pointer' }}>
                📦 Garder en mémoire
              </button>
            )}
          </div>

          {/* ANALYSE */}
          <div style={{ background: c.blanc, padding: '30px', borderRadius: '20px', border: `0.5px solid ${c.bordure}`, height: 'fit-content' }}>
            <h3 style={{ marginTop: 0, color: c.principal, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px' }}>Analyse</h3>
            <div style={{ margin: '15px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: c.texteMuted }}>PV HT :</span>
                <strong>{prixVenteHT.toFixed(2)} €</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: c.texteMuted }}>Coût matière :</span>
                <strong>{totalCoutMatiere.toFixed(2)} €</strong>
              </div>
            </div>
            <div style={{
              padding: '25px', borderRadius: '15px', textAlign: 'center',
              background: foodCost > 33 ? '#FEE2E2' : '#DCFCE7',
              border: `0.5px solid ${foodCost > 33 ? '#FECACA' : '#BBF7D0'}`,
              marginBottom: '20px'
            }}>
              <div style={{ fontSize: '3rem', fontWeight: '700', color: foodCost > 33 ? '#DC2626' : '#16A34A' }}>
                {foodCost.toFixed(1)}%
              </div>
              <div style={{ fontSize: '12px', color: foodCost > 33 ? '#DC2626' : '#16A34A', marginTop: '4px' }}>
                {foodCost > 33 ? '⚠️ Au-dessus du seuil' : '✓ Dans les objectifs'}
              </div>
            </div>
            <button onClick={validerArdoise}
              style={{ width: '100%', padding: '15px', background: c.accent, color: 'white', border: 'none', borderRadius: '10px', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}>
              💾 Enregistrer
            </button>
          </div>
        </div>

        {/* HISTORIQUE */}
        <div style={{ marginTop: '60px', borderTop: `0.5px solid ${c.bordure}`, paddingTop: '30px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: c.principal, marginBottom: '20px' }}>Dernières analyses</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {historique.map(item => {
              const ratio = ((item.cout_total_matiere / item.prix_vente_ht) * 100).toFixed(1)
              const isExpanded = expandedId === item.id
              return (
                <div key={item.id} style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
                  <div onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    style={{ padding: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '11px', color: c.texteMuted, marginBottom: '4px' }}>
                        {new Date(item.created_at).toLocaleDateString('fr-FR')} — {item.nom_plat}
                      </div>
                      <div style={{ fontWeight: '600', color: ratio > 33 ? '#DC2626' : '#16A34A' }}>{ratio}%</div>
                    </div>
                    <div style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: '0.3s', color: c.texteMuted }}>▼</div>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '15px', background: c.fond, borderTop: `0.5px solid ${c.bordure}` }}>
                      <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '10px', fontWeight: '600', textTransform: 'uppercase' }}>Composition :</div>
                      {item.composition?.map((ing, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '6px 0', borderBottom: `0.5px solid ${c.bordure}` }}>
                          <span>{ing.nom} ({ing.quantite} {ing.unite})</span>
                          <span style={{ fontWeight: '500' }}>{(ing.prix_u * ing.quantite).toFixed(2)} €</span>
                        </div>
                      ))}
                      <div style={{ marginTop: '10px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: c.accent }}>
                        Total : {item.cout_total_matiere.toFixed(2)} €
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {historique.length === 0 && (
              <div style={{ padding: '40px', textAlign: 'center', color: c.texteMuted, fontSize: '13px' }}>
                Aucune analyse enregistrée pour ce site
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
