'use client'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../lib/theme.jsx'
import * as XLSX from 'xlsx'

export default function ImportPage() {
  const [loading, setLoading] = useState(false)
  const [resultat, setResultat] = useState(null)
  const [apercu, setApercu] = useState([])
  const [fichierPret, setFichierPret] = useState(false)
  const [donnees, setDonnees] = useState([])
  const [progression, setProgression] = useState(0)
  const [etape, setEtape] = useState('')
  const router = useRouter()
  const c = theme.couleurs

  const normaliserPrix = (valeur) => {
    if (!valeur) return null
    const str = valeur.toString().replace(',', '.').replace(/[^0-9.]/g, '')
    const num = parseFloat(str)
    return isNaN(num) ? null : num
  }

  const handleFichier = (e) => {
    const fichier = e.target.files[0]
    if (!fichier) return
    setResultat(null)
    setProgression(0)

    const reader = new FileReader()
    reader.onload = (evt) => {
      const data = evt.target.result
      const workbook = XLSX.read(data, { type: 'binary' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })

      const ingredients = []
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (!row[0]) continue
        ingredients.push({
          nom: row[0]?.toString().trim(),
          prix_kg: normaliserPrix(row[1]),
          unite: row[2]?.toString().trim() || 'kg'
        })
      }

      setDonnees(ingredients)
      setApercu(ingredients.slice(0, 5))
      setFichierPret(true)
    }
    reader.readAsBinaryString(fichier)
  }

  const handleImport = async () => {
    if (!donnees.length) return
    setLoading(true)
    setResultat(null)
    setProgression(0)

    const batchSize = 50
    let importes = 0
    let misAJour = 0
    let erreurs = 0
    const total = donnees.length

    for (let i = 0; i < donnees.length; i += batchSize) {
      const batch = donnees.slice(i, i + batchSize)

      for (const ing of batch) {
        try {
          const { data: existing } = await supabase
            .from('ingredients')
            .select('id, prix_kg')
            .eq('nom', ing.nom)
            .single()

          if (existing) {
            if (existing.prix_kg !== ing.prix_kg) {
              await supabase
                .from('ingredients')
                .update({ prix_kg: ing.prix_kg, unite: ing.unite })
                .eq('id', existing.id)
              misAJour++
            }
          } else {
            await supabase
              .from('ingredients')
              .insert([ing])
            importes++
          }
        } catch (e) {
          erreurs++
        }
      }

      const done = Math.min(i + batchSize, total)
      setProgression(Math.round((done / total) * 100))
      setEtape(`Traitement ${done} / ${total} ingrédients...`)
      await new Promise(r => setTimeout(r, 10))
    }

    setLoading(false)
    setResultat({ importes, misAJour, erreurs, total })
    setEtape('')
  }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

      <div style={{
        background: c.principal,
        borderBottom: `0.5px solid ${c.accent}40`,
        padding: '0 24px',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px'
      }}>
        <Logo height={30} couleur="white" onClick={() => router.push('/fiches')} />
        <button onClick={() => router.push('/ingredients')} style={{
          background: 'transparent', color: 'rgba(255,255,255,0.7)',
          border: '0.5px solid rgba(255,255,255,0.2)',
          borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer'
        }}>← Retour</button>
      </div>

      <div style={{ padding: '24px', maxWidth: '700px', margin: '0 auto' }}>

        <div style={{
          background: 'white', borderRadius: '12px', padding: '28px',
          border: `0.5px solid ${c.bordure}`, marginBottom: '20px'
        }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '16px' }}>
            Import Excel des ingrédients
          </div>

          <div style={{
            background: c.fond, borderRadius: '8px', padding: '14px 16px',
            fontSize: '13px', color: c.texteMuted, marginBottom: '20px',
            border: `0.5px solid ${c.bordure}`
          }}>
            <strong style={{ color: c.texte }}>Colonne A</strong> — Nom de l'article<br />
            <strong style={{ color: c.texte }}>Colonne B</strong> — Prix HT (avec . ou ,)<br />
            <strong style={{ color: c.texte }}>Colonne C</strong> — Unité d'utilisation<br />
            <div style={{ marginTop: '8px', color: c.vert, fontSize: '12px' }}>
              ✓ Les prix existants seront mis à jour automatiquement
            </div>
          </div>

          <input
            type="file" accept=".xlsx,.xls,.csv"
            onChange={handleFichier}
            style={{
              width: '100%', padding: '12px',
              border: `0.5px solid ${c.accent}`,
              borderRadius: '8px', fontSize: '13px',
              background: c.accentClair, cursor: 'pointer',
              color: c.texte, marginBottom: '16px'
            }}
          />

          {apercu.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '8px', fontWeight: '500' }}>
                Aperçu des 5 premiers ingrédients ({donnees.length} au total) :
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: c.fond }}>
                    {['Nom', 'Prix HT', 'Unité'].map(h => (
                      <th key={h} style={{
                        padding: '8px 12px', textAlign: 'left',
                        fontSize: '11px', color: c.texteMuted,
                        fontWeight: '500', textTransform: 'uppercase',
                        border: `0.5px solid ${c.bordure}`
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {apercu.map((ing, i) => (
                    <tr key={i}>
                      <td style={{ padding: '8px 12px', border: `0.5px solid ${c.bordure}`, color: c.texte }}>{ing.nom}</td>
                      <td style={{ padding: '8px 12px', border: `0.5px solid ${c.bordure}`, color: c.texte }}>{ing.prix_kg ? `${ing.prix_kg} €` : '—'}</td>
                      <td style={{ padding: '8px 12px', border: `0.5px solid ${c.bordure}`, color: c.texte }}>{ing.unite}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Barre de progression */}
          {loading && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '6px' }}>
                {etape}
              </div>
              <div style={{ background: c.fond, borderRadius: '20px', height: '8px', overflow: 'hidden', border: `0.5px solid ${c.bordure}` }}>
                <div style={{
                  background: c.accent, height: '100%', borderRadius: '20px',
                  width: `${progression}%`, transition: 'width 0.3s ease'
                }} />
              </div>
              <div style={{ fontSize: '12px', color: c.accent, marginTop: '4px', textAlign: 'right' }}>
                {progression}%
              </div>
            </div>
          )}

          {fichierPret && (
            <button
              onClick={handleImport}
              disabled={loading}
              style={{
                width: '100%', padding: '14px',
                background: loading ? c.texteMuted : c.accent,
                color: c.principal, border: 'none',
                borderRadius: '8px', fontSize: '13px',
                fontWeight: '600', letterSpacing: '1px',
                textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? `Import en cours... ${progression}%` : `Importer / Mettre à jour ${donnees.length} ingrédients`}
            </button>
          )}
        </div>

        {resultat && (
          <div style={{
            background: c.vertClair,
            border: `0.5px solid ${c.vert}40`,
            borderRadius: '12px', padding: '20px',
            fontSize: '14px', color: c.vert
          }}>
            <div style={{ fontWeight: '600', marginBottom: '10px' }}>Import terminé !</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div style={{ background: 'white', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: '500', color: c.vert }}>{resultat.importes}</div>
                <div style={{ fontSize: '11px', color: c.texteMuted, textTransform: 'uppercase' }}>Nouveaux</div>
              </div>
              <div style={{ background: 'white', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: '500', color: '#854F0B' }}>{resultat.misAJour}</div>
                <div style={{ fontSize: '11px', color: c.texteMuted, textTransform: 'uppercase' }}>Mis à jour</div>
              </div>
              <div style={{ background: 'white', borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: '500', color: resultat.erreurs > 0 ? '#A32D2D' : c.texte }}>{resultat.erreurs}</div>
                <div style={{ fontSize: '11px', color: c.texteMuted, textTransform: 'uppercase' }}>Erreurs</div>
              </div>
            </div>
            <button
              onClick={() => router.push('/ingredients')}
              style={{
                width: '100%', padding: '10px 20px',
                background: c.vert, color: 'white',
                border: 'none', borderRadius: '8px',
                fontSize: '13px', cursor: 'pointer', fontWeight: '500'
              }}
            >
              Voir les ingrédients
            </button>
          </div>
        )}
      </div>
    </div>
  )
}