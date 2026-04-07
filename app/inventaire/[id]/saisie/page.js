'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, getClientId } from '../../../../lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { useTheme } from '../../../../lib/useTheme'
import { useRole } from '../../../../lib/useRole'
import { useIsMobile } from '../../../../lib/useIsMobile'
import Navbar from '../../../../components/Navbar'
import IngredientSearch from '../../../../components/IngredientSearch'
import ChefLoader from '../../../../components/ChefLoader'

export default function SaisieInventairePage() {
  const params = useParams()
  const inventaireId = params.id
  const router = useRouter()
  const { c } = useTheme()
  const { role } = useRole()
  const isMobile = useIsMobile()

  const [inventaire, setInventaire] = useState(null)
  const [lignes, setLignes] = useState([])
  const [categories, setCategories] = useState([])
  const [allIngredients, setAllIngredients] = useState([]) // pool pour IngredientSearch
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [recherche, setRecherche] = useState('')
  const [catFiltre, setCatFiltre] = useState('tous')
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [addingIngredient, setAddingIngredient] = useState(false)
  const [validating, setValidating] = useState(false)
  const debounceTimers = useRef({})

  useEffect(() => {
    if (!role) return
    if (role !== 'admin') router.replace('/inventaire')
  }, [role, router])

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const clientId = await getClientId()
    if (!clientId) { router.push('/'); return }

    // Charger l'inventaire
    const { data: inv } = await supabase
      .from('inventaires')
      .select('*')
      .eq('id', inventaireId)
      .eq('client_id', clientId)
      .maybeSingle()

    if (!inv) { router.push('/inventaire'); return }
    if (inv.statut === 'valide') { router.push(`/inventaire/${inventaireId}`); return }
    setInventaire(inv)

    // Charger les lignes
    const { data: lig } = await supabase
      .from('inventaire_lignes')
      .select('*')
      .eq('inventaire_id', inventaireId)
      .eq('client_id', clientId)
      .order('nom_ingredient')

    setLignes(lig || [])

    // Charger les catégories pour les filtres
    const sections = inv.section === 'global' ? ['cuisine', 'bar'] : [inv.section]
    const { data: cats } = await supabase
      .from('categories_ingredients')
      .select('id, nom, emoji')
      .eq('client_id', clientId)
      .in('section', sections)
      .order('ordre')

    setCategories(cats || [])

    // Charger les mappings ingrédient → catégorie + pool pour IngredientSearch
    const pool = []
    for (const sec of sections) {
      const table = sec === 'bar' ? 'ingredients_bar' : 'ingredients'
      const { data: ings } = await supabase
        .from(table)
        .select('id, nom, unite, prix_kg, categorie_id, est_sous_fiche')
        .eq('client_id', clientId)

      if (ings) {
        const catMap = Object.fromEntries(ings.map(i => [i.id, i.categorie_id]))
        setLignes(prev => prev.map(l => ({
          ...l,
          _categorie_id: catMap[l.ingredient_id] || l._categorie_id
        })))
        // Enrichir le pool avec la section pour pouvoir retrouver le catMap plus tard
        for (const ing of ings) {
          pool.push({ ...ing, _section: sec })
        }
      }
    }
    setAllIngredients(pool)

    setLoading(false)
  }

  const saveLigne = useCallback(async (ligneId, value) => {
    setSaving(prev => ({ ...prev, [ligneId]: true }))
    const clientId = await getClientId()
    const { data: { session } } = await supabase.auth.getSession()

    await fetch('/api/inventaire/save-ligne', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        ligneId,
        quantite_reelle: value === '' ? null : Number(value),
        clientId,
      })
    })

    setSaving(prev => ({ ...prev, [ligneId]: false }))
  }, [])

  const handleQuantiteChange = (ligneId, value) => {
    setLignes(prev => prev.map(l =>
      l.id === ligneId ? { ...l, quantite_reelle: value === '' ? null : Number(value) } : l
    ))

    if (debounceTimers.current[ligneId]) {
      clearTimeout(debounceTimers.current[ligneId])
    }
    debounceTimers.current[ligneId] = setTimeout(() => {
      saveLigne(ligneId, value)
    }, 500)
  }

  const handleValider = async () => {
    if (!window.confirm('Valider définitivement cet inventaire ? Cette action est irréversible.')) return
    setValidating(true)
    try {
      const clientId = await getClientId()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/inventaire/valider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ inventaireId, clientId })
      })
      if (res.ok) {
        router.push(`/inventaire/${inventaireId}`)
      } else {
        const json = await res.json()
        alert(json.error || 'Erreur lors de la validation.')
        setValidating(false)
      }
    } catch {
      alert('Erreur réseau.')
      setValidating(false)
    }
  }

  const handleAddIngredient = async (ingredientId) => {
    if (!ingredientId || addingIngredient) return
    setAddingIngredient(true)
    try {
      const clientId = await getClientId()
      const { data: { session } } = await supabase.auth.getSession()
      const ingMeta = allIngredients.find(i => i.id === ingredientId)
      const section = ingMeta?._section || (inventaire?.section === 'bar' ? 'bar' : 'cuisine')
      const res = await fetch('/api/inventaire/add-ligne', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ inventaireId, ingredientId, clientId, section })
      })
      const ligne = await res.json()
      if (res.ok && ligne?.id) {
        setLignes(prev => [...prev, { ...ligne, _categorie_id: ingMeta?.categorie_id || null }])
        setShowAddPanel(false)
      } else {
        alert(ligne?.error || 'Erreur lors de l\'ajout.')
      }
    } finally {
      setAddingIngredient(false)
    }
  }

  // Filtrer les lignes
  const filteredLignes = lignes.filter(l => {
    if (recherche && !l.nom_ingredient.toLowerCase().includes(recherche.toLowerCase())) return false
    if (catFiltre !== 'tous' && l._categorie_id !== catFiltre) return false
    return true
  })

  // Pool pour le dropdown (exclure ceux déjà dans l'inventaire)
  const alreadyPresentIds = new Set(lignes.map(l => l.ingredient_id).filter(Boolean))
  const availableToAdd = allIngredients.filter(i => !alreadyPresentIds.has(i.id))

  const nbSaisis = lignes.filter(l => l.quantite_reelle != null).length
  const nbTotal = lignes.length
  const pctProgress = nbTotal > 0 ? Math.round((nbSaisis / nbTotal) * 100) : 0

  if (loading) return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <ChefLoader />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section={inventaire?.section === 'bar' ? 'bar' : 'cuisine'} />

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '700px', margin: '0 auto' }}>

        {/* Header + Progression */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <button
              onClick={() => router.push('/inventaire')}
              style={{ background: 'none', border: 'none', color: c.texteMuted, fontSize: '13px', cursor: 'pointer', padding: 0 }}
            >
              ← Inventaires
            </button>
            <span style={{ fontSize: '13px', color: c.texteMuted }}>
              {inventaire?.type === 'tournant' ? 'Flash' : 'Complet'} — {inventaire?.section}
            </span>
          </div>

          {/* Barre de progression */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ flex: 1, height: '6px', background: c.bordure, borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{
                width: `${pctProgress}%`, height: '100%',
                background: pctProgress === 100 ? '#16A34A' : c.accent,
                borderRadius: '3px', transition: 'width 0.3s'
              }} />
            </div>
            <span style={{ fontSize: '13px', fontWeight: '500', color: c.texte, whiteSpace: 'nowrap' }}>
              {nbSaisis}/{nbTotal}
            </span>
          </div>
        </div>

        {/* Filtres catégorie (pills scrollables) */}
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '8px', marginBottom: '12px', WebkitOverflowScrolling: 'touch' }}>
          <button
            onClick={() => setCatFiltre('tous')}
            style={{
              padding: '6px 12px', borderRadius: '20px', fontSize: '12px', whiteSpace: 'nowrap',
              border: `0.5px solid ${catFiltre === 'tous' ? c.accent : c.bordure}`,
              background: catFiltre === 'tous' ? c.accentClair : c.blanc,
              color: catFiltre === 'tous' ? c.accent : c.texteMuted,
              cursor: 'pointer', flexShrink: 0
            }}
          >
            Tous
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCatFiltre(cat.id)}
              style={{
                padding: '6px 12px', borderRadius: '20px', fontSize: '12px', whiteSpace: 'nowrap',
                border: `0.5px solid ${catFiltre === cat.id ? c.accent : c.bordure}`,
                background: catFiltre === cat.id ? c.accentClair : c.blanc,
                color: catFiltre === cat.id ? c.accent : c.texteMuted,
                cursor: 'pointer', flexShrink: 0
              }}
            >
              {cat.emoji} {cat.nom}
            </button>
          ))}
        </div>

        {/* Recherche */}
        <input
          type="text"
          placeholder="Rechercher un ingrédient..."
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: '10px',
            border: `0.5px solid ${c.bordure}`, fontSize: '14px',
            outline: 'none', color: c.texte, background: c.blanc,
            marginBottom: '12px', boxSizing: 'border-box'
          }}
        />

        {/* Liste des lignes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filteredLignes.map(ligne => {
            const ecart = ligne.quantite_reelle != null && ligne.quantite_theorique != null
              ? ligne.quantite_reelle - ligne.quantite_theorique
              : null
            const ecartPct = ecart != null && ligne.quantite_theorique
              ? Math.abs(ecart / ligne.quantite_theorique) * 100
              : null
            const ecartColor = ecartPct == null ? c.texteMuted
              : ecartPct < 5 ? '#16A34A'
              : ecartPct < 15 ? '#D97706'
              : '#DC2626'

            return (
              <div
                key={ligne.id}
                style={{
                  padding: '14px 16px', background: c.blanc,
                  border: `0.5px solid ${c.bordure}`, borderRadius: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: '14px', fontWeight: '500', color: c.texte }}>
                      {ligne.nom_ingredient}
                    </span>
                    {ligne.est_critique && (
                      <span style={{ fontSize: '10px', background: '#FEF3C7', color: '#92400E', padding: '1px 6px', borderRadius: '10px', marginLeft: '8px' }}>
                        Pareto
                      </span>
                    )}
                  </div>
                  {saving[ligne.id] && (
                    <span style={{ fontSize: '10px', color: c.texteMuted }}>...</span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {ligne.quantite_theorique != null && (
                    <div style={{ fontSize: '12px', color: c.texteMuted }}>
                      Théo : {Number(ligne.quantite_theorique).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} {ligne.unite}
                    </div>
                  )}

                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={ligne.quantite_reelle ?? ''}
                      onChange={e => handleQuantiteChange(ligne.id, e.target.value)}
                      placeholder="—"
                      style={{
                        width: '80px', padding: '8px 10px', borderRadius: '8px',
                        border: `1px solid ${ligne.quantite_reelle != null ? c.accent : c.bordure}`,
                        fontSize: '15px', fontWeight: '500', textAlign: 'right',
                        outline: 'none', color: c.texte, background: c.blanc,
                      }}
                    />
                    <span style={{ fontSize: '13px', color: c.texteMuted, minWidth: '24px' }}>
                      {ligne.unite}
                    </span>
                  </div>
                </div>

                {ecart != null && (
                  <div style={{ fontSize: '11px', color: ecartColor, marginTop: '4px', textAlign: 'right' }}>
                    {ecart > 0 ? '+' : ''}{ecart.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} {ligne.unite}
                    {ecartPct != null && ` (${ecartPct.toFixed(0)}%)`}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {filteredLignes.length === 0 && !showAddPanel && (
          <div style={{ padding: '30px', textAlign: 'center', color: c.texteMuted, fontSize: '13px' }}>
            {recherche ? 'Aucun ingrédient trouvé.' : 'Aucune ligne dans cet inventaire.'}
          </div>
        )}

        {/* Ajouter un ingrédient manquant */}
        <div style={{ marginTop: '12px' }}>
          {!showAddPanel ? (
            <button
              onClick={() => setShowAddPanel(true)}
              style={{
                width: '100%', padding: '12px',
                border: `1px dashed ${c.bordure}`, borderRadius: '12px',
                background: 'transparent', color: c.texteMuted,
                fontSize: '13px', cursor: 'pointer',
              }}
            >
              + Ajouter un ingrédient manquant
            </button>
          ) : (
            <div style={{
              padding: '14px 16px', background: c.blanc,
              border: `0.5px solid ${c.accent}`, borderRadius: '12px',
            }}>
              <div style={{ fontSize: '13px', fontWeight: '500', color: c.texte, marginBottom: '8px' }}>
                Ajouter un ingrédient
              </div>
              <IngredientSearch
                ingredients={availableToAdd}
                value={null}
                onChange={handleAddIngredient}
                placeholder="Rechercher un ingrédient à ajouter..."
              />
              {addingIngredient && (
                <div style={{ fontSize: '12px', color: c.texteMuted, marginTop: '6px' }}>Ajout en cours...</div>
              )}
              <button
                onClick={() => setShowAddPanel(false)}
                style={{ marginTop: '8px', background: 'none', border: 'none', color: c.texteMuted, fontSize: '12px', cursor: 'pointer', padding: 0 }}
              >
                Annuler
              </button>
            </div>
          )}
        </div>

        {/* Actions sticky */}
        <div style={{ position: 'sticky', bottom: '16px', padding: '12px 0', marginTop: '16px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => router.push('/inventaire')}
              style={{
                flex: 1, padding: '14px', background: c.blanc,
                border: `0.5px solid ${c.bordure}`, borderRadius: '12px',
                color: c.texte, fontSize: '14px', cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
              }}
            >
              Enregistrer et quitter
            </button>
            <button
              onClick={handleValider}
              disabled={validating}
              style={{
                flex: 2, padding: '14px', background: '#16A34A',
                color: 'white', border: 'none', borderRadius: '12px',
                fontSize: '14px', fontWeight: '500',
                cursor: validating ? 'not-allowed' : 'pointer',
                opacity: validating ? 0.7 : 1,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
              }}
            >
              {validating ? 'Validation...' : 'Valider l\'inventaire →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
