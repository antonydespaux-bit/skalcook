'use client'
import { useState } from 'react'
import { supabase, getClientId } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useIsMobile } from '../lib/useIsMobile'
import { useTheme } from '../lib/useTheme'
import Navbar from './Navbar'
import ChefLoader from './ChefLoader'
import { Badge } from './ui'

// Import en masse de fiches techniques cuisine depuis un Excel "long" :
// une ligne par ingrédient, le nom de la fiche n'est renseigné que sur la
// 1ʳᵉ ligne du bloc (report automatique sur les lignes suivantes).

const TEMPLATE_ROWS = [
  ['Fiche', 'Catégorie', 'Nb portions', 'Prix TTC', 'Ingrédient', 'Quantité', 'Unité', 'Prix ingrédient HT'],
  ['Blanquette de veau', 'Plats', '10', '18.50', 'Épaule de veau', '2', 'kg', '14.90'],
  ['', '', '', '', 'Carottes', '1.5', 'kg', '1.20'],
  ['', '', '', '', 'Crème fraîche', '0.5', 'L', '3.80'],
  ['Tarte aux pommes', 'Desserts', '8', '7.00', 'Pommes', '1.2', 'kg', '2.10'],
  ['', '', '', '', 'Pâte brisée', '0.4', 'kg', '3.50'],
]

function normalizeHeader(s) {
  return (s ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function detectColumns(headerRow) {
  const cols = { fiche: -1, categorie: -1, portions: -1, prixTtc: -1, ingredient: -1, quantite: -1, unite: -1, prixIng: -1 }
  if (!Array.isArray(headerRow)) return { cols, detected: false }

  headerRow.forEach((cell, idx) => {
    const n = normalizeHeader(cell)
    if (!n) return
    if (cols.fiche < 0 && (n === 'fiche' || n === 'recette' || n === 'plat' || n.startsWith('nomdelafiche') || n === 'nomfiche')) cols.fiche = idx
    else if (cols.portions < 0 && (n.startsWith('nbportion') || n === 'portions' || n === 'couverts' || n.startsWith('nombredeportion') || n === 'rendement')) cols.portions = idx
    else if (cols.prixTtc < 0 && (n === 'prixttc' || n === 'pvttc' || n.startsWith('prixvente') || n.startsWith('prixdevente') || n === 'ttc')) cols.prixTtc = idx
    else if (cols.prixIng < 0 && (n === 'prixht' || n.startsWith('prixingredient') || n.startsWith('prixunitaire') || n === 'coutht' || n === 'pu')) cols.prixIng = idx
    else if (cols.categorie < 0 && (n.startsWith('categ') || n === 'famille' || n === 'type')) cols.categorie = idx
    else if (cols.ingredient < 0 && (n === 'ingredient' || n === 'article' || n === 'produit' || n === 'denree' || n === 'nom')) cols.ingredient = idx
    else if (cols.quantite < 0 && (n.startsWith('quantite') || n === 'qte' || n === 'quantity')) cols.quantite = idx
    else if (cols.unite < 0 && (n === 'unite' || n === 'unit' || n === 'mesure' || n === 'u')) cols.unite = idx
  })
  return { cols, detected: cols.fiche >= 0 && cols.ingredient >= 0 }
}

function toNumber(v) {
  if (v == null || v === '') return null
  const num = parseFloat(v.toString().replace(',', '.').replace(/[^0-9.]/g, ''))
  return Number.isNaN(num) ? null : num
}

export default function ImportFichesView() {
  const [loading, setLoading] = useState(false)
  const [parseError, setParseError] = useState('')
  const [fiches, setFiches] = useState([])
  const [apercu, setApercu] = useState([])
  const [fichierPret, setFichierPret] = useState(false)
  const [resultat, setResultat] = useState(null)
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()

  const totalLignes = fiches.reduce((s, f) => s + f.lignes.length, 0)

  const telechargerModele = async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(TEMPLATE_ROWS)
    ws['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 26 }, { wch: 10 }, { wch: 8 }, { wch: 18 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Fiches')
    XLSX.writeFile(wb, 'modele_import_fiches.xlsx')
  }

  const handleFichier = async (e) => {
    const fichier = e.target.files?.[0]
    if (!fichier) return
    setResultat(null)
    setParseError('')
    setFichierPret(false)
    setFiches([])
    setApercu([])

    const XLSX = await import('xlsx')
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: 'binary' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })

        const detection = detectColumns(rows[0])
        let cols, startRow
        if (detection.detected) {
          cols = detection.cols
          startRow = 1
        } else {
          // Repli sur l'ordre du modèle.
          cols = { fiche: 0, categorie: 1, portions: 2, prixTtc: 3, ingredient: 4, quantite: 5, unite: 6, prixIng: 7 }
          startRow = 1
        }

        const grouped = new Map()
        let currentKey = null

        for (let i = startRow; i < rows.length; i++) {
          const row = rows[i]
          if (!Array.isArray(row) || row.length === 0) continue

          const ficheNom = cols.fiche >= 0 ? (row[cols.fiche]?.toString().trim() || '') : ''
          const ingNom = cols.ingredient >= 0 ? (row[cols.ingredient]?.toString().trim() || '') : ''

          // Report du nom de fiche sur les lignes de continuation.
          if (ficheNom) {
            currentKey = ficheNom.toLowerCase()
            if (!grouped.has(currentKey)) {
              grouped.set(currentKey, {
                nom: ficheNom,
                categorie: cols.categorie >= 0 ? (row[cols.categorie]?.toString().trim() || '') : '',
                nb_portions: cols.portions >= 0 ? toNumber(row[cols.portions]) : null,
                prix_ttc: cols.prixTtc >= 0 ? toNumber(row[cols.prixTtc]) : null,
                lignes: [],
              })
            }
          }
          if (!currentKey || !ingNom) continue

          const f = grouped.get(currentKey)
          // Complète les en-têtes si renseignés sur une ligne ultérieure.
          if (!f.categorie && cols.categorie >= 0 && row[cols.categorie]) f.categorie = row[cols.categorie].toString().trim()
          if (f.nb_portions == null && cols.portions >= 0) f.nb_portions = toNumber(row[cols.portions])
          if (f.prix_ttc == null && cols.prixTtc >= 0) f.prix_ttc = toNumber(row[cols.prixTtc])

          f.lignes.push({
            ingredient: ingNom,
            quantite: cols.quantite >= 0 ? (toNumber(row[cols.quantite]) ?? 0) : 0,
            unite: cols.unite >= 0 ? (row[cols.unite]?.toString().trim() || 'kg') : 'kg',
            prix_ht: cols.prixIng >= 0 ? toNumber(row[cols.prixIng]) : null,
          })
        }

        const parsed = [...grouped.values()].filter((f) => f.nom && f.nb_portions && f.nb_portions > 0)
        if (parsed.length === 0) {
          setParseError("Aucune fiche valide détectée. Vérifiez les colonnes Fiche, Nb portions et Ingrédient (utilisez le modèle).")
          return
        }
        setFiches(parsed)
        setApercu(parsed.slice(0, 5))
        setFichierPret(true)
      } catch (err) {
        setParseError('Fichier illisible : ' + (err?.message || 'format inconnu'))
      }
    }
    reader.readAsBinaryString(fichier)
  }

  const handleImport = async () => {
    if (!fiches.length) return
    setLoading(true)
    setResultat(null)
    try {
      const clientId = await getClientId()
      if (!clientId) { setLoading(false); return }
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/import-fiches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ client_id: clientId, fiches }),
      })
      const json = await res.json()
      if (!res.ok) {
        setParseError(json.error || "Erreur lors de l'import.")
      } else {
        setResultat(json)
      }
    } catch {
      setParseError("Erreur réseau lors de l'import.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '760px', margin: '0 auto' }}>
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '28px', border: `0.5px solid ${c.bordure}`, marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Import Excel des fiches techniques
            </div>
            <button onClick={telechargerModele} style={{
              background: c.accentClair, color: c.accent, border: `0.5px solid ${c.accent}40`,
              borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: '500', cursor: 'pointer'
            }}>
              📥 Télécharger le modèle
            </button>
          </div>

          <div style={{ background: c.fond, borderRadius: '8px', padding: '14px 16px', fontSize: '13px', color: c.texteMuted, marginBottom: '20px', border: `0.5px solid ${c.bordure}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 12px' }}>
              <strong style={{ color: c.texte }}>Fiche</strong><span>Nom de la fiche <span style={{ color: '#DC2626' }}>*</span> (laissez vide pour ajouter un ingrédient à la fiche du dessus)</span>
              <strong style={{ color: c.texte }}>Catégorie</strong><span>Catégorie du plat (créée automatiquement si absente)</span>
              <strong style={{ color: c.texte }}>Nb portions</strong><span>Nombre de portions <span style={{ color: '#DC2626' }}>*</span></span>
              <strong style={{ color: c.texte }}>Prix TTC</strong><span>Prix de vente TTC (optionnel)</span>
              <strong style={{ color: c.texte }}>Ingrédient</strong><span>Nom de l&apos;ingrédient <span style={{ color: '#DC2626' }}>*</span></span>
              <strong style={{ color: c.texte }}>Quantité</strong><span>Quantité utilisée</span>
              <strong style={{ color: c.texte }}>Unité</strong><span>kg, g, L, cl, u…</span>
              <strong style={{ color: c.accent }}>Prix ingrédient HT</strong><span style={{ color: c.accent }}>Prix au kg/L de l&apos;ingrédient s&apos;il n&apos;existe pas encore (sinon ignoré)</span>
            </div>
            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: `0.5px solid ${c.bordure}`, fontSize: '12px' }}>
              <div style={{ color: c.vert, marginBottom: '2px' }}>✓ Les ingrédients et catégories absents sont créés automatiquement</div>
              <div style={{ color: c.vert, marginBottom: '2px' }}>✓ Le coût par portion est calculé à partir des prix du catalogue</div>
              <div style={{ color: c.texteMuted }}>○ Une fiche dont le nom existe déjà est ignorée (pas d&apos;écrasement)</div>
            </div>
          </div>

          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFichier}
            style={{ width: '100%', padding: '12px', border: `0.5px solid ${c.accent}`, borderRadius: '8px', fontSize: '13px', background: c.accentClair, cursor: 'pointer', color: c.texte, marginBottom: '16px' }}
          />

          {parseError && (
            <div style={{ background: '#FCEBEB', border: '0.5px solid #F09595', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#A32D2D' }}>
              {parseError}
            </div>
          )}

          {fichierPret && (
            <div style={{ marginBottom: '18px', border: `0.5px solid ${c.bordure}`, borderRadius: '10px', padding: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: c.texte, marginBottom: '4px' }}>
                {fiches.length} fiche{fiches.length > 1 ? 's' : ''} · {totalLignes} ligne{totalLignes > 1 ? 's' : ''} d&apos;ingrédient
              </div>
              <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '10px' }}>Aperçu des 5 premières fiches :</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: c.fond }}>
                      {['Fiche', 'Catégorie', 'Portions', 'Prix TTC', 'Ingrédients'].map((h) => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', border: `0.5px solid ${c.bordure}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {apercu.map((f, i) => (
                      <tr key={i}>
                        <td style={{ padding: '8px 12px', border: `0.5px solid ${c.bordure}`, color: c.texte }}>{f.nom}</td>
                        <td style={{ padding: '8px 12px', border: `0.5px solid ${c.bordure}` }}>
                          {f.categorie ? <Badge bg={c.accentClair} color={c.accent} size="sm">{f.categorie}</Badge> : <span style={{ color: c.texteMuted }}>—</span>}
                        </td>
                        <td style={{ padding: '8px 12px', border: `0.5px solid ${c.bordure}`, color: c.texte }}>{f.nb_portions}</td>
                        <td style={{ padding: '8px 12px', border: `0.5px solid ${c.bordure}`, color: c.texte }}>{f.prix_ttc != null ? `${f.prix_ttc} €` : '—'}</td>
                        <td style={{ padding: '8px 12px', border: `0.5px solid ${c.bordure}`, color: c.texteMuted }}>{f.lignes.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {loading && (
            <div style={{ marginBottom: '16px' }}>
              <ChefLoader message="Le chef enregistre vos fiches..." size={120} />
            </div>
          )}

          {fichierPret && !resultat && (
            <button onClick={handleImport} disabled={loading} style={{
              width: '100%', padding: '14px', background: loading ? c.texteMuted : c.accent,
              color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px',
              fontWeight: '600', textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer'
            }}>
              {loading ? 'Import en cours...' : `Importer ${fiches.length} fiche${fiches.length > 1 ? 's' : ''}`}
            </button>
          )}
        </div>

        {resultat && (
          <div style={{ background: c.vertClair, border: `0.5px solid ${c.vert}40`, borderRadius: '12px', padding: '20px' }}>
            <div style={{ fontWeight: '600', marginBottom: '12px', color: c.vert }}>Import terminé !</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' }}>
              {[
                { label: 'Fiches créées', value: resultat.fiches_creees, color: c.vert },
                { label: 'Ignorées', value: resultat.fiches_ignorees, color: '#D97706' },
                { label: 'Ingr. créés', value: resultat.ingredients_crees, color: c.accent },
                { label: 'Cat. créées', value: resultat.categories_creees, color: c.accent },
              ].map((s, i) => (
                <div key={i} style={{ background: c.blanc, borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: '500', color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '11px', color: c.texteMuted, textTransform: 'uppercase' }}>{s.label}</div>
                </div>
              ))}
            </div>
            {resultat.ingredients_crees > 0 && (
              <div style={{ background: '#FAEEDA', borderRadius: '8px', padding: '12px 14px', marginBottom: '12px', border: '0.5px solid #FAC775', fontSize: '12px', color: '#633806' }}>
                ⚠️ {resultat.ingredients_crees} ingrédient{resultat.ingredients_crees > 1 ? 's ont' : ' a'} été créé{resultat.ingredients_crees > 1 ? 's' : ''} sans prix renseigné dans le fichier : vérifiez leurs prix dans le catalogue puis recalculez les fiches.
              </div>
            )}
            <button onClick={() => router.push('/fiches')} style={{
              width: '100%', padding: '10px 20px', background: c.accent, color: 'white',
              border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500'
            }}>Voir les fiches</button>
          </div>
        )}
      </div>
    </div>
  )
}
