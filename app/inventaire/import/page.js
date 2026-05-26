'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import * as XLSX from 'xlsx'
import { supabase, getClientId } from '../../../lib/supabase'
import { useTheme } from '../../../lib/useTheme'
import { useRole } from '../../../lib/useRole'
import { useIsMobile } from '../../../lib/useIsMobile'
import Navbar from '../../../components/Navbar'
import ChefLoader from '../../../components/ChefLoader'

const todayIso = () => new Date().toISOString().slice(0, 10)

export default function ImportInventairePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { c } = useTheme()
  const { role } = useRole()
  const isMobile = useIsMobile()

  const sectionParam = searchParams.get('section')
  const sectionForced = sectionParam === 'bar' || sectionParam === 'cuisine' ? sectionParam : null
  const navbarSection = sectionForced || (role === 'bar' ? 'bar' : 'cuisine')
  const queryString = sectionForced ? `?section=${sectionForced}` : ''

  const canChooseSection = !sectionForced && (role === 'admin' || role === 'directeur')

  const [section, setSection] = useState(sectionForced || (role === 'bar' ? 'bar' : 'cuisine'))
  const [dateInventaire, setDateInventaire] = useState(todayIso())
  const [lignes, setLignes] = useState([])
  const [fileName, setFileName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  const handleFile = (e) => {
    setError('')
    setResult(null)
    const f = e.target.files?.[0]
    if (!f) return
    setFileName(f.name)
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })

        const parseSheet = (sheet) => {
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })
          const out = []
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i]
            if (!row || row.length === 0) continue
            const nom = String(row[0] || '').trim()
            const qStr = String(row[1] || '').replace(',', '.').replace(/[^0-9.\-]/g, '')
            const quantite = parseFloat(qStr)
            if (!nom || isNaN(quantite)) continue
            out.push({ nom, quantite })
          }
          return out
        }

        // Excel peut masquer des feuilles vides en première position : on scanne
        // d'abord les feuilles visibles, puis les masquées en fallback, et on prend
        // la première qui contient au moins une ligne valide.
        const sheetMeta = wb.Workbook?.Sheets || []
        const isHidden = (i) => (sheetMeta[i]?.Hidden ?? 0) !== 0
        const visible = wb.SheetNames.filter((_, i) => !isHidden(i))
        const hidden = wb.SheetNames.filter((_, i) => isHidden(i))
        const ordered = [...visible, ...hidden]

        let parsed = []
        for (const name of ordered) {
          parsed = parseSheet(wb.Sheets[name])
          if (parsed.length > 0) break
        }

        if (parsed.length === 0) {
          setError('Aucune ligne valide trouvée. Vérifie le format : colonne A = Nom, colonne B = Quantité.')
          setLignes([])
          return
        }
        setLignes(parsed)
      } catch (err) {
        setError('Lecture du fichier échouée : ' + (err.message || 'fichier invalide'))
      }
    }
    reader.readAsBinaryString(f)
  }

  const telechargerModele = () => {
    const wb = XLSX.utils.book_new()
    const rows = [
      ['Nom', 'Quantité'],
      ['Beurre doux', '4.5'],
      ['Farine T55', '12'],
      ['Tomates cerises', '2.3'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    ws['!cols'] = [{ wch: 30 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Inventaire')
    XLSX.writeFile(wb, 'modele_import_inventaire.xlsx')
  }

  const handleSubmit = async () => {
    if (lignes.length === 0) {
      setError('Uploade un fichier Excel avant de valider.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const clientId = await getClientId()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/inventaire/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          client_id: clientId,
          section,
          date_inventaire: dateInventaire,
          lignes,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Erreur lors de l\'import')
        return
      }
      setResult(data)
    } catch (err) {
      setError('Erreur réseau : ' + (err.message || ''))
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render résultat ──────────────────────────────────────────────────────
  if (result) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond }}>
        <Navbar section={navbarSection} />
        <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ background: '#DCFCE7', border: '0.5px solid #86EFAC', borderRadius: '12px', padding: '20px', marginBottom: '16px' }}>
            <div style={{ fontSize: '15px', fontWeight: '600', color: '#166534', marginBottom: '8px' }}>
              ✓ Inventaire importé
            </div>
            <div style={{ fontSize: '13px', color: '#15803D' }}>
              {result.nb_lignes} ligne{result.nb_lignes > 1 ? 's' : ''} créée{result.nb_lignes > 1 ? 's' : ''} pour le {dateInventaire}.
              {result.nb_ingredients_crees > 0 && (
                <> {result.nb_ingredients_crees} nouvel{result.nb_ingredients_crees > 1 ? 's' : ''} ingrédient{result.nb_ingredients_crees > 1 ? 's ont' : ' a'} été ajouté{result.nb_ingredients_crees > 1 ? 's' : ''} à la base.</>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => router.push(`/inventaire/${result.inventaire.id}${queryString}`)}
              style={{ flex: 1, padding: '12px', background: c.accent, color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
              Voir l&apos;inventaire
            </button>
            <button onClick={() => router.push(`/inventaire${queryString}`)}
              style={{ flex: 1, padding: '12px', background: c.blanc, color: c.texteMuted, border: `0.5px solid ${c.bordure}`, borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>
              Retour à la liste
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section={navbarSection} />
      <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '700px', margin: '0 auto' }}>

        <button onClick={() => router.push(`/inventaire${queryString}`)}
          style={{ background: 'none', border: 'none', color: c.texteMuted, fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '12px' }}>
          ← Inventaires
        </button>

        <h1 style={{ fontSize: '20px', fontWeight: '600', color: c.texte, margin: '0 0 6px 0' }}>
          Importer un inventaire
        </h1>
        <p style={{ fontSize: '13px', color: c.texteMuted, margin: '0 0 24px 0' }}>
          Upload un Excel avec les quantités comptées. Les ingrédients absents de ta base seront créés automatiquement.
          L&apos;inventaire est validé immédiatement et devient la nouvelle référence pour les calculs de stock théorique.
        </p>

        {/* Section + Date */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}`, marginBottom: '16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: canChooseSection ? '1fr 1fr' : '1fr', gap: '12px' }}>
            {canChooseSection && (
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Section</label>
                <select value={section} onChange={e => setSection(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte, cursor: 'pointer' }}>
                  <option value="cuisine">🍳 Cuisine</option>
                  <option value="bar">🍸 Bar</option>
                </select>
              </div>
            )}
            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>
                Date de l&apos;inventaire
              </label>
              <input type="date" value={dateInventaire} onChange={e => setDateInventaire(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}
              />
            </div>
          </div>
        </div>

        {/* Format + modèle */}
        <div style={{ background: c.fond, borderRadius: '8px', padding: '14px 16px', fontSize: '13px', color: c.texteMuted, marginBottom: '16px', border: `0.5px solid ${c.bordure}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
            <strong style={{ color: c.texte }}>Format attendu</strong>
            <button onClick={telechargerModele}
              style={{ background: c.accentClair, color: c.accent, border: `0.5px solid ${c.accent}40`, borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer' }}>
              📥 Télécharger le modèle
            </button>
          </div>
          <div>
            <strong style={{ color: c.texte }}>Colonne A</strong> — Nom de l&apos;ingrédient (la première ligne est ignorée comme en-tête)<br />
            <strong style={{ color: c.texte }}>Colonne B</strong> — Quantité (point ou virgule décimale)
          </div>
        </div>

        {/* File upload */}
        <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile}
          style={{ width: '100%', padding: '12px', border: `0.5px solid ${c.accent}`, borderRadius: '8px', fontSize: '13px', background: c.accentClair, cursor: 'pointer', color: c.texte, marginBottom: '16px' }}
        />

        {fileName && lignes.length > 0 && (
          <div style={{ background: c.blanc, borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', color: c.texte }}>
            <strong>{fileName}</strong> — {lignes.length} ligne{lignes.length > 1 ? 's' : ''} détectée{lignes.length > 1 ? 's' : ''}
          </div>
        )}

        {/* Preview */}
        {lignes.length > 0 && (
          <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden', marginBottom: '16px' }}>
            <div style={{ padding: '10px 16px', borderBottom: `0.5px solid ${c.bordure}`, fontSize: '12px', fontWeight: '600', color: c.texteMuted, textTransform: 'uppercase' }}>
              Aperçu ({Math.min(10, lignes.length)} premières lignes)
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: c.fond }}>
                  <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Nom</th>
                  <th style={{ padding: '8px 16px', textAlign: 'right', fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Quantité</th>
                </tr>
              </thead>
              <tbody>
                {lignes.slice(0, 10).map((l, i) => (
                  <tr key={i} style={{ borderTop: `0.5px solid ${c.bordure}` }}>
                    <td style={{ padding: '8px 16px', color: c.texte }}>{l.nom}</td>
                    <td style={{ padding: '8px 16px', textAlign: 'right', color: c.texte }}>{l.quantite}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lignes.length > 10 && (
              <div style={{ padding: '8px 16px', fontSize: '12px', color: c.texteMuted, fontStyle: 'italic', borderTop: `0.5px solid ${c.bordure}` }}>
                + {lignes.length - 10} autre{lignes.length - 10 > 1 ? 's' : ''} ligne{lignes.length - 10 > 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}

        {error && (
          <div style={{ background: '#FEE2E2', border: '0.5px solid #FECACA', borderRadius: '8px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: '#991B1B' }}>
            {error}
          </div>
        )}

        {submitting ? (
          <ChefLoader message="Création de l'inventaire..." />
        ) : (
          <button onClick={handleSubmit} disabled={lignes.length === 0}
            style={{
              width: '100%', padding: '14px',
              background: lignes.length === 0 ? c.texteMuted : c.accent,
              color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600',
              cursor: lignes.length === 0 ? 'not-allowed' : 'pointer',
            }}>
            {lignes.length === 0 ? 'Sélectionne un fichier' : `Créer l'inventaire (${lignes.length} ligne${lignes.length > 1 ? 's' : ''})`}
          </button>
        )}
      </div>
    </div>
  )
}
