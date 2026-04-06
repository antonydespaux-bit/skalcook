'use client'

import { ALLERGENES } from '../lib/allergenes'

/**
 * Shared allergen selector for fiche forms (nouvelle + modifier).
 * Used by both cuisine and bar.
 */
export function AllergenesSelector({ allergenes = [], onToggle, c }) {
  return (
    <div style={{ background: c.blanc, borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
      <div style={{ fontSize: '12px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '12px' }}>
        Allergènes présents dans la recette
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {ALLERGENES.map(a => {
          const selected = allergenes.includes(a.id)
          return (
            <button key={a.id} type="button" onClick={() => onToggle(a.id)} style={{
              padding: '6px 12px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
              border: `0.5px solid ${selected ? '#F09595' : c.bordure}`,
              background: selected ? '#FCEBEB' : c.blanc,
              color: selected ? '#A32D2D' : c.texteMuted,
              fontWeight: selected ? '500' : '400',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              <span>{a.emoji}</span> {a.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Shared financial preview for fiche forms.
 * Shows live food cost, cost per portion, and recommended price.
 */
export function FicheFinancialPreview({
  cout, coutPortion, fc, prixIndic, prixTTC,
  seuilVert, seuilOrange, isSousFiche, c
}) {
  if (!cout || cout <= 0) return null

  const fcColor = fc ? (fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D') : null
  const fcBg = fc ? (fc < seuilVert ? '#EAF3DE' : fc < seuilOrange ? '#FAEEDA' : '#FCEBEB') : null

  return (
    <div style={{
      background: c.blanc, borderRadius: '12px', padding: '16px',
      border: `0.5px solid ${c.bordure}`, marginBottom: '12px',
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px'
    }}>
      <div style={{ background: c.fond, borderRadius: '8px', padding: '10px' }}>
        <div style={{ fontSize: '10px', color: c.texteMuted, textTransform: 'uppercase' }}>Coût total</div>
        <div style={{ fontSize: '16px', fontWeight: '500', color: c.texte }}>{cout.toFixed(2)} €</div>
      </div>
      {coutPortion && (
        <div style={{ background: c.fond, borderRadius: '8px', padding: '10px' }}>
          <div style={{ fontSize: '10px', color: c.texteMuted, textTransform: 'uppercase' }}>Coût / portion</div>
          <div style={{ fontSize: '16px', fontWeight: '500', color: c.texte }}>{Number(coutPortion).toFixed(2)} €</div>
        </div>
      )}
      {fc && !isSousFiche && (
        <div style={{ background: fcBg, borderRadius: '8px', padding: '10px' }}>
          <div style={{ fontSize: '10px', color: fcColor, textTransform: 'uppercase' }}>Food cost</div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: fcColor }}>{fc} %</div>
        </div>
      )}
      {prixIndic && !isSousFiche && (
        <div style={{ background: '#EAF3DE', borderRadius: '8px', padding: '10px' }}>
          <div style={{ fontSize: '10px', color: '#3B6D11', textTransform: 'uppercase' }}>Prix indicatif TTC</div>
          <div style={{ fontSize: '16px', fontWeight: '500', color: '#3B6D11' }}>{prixIndic} €</div>
        </div>
      )}
    </div>
  )
}

/**
 * Shared metadata form section (nom, catégorie, lieu, saison, portions, prix).
 */
export function FicheMetadataForm({
  nom, setNom,
  categoriePlat, setCategoriePlat,
  lieuId, setLieuId,
  nbPortions, setNbPortions,
  prixTTC, setPrixTTC,
  description, setDescription,
  saison, setSaison,
  perte, setPerte,
  categoriesDyn, lieux, saisons,
  isSousFiche, isMobile, c,
  // Optional cuisine-specific
  unitePortions, setUnitePortions, unitesProduction,
}) {
  const inputStyle = {
    width: '100%', padding: '10px', borderRadius: '8px',
    border: `0.5px solid ${c.bordure}`, background: c.blanc,
    outline: 'none', fontSize: '14px', color: c.texte
  }
  const labelStyle = {
    fontSize: '11px', color: c.texteMuted, fontWeight: '500',
    textTransform: 'uppercase', letterSpacing: '0.04em',
    display: 'block', marginBottom: '6px'
  }

  return (
    <div style={{ background: c.blanc, borderRadius: '12px', padding: '20px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px' }}>
        <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
          <label style={labelStyle}>Nom de la fiche *</label>
          <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex : Risotto aux champignons" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Catégorie</label>
          <select value={categoriePlat} onChange={e => setCategoriePlat(e.target.value)} style={inputStyle}>
            <option value="">— Choisir —</option>
            {categoriesDyn.map(cat => <option key={cat.id} value={cat.id}>{cat.emoji} {cat.nom}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Lieu de service</label>
          <select value={lieuId} onChange={e => setLieuId(e.target.value)} style={inputStyle}>
            <option value="">— Tous les lieux —</option>
            {lieux.map(l => <option key={l.id} value={l.id}>{l.emoji} {l.nom}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Saison</label>
          <select value={saison} onChange={e => setSaison(e.target.value)} style={inputStyle}>
            {saisons.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>{unitePortions ? 'Nombre' : 'Nb portions'}</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="number" value={nbPortions} onChange={e => setNbPortions(e.target.value)}
              placeholder="Ex : 10" style={{ ...inputStyle, flex: 1 }} min="1" />
            {setUnitePortions && unitesProduction && (
              <select value={unitePortions} onChange={e => setUnitePortions(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '100px' }}>
                {unitesProduction.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            )}
          </div>
        </div>
        {!isSousFiche && (
          <div>
            <label style={labelStyle}>Prix TTC (€)</label>
            <input type="number" value={prixTTC} onChange={e => setPrixTTC(e.target.value)}
              placeholder="Ex : 24.00" style={inputStyle} step="0.01" min="0" />
          </div>
        )}
        <div>
          <label style={labelStyle}>Perte (%)</label>
          <input type="number" value={perte} onChange={e => setPerte(e.target.value)}
            placeholder="0" style={inputStyle} min="0" max="100" step="1" />
        </div>
        <div style={{ gridColumn: isMobile ? '1' : '1 / -1' }}>
          <label style={labelStyle}>Description / notes</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Instructions, notes..." rows={3}
            style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
      </div>
    </div>
  )
}
