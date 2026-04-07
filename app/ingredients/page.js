'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase, getClientId } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { useIsMobile } from '../../lib/useIsMobile'
import { useTheme } from '../../lib/useTheme'
import { useRole } from '../../lib/useRole'
import { log } from '../../lib/useLog'
import Navbar from '../../components/Navbar'
import Pagination from '../../components/Pagination'
import ChefLoader from '../../components/ChefLoader'

const PAGE_SIZE = 30

const UNITES = ['kg', 'g', 'L', 'cl', 'ml', 'u', 'botte', 'pièce']

export default function IngredientsPage() {
  const [ingredients, setIngredients] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [filtreCategorie, setFiltreCategorie] = useState('toutes')
  const [filterUsage, setFilterUsage] = useState('all') // 'all' | 'used' | 'unused' | 'uncategorized'
  const [vue, setVue] = useState('liste') // 'liste' | 'categories' | 'inflation'
  const [selection, setSelection] = useState([])
  const [supprimant, setSupprimant] = useState(false)
  const [saving, setSaving] = useState(false)
  const [page, setPage] = useState(1)

  // Formulaire ajout ingrédient
  const [ajoutVisible, setAjoutVisible] = useState(false)
  const [nouveauNom, setNouveauNom] = useState('')
  const [nouveauPrix, setNouveauPrix] = useState('')
  const [nouvelleUnite, setNouvelleUnite] = useState('kg')
  const [nouvelleCategorie, setNouvelleCategorie] = useState('')

  // Formulaire ajout catégorie
  const [ajoutCatVisible, setAjoutCatVisible] = useState(false)
  const [nouvelleCatNom, setNouvelleCatNom] = useState('')
  const [nouvelleCatEmoji, setNouvelleCatEmoji] = useState('📦')
  const [savingCat, setSavingCat] = useState(false)

  // Edition inline ingrédient
  const [editionId, setEditionId] = useState(null)
  const [editionPrix, setEditionPrix] = useState('')
  const [editionCategorie, setEditionCategorie] = useState('')

  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()
  const { role, loading: roleLoading } = useRole()

  const peutModifier = role === 'admin' || role === 'cuisine'

  useEffect(() => {
    checkUser()
    loadAll()
  }, [])

  useEffect(() => {
    if (!roleLoading && role && !['admin', 'cuisine', 'directeur'].includes(role)) {
      router.push(role === 'bar' ? '/bar/dashboard' : '/dashboard')
    }
  }, [role, roleLoading])

  const checkUser = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) router.push('/')
    } catch { router.push('/') }
  }

  const loadAll = async () => {
    try {
      setLoading(true)
      const clientId = await getClientId()
      if (!clientId) { router.push('/'); return }

      const [{ data: ings, error: errIngs }, { data: cats, error: errCats }] = await Promise.all([
        supabase.from('ingredients')
          .select('*, categories_ingredients(id, nom, emoji), fiche_ingredients(id)')
          .eq('client_id', clientId)
          .eq('est_sous_fiche', false)
          .order('nom')
          .limit(5000),
        supabase.from('categories_ingredients')
          .select('*')
          .eq('client_id', clientId)
          .order('ordre')
      ])

      if (errIngs) throw errIngs
      if (errCats) throw errCats

      setIngredients(ings || [])
      setCategories(cats || [])
      setSelection([])
    } catch (err) {
      console.error('Load error:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── Filtres ──────────────────────────────────────────────────────────────
  const ingredientsFiltres = useMemo(() => ingredients.filter(i => {
    const matchRecherche = i.nom.toLowerCase().includes(recherche.toLowerCase())
    let matchCat = false
    if (filtreCategorie === 'toutes') {
      matchCat = true
    } else if (filtreCategorie === 'sans_categorie') {
      matchCat = i.categorie_id === null || i.categorie_id === undefined || i.categorie_id === ''
    } else {
      matchCat = i.categorie_id === filtreCategorie
    }
    const isUsed = Array.isArray(i.fiche_ingredients) && i.fiche_ingredients.length > 0
    const isUncategorized = i.categorie_id == null
    const matchUsage =
      filterUsage === 'all' ||
      (filterUsage === 'used' ? isUsed : false) ||
      (filterUsage === 'unused' ? !isUsed : false) ||
      (filterUsage === 'uncategorized' ? isUncategorized : false)
    return matchRecherche && matchCat && matchUsage
  }), [ingredients, recherche, filtreCategorie, filterUsage])

  // Remettre à la page 1 quand les filtres changent
  useEffect(() => { setPage(1) }, [recherche, filtreCategorie, filterUsage])

  const totalPages = Math.max(1, Math.ceil(ingredientsFiltres.length / PAGE_SIZE))
  const ingredientsPagines = useMemo(
    () => ingredientsFiltres.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [ingredientsFiltres, page]
  )

  // ── Stats inflation par catégorie ─────────────────────────────────────────
  const statsParCategorie = useMemo(() => {
    return categories.map(cat => {
      const ings = ingredients.filter(i => i.categorie_id === cat.id && i.prix_kg > 0)
      if (ings.length === 0) return { ...cat, nb: 0, prixMoyen: 0, prixMin: 0, prixMax: 0 }
      const prix = ings.map(i => Number(i.prix_kg))
      return {
        ...cat,
        nb: ings.length,
        prixMoyen: prix.reduce((a, b) => a + b, 0) / prix.length,
        prixMin: Math.min(...prix),
        prixMax: Math.max(...prix),
      }
    }).filter(s => s.nb > 0)
  }, [categories, ingredients])

  const sansCategorie = useMemo(() =>
    ingredients.filter(i => !i.categorie_id && i.prix_kg > 0),
    [ingredients]
  )

  // ── Sélection ─────────────────────────────────────────────────────────────
  const toggleSelection = (id) => setSelection(prev =>
    prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
  )
  const toggleTout = () => setSelection(
    selection.length === ingredientsFiltres.length ? [] : ingredientsFiltres.map(i => i.id)
  )

  // ── Suppression ───────────────────────────────────────────────────────────
  const supprimerSelection = async () => {
    if (!confirm(`Supprimer ${selection.length} ingrédient${selection.length > 1 ? 's' : ''} ? Action irréversible.`)) return
    setSupprimant(true)
    try {
      const clientId = await getClientId()
      const { error } = await supabase.from('ingredients').delete().in('id', selection).eq('client_id', clientId)
      if (error) throw error
      await log({ action: 'SUPPRESSION', entite: 'ingredient', entite_nom: `${selection.length} ingrédients`, section: 'cuisine', details: `IDs: ${selection.join(', ')}` })
      await loadAll()
    } catch (err) {
      console.error('Delete error:', err)
      alert('Erreur lors de la suppression')
    } finally { setSupprimant(false) }
  }

  // ── Ajout ingrédient ──────────────────────────────────────────────────────
  const ajouterIngredient = async () => {
    if (!nouveauNom.trim()) return
    setSaving(true)
    try {
      const clientId = await getClientId()
      if (!clientId) return
      const { error } = await supabase.from('ingredients').insert([{
        nom: nouveauNom.trim(),
        prix_kg: nouveauPrix ? parseFloat(nouveauPrix.replace(',', '.')) : null,
        unite: nouvelleUnite,
        client_id: clientId,
        categorie_id: nouvelleCategorie || null
      }])
      if (error) throw error
      await log({ action: 'CREATION', entite: 'ingredient', entite_nom: nouveauNom.trim(), section: 'cuisine' })
      setNouveauNom(''); setNouveauPrix(''); setNouvelleUnite('kg'); setNouvelleCategorie('')
      setAjoutVisible(false)
      await loadAll()
    } catch (err) {
      console.error('Add error:', err)
      alert('Erreur lors de l\'ajout')
    } finally { setSaving(false) }
  }

  // ── Ajout catégorie ───────────────────────────────────────────────────────
  const ajouterCategorie = async () => {
    if (!nouvelleCatNom.trim()) return
    setSavingCat(true)
    try {
      const clientId = await getClientId()
      if (!clientId) return
      const { error } = await supabase.from('categories_ingredients').insert([{
        nom: nouvelleCatNom.trim(),
        emoji: nouvelleCatEmoji,
        client_id: clientId,
        ordre: categories.length + 1
      }])
      if (error) throw error
      setNouvelleCatNom(''); setNouvelleCatEmoji('📦')
      setAjoutCatVisible(false)
      await loadAll()
    } catch (err) {
      console.error('Add cat error:', err)
    } finally { setSavingCat(false) }
  }

  // ── Édition inline prix + catégorie ──────────────────────────────────────
  const startEdition = (ing) => {
    setEditionId(ing.id)
    setEditionPrix(ing.prix_kg ? String(ing.prix_kg) : '')
    setEditionCategorie(ing.categorie_id || '')
  }

  const saveEdition = async (id) => {
    try {
      const clientId = await getClientId()
      const { error } = await supabase.from('ingredients').update({
        prix_kg: editionPrix ? parseFloat(editionPrix.replace(',', '.')) : null,
        categorie_id: editionCategorie || null
      }).eq('id', id).eq('client_id', clientId)
      if (error) throw error
      setEditionId(null)
      await loadAll()
    } catch (err) {
      console.error('Edit error:', err)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '1100px', margin: '0 auto' }}>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
          {[
            { label: 'Total ingrédients', value: ingredients.length },
            { label: 'Catégories', value: categories.length },
            { label: 'Sans catégorie', value: ingredients.filter(i => !i.categorie_id).length },
          ].map((s, i) => (
            <div key={i} style={{ background: c.blanc, borderRadius: '10px', padding: '14px 16px', border: `0.5px solid ${c.bordure}` }}>
              <div style={{ fontSize: '10px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
              <div style={{ fontSize: '24px', fontWeight: '500', color: c.texte, marginTop: '4px' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Onglets vues */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', background: c.blanc, padding: '4px', borderRadius: '10px', border: `0.5px solid ${c.bordure}`, width: 'fit-content' }}>
          {[
            { id: 'liste', label: '📋 Liste' },
            { id: 'categories', label: '🗂 Catégories' },
            { id: 'inflation', label: '📈 Inflation' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setVue(tab.id)} style={{
              padding: '7px 14px', borderRadius: '7px', fontSize: '13px', border: 'none',
              cursor: 'pointer', fontWeight: vue === tab.id ? '500' : '400',
              background: vue === tab.id ? c.accent : 'transparent',
              color: vue === tab.id ? 'white' : c.texteMuted,
              transition: 'all 0.15s'
            }}>{tab.label}</button>
          ))}
        </div>

        {/* ── VUE LISTE ── */}
        {vue === 'liste' && (
          <>
            {/* Barre d'actions */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="text" placeholder="Rechercher un ingrédient..."
                value={recherche} onChange={e => setRecherche(e.target.value)}
                style={{ flex: 1, minWidth: '180px', padding: '10px 14px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}
              />
              <select value={filtreCategorie} onChange={e => setFiltreCategorie(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', background: c.blanc, outline: 'none', color: c.texte, cursor: 'pointer' }}>
                <option value="toutes">Toutes catégories</option>
                <option value="sans_categorie">📦 Sans catégorie</option>
                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.emoji} {cat.nom}</option>)}
              </select>
              <span style={{ fontSize: '12px', color: c.texteMuted, whiteSpace: 'nowrap' }}>
                {ingredientsFiltres.length}{selection.length > 0 && ` — ${selection.length} sél.`}
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                {selection.length > 0 && peutModifier && (
                  <button onClick={supprimerSelection} disabled={supprimant} style={{
                    background: '#DC2626', color: 'white', border: 'none',
                    borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontWeight: '500', cursor: 'pointer'
                  }}>{supprimant ? '...' : `🗑 Supprimer (${selection.length})`}</button>
                )}
                {peutModifier && (
                  <button onClick={() => router.push('/import')} style={{
                    background: c.blanc, color: c.texteMuted, border: `0.5px solid ${c.bordure}`,
                    borderRadius: '8px', padding: '8px 12px', fontSize: '13px', cursor: 'pointer'
                  }}>{isMobile ? '📥' : '📥 Import Excel'}</button>
                )}
                {peutModifier && (
                  <button onClick={() => setAjoutVisible(!ajoutVisible)} style={{
                    background: c.accent, color: 'white', border: 'none',
                    borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: '500', cursor: 'pointer'
                  }}>+ {!isMobile && 'Nouvel ingrédient'}</button>
                )}
              </div>
            </div>

            {/* Filtres d'utilisation */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: 'Tous' },
                { id: 'used', label: 'Utilisés en cuisine' },
                { id: 'unused', label: 'Non utilisés' },
                { id: 'uncategorized', label: 'Sans catégorie' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setFilterUsage(opt.id)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '999px',
                    border: `0.5px solid ${filterUsage === opt.id ? c.accent : c.bordure}`,
                    background: filterUsage === opt.id ? c.accentClair : c.blanc,
                    color: filterUsage === opt.id ? c.accent : c.texteMuted,
                    fontSize: '12px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Formulaire ajout */}
            {ajoutVisible && peutModifier && (
              <div style={{ background: c.blanc, borderRadius: '12px', padding: '20px', border: `1px solid ${c.accent}`, marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>Nouvel ingrédient</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Nom *</label>
                    <input type="text" value={nouveauNom} onChange={e => setNouveauNom(e.target.value)}
                      placeholder="Ex : Beurre doux"
                      onKeyDown={e => e.key === 'Enter' && ajouterIngredient()}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Prix HT (€)</label>
                      <input type="text" value={nouveauPrix} onChange={e => setNouveauPrix(e.target.value)}
                        placeholder="Ex : 4.50"
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Unité</label>
                      <select value={nouvelleUnite} onChange={e => setNouvelleUnite(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}>
                        {UNITES.map(u => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Catégorie</label>
                      <select value={nouvelleCategorie} onChange={e => setNouvelleCategorie(e.target.value)}
                        style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}>
                        <option value="">Sans catégorie</option>
                        {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.emoji} {cat.nom}</option>)}
                      </select>
                    </div>
                  </div>
                  <button onClick={ajouterIngredient} disabled={saving || !nouveauNom.trim()} style={{
                    width: '100%', padding: '12px', background: saving || !nouveauNom.trim() ? c.texteMuted : c.accent,
                    color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
                    cursor: saving || !nouveauNom.trim() ? 'not-allowed' : 'pointer'
                  }}>{saving ? 'Ajout en cours...' : 'Ajouter l\'ingrédient'}</button>
                </div>
              </div>
            )}

            {/* Table ingrédients */}
            {loading ? (
              <ChefLoader />
            ) : ingredientsFiltres.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, color: c.texteMuted, fontSize: '14px' }}>
                Aucun ingrédient trouvé
              </div>
            ) : isMobile ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', padding: '10px 12px', background: c.blanc, borderRadius: '8px', border: `0.5px solid ${c.bordure}` }}>
                  <input type="checkbox" checked={selection.length === ingredientsFiltres.length && ingredientsFiltres.length > 0} onChange={toggleTout} style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: c.accent }} />
                  <span style={{ fontSize: '13px', color: c.texteMuted }}>{selection.length === ingredientsFiltres.length ? 'Tout désélectionner' : 'Tout sélectionner'}</span>
                </div>
                {ingredientsPagines.map(ing => (
                  <div key={ing.id} style={{ background: selection.includes(ing.id) ? c.accentClair : c.blanc, borderRadius: '8px', padding: '12px', border: `0.5px solid ${c.bordure}`, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input type="checkbox" checked={selection.includes(ing.id)} onChange={() => toggleSelection(ing.id)} style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: c.accent, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: c.texte, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span>{ing.nom}</span>
                        {Array.isArray(ing.fiche_ingredients) && ing.fiche_ingredients.length > 0 && (
                          <span style={{ fontSize: '11px', color: '#166534', background: '#DCFCE7', border: '0.5px solid #86EFAC', borderRadius: '999px', padding: '1px 8px' }}>
                            🟢 Utilisé
                          </span>
                        )}
                        {ing.categorie_id == null && (
                          <span style={{ fontSize: '11px', color: '#9A3412', background: '#FFEDD5', border: '0.5px solid #FDBA74', borderRadius: '999px', padding: '1px 8px' }}>
                            ⚠️ À catégoriser
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: c.texteMuted, marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <span>{ing.prix_kg ? `${Number(ing.prix_kg).toFixed(2)} €` : '—'} / {ing.unite || '—'}</span>
                        {ing.categories_ingredients && (
                          <span style={{ background: c.accentClair, color: c.accent, borderRadius: '20px', padding: '1px 8px', fontSize: '11px' }}>
                            {ing.categories_ingredients.emoji} {ing.categories_ingredients.nom}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: c.principal }}>
                      <th style={{ padding: '10px 16px', width: '40px' }}>
                        <input type="checkbox" checked={selection.length === ingredientsFiltres.length && ingredientsFiltres.length > 0} onChange={toggleTout} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: c.accent }} />
                      </th>
                      {['Nom', 'Catégorie', 'Prix HT', 'Unité', ...(peutModifier ? ['Action'] : [])].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Nom' || h === 'Catégorie' ? 'left' : 'right', fontSize: '11px', color: c.accent, fontWeight: '500', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ingredientsPagines.map((ing, i) => (
                      <tr key={ing.id} style={{ borderBottom: i < ingredientsPagines.length - 1 ? `0.5px solid ${c.bordure}` : 'none', background: selection.includes(ing.id) ? c.accentClair : c.blanc }}>
                        <td style={{ padding: '10px 16px' }}>
                          <input type="checkbox" checked={selection.includes(ing.id)} onChange={() => toggleSelection(ing.id)} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: c.accent }} />
                        </td>
                        <td style={{ padding: '10px 16px', fontWeight: '500', color: c.texte }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>{ing.nom}</span>
                            {Array.isArray(ing.fiche_ingredients) && ing.fiche_ingredients.length > 0 && (
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22C55E', display: 'inline-block' }} title="Utilisé en fiche technique" />
                            )}
                            {ing.categorie_id == null && (
                              <span style={{ fontSize: '11px', color: '#9A3412', background: '#FFEDD5', border: '0.5px solid #FDBA74', borderRadius: '999px', padding: '1px 8px' }}>
                                ⚠️ À catégoriser
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          {editionId === ing.id ? (
                            <select value={editionCategorie} onChange={e => setEditionCategorie(e.target.value)}
                              style={{ padding: '4px 8px', borderRadius: '6px', border: `0.5px solid ${c.bordure}`, fontSize: '12px', background: c.blanc, outline: 'none', color: c.texte, cursor: 'pointer' }}>
                              <option value="">Sans catégorie</option>
                              {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.emoji} {cat.nom}</option>)}
                            </select>
                          ) : ing.categories_ingredients ? (
                            <span style={{ background: c.accentClair, color: c.accent, borderRadius: '20px', padding: '2px 10px', fontSize: '11px', fontWeight: '500' }}>
                              {ing.categories_ingredients.emoji} {ing.categories_ingredients.nom}
                            </span>
                          ) : (
                            <span style={{ color: c.texteMuted, fontSize: '12px' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                          {editionId === ing.id ? (
                            <input type="text" value={editionPrix} onChange={e => setEditionPrix(e.target.value)}
                              style={{ width: '80px', padding: '4px 8px', borderRadius: '6px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', outline: 'none', textAlign: 'right', background: c.blanc, color: c.texte }}
                            />
                          ) : (
                            <span style={{ color: c.texte }}>{ing.prix_kg ? `${Number(ing.prix_kg).toFixed(2)} €` : '—'}</span>
                          )}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', color: c.texteMuted }}>{ing.unite || '—'}</td>
                        {peutModifier && (
                          <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                            {editionId === ing.id ? (
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                <button onClick={() => saveEdition(ing.id)} style={{ background: c.accent, color: 'white', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}>✓</button>
                                <button onClick={() => setEditionId(null)} style={{ background: c.fond, color: c.texteMuted, border: `0.5px solid ${c.bordure}`, borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}>✕</button>
                              </div>
                            ) : (
                              <button onClick={() => startEdition(ing)} style={{ background: 'transparent', color: c.texteMuted, border: `0.5px solid ${c.bordure}`, borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}>✏️ Modifier</button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}

        {/* ── VUE CATÉGORIES ── */}
        {vue === 'categories' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
              {peutModifier && (
                <button onClick={() => setAjoutCatVisible(!ajoutCatVisible)} style={{
                  background: c.accent, color: 'white', border: 'none',
                  borderRadius: '8px', padding: '8px 14px', fontSize: '13px', fontWeight: '500', cursor: 'pointer'
                }}>+ Nouvelle catégorie</button>
              )}
            </div>

            {ajoutCatVisible && peutModifier && (
              <div style={{ background: c.blanc, borderRadius: '12px', padding: '20px', border: `1px solid ${c.accent}`, marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', fontWeight: '600', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>Nouvelle catégorie</div>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Emoji</label>
                    <input type="text" value={nouvelleCatEmoji} onChange={e => setNouvelleCatEmoji(e.target.value)} maxLength={2}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '22px', outline: 'none', textAlign: 'center', background: c.blanc }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Nom *</label>
                    <input type="text" value={nouvelleCatNom} onChange={e => setNouvelleCatNom(e.target.value)}
                      placeholder="Ex : Viandes & Volailles"
                      onKeyDown={e => e.key === 'Enter' && ajouterCategorie()}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                    />
                  </div>
                </div>
                <button onClick={ajouterCategorie} disabled={savingCat || !nouvelleCatNom.trim()} style={{
                  width: '100%', padding: '12px', background: savingCat || !nouvelleCatNom.trim() ? c.texteMuted : c.accent,
                  color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
                  cursor: savingCat || !nouvelleCatNom.trim() ? 'not-allowed' : 'pointer'
                }}>{savingCat ? 'Création...' : 'Créer la catégorie'}</button>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
              {categories.map(cat => {
                const ingsChat = ingredients.filter(i => i.categorie_id === cat.id)
                return (
                  <div key={cat.id} style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
                    <div style={{ padding: '16px', borderBottom: `0.5px solid ${c.bordure}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: c.accentClair, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>
                        {cat.emoji}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '15px', fontWeight: '500', color: c.texte }}>{cat.nom}</div>
                        <div style={{ fontSize: '12px', color: c.texteMuted }}>{ingsChat.length} ingrédient{ingsChat.length > 1 ? 's' : ''}</div>
                      </div>
                    </div>
                    <div style={{ padding: '12px 16px', maxHeight: '160px', overflowY: 'auto' }}>
                      {ingsChat.length === 0 ? (
                        <div style={{ fontSize: '13px', color: c.texteMuted, fontStyle: 'italic' }}>Aucun ingrédient</div>
                      ) : ingsChat.slice(0, 8).map(ing => (
                        <div key={ing.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: `0.5px solid ${c.fond}` }}>
                          <span style={{ fontSize: '13px', color: c.texte }}>{ing.nom}</span>
                          <span style={{ fontSize: '12px', color: c.texteMuted }}>{ing.prix_kg ? `${Number(ing.prix_kg).toFixed(2)} €` : '—'}</span>
                        </div>
                      ))}
                      {ingsChat.length > 8 && (
                        <div style={{ fontSize: '12px', color: c.texteMuted, marginTop: '6px', fontStyle: 'italic' }}>+ {ingsChat.length - 8} autres</div>
                      )}
                    </div>
                  </div>
                )
              })}
              {/* Sans catégorie */}
              {sansCategorie.length > 0 && (
                <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden', opacity: 0.7 }}>
                  <div style={{ padding: '16px', borderBottom: `0.5px solid ${c.bordure}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>📦</div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: '500', color: c.texte }}>Sans catégorie</div>
                      <div style={{ fontSize: '12px', color: c.texteMuted }}>{sansCategorie.length} ingrédient{sansCategorie.length > 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  <div style={{ padding: '10px 16px' }}>
                    <div style={{ fontSize: '12px', color: c.texteMuted, fontStyle: 'italic' }}>Assignez une catégorie depuis la vue Liste</div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ── VUE INFLATION ── */}
        {vue === 'inflation' && (
          <div>
            <div style={{ background: '#FEF3C7', border: '0.5px solid #FDE68A', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#92400E' }}>
              💡 Ces statistiques affichent le prix moyen HT par catégorie. Mettez à jour les prix régulièrement pour suivre l'inflation de vos matières premières.
            </div>

            <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: c.principal }}>
                    {['Catégorie', 'Nb ingr.', 'Prix moyen HT', 'Prix min', 'Prix max', 'Écart'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: h === 'Catégorie' ? 'left' : 'right', fontSize: '11px', color: c.accent, fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {statsParCategorie.map((stat, i) => {
                    const ecart = stat.prixMax - stat.prixMin
                    const ecartPct = stat.prixMin > 0 ? ((ecart / stat.prixMin) * 100).toFixed(0) : 0
                    return (
                      <tr key={stat.id} style={{ borderBottom: i < statsParCategorie.length - 1 ? `0.5px solid ${c.bordure}` : 'none' }}
                        onMouseEnter={e => e.currentTarget.style.background = c.fond}
                        onMouseLeave={e => e.currentTarget.style.background = c.blanc}
                      >
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '18px' }}>{stat.emoji}</span>
                            <span style={{ fontWeight: '500', color: c.texte }}>{stat.nom}</span>
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', color: c.texteMuted }}>{stat.nb}</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: '500', color: c.texte }}>{stat.prixMoyen.toFixed(2)} €</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', color: '#16A34A' }}>{stat.prixMin.toFixed(2)} €</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right', color: '#DC2626' }}>{stat.prixMax.toFixed(2)} €</td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <span style={{
                            background: ecartPct > 50 ? '#FEE2E2' : ecartPct > 20 ? '#FEF3C7' : '#DCFCE7',
                            color: ecartPct > 50 ? '#DC2626' : ecartPct > 20 ? '#D97706' : '#16A34A',
                            borderRadius: '20px', padding: '2px 10px', fontSize: '12px', fontWeight: '500'
                          }}>{ecart.toFixed(2)} € ({ecartPct}%)</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
