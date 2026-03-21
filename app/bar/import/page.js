'use client'
import { useState } from 'react'
import { supabase, getClientId } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../../lib/theme.jsx'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import { log } from '../../../lib/useLog'
import * as XLSX from 'xlsx'

export default function BarImportPage() {
  const [loading, setLoading] = useState(false)
  const [recalcul, setRecalcul] = useState(false)
  const [resultat, setResultat] = useState(null)
  const [apercu, setApercu] = useState([])
  const [fichierPret, setFichierPret] = useState(false)
  const [donnees, setDonnees] = useState([])
  const [progression, setProgression] = useState(0)
  const [etape, setEtape] = useState('')
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()

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
          unite: row[2]?.toString().trim() || 'cl'
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

    const clientId = await getClientId()
    if (!clientId) { setLoading(false); return }

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
            .from('ingredients_bar')
            .select('id, prix_kg')
            .eq('nom', ing.nom)
            .eq('client_id', clientId)
            .single()

          if (existing) {
            if (existing.prix_kg !== ing.prix_kg) {
              await supabase.from('ingredients_bar')
                .update({
                  prix_kg: ing.prix_kg,
                  unite: ing.unite,
                  prix_precedent: existing.prix_kg,
                  prix_updated_at: new Date().toISOString()
                })
                .eq('id', existing.id)
              misAJour++
            }
          } else {
            await supabase.from('ingredients_bar').insert([{
              ...ing,
              client_id: clientId
            }])
            importes++
          }
        } catch (e) { erreurs++ }
      }
      const done = Math.min(i + batchSize, total)
      setProgression(Math.round((done / total) * 100))
      setEtape(`Traitement ${done} / ${total} ingrédients...`)
      await new Promise(r => setTimeout(r, 10))
    }

    await log({
      action: 'IMPORT',
      entite: 'ingredients_bar',
      entite_nom: `${importes} nouveaux, ${misAJour} mis à jour`,
      section: 'bar',
      details: `${total} ingrédients bar traités`
    })

    setLoading(false)
    setResultat({ importes, misAJour, erreurs, total })
    setEtape('')
  }

  const handleRecalcul = async () => {
    setRecalcul(true)
    setEtape('Recalcul du coût de toutes les fiches bar...')
    await supabase.rpc('recalculer_cout_portions_bar')
    setRecalcul(false)
    setEtape('')
    setResultat(prev => ({ ...prev, recalculDone: true }))
  }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

      <div style={{
        background: '#3C3489', borderBottom: '0.5px solid #7F77DD40',
        padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Logo height={28} couleur="white" onClick={() => router.push('/bar/dashboard')} />
          <span style={{ background: '#7F77DD', color: 'white', borderRadius: '6px', padding: '2px 10px', fontSize: '11px', fontWeight: '600', letterSpacing: '1px' }}>BAR</span>
        </div>
        <button onClick={() => router.push('/bar/ingredients')} style={{
          background: 'transparent', color: 'rgba(255,255,255,0.7)',
          border: '0.5px solid rgba(255,255,255,0.2)',
          borderRadius: '8px', padding: '8px 12px', fontSize: '13px', cursor: 'pointer'
        }}>← {!isMobile && 'Retour'}</button>
      </div>

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '700px', margin: '0 auto' }}>

        {/* Recalcul rapide */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '20px', border: `0.5px solid ${c.bordure}`, marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '10px' }}>
            Mise à jour en masse des fiches bar
          </div>
          <div style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '14px' }}>
            Recalcule le coût de toutes les fiches bar avec les prix actuels des ingrédients.
          </div>
          <button onClick={handleRecalcul} disabled={recalcul} style={{
            width: '100%', padding: '14px', background: recalcul ? c.texteMuted : '#4A7B6F',
            color: 'white', border: 'none', borderRadius: '8px',
            fontSize: '13px', fontWeight: '600', cursor: recalcul ? 'not-allowed' : 'pointer'
          }}>
            {recalcul ? etape : '🔄 Recalculer toutes les fiches bar'}
          </button>
          {resultat?.recalculDone && (
            <div style={{ marginTop: '10px', padding: '10px 14px', background: '#E8F2EF', borderRadius: '8px', fontSize: '13px', color: '#4A7B6F', border: '0.5px solid #4A7B6F40' }}>
              ✓ Toutes les fiches bar ont été mises à jour !
            </div>
          )}
        </div>

        {/* Import Excel */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '28px', border: `0.5px solid ${c.bordure}`, marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '16px' }}>
            Import Excel des ingrédients bar
          </div>

          <div style={{ background: c.fond, borderRadius: '8px', padding: '14px 16px', fontSize: '13px', color: c.texteMuted, marginBottom: '20px', border: `0.5px solid ${c.bordure}` }}>
            <strong style={{ color: c.texte }}>Colonne A</strong> — Nom de l'article<br />
            <strong style={{ color: c.texte }}>Colonne B</strong> — Prix HT (avec . ou ,)<br />
            <strong style={{ color: c.texte }}>Colonne C</strong> — Unité (cl, ml, L...)<br />
            <div style={{ marginTop: '8px', color: '#4A7B6F', fontSize: '12px' }}>✓ Les prix existants seront mis à jour automatiquement</div>
          </div>

          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFichier}
            style={{ width: '100%', padding: '12px', border: '0.5px solid #7F77DD', borderRadius: '8px', fontSize: '13px', background: '#EEEDFE', cursor: 'pointer', color: c.texte, marginBottom: '16px' }}
          />

          {apercu.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '8px', fontWeight: '500' }}>
                Aperçu ({donnees.length} ingrédients) :
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: c.fond }}>
                      {['Nom', 'Prix HT', 'Unité'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', border: `0.5px solid ${c.bordure}` }}>{h}</th>
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
            </div>
          )}

          {loading && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '6px' }}>{etape}</div>
              <div style={{ background: c.fond, borderRadius: '20px', height: '8px', overflow: 'hidden', border: `0.5px solid ${c.bordure}` }}>
                <div style={{ background: '#7F77DD', height: '100%', borderRadius: '20px', width: `${progression}%`, transition: 'width 0.3s ease' }} />
              </div>
              <div style={{ fontSize: '12px', color: '#7F77DD', marginTop: '4px', textAlign: 'right' }}>{progression}%</div>
            </div>
          )}

          {fichierPret && (
            <button onClick={handleImport} disabled={loading} style={{
              width: '100%', padding: '14px', background: loading ? c.texteMuted : '#7F77DD',
              color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px',
              fontWeight: '600', textTransform: 'uppercase', cursor: loading ? 'not-allowed' : 'pointer'
            }}>
              {loading ? `Import en cours... ${progression}%` : `Importer / Mettre à jour ${donnees.length} ingrédients`}
            </button>
          )}
        </div>

        {resultat && (
          <div style={{ background: '#E8F2EF', border: '0.5px solid #4A7B6F40', borderRadius: '12px', padding: '20px' }}>
            <div style={{ fontWeight: '600', marginBottom: '10px', color: '#4A7B6F' }}>Import terminé !</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div style={{ background: c.blanc, borderRadius: '8px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: '500', color: '#4A7B6F' }}>{resultat.importes}</div>
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

            {resultat.misAJour > 0 && !resultat.recalculDone && (
              <div style={{ background: '#FAEEDA', borderRadius: '8px', padding: '14px', marginBottom: '12px', border: '0.5px solid #FAC775' }}>
                <div style={{ fontSize: '13px', color: '#633806', fontWeight: '500', marginBottom: '8px' }}>⚠️ {resultat.misAJour} prix ont été mis à jour</div>
                <button onClick={handleRecalcul} disabled={recalcul} style={{
                  width: '100%', padding: '12px', background: recalcul ? c.texteMuted : '#4A7B6F',
                  color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: recalcul ? 'not-allowed' : 'pointer'
                }}>
                  {recalcul ? 'Recalcul en cours...' : '🔄 Recalculer toutes les fiches bar'}
                </button>
              </div>
            )}

            {resultat.recalculDone && (
              <div style={{ background: '#E8F2EF', borderRadius: '8px', padding: '12px', marginBottom: '12px', border: '0.5px solid #4A7B6F40', fontSize: '13px', color: '#4A7B6F', fontWeight: '500' }}>
                ✓ Toutes les fiches bar ont été recalculées !
              </div>
            )}

            <button onClick={() => router.push('/bar/fiches')} style={{
              width: '100%', padding: '10px 20px', background: '#7F77DD', color: 'white',
              border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500'
            }}>Voir les fiches bar</button>
          </div>
        )}
      </div>
    </div>
  )
}
