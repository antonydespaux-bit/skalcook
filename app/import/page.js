'use client'
import { useMemo, useState } from 'react'
import { supabase, getClientId } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { useIsMobile } from '../../lib/useIsMobile'
import { useTheme } from '../../lib/useTheme'
import { log } from '../../lib/useLog'
import * as XLSX from 'xlsx'
import NavbarCuisine from '../../components/NavbarCuisine'
import ChefLoader from '../../components/ChefLoader'

export default function ImportPage() {
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

  const normaliserPrix = (valeur) => {
    if (!valeur) return null
    const str = valeur.toString().replace(',', '.').replace(/[^0-9.]/g, '')
    const num = parseFloat(str)
    return isNaN(num) ? null : num
  }

  const categorieLabel = (ing) => (ing?.categorieNom && ing.categorieNom.trim()) ? ing.categorieNom.trim() : 'Sans catégorie'

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

    // Charger les catégories existantes pour le matching
    const clientId = await getClientId()
    const { data: cats } = await supabase
      .from('categories_ingredients')
      .select('id, nom')
      .eq('client_id', clientId)

    const categoriesMap = {}
    ;(cats || []).forEach(cat => {
      categoriesMap[cat.nom.toLowerCase().trim()] = cat.id
    })

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

        if (nomCategorie) {
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
          unite: row[2]?.toString().trim() || 'kg',
          categorie_id,
          categorieNom: nomCategorie,
          categorieNonTrouvee
        })
      }

      setCategoriesInconnues([...inconnues])
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
      setResultat({ importes: 0, misAJour: 0, erreurs: 0, total: 0, categoriesAssignees: 0, ignores })
      return
    }

    const { count: dejaPresents, error: errCount } = await supabase
      .from('ingredients')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
    if (errCount) {
      setLoading(false)
      alert(`Impossible de vérifier le quota : ${errCount.message}`)
      return
    }
    if ((dejaPresents || 0) + totalSelectionnes > 5000) {
      setLoading(false)
      alert(`Quota dépassé : ${(dejaPresents || 0)} existants + ${totalSelectionnes} sélectionnés > 5000.`)
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
          const { data: existing } = await supabase
            .from('ingredients')
            .select('id, prix_kg, categorie_id')
            .eq('nom', ing.nom)
            .eq('client_id', clientId)
            .single()

          const updateData = {
            prix_kg: ing.prix_kg,
            unite: ing.unite,
          }
          // On n'écrase la catégorie existante que si une catégorie est fournie dans le fichier
          if (ing.categorie_id) updateData.categorie_id = ing.categorie_id

          if (existing) {
            const prixChange = existing.prix_kg !== ing.prix_kg
            const catChange = ing.categorie_id && existing.categorie_id !== ing.categorie_id

            if (prixChange || catChange) {
              if (prixChange) {
                updateData.prix_precedent = existing.prix_kg
                updateData.prix_updated_at = new Date().toISOString()
              }
              await supabase.from('ingredients')
                .update(updateData)
                .eq('id', existing.id)
                .eq('client_id', clientId)
              misAJour++
              if (catChange) categoriesAssignees++
            }
          } else {
            await supabase.from('ingredients').insert([{
              nom: ing.nom,
              prix_kg: ing.prix_kg,
              unite: ing.unite,
              categorie_id: ing.categorie_id || null,
              client_id: clientId
            }])
            importes++
            if (ing.categorie_id) categoriesAssignees++
          }
        } catch { erreurs++ }
      }

      const done = Math.min(i + batchSize, total)
      setProgression(Math.round((done / total) * 100))
      setEtape(`Traitement ${done} / ${total} ingrédients...`)
      await new Promise(r => setTimeout(r, 10))
    }

    await log({
      action: 'IMPORT',
      entite: 'ingredients',
      entite_nom: `${importes} nouveaux, ${misAJour} mis à jour`,
      section: 'cuisine',
      details: `${total} traités, ${ignores} ignorés, ${categoriesAssignees} catégories assignées`
    })

    setLoading(false)
    setResultat({ importes, misAJour, erreurs, total, categoriesAssignees, ignores })
    setEtape('')
  }

  const handleRecalcul = async () => {
    setRecalcul(true)
    setEtape('Recalcul du coût de toutes les fiches...')
    await supabase.rpc('recalculer_cout_portions')
    setRecalcul(false)
    setEtape('')
    setResultat(prev => ({ ...prev, recalculDone: true }))
  }

  // Générer un fichier modèle Excel
  const telechargerModele = () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([
      ['Nom', 'Prix HT (€)', 'Unité', 'Catégorie'],
      ['Beurre doux', '4.50', 'kg', 'Produits laitiers'],
      ['Filet de boeuf', '38.00', 'kg', 'Viandes & Volailles'],
      ['Tomates cerises', '3.20', 'kg', 'Légumes & Herbes'],
      ['Farine T55', '0.80', 'kg', 'Épicerie sèche'],
    ])
    // Largeurs colonnes
    ws['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 25 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Ingrédients')
    XLSX.writeFile(wb, 'modele_import_ingredients.xlsx')
  }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <NavbarCuisine />

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '700px', margin: '0 auto' }}>

        {/* Recalcul rapide */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '20px', border: `0.5px solid ${c.bordure}`, marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
            Mise à jour en masse des fiches
          </div>
          <div style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '14px' }}>
            Recalcule automatiquement le coût de toutes les fiches techniques en fonction des prix actuels des ingrédients.
          </div>
          <button onClick={handleRecalcul} disabled={recalcul} style={{
            width: '100%', padding: '14px', background: recalcul ? c.texteMuted : c.vert,
            color: 'white', border: 'none', borderRadius: '8px',
            fontSize: '13px', fontWeight: '600', cursor: recalcul ? 'not-allowed' : 'pointer'
          }}>
            {recalcul ? etape : '🔄 Recalculer toutes les fiches'}
          </button>
          {resultat?.recalculDone && (
            <div style={{ marginTop: '10px', padding: '10px 14px', background: c.vertClair, borderRadius: '8px', fontSize: '13px', color: c.vert, border: `0.5px solid ${c.vert}40` }}>
              ✓ Toutes les fiches ont été mises à jour avec les prix actuels !
            </div>
          )}
        </div>

        {/* Import Excel */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '28px', border: `0.5px solid ${c.bordure}`, marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Import Excel des ingrédients
            </div>
            <button onClick={telechargerModele} style={{
              background: c.accentClair, color: c.accent, border: `0.5px solid ${c.accent}40`,
              borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: '500', cursor: 'pointer'
            }}>
              📥 Télécharger le modèle
            </button>
          </div>

          {/* Format attendu */}
          <div style={{ background: c.fond, borderRadius: '8px', padding: '14px 16px', fontSize: '13px', color: c.texteMuted, marginBottom: '20px', border: `0.5px solid ${c.bordure}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
              <strong style={{ color: c.texte }}>Colonne A</strong><span>Nom de l'article <span style={{ color: '#DC2626' }}>*</span></span>
              <strong style={{ color: c.texte }}>Colonne B</strong><span>Prix HT en € (avec . ou ,)</span>
              <strong style={{ color: c.texte }}>Colonne C</strong><span>Unité (kg, L, u…)</span>
              <strong style={{ color: c.accent }}>Colonne D</strong><span style={{ color: c.accent }}>Catégorie (doit correspondre exactement)</span>
            </div>
            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: `0.5px solid ${c.bordure}`, fontSize: '12px' }}>
              <div style={{ color: c.vert, marginBottom: '2px' }}>✓ Les prix existants seront mis à jour automatiquement</div>
              <div style={{ color: c.accent }}>✓ La catégorie doit correspondre exactement à une catégorie existante</div>
            </div>
          </div>

          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFichier}
            style={{ width: '100%', padding: '12px', border: `0.5px solid ${c.accent}`, borderRadius: '8px', fontSize: '13px', background: c.accentClair, cursor: 'pointer', color: c.texte, marginBottom: '16px' }}
          />

          {/* Alerte catégories inconnues */}
          {categoriesInconnues.length > 0 && (
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
                Ces ingrédients seront importés sans catégorie. Créez d'abord les catégories manquantes dans la page Ingrédients.
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
                        border: `0.5px solid ${checked ? c.accent : c.bordure}`,
                        background: checked ? c.accentClair : c.blanc,
                        color: checked ? c.accent : c.texteMuted,
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

          {/* Aperçu */}
          {apercu.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '8px', fontWeight: '500' }}>
                Aperçu des 5 premiers ({donnees.length} au total) :
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: c.fond }}>
                      {['Nom', 'Prix HT', 'Unité', 'Catégorie'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', color: h === 'Catégorie' ? c.accent : c.texteMuted, fontWeight: '500', textTransform: 'uppercase', border: `0.5px solid ${c.bordure}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {apercu.map((ing, i) => (
                      <tr key={i}>
                        <td style={{ padding: '8px 12px', border: `0.5px solid ${c.bordure}`, color: c.texte }}>{ing.nom}</td>
                        <td style={{ padding: '8px 12px', border: `0.5px solid ${c.bordure}`, color: c.texte }}>{ing.prix_kg ? `${ing.prix_kg} €` : '—'}</td>
                        <td style={{ padding: '8px 12px', border: `0.5px solid ${c.bordure}`, color: c.texte }}>{ing.unite}</td>
                        <td style={{ padding: '8px 12px', border: `0.5px solid ${c.bordure}` }}>
                          {ing.categorieNom ? (
                            <span style={{
                              background: ing.categorieNonTrouvee ? '#FEF3C7' : c.accentClair,
                              color: ing.categorieNonTrouvee ? '#92400E' : c.accent,
                              borderRadius: '20px', padding: '2px 8px', fontSize: '11px', fontWeight: '500'
                            }}>
                              {ing.categorieNonTrouvee ? '⚠️ ' : '✓ '}{ing.categorieNom}
                            </span>
                          ) : (
                            <span style={{ color: c.texteMuted, fontSize: '12px' }}>—</span>
                          )}
                        </td>
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
                <div style={{ background: c.accent, height: '100%', borderRadius: '20px', width: `${progression}%`, transition: 'width 0.3s ease' }} />
              </div>
              <div style={{ fontSize: '12px', color: c.accent, marginTop: '4px', textAlign: 'right' }}>{progression}%</div>
            </div>
          )}

          {fichierPret && (
            <button onClick={handleImport} disabled={loading} style={{
              width: '100%', padding: '14px', background: loading ? c.texteMuted : c.accent,
              color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px',
              fontWeight: '600', textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer'
            }}>
              {loading ? `Import en cours... ${progression}%` : `Importer / Mettre à jour ${donneesSelectionnees.length} ingrédients`}
            </button>
          )}
        </div>

        {/* Résultat */}
        {resultat && (
          <div style={{ background: c.vertClair, border: `0.5px solid ${c.vert}40`, borderRadius: '12px', padding: '20px' }}>
            <div style={{ fontWeight: '600', marginBottom: '10px', color: c.vert }}>Import terminé !</div>
            <div style={{ fontSize: '13px', color: c.texte, marginBottom: '10px' }}>
              Succès : {resultat.importes + resultat.misAJour} ingrédients traités, {resultat.ignores || 0} ignorés (car décochés).
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
              {[
                { label: 'Nouveaux', value: resultat.importes, color: c.vert },
                { label: 'Mis à jour', value: resultat.misAJour, color: '#D97706' },
                { label: 'Catégories', value: resultat.categoriesAssignees, color: c.accent },
                { label: 'Erreurs', value: resultat.erreurs, color: resultat.erreurs > 0 ? '#DC2626' : c.texte },
              ].map((s, i) => (
                <div key={i} style={{ background: c.blanc, borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: '500', color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '11px', color: c.texteMuted, textTransform: 'uppercase' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {resultat.misAJour > 0 && !resultat.recalculDone && (
              <div style={{ background: '#FAEEDA', borderRadius: '8px', padding: '14px', marginBottom: '12px', border: '0.5px solid #FAC775' }}>
                <div style={{ fontSize: '13px', color: '#633806', fontWeight: '500', marginBottom: '8px' }}>⚠️ {resultat.misAJour} prix ont été mis à jour</div>
                <button onClick={handleRecalcul} disabled={recalcul} style={{
                  width: '100%', padding: '12px', background: recalcul ? c.texteMuted : c.vert,
                  color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: recalcul ? 'not-allowed' : 'pointer'
                }}>
                  {recalcul ? 'Recalcul en cours...' : '🔄 Recalculer toutes les fiches maintenant'}
                </button>
              </div>
            )}

            {resultat.recalculDone && (
              <div style={{ background: c.vertClair, borderRadius: '8px', padding: '12px', marginBottom: '12px', border: `0.5px solid ${c.vert}40`, fontSize: '13px', color: c.vert, fontWeight: '500' }}>
                ✓ Toutes les fiches ont été recalculées avec les nouveaux prix !
              </div>
            )}

            <button onClick={() => router.push('/ingredients')} style={{
              width: '100%', padding: '10px 20px', background: c.accent, color: 'white',
              border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500'
            }}>Voir les ingrédients</button>
          </div>
        )}
      </div>
    </div>
  )
}
