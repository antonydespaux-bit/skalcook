import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Badge } from '../../ui'
import { ALLERGENES } from '../../../lib/allergenes'
import { theme } from '../../../lib/theme.jsx'

export default function SectionAllergenes({ c, fiches, lieux, params }) {
  const [filtreCategorie, setFiltreCategorie] = useState('toutes')
  const [filtreSaison, setFiltreSaison] = useState('toutes')
  const [filtreLieu, setFiltreLieu] = useState('tous')
  const [isExpanded, setIsExpanded] = useState(true)

  const fichesAvecAllergenes = fiches.filter((f) => f.allergenes && f.allergenes.length > 0)
  const fichesFiltreesAllergenes = fichesAvecAllergenes
    .filter((f) => filtreCategorie === 'toutes' || f.categorie === filtreCategorie)
    .filter((f) => filtreSaison === 'toutes' || f.saison === filtreSaison)
    .filter((f) => filtreLieu === 'tous' || f.lieu_id === filtreLieu)

  const exportAllergenesExcel = () => {
    const wb = XLSX.utils.book_new()
    const rows = fichesFiltreesAllergenes.map((f) => {
      const row = { Fiche: f.nom, Catégorie: f.categorie || '—', Saison: f.saison || '—' }
      ALLERGENES.forEach((a) => { row[`${a.emoji} ${a.label}`] = f.allergenes?.includes(a.id) ? '✓' : '' })
      return row
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, 'Allergènes')
    XLSX.writeFile(wb, `allergenes_la_fantaisie_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.xlsx`)
  }

  const today = new Date().toLocaleDateString('fr-FR')

  return (
    <>
      <div className="no-print" style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: isExpanded ? `0.5px solid ${c.bordure}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', background: isExpanded ? c.fond + '40' : c.blanc, transition: 'background 0.2s ease' }}>
          <div
            onClick={() => setIsExpanded(!isExpanded)}
            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
          >
            <div style={{ fontSize: '13px', fontWeight: '500', color: c.texte }}>⚠️ Tableau des allergènes</div>
            <Badge bg={'#FCEBEB'} color={'#A32D2D'} size="sm">
              {fichesAvecAllergenes.length} fiche{fichesAvecAllergenes.length > 1 ? 's' : ''}
            </Badge>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {isExpanded && (
              <>
                <select value={filtreCategorie} onChange={(e) => setFiltreCategorie(e.target.value)} style={{ padding: '6px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '12px', background: c.blanc, outline: 'none', color: c.texte, cursor: 'pointer' }}>
                  <option value="toutes">Toutes les catégories</option>
                  {theme.categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                <select value={filtreSaison} onChange={(e) => setFiltreSaison(e.target.value)} style={{ padding: '6px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '12px', background: c.blanc, outline: 'none', color: c.texte, cursor: 'pointer' }}>
                  <option value="toutes">Toutes les saisons</option>
                  {theme.saisons.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {lieux.length > 0 && (
                  <select value={filtreLieu} onChange={(e) => setFiltreLieu(e.target.value)} style={{ padding: '6px 10px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '12px', background: c.blanc, outline: 'none', color: c.texte, cursor: 'pointer' }}>
                    <option value="tous">Tous les lieux</option>
                    {lieux.map((l) => <option key={l.id} value={l.id}>{l.emoji ? `${l.emoji} ${l.nom}` : l.nom}</option>)}
                  </select>
                )}
                <button onClick={exportAllergenesExcel} style={{ padding: '6px 12px', background: c.vert, color: 'white', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>📊 Excel</button>
                <button onClick={() => window.print()} style={{ padding: '6px 12px', background: c.accent, color: c.principal, border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>🖨️ Imprimer</button>
              </>
            )}
            <div
              onClick={() => setIsExpanded(!isExpanded)}
              style={{ fontSize: '16px', color: c.texteMuted, fontWeight: '300', cursor: 'pointer' }}
            >
              {isExpanded ? '− Masquer' : '+ Développer'}
            </div>
          </div>
        </div>
        {isExpanded && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '900px' }}>
              <thead>
                <tr style={{ background: c.principal }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '11px', color: c.accent, fontWeight: '500', textTransform: 'uppercase', position: 'sticky', left: 0, background: c.principal, zIndex: 1, minWidth: '160px' }}>
                    Fiche / Catégorie
                  </th>
                  {ALLERGENES.map((a) => (
                    <th key={a.id} style={{ padding: '8px 4px', textAlign: 'center', fontSize: '10px', color: c.accent, fontWeight: '500', minWidth: '52px' }}>
                      <div style={{ fontSize: '14px' }}>{a.emoji}</div>
                      <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '0.5px', lineHeight: '1.2', marginTop: '2px' }}>{a.label}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fichesFiltreesAllergenes.map((fiche, i) => (
                  <tr key={fiche.id} style={{ borderBottom: `0.5px solid ${c.bordure}`, background: i % 2 === 0 ? c.blanc : c.fond }}>
                    <td style={{ padding: '10px 12px', position: 'sticky', left: 0, background: i % 2 === 0 ? c.blanc : c.fond, zIndex: 1 }}>
                      <div style={{ fontWeight: '500', color: c.texte, fontSize: '13px' }}>{fiche.nom}</div>
                      <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '2px' }}>{fiche.categorie}</div>
                    </td>
                    {ALLERGENES.map((a) => (
                      <td key={a.id} style={{ padding: '8px 4px', textAlign: 'center' }}>
                        {fiche.allergenes?.includes(a.id) ? (
                          <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#FCEBEB', border: '1.5px solid #A32D2D', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: '10px', color: '#A32D2D', fontWeight: '700' }}>✓</div>
                        ) : (
                          <div style={{ width: '20px', height: '20px', margin: '0 auto', opacity: 0.15, fontSize: '12px', textAlign: 'center', color: c.bordure }}>—</div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                {fichesFiltreesAllergenes.length === 0 && (
                  <tr>
                    <td colSpan={ALLERGENES.length + 1} style={{ padding: '30px', textAlign: 'center', color: c.texteMuted, fontSize: '13px' }}>
                      Aucune fiche avec allergènes
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Version impression */}
      <div className="print-only dashboard-allergenes-print" style={{ fontFamily: 'sans-serif', color: '#1a1a1a', background: 'white', padding: '0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #2C1810', paddingBottom: '12px', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: '8px', letterSpacing: '3px', textTransform: 'uppercase', color: '#8B7355', marginBottom: '4px' }}>Tableau des allergènes — Fiches actives</div>
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#2C1810', fontFamily: 'Georgia, serif' }}>{params['nom_etablissement'] || 'La Fantaisie'}</div>
            <div style={{ fontSize: '9px', color: '#8B7355', marginTop: '2px' }}>Imprimé le {today} — {fichesFiltreesAllergenes.length} fiche{fichesFiltreesAllergenes.length > 1 ? 's' : ''}</div>
          </div>
          <img
            src={params['logo_url'] || '/skalcook_logo.svg'}
            alt={params['nom_etablissement'] || 'Skalcook'}
            style={{ height: '60px', objectFit: 'contain' }}
          />
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ background: '#2C1810' }}>
              <th style={{ padding: '6px 8px', textAlign: 'left', color: '#C4956A', fontWeight: '600', fontSize: '9px', textTransform: 'uppercase', width: '140px', wordWrap: 'break-word' }}>Fiche</th>
              {ALLERGENES.map((a) => (
                <th key={a.id} style={{ padding: '4px 2px', textAlign: 'center', color: '#C4956A', fontWeight: '600', fontSize: '7px', textTransform: 'uppercase', lineHeight: '1.2' }}>
                  <div style={{ fontSize: '10px' }}>{a.emoji}</div>
                  <div style={{ fontSize: '6px', marginTop: '1px' }}>{a.label.replace('Céréales/Gluten', 'Gluten').replace('Graines de sésame', 'Sésame').replace('Anhydride sulfureux', 'Sulfites').replace('Fruits à coque', 'F. à coque')}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fichesFiltreesAllergenes.map((fiche, i) => (
              <tr key={fiche.id} style={{ background: i % 2 === 0 ? 'white' : '#FAF9F6', borderBottom: '0.5px solid #e8e4dc' }}>
                <td style={{ padding: '5px 8px', fontWeight: '500', color: '#2C1810', fontSize: '9px', wordWrap: 'break-word' }}>
                  {fiche.nom}
                  <div style={{ fontSize: '7px', color: '#8B7355', marginTop: '1px' }}>{fiche.categorie}</div>
                </td>
                {ALLERGENES.map((a) => (
                  <td key={a.id} style={{ padding: '4px 2px', textAlign: 'center' }}>
                    {fiche.allergenes?.includes(a.id) ? (
                      <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#FCEBEB', border: '1px solid #A32D2D', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', fontSize: '8px', color: '#A32D2D', fontWeight: '700' }}>✓</div>
                    ) : (
                      <div style={{ color: '#ddd', fontSize: '8px', textAlign: 'center' }}>·</div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: '10px', borderTop: '1px solid #e8e4dc', paddingTop: '8px', fontSize: '7px', color: '#8B7355' }}>
          <strong>Allergènes :</strong> {ALLERGENES.map((a) => `${a.emoji} ${a.label}`).join(' — ')}
        </div>
      </div>
    </>
  )
}
