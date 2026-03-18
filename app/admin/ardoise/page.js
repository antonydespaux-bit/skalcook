'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { c } from '@/lib/theme' 
import { useRouter } from 'next/navigation'

export default function ArdoisePage() {
  const router = useRouter()
  const [sites, setSites] = useState([])
  const [activeSiteId, setActiveSiteId] = useState(null)
  const [allSettings, setAllSettings] = useState([])
  const [loading, setLoading] = useState(true)

  // États pour la création de plat
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [panier, setPanier] = useState([])
  const [nomPlat, setNomPlat] = useState('')
  const [typePlat, setTypePlat] = useState('plat')
  const [historique, setHistorique] = useState([])

  useEffect(() => {
    checkAuthAndInit()
  }, [])

  const checkAuthAndInit = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    
    // 1. Sécurité : Vérification du rôle
    const { data: profile } = await supabase
      .from('profils')
      .select('role')
      .eq('id', user?.id)
      .single()

    const rolesAutorises = ['admin', 'directeur', 'cuisine']
    if (!profile || !rolesAutorises.includes(profile.role)) {
      alert("Accès réservé aux administrateurs et chefs.")
      router.push('/')
      return
    }

    // 2. Chargement des données (Sites + Settings)
    const { data: sitesData } = await supabase.from('sites').select('*').order('nom')
    const { data: settingsData } = await supabase.from('site_settings').select('*')
    
    setSites(sitesData)
    setAllSettings(settingsData)
    
    if (sitesData.length > 0) {
      const firstSite = sitesData[0].id
      setActiveSiteId(firstSite)
      fetchHistorique(firstSite)
    }
    setLoading(false)
  }

  // --- LOGIQUE MÉTIER ---

  const fetchHistorique = async (siteId) => {
    const { data } = await supabase
      .from('journal_ardoise')
      .select('*')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .limit(5)
    setHistorique(data || [])
  }

  const getSetting = (cle) => {
    const val = allSettings.find(s => s.site_id === activeSiteId && s.cle === cle)?.valeur
    return parseFloat(val) || 0
  }

  const handleSearch = async (val) => {
    setSearch(val)
    if (val.length < 2) return setResults([])
    
    const { data } = await supabase
      .from('ingredients')
      .select('id, nom, prix_kg, unite')
      .ilike('nom', `%${val}%`)
      .limit(5)
    setResults(data || [])
  }

  const ajouterIngredient = (ing) => {
    if (panier.find(i => i.id === ing.id)) return alert("Déjà dans la liste")
    
    setPanier([...panier, { 
      id: ing.id, 
      nom: ing.nom, 
      prix_u: parseFloat(ing.prix_kg) || 0,
      unite: ing.unite || 'unité',
      quantite: 0 
    }])
    setSearch(''); setResults([])
  }

  const supprimerIngredient = (id) => setPanier(panier.filter(i => i.id !== id))

// --- CALCULS DE COÛT MATIÈRE (Food Cost) ---
  const coutIngredients = panier.reduce((acc, ing) => {
    const qte = parseFloat(ing.quantite) || 0
    const pu = parseFloat(ing.prix_u) || 0
    return acc + (pu * qte)
  }, 0)

  // On n'applique le coût fixe QUE si le panier contient au moins un ingrédient
  const aDesIngredients = panier.length > 0
  const coutFixeBase = getSetting('cout_fixe_boisson') + getSetting('cout_fixe_dessert')
  const coutFixe = aDesIngredients ? coutFixeBase : 0
  
  const coutTotalMatiere = coutIngredients + coutFixe
  
  const prixVenteTTC = getSetting('prix_formule_midi')
  const prixVenteHT = prixVenteTTC / 1.1 
  const ratioFoodCost = prixVenteHT > 0 ? (coutTotalMatiere / prixVenteHT) * 100 : 0

  const validerArdoise = async () => {
    if (!nomPlat) return alert("Nom du plat obligatoire")
    if (panier.length === 0) return alert("Ajoutez des ingrédients")

    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase.from('journal_ardoise').insert([{
      site_id: activeSiteId,
      type_plat: typePlat,
      nom_plat: nomPlat,
      cout_total_matiere: coutTotalMatiere,
      prix_vente_ht: prixVenteHT,
      composition: panier,
      created_by: user.id
    }])

    if (!error) {
      alert("✅ Plat enregistré avec succès !")
      setPanier([]); setNomPlat('');
      fetchHistorique(activeSiteId)
    }
  }

  if (loading) return <p style={{ padding: '20px' }}>Chargement du module cuisine...</p>

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'sans-serif', backgroundColor: '#fcfcfc', minHeight: '100vh' }}>
      <h1 style={{ color: c.primary, marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        🍳 Programmation Ardoise
      </h1>

      {/* --- SÉLECTEUR DE RESTAURANT --- */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '30px' }}>
        {sites.map(site => (
          <button key={site.id} 
            onClick={() => {setActiveSiteId(site.id); setPanier([]); fetchHistorique(site.id);}}
            style={{
              padding: '12px 24px', borderRadius: '10px', border: 'none', cursor: 'pointer',
              backgroundColor: activeSiteId === site.id ? c.primary : '#eee',
              color: activeSiteId === site.id ? 'white' : '#666', fontWeight: 'bold', transition: '0.3s',
              boxShadow: activeSiteId === site.id ? '0 4px 10px rgba(0,0,0,0.1)' : 'none'
            }}>
            {site.nom}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '30px' }}>
        
        {/* --- CONSTRUCTION DU PLAT --- */}
        <div>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <select value={typePlat} onChange={(e) => setTypePlat(e.target.value)} 
              style={{ padding: '12px', borderRadius: '8px', border: `1px solid ${c.border}`, background: 'white', fontWeight: 'bold' }}>
              <option value="entree">ENTRÉE DU JOUR</option>
              <option value="plat">PLAT DU JOUR</option>
              <option value="dessert">DESSERT DU JOUR</option>
            </select>
            <input type="text" placeholder="Nom du plat (ex: Pavé de cabillaud à l'oseille)" value={nomPlat} onChange={(e) => setNomPlat(e.target.value)}
              style={{ flex: 1, padding: '12px', borderRadius: '8px', border: `1px solid ${c.border}`, fontSize: '1.1rem' }} />
          </div>

          <div style={{ position: 'relative' }}>
            <input type="text" placeholder="🔍 Rechercher un ingrédient dans la base..." value={search} onChange={(e) => handleSearch(e.target.value)}
              style={{ width: '100%', padding: '15px', borderRadius: '8px', border: `2px solid ${c.primary}22`, fontSize: '1rem' }} />
            
            {results.length > 0 && (
              <div style={{ position: 'absolute', width: '100%', background: 'white', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', zIndex: 100, borderRadius: '8px', marginTop: '5px' }}>
                {results.map(r => (
                  <div key={r.id} onClick={() => ajouterIngredient(r)} 
                    style={{ padding: '12px', cursor: 'pointer', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', hover: {background: '#f8f8f8'} }}>
                    <span>{r.nom}</span>
                    <span style={{ color: c.accent, fontWeight: 'bold' }}>{parseFloat(r.prix_kg).toFixed(2)}€ / {r.unite}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: '25px' }}>
            {panier.map((ing, index) => (
              <div key={ing.id} style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', background: 'white', borderRadius: '12px', marginBottom: '10px', border: '1px solid #eee', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
                <span style={{ flex: 1, fontWeight: '600', color: c.primary }}>{ing.nom}</span>
                <input type="number" placeholder="Qté" value={ing.quantite || ''} 
                  onChange={(e) => {
                    const newPanier = [...panier]; 
                    newPanier[index].quantite = e.target.value; 
                    setPanier(newPanier);
                  }} 
                  style={{ width: '90px', padding: '10px', borderRadius: '8px', border: `1px solid #ddd`, textAlign: 'center' }} 
                />
                <span style={{ width: '40px', color: '#888', fontSize: '0.9rem' }}>{ing.unite}</span>
                <span style={{ width: '80px', textAlign: 'right', fontWeight: 'bold', color: c.primary }}>{( (parseFloat(ing.prix_u) || 0) * (parseFloat(ing.quantite) || 0) ).toFixed(2)}€</span>
                <button onClick={() => supprimerIngredient(ing.id)} style={{ border: 'none', background: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* --- RÉCAPITULATIF FINANCIER --- */}
        <div style={{ background: '#fff', padding: '25px', borderRadius: '20px', border: `1px solid ${c.border}`, height: 'fit-content', position: 'sticky', top: '20px', boxShadow: '0 10px 30px rgba(0,0,0,0.05)' }}>
          <h3 style={{ marginTop: 0, borderBottom: '1px solid #eee', paddingBottom: '15px', color: c.primary }}>Analyse du coût</h3>
          
          <div style={{ margin: '20px 0', fontSize: '0.95rem', color: '#555' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span>Prix de Vente HT</span>
              <span style={{ fontWeight: '600' }}>{prixVenteHT.toFixed(2)} €</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span>Total Matières</span>
              <span style={{ fontWeight: '600' }}>{coutTotalMatiere.toFixed(2)} €</span>
            </div>
          </div>

          <div style={{ background: ratioFoodCost > 35 ? '#fff5f5' : '#f0fdf4', padding: '25px', borderRadius: '15px', textAlign: 'center', margin: '25px 0', border: ratioFoodCost > 35 ? '1px solid #feb2b2' : '1px solid #bbf7d0' }}>
            <div style={{ fontSize: '0.85rem', color: '#666', fontWeight: 'bold', marginBottom: '5px', textTransform: 'uppercase' }}>Coût Matière %</div>
            <div style={{ 
              fontSize: '3.2rem', 
              fontWeight: '900', 
              color: ratioFoodCost > 35 ? '#e53e3e' : '#22c55e' 
            }}>
                {ratioFoodCost.toFixed(1)}%
            </div>
            <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '8px' }}>
              {ratioFoodCost > 35 ? '⚠️ Trop élevé ! Revoir la recette' : '✅ Excellent ratio'}
            </div>
          </div>

          <button onClick={validerArdoise}
            style={{ width: '100%', padding: '20px', borderRadius: '12px', border: 'none', backgroundColor: c.primary, color: 'white', fontWeight: 'bold', fontSize: '1.1rem', cursor: 'pointer', transition: '0.2s', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>
            💾 Valider l'Ardoise
          </button>
        </div>
      </div>

      {/* --- HISTORIQUE DES 5 DERNIERS --- */}
      <div style={{ marginTop: '70px', borderTop: `2px solid #eee`, paddingTop: '40px' }}>
        <h2 style={{ color: c.primary, marginBottom: '25px', fontSize: '1.5rem' }}>Derniers plats enregistrés</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '20px' }}>
          {historique.map(item => {
            const fc = ((item.cout_total_matiere / item.prix_vente_ht) * 100).toFixed(1)
            return (
              <div key={item.id} style={{ background: '#fff', padding: '20px', borderRadius: '15px', border: '1px solid #eee', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                <div style={{ fontSize: '0.7rem', color: c.accent, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '10px' }}>
                  {item.type_plat} • {new Date(item.created_at).toLocaleDateString('fr-FR')}
                </div>
                <div style={{ fontWeight: 'bold', marginBottom: '15px', height: '40px', color: c.primary, overflow: 'hidden' }}>{item.nom_plat}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f9f9f9', paddingTop: '12px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: '#999' }}>Food Cost :</span>
                  <span style={{ fontWeight: 'bold', color: parseFloat(fc) > 35 ? '#e53e3e' : '#22c55e' }}>{fc}%</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
