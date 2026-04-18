'use client'
import { useMemo, useState } from 'react'
import { supabase, getClientId } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useIsMobile } from '../lib/useIsMobile'
import { useTheme } from '../lib/useTheme'
import { log } from '../lib/useLog'
import * as XLSX from 'xlsx'
import Navbar from './Navbar'
import ChefLoader from './ChefLoader'
import { Badge } from './ui'

const CONFIG = {
  cuisine: {
    table: 'ingredients',
    categoriesTable: 'categories_ingredients',
    defaultUnit: 'kg',
    unitExamples: 'kg, L, u\u2026',
    recalculRpc: 'recalculer_cout_portions',
    accentColor: null, // uses c.accent
    greenColor: null, // uses c.vert
    greenBg: null, // uses c.vertClair
    greenBorder: null,
    sectionLabel: '',
    recalculLabel: 'Mise \u00e0 jour en masse des fiches',
    recalculDescription: 'Recalcule automatiquement le co\u00fbt de toutes les fiches techniques en fonction des prix actuels des ingr\u00e9dients.',
    recalculButton: '\ud83d\udd04 Recalculer toutes les fiches',
    recalculDoneMsg: '\u2713 Toutes les fiches ont \u00e9t\u00e9 mises \u00e0 jour avec les prix actuels !',
    recalculDoneMsgShort: '\u2713 Toutes les fiches ont \u00e9t\u00e9 recalcul\u00e9es avec les nouveaux prix !',
    recalculButtonPost: '\ud83d\udd04 Recalculer toutes les fiches maintenant',
    importLabel: 'Import Excel des ingr\u00e9dients',
    hasTemplate: true,
    hasCategories: true,
    showCategoryInPreview: true,
    afterImportRoute: '/ingredients',
    afterImportLabel: 'Voir les ingr\u00e9dients',
    logEntite: 'ingredients',
    logSection: 'cuisine',
    logDetails: (total, ignores, categoriesAssignees) => `${total} trait\u00e9s, ${ignores} ignor\u00e9s, ${categoriesAssignees} cat\u00e9gories assign\u00e9es`,
    templateFileName: 'modele_import_ingredients.xlsx',
    templateSheetName: 'Ingr\u00e9dients',
    templateRows: [
      ['Nom', 'Prix HT (\u20ac)', 'Unit\u00e9', 'Cat\u00e9gorie'],
      ['Beurre doux', '4.50', 'kg', 'Produits laitiers'],
      ['Filet de boeuf', '38.00', 'kg', 'Viandes & Volailles'],
      ['Tomates cerises', '3.20', 'kg', 'L\u00e9gumes & Herbes'],
      ['Farine T55', '0.80', 'kg', '\u00c9picerie s\u00e8che'],
    ],
  },
  bar: {
    table: 'ingredients_bar',
    categoriesTable: null,
    defaultUnit: 'cl',
    unitExamples: 'cl, ml, L...',
    recalculRpc: 'recalculer_cout_portions_bar',
    accentColor: '#7F77DD',
    greenColor: '#4A7B6F',
    greenBg: '#E8F2EF',
    greenBorder: '#4A7B6F40',
    sectionLabel: ' bar',
    recalculLabel: 'Mise \u00e0 jour en masse des fiches bar',
    recalculDescription: 'Recalcule le co\u00fbt de toutes les fiches bar avec les prix actuels des ingr\u00e9dients.',
    recalculButton: '\ud83d\udd04 Recalculer toutes les fiches bar',
    recalculDoneMsg: '\u2713 Toutes les fiches bar ont \u00e9t\u00e9 mises \u00e0 jour !',
    recalculDoneMsgShort: '\u2713 Toutes les fiches bar ont \u00e9t\u00e9 recalcul\u00e9es !',
    recalculButtonPost: '\ud83d\udd04 Recalculer toutes les fiches bar',
    importLabel: 'Import Excel des ingr\u00e9dients bar',
    hasTemplate: false,
    hasCategories: false,
    showCategoryInPreview: false,
    afterImportRoute: '/bar/fiches',
    afterImportLabel: 'Voir les fiches bar',
    logEntite: 'ingredients_bar',
    logSection: 'bar',
    logDetails: (total, ignores) => `${total} ingr\u00e9dients bar trait\u00e9s, ${ignores} ignor\u00e9s`,
    templateFileName: null,
    templateSheetName: null,
    templateRows: null,
  },
}

export default function ImportView({ section = 'cuisine' }) {
  const cfg = CONFIG[section]
  const [loading, setLoading] = useState(false)
  const [recalcul, setRecalcul] = useState(false)
  const [resultat, setResultat] = useState(null)
  const [apercu, setApercu] = useState([])
  const [fichierPret, setFichierPret] = useState(false)
  const [donnees, setDonnees] = useState([])
  const [progression, setProgression] = useState(0)
  const [etape, setEtape] = useState('')
  const [categoriesInconnues, setCategoriesInconnues] = useState([])
  const [categoriesFichier, setCategoriesFichier] = useState([])
  const [categoriesSelectionnees, setCategoriesSelectionnees] = useState([])
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()

  const accent = cfg.accentColor || c.accent
  const green = cfg.greenColor || c.vert
  const greenBg = cfg.greenBg || c.vertClair
  const greenBorder = cfg.greenBorder || `${c.vert}40`
  const accentBg = cfg.accentColor ? '#EEEDFE' : c.accentClair

  const normaliserPrix = (valeur) => {
    if (!valeur) return null
    const str = valeur.toString().replace(',', '.').replace(/[^0-9.]/g, '')
    const num = parseFloat(str)
    return isNaN(num) ? null : num
  }

  const categorieLabel = (ing) => (ing?.categorieNom && ing.categorieNom.trim()) ? ing.categorieNom.trim() : 'Sans cat\u00e9gorie'

  const donneesSelectionnees = useMemo(() => {
    if (!donnees.length || !categoriesSelectionnees.length) return []
    return donnees.filter((ing) => categoriesSelectionnees.includes(categorieLabel(ing)))
  }, [donnees, categoriesSelectionnees])

  const toggleCategorie = (cat) => {
    setCategoriesSelectionnees((prev) => (
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    ))
  }

  const handleFichier = async (e) => {
    const fichier = e.target.files[0]
    if (!fichier) return
    setResultat(null)
    setProgression(0)
    setCategoriesInconnues([])
    setCategoriesFichier([])
    setCategoriesSelectionnees([])

    // Load category map for cuisine section
    let categoriesMap = {}
    if (cfg.hasCategories) {
      const clientId = await getClientId()
      const { data: cats } = await supabase
        .from(cfg.categoriesTable)
        .select('id, nom')
        .eq('client_id', clientId)
      ;(cats || []).forEach(cat => {
        categoriesMap[cat.nom.toLowerCase().trim()] = cat.id
      })
    }

    const reader = new FileReader()
    reader.onload = (evt) => {
      const data = evt.target.result
      const workbook = XLSX.read(data, { type: 'binary' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })

      const ingredients = []
      const inconnues = new Set()

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (!row[0]) continue

        const nomCategorie = row[3]?.toString().trim() || ''
        let categorie_id = null
        let categorieNonTrouvee = false

        if (cfg.hasCategories && nomCategorie) {
          const match = categoriesMap[nomCategorie.toLowerCase()]
          if (match) {
            categorie_id = match
          } else {
            inconnues.add(nomCategorie)
            categorieNonTrouvee = true
          }
        }

        ingredients.push({
          nom: row[0]?.toString().trim(),
          prix_kg: normaliserPrix(row[1]),
          unite: row[2]?.toString().trim() || cfg.defaultUnit,
          categorie_id,
          categorieNom: nomCategorie,
          categorieNonTrouvee
        })
      }

      if (cfg.hasCategories) setCategoriesInconnues([...inconnues])
      setDonnees(ingredients)
      setApercu(ingredients.slice(0, 5))
      const uniques = Array.from(new Set(ingredients.map((ing) => categorieLabel(ing)))).sort((a, b) => a.localeCompare(b))
      setCategoriesFichier(uniques)
      setCategoriesSelectionnees(uniques)
      setFichierPret(true)
    }
    reader.readAsBinaryString(fichier)
  }

  const handleImport = async () => {
    if (!donnees.length) return
    setLoading(true)
    setResultat(null)
    setProgression(0)

    const clientId = await getClientId()
    if (!clientId) { setLoading(false); return }

    const totalTrouves = donnees.length
    const totalSelectionnes = donneesSelectionnees.length
    const ignores = totalTrouves - totalSelectionnes

    if (totalSelectionnes === 0) {
      setLoading(false)
      const res = { importes: 0, misAJour: 0, erreurs: 0, total: 0, ignores }
      if (cfg.hasCategories) res.categoriesAssignees = 0
      setResultat(res)
      return
    }

    const { count: dejaPresents, error: errCount } = await supabase
      .from(cfg.table)
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
    if (errCount) {
      setLoading(false)
      alert(`Impossible de v\u00e9rifier le quota : ${errCount.message}`)
      return
    }
    if ((dejaPresents || 0) + totalSelectionnes > 5000) {
      setLoading(false)
      alert(`Quota d\u00e9pass\u00e9 : ${(dejaPresents || 0)} existants + ${totalSelectionnes} s\u00e9lectionn\u00e9s > 5000.`)
      return
    }

    const batchSize = 50
    let importes = 0
    let misAJour = 0
    let erreurs = 0
    let categoriesAssignees = 0
    const total = totalSelectionnes

    for (let i = 0; i < donneesSelectionnees.length; i += batchSize) {
      const batch = donneesSelectionnees.slice(i, i + batchSize)
      for (const ing of batch) {
        try {
          if (cfg.hasCategories) {
            // Cuisine: full category-aware import
            const { data: existing } = await supabase
              .from(cfg.table)
              .select('id, prix_kg, categorie_id')
              .eq('nom', ing.nom)
              .eq('client_id', clientId)
              .single()

            const updateData = {
              prix_kg: ing.prix_kg,
              unite: ing.unite,
            }
            if (ing.categorie_id) updateData.categorie_id = ing.categorie_id

            if (existing) {
              const prixChange = existing.prix_kg !== ing.prix_kg
              const catChange = ing.categorie_id && existing.categorie_id !== ing.categorie_id

              if (prixChange || catChange) {
                if (prixChange) {
                  updateData.prix_precedent = existing.prix_kg
                  updateData.prix_updated_at = new Date().toISOString()
                }
                await supabase.from(cfg.table)
                  .update(updateData)
                  .eq('id', existing.id)
                  .eq('client_id', clientId)
                misAJour++
                if (catChange) categoriesAssignees++
              }
            } else {
              await supabase.from(cfg.table).insert([{
                nom: ing.nom,
                prix_kg: ing.prix_kg,
                unite: ing.unite,
                categorie_id: ing.categorie_id || null,
                client_id: clientId
              }])
              importes++
              if (ing.categorie_id) categoriesAssignees++
            }
          } else {
            // Bar: simpler import without category matching
            const { data: existing } = await supabase
              .from(cfg.table)
              .select('id, prix_kg')
              .eq('nom', ing.nom)
              .eq('client_id', clientId)
              .single()

            if (existing) {
              if (existing.prix_kg !== ing.prix_kg) {
                await supabase.from(cfg.table)
                  .update({
                    prix_kg: ing.prix_kg,
                    unite: ing.unite,
                    prix_precedent: existing.prix_kg,
                    prix_updated_at: new Date().toISOString()
                  })
                  .eq('id', existing.id)
                  .eq('client_id', clientId)
                misAJour++
              }
            } else {
              await supabase.from(cfg.table).insert([{
                nom: ing.nom,
                prix_kg: ing.prix_kg,
                unite: ing.unite,
                client_id: clientId
              }])
              importes++
            }
          }
        } catch { erreurs++ }
      }

      const done = Math.min(i + batchSize, total)
      setProgression(Math.round((done / total) * 100))
      setEtape(`Traitement ${done} / ${total} ingr\u00e9dients...`)
      await new Promise(r => setTimeout(r, 10))
    }

    await log({
      action: 'IMPORT',
      entite: cfg.logEntite,
      entite_nom: `${importes} nouveaux, ${misAJour} mis \u00e0 jour`,
      section: cfg.logSection,
      details: cfg.logDetails(total, ignores, categoriesAssignees)
    })

    setLoading(false)
    const res = { importes, misAJour, erreurs, total, ignores }
    if (cfg.hasCategories) res.categoriesAssignees = categoriesAssignees
    setResultat(res)
    setEtape('')
  }

  const handleRecalcul = async () => {
    setRecalcul(true)
    setEtape(`Recalcul du co\u00fbt de toutes les fiches${cfg.sectionLabel}...`)
    await supabase.rpc(cfg.recalculRpc)
    setRecalcul(false)
    setEtape('')
    setResultat(prev => ({ ...prev, recalculDone: true }))
  }

  const telechargerModele = () => {
    if (!cfg.hasTemplate) return
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(cfg.templateRows)
    ws['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 25 }]
    XLSX.utils.book_append_sheet(wb, ws, cfg.templateSheetName)
    XLSX.writeFile(wb, cfg.templateFileName)
  }

  const previewHeaders = cfg.showCategoryInPreview
    ? ['Nom', 'Prix HT', 'Unit\u00e9', 'Cat\u00e9gorie']
    : ['Nom', 'Prix HT', 'Unit\u00e9']

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section={section} />

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '700px', margin: '0 auto' }}>

        {/* Recalcul rapide */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '20px', border: `0.5px solid ${c.bordure}`, marginBottom: '16px' }}>
          <div className="sk-label-muted" style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '10px' }}>
            {cfg.recalculLabel}
          </div>
          <div style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '14px' }}>
            {cfg.recalculDescription}
          </div>
          <button onClick={handleRecalcul} disabled={recalcul} style={{
            width: '100%', padding: '14px', background: recalcul ? c.texteMuted : green,
            color: 'white', border: 'none', borderRadius: '8px',
            fontSize: '13px', fontWeight: '600', cursor: recalcul ? 'not-allowed' : 'pointer'
          }}>
            {recalcul ? etape : cfg.recalculButton}
          </button>
          {resultat?.recalculDone && (
            <div style={{ marginTop: '10px', padding: '10px 14px', background: greenBg, borderRadius: '8px', fontSize: '13px', color: green, border: `0.5px solid ${greenBorder}` }}>
              {cfg.recalculDoneMsg}
            </div>
          )}
        </div>

        {/* Import Excel */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '28px', border: `0.5px solid ${c.bordure}`, marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {cfg.importLabel}
            </div>
            {cfg.hasTemplate && (
              <button onClick={telechargerModele} style={{
                background: accentBg, color: accent, border: `0.5px solid ${accent}40`,
                borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: '500', cursor: 'pointer'
              }}>
                📥 Télécharger le modèle
              </button>
            )}
          </div>

          {/* Format attendu */}
          {cfg.hasCategories ? (
            <div style={{ background: c.fond, borderRadius: '8px', padding: '14px 16px', fontSize: '13px', color: c.texteMuted, marginBottom: '20px', border: `0.5px solid ${c.bordure}` }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
                <strong style={{ color: c.texte }}>Colonne A</strong><span>Nom de l&apos;article <span style={{ color: '#DC2626' }}>*</span></span>
                <strong style={{ color: c.texte }}>Colonne B</strong><span>Prix HT en € (avec . ou ,)</span>
                <strong style={{ color: c.texte }}>Colonne C</strong><span>Unité ({cfg.unitExamples})</span>
                <strong style={{ color: accent }}>Colonne D</strong><span style={{ color: accent }}>Catégorie (doit correspondre exactement)</span>
              </div>
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: `0.5px solid ${c.bordure}`, fontSize: '12px' }}>
                <div style={{ color: green, marginBottom: '2px' }}>✓ Les prix existants seront mis à jour automatiquement</div>
                <div style={{ color: accent }}>✓ La catégorie doit correspondre exactement à une catégorie existante</div>
              </div>
            </div>
          ) : (
            <div style={{ background: c.fond, borderRadius: '8px', padding: '14px 16px', fontSize: '13px', color: c.texteMuted, marginBottom: '20px', border: `0.5px solid ${c.bordure}` }}>
              <strong style={{ color: c.texte }}>Colonne A</strong> — Nom de l&apos;article<br />
              <strong style={{ color: c.texte }}>Colonne B</strong> — Prix HT (avec . ou ,)<br />
              <strong style={{ color: c.texte }}>Colonne C</strong> — Unité ({cfg.unitExamples})<br />
              <strong style={{ color: c.texte }}>Colonne D</strong> — Catégorie (optionnelle, pour filtrage)<br />
              <div style={{ marginTop: '8px', color: green, fontSize: '12px' }}>✓ Les prix existants seront mis à jour automatiquement</div>
            </div>
          )}

          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFichier}
            style={{ width: '100%', padding: '12px', border: `0.5px solid ${accent}`, borderRadius: '8px', fontSize: '13px', background: accentBg, cursor: 'pointer', color: c.texte, marginBottom: '16px' }}
          />

          {/* Alerte cat\u00e9gories inconnues (cuisine only) */}
          {cfg.hasCategories && categoriesInconnues.length > 0 && (
            <div style={{ background: '#FEF3C7', border: '0.5px solid #FDE68A', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: '500', color: '#92400E', marginBottom: '8px' }}>
                ⚠️ {categoriesInconnues.length} catégorie{categoriesInconnues.length > 1 ? 's' : ''} non reconnue{categoriesInconnues.length > 1 ? 's' : ''} :
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {categoriesInconnues.map(cat => (
                  <span key={cat} style={{ background: '#FDE68A', color: '#92400E', borderRadius: '20px', padding: '2px 10px', fontSize: '12px', fontWeight: '500' }}>
                    {cat}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: '12px', color: '#92400E', marginTop: '8px' }}>
                Ces ingrédients seront importés sans catégorie. Créez d&apos;abord les catégories manquantes dans la page Ingrédients.
              </div>
            </div>
          )}

          {categoriesFichier.length > 0 && (
            <div style={{ marginBottom: '18px', border: `0.5px solid ${c.bordure}`, borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: c.texte, marginBottom: '8px' }}>
                Filtrer les produits à importer
              </div>
              <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '10px' }}>
                {donneesSelectionnees.length} ingrédients sélectionnés sur {donnees.length} trouvés dans le fichier
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {categoriesFichier.map((cat) => {
                  const checked = categoriesSelectionnees.includes(cat)
                  return (
                    <label
                      key={cat}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        borderRadius: '999px',
                        padding: '6px 10px',
                        border: `0.5px solid ${checked ? accent : c.bordure}`,
                        background: checked ? accentBg : c.blanc,
                        color: checked ? accent : c.texteMuted,
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleCategorie(cat)} />
                      {cat}
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Aper\u00e7u */}
          {apercu.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '8px', fontWeight: '500' }}>
                {cfg.showCategoryInPreview
                  ? `Aper\u00e7u des 5 premiers (${donnees.length} au total) :`
                  : `Aper\u00e7u (${donnees.length} ingr\u00e9dients) :`
                }
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: c.fond }}>
                      {previewHeaders.map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', color: (h === 'Cat\u00e9gorie' && cfg.hasCategories) ? accent : c.texteMuted, fontWeight: '500', textTransform: 'uppercase', border: `0.5px solid ${c.bordure}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {apercu.map((ing, i) => (
                      <tr key={i}>
                        <td style={{ padding: '8px 12px', border: `0.5px solid ${c.bordure}`, color: c.texte }}>{ing.nom}</td>
                        <td style={{ padding: '8px 12px', border: `0.5px solid ${c.bordure}`, color: c.texte }}>{ing.prix_kg ? `${ing.prix_kg} \u20ac` : '\u2014'}</td>
                        <td style={{ padding: '8px 12px', border: `0.5px solid ${c.bordure}`, color: c.texte }}>{ing.unite}</td>
                        {cfg.showCategoryInPreview && (
                          <td style={{ padding: '8px 12px', border: `0.5px solid ${c.bordure}` }}>
                            {ing.categorieNom ? (
                              <Badge bg={ing.categorieNonTrouvee ? '#FEF3C7' : accentBg} color={ing.categorieNonTrouvee ? '#92400E' : accent} size="sm">
                                {ing.categorieNonTrouvee ? '\u26a0\ufe0f ' : '\u2713 '}{ing.categorieNom}
                              </Badge>
                            ) : (
                              <span style={{ color: c.texteMuted, fontSize: '12px' }}>—</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Progression */}
          {loading && (
            <div style={{ marginBottom: '16px' }}>
              <ChefLoader message="Le chef analyse vos ingrédients..." size={120} />
              <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '6px' }}>{etape}</div>
              <div style={{ background: c.fond, borderRadius: '20px', height: '8px', overflow: 'hidden', border: `0.5px solid ${c.bordure}` }}>
                <div style={{ background: accent, height: '100%', borderRadius: '20px', width: `${progression}%`, transition: 'width 0.3s ease' }} />
              </div>
              <div style={{ fontSize: '12px', color: accent, marginTop: '4px', textAlign: 'right' }}>{progression}%</div>
            </div>
          )}

          {fichierPret && (
            <button onClick={handleImport} disabled={loading} style={{
              width: '100%', padding: '14px', background: loading ? c.texteMuted : accent,
              color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px',
              fontWeight: '600', textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer'
            }}>
              {loading ? `Import en cours... ${progression}%` : `Importer / Mettre \u00e0 jour ${donneesSelectionnees.length} ingr\u00e9dients`}
            </button>
          )}
        </div>

        {/* R\u00e9sultat */}
        {resultat && (
          <div style={{ background: greenBg, border: `0.5px solid ${greenBorder}`, borderRadius: '12px', padding: '20px' }}>
            <div style={{ fontWeight: '600', marginBottom: '10px', color: green }}>Import terminé !</div>
            <div style={{ fontSize: '13px', color: c.texte, marginBottom: '10px' }}>
              Succès : {resultat.importes + resultat.misAJour} ingrédients traités, {resultat.ignores || 0} ignorés (car décochés).
            </div>

            {cfg.hasCategories ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
                {[
                  { label: 'Nouveaux', value: resultat.importes, color: green },
                  { label: 'Mis \u00e0 jour', value: resultat.misAJour, color: '#D97706' },
                  { label: 'Cat\u00e9gories', value: resultat.categoriesAssignees, color: accent },
                  { label: 'Erreurs', value: resultat.erreurs, color: resultat.erreurs > 0 ? '#DC2626' : c.texte },
                ].map((s, i) => (
                  <div key={i} style={{ background: c.blanc, borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '22px', fontWeight: '500', color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: '11px', color: c.texteMuted, textTransform: 'uppercase' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                <div style={{ background: c.blanc, borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: '500', color: green }}>{resultat.importes}</div>
                  <div style={{ fontSize: '11px', color: c.texteMuted, textTransform: 'uppercase' }}>Nouveaux</div>
                </div>
                <div style={{ background: c.blanc, borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: '500', color: '#854F0B' }}>{resultat.misAJour}</div>
                  <div style={{ fontSize: '11px', color: c.texteMuted, textTransform: 'uppercase' }}>Mis à jour</div>
                </div>
                <div style={{ background: c.blanc, borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: '500', color: resultat.erreurs > 0 ? '#A32D2D' : c.texte }}>{resultat.erreurs}</div>
                  <div style={{ fontSize: '11px', color: c.texteMuted, textTransform: 'uppercase' }}>Erreurs</div>
                </div>
              </div>
            )}

            {resultat.misAJour > 0 && !resultat.recalculDone && (
              <div style={{ background: '#FAEEDA', borderRadius: '8px', padding: '14px', marginBottom: '12px', border: '0.5px solid #FAC775' }}>
                <div style={{ fontSize: '13px', color: '#633806', fontWeight: '500', marginBottom: '8px' }}>⚠️ {resultat.misAJour} prix ont été mis à jour</div>
                <button onClick={handleRecalcul} disabled={recalcul} style={{
                  width: '100%', padding: '12px', background: recalcul ? c.texteMuted : green,
                  color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: recalcul ? 'not-allowed' : 'pointer'
                }}>
                  {recalcul ? 'Recalcul en cours...' : cfg.recalculButtonPost}
                </button>
              </div>
            )}

            {resultat.recalculDone && (
              <div style={{ background: greenBg, borderRadius: '8px', padding: '12px', marginBottom: '12px', border: `0.5px solid ${greenBorder}`, fontSize: '13px', color: green, fontWeight: '500' }}>
                {cfg.recalculDoneMsgShort}
              </div>
            )}

            <button onClick={() => router.push(cfg.afterImportRoute)} style={{
              width: '100%', padding: '10px 20px', background: accent, color: 'white',
              border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500'
            }}>{cfg.afterImportLabel}</button>
          </div>
        )}
      </div>
    </div>
  )
}
