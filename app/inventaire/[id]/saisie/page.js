'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase, getClientId, fetchAllRows } from '../../../../lib/supabase'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
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
  const searchParams = useSearchParams()
  const { c } = useTheme()
  const { role } = useRole()
  const isMobile = useIsMobile()

  // Préserve le contexte ?section= (bar / cuisine) entre les pages
  // inventaire pour que la navbar reste cohérente.
  const sectionParam = searchParams.get('section')
  const queryString = sectionParam === 'bar' || sectionParam === 'cuisine' ? `?section=${sectionParam}` : ''

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
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const debounceTimers = useRef({})

  useEffect(() => {
    if (!role) return
    if (role !== 'admin' && role !== 'cuisine' && role !== 'bar') router.replace('/inventaire')
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

    if (!inv) { router.push(`/inventaire${queryString}`); return }
    if (inv.statut === 'valide') { router.push(`/inventaire/${inventaireId}${queryString}`); return }
    setInventaire(inv)

    // Charger les lignes (pagination au-delà du plafond PostgREST de 1000)
    const lig = await fetchAllRows((from, to) =>
      supabase
        .from('inventaire_lignes')
        .select('*')
        .eq('inventaire_id', inventaireId)
        .eq('client_id', clientId)
        .order('nom_ingredient')
        .order('id')
        .range(from, to)
    )

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
        router.push(`/inventaire/${inventaireId}${queryString}`)
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

  // Met à jour l'inventaire avec les articles créés depuis qu'il a démarré
  // (ex : nouveaux ingrédients issus d'une facture). Recharge le pool frais
  // puis ajoute comme nouvelles lignes les ingrédients de la/les section(s)
  // qui ne sont pas encore dans l'inventaire. Les sous-fiches sont exclues.
  const handleSyncArticles = async () => {
    if (syncing || !inventaire) return
    setSyncing(true)
    setSyncMsg('')
    try {
      const clientId = await getClientId()
      const { data: { session } } = await supabase.auth.getSession()
      const sections = inventaire.section === 'global' ? ['cuisine', 'bar'] : [inventaire.section]

      // Recharge le pool d'ingrédients (frais) pour la/les section(s).
      const pool = []
      for (const sec of sections) {
        const table = sec === 'bar' ? 'ingredients_bar' : 'ingredients'
        const { data: ings } = await supabase
          .from(table)
          .select('id, nom, unite, prix_kg, categorie_id, est_sous_fiche')
          .eq('client_id', clientId)
        if (ings) for (const ing of ings) pool.push({ ...ing, _section: sec })
      }
      setAllIngredients(pool)

      // Articles déjà présents dans l'inventaire.
      const presentIds = new Set(lignes.map(l => l.ingredient_id).filter(Boolean))
      const toAdd = pool.filter(i => !i.est_sous_fiche && !presentIds.has(i.id))

      if (toAdd.length === 0) {
        setSyncMsg('Aucun nouvel article à ajouter — l\'inventaire est à jour.')
        return
      }

      // Ajoute les lignes manquantes (par lots pour limiter les requêtes).
      const added = []
      const CHUNK = 10
      for (let i = 0; i < toAdd.length; i += CHUNK) {
        const batch = toAdd.slice(i, i + CHUNK)
        const results = await Promise.all(batch.map(async (ing) => {
          const res = await fetch('/api/inventaire/add-ligne', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
            body: JSON.stringify({ inventaireId, ingredientId: ing.id, clientId, section: ing._section }),
          })
          if (!res.ok) return null
          const ligne = await res.json()
          return ligne?.id ? { ...ligne, _categorie_id: ing.categorie_id || null } : null
        }))
        for (const r of results) if (r) added.push(r)
      }

      if (added.length > 0) {
        setLignes(prev => {
          const existing = new Set(prev.map(l => l.id))
          return [...prev, ...added.filter(a => !existing.has(a.id))]
        })
      }
      setSyncMsg(`${added.length} article${added.length > 1 ? 's' : ''} ajouté${added.length > 1 ? 's' : ''} à l'inventaire.`)
    } catch (e) {
      setSyncMsg('Erreur lors de la mise à jour : ' + (e.message || ''))
    } finally {
      setSyncing(false)
    }
  }

  // Export Excel de l'inventaire en cours de saisie. On recalcule l'écart et
  // la valeur de stock à la volée car les colonnes générées par Postgres
  // (ecart, valeur_stock) ne reflètent pas les quantités tout juste tapées
  // (sauvegarde debouncée, état local non rechargé).
  const exportXlsx = () => {
    if (lignes.length === 0) return
    const header = [
      'Ingrédient', 'Unité', 'Prix unitaire (€)',
      'Qté théorique', 'Qté réelle', 'Écart',
      'Écart valorisé (€)', 'Valeur stock (€)',
    ]
    const rows = lignes.map(l => {
      const cout = l.cout_unitaire != null ? Number(l.cout_unitaire) : null
      const theo = l.quantite_theorique != null ? Number(l.quantite_theorique) : null
      const reelle = l.quantite_reelle != null ? Number(l.quantite_reelle) : null
      const ecart = reelle != null && theo != null ? +(reelle - theo).toFixed(3) : null
      const valeur = reelle != null && cout != null ? +(reelle * cout).toFixed(2) : null
      return [
        l.nom_ingredient || '',
        l.unite || '',
        cout,
        theo,
        reelle,
        ecart,
        ecart != null && cout != null ? +(ecart * cout).toFixed(2) : null,
        valeur,
      ]
    })
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    ws['!cols'] = [
      { wch: 32 }, { wch: 10 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 10 },
      { wch: 16 }, { wch: 14 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inventaire')
    const safeDate = (inventaire?.date_inventaire || '').slice(0, 10) || 'sans-date'
    const safeSection = (inventaire?.section || 'inventaire').replace(/[^a-z0-9-]/gi, '-').toLowerCase()
    XLSX.writeFile(wb, `inventaire_${safeSection}_${safeDate}_en-cours.xlsx`)
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
      <Navbar section={sectionParam === 'bar' ? 'bar' : 'cuisine'} />
      <ChefLoader />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section={sectionParam === 'bar' ? 'bar' : sectionParam === 'cuisine' ? 'cuisine' : (inventaire?.section === 'bar' ? 'bar' : 'cuisine')} />

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '700px', margin: '0 auto' }}>

        {/* Header + Progression */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <button
              onClick={() => router.push(`/inventaire${queryString}`)}
              style={{ background: 'none', border: 'none', color: c.texteMuted, fontSize: '13px', cursor: 'pointer', padding: 0 }}
            >
              ← Inventaires
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                onClick={handleSyncArticles}
                disabled={syncing}
                title="Ajouter les articles créés depuis le démarrage de l'inventaire (ex : nouveaux ingrédients d'une facture)"
                style={{
                  padding: '6px 12px', background: c.accentClair,
                  border: `0.5px solid ${c.accent}40`, color: c.accent,
                  borderRadius: '20px', fontSize: '12px', fontWeight: '500',
                  cursor: syncing ? 'not-allowed' : 'pointer',
                  opacity: syncing ? 0.6 : 1, whiteSpace: 'nowrap',
                }}
              >
                {syncing ? '⏳ Mise à jour…' : '🔄 Mettre à jour les articles'}
              </button>
              <button
                onClick={exportXlsx}
                disabled={lignes.length === 0}
                title="Exporter l'inventaire en cours au format Excel"
                style={{
                  padding: '6px 12px', background: c.blanc,
                  border: `0.5px solid ${c.bordure}`, color: c.texte,
                  borderRadius: '20px', fontSize: '12px', fontWeight: '500',
                  cursor: lignes.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: lignes.length === 0 ? 0.5 : 1, whiteSpace: 'nowrap',
                }}
              >
                📤 Export Excel
              </button>
              <span style={{ fontSize: '13px', color: c.texteMuted, whiteSpace: 'nowrap' }}>
                {inventaire?.type === 'tournant' ? 'Flash' : 'Complet'} — {inventaire?.section}
              </span>
            </div>
          </div>

          {syncMsg && (
            <div style={{ fontSize: '12px', color: c.texteMuted, marginTop: '6px' }}>
              {syncMsg}
            </div>
          )}

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
              onClick={() => router.push(`/inventaire${queryString}`)}
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
