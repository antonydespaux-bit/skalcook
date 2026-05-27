'use client'
import IngredientSearch from './IngredientSearch'
import { Card } from './ui'

const UNITES = ['kg', 'g', 'L', 'cl', 'ml', 'u', 'botte', 'pièce', 'portions']

export default function SectionsEditor({
  sections,
  setSections,
  ingredients,
  setIngredients,
  listeIngredients,
  c,
  isMobile,
}) {
  const ajouterSection = () => {
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    setSections([...sections, { tempId, nom: '', descriptif: '' }])
  }

  const modifierSection = (tempId, champ, valeur) => {
    setSections(sections.map(s => s.tempId === tempId ? { ...s, [champ]: valeur } : s))
  }

  const supprimerSection = (tempId) => {
    if (!confirm('Supprimer cette préparation et ses ingrédients ?')) return
    setSections(sections.filter(s => s.tempId !== tempId))
    setIngredients(ingredients.filter(i => i.section_temp_id !== tempId))
  }

  const monterSection = (idx) => {
    if (idx === 0) return
    const next = [...sections]
    ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
    setSections(next)
  }

  const descendreSection = (idx) => {
    if (idx === sections.length - 1) return
    const next = [...sections]
    ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
    setSections(next)
  }

  const ajouterIngredientSection = (sectionTempId) => {
    setIngredients([...ingredients, { ingredient_id: '', nom: '', quantite: '', unite: 'kg', section_temp_id: sectionTempId }])
  }

  const modifierIngredient = (gIdx, champ, valeur) => {
    const nouveaux = [...ingredients]
    nouveaux[gIdx][champ] = valeur
    if (champ === 'ingredient_id') {
      const ing = listeIngredients.find(i => i.id === valeur)
      if (ing) {
        nouveaux[gIdx].nom = ing.nom
        nouveaux[gIdx].unite = ing.unite || 'kg'
      }
    }
    setIngredients(nouveaux)
  }

  const supprimerIngredient = (gIdx) => {
    setIngredients(ingredients.filter((_, i) => i !== gIdx))
  }

  // Sur desktop, on rend l'ingrédient sur sa propre ligne (large) + qté/unité/suppr
  // en dessous, pour que le nom long de l'ingrédient soit toujours visible.
  // Sur mobile, tout en colonne unique.
  const rowTemplate = isMobile ? '1fr' : 'minmax(0, 1fr)'

  return (
    <Card c={c} style={{ marginBottom: '12px' }}>
      <div className="sk-label-muted" style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '6px' }}>⭐ Préparations</div>
      <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '14px' }}>
        Chaque préparation regroupe ses ingrédients et son descriptif. Le coût est calculé section par section.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {sections.map((section, sIdx) => {
          const ingsSection = ingredients
            .map((ing, gIdx) => ({ ing, gIdx }))
            .filter(({ ing }) => ing.section_temp_id === section.tempId)
          const coutSection = ingsSection.reduce((tot, { ing }) => {
            const ingData = listeIngredients.find(i => i.id === ing.ingredient_id)
            if (ingData?.prix_kg && ing.quantite) return tot + (ingData.prix_kg * parseFloat(ing.quantite))
            return tot
          }, 0)
          return (
            <div key={section.tempId} style={{ background: c.fond, borderRadius: '10px', padding: '14px', border: `0.5px solid ${c.bordure}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <input
                  type="text" value={section.nom}
                  onChange={e => modifierSection(section.tempId, 'nom', e.target.value)}
                  placeholder={`Préparation ${sIdx + 1} — ex : Garniture navet ail noir`}
                  style={{ flex: 1, padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', fontWeight: '500', outline: 'none', color: c.texte, background: c.blanc }}
                />
                <button type="button" onClick={() => monterSection(sIdx)} disabled={sIdx === 0}
                  style={{ width: '32px', height: '36px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, background: c.blanc, cursor: sIdx === 0 ? 'not-allowed' : 'pointer', color: c.texteMuted, opacity: sIdx === 0 ? 0.3 : 1 }}>↑</button>
                <button type="button" onClick={() => descendreSection(sIdx)} disabled={sIdx === sections.length - 1}
                  style={{ width: '32px', height: '36px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, background: c.blanc, cursor: sIdx === sections.length - 1 ? 'not-allowed' : 'pointer', color: c.texteMuted, opacity: sIdx === sections.length - 1 ? 0.3 : 1 }}>↓</button>
                <button type="button" onClick={() => supprimerSection(section.tempId)}
                  style={{ width: '36px', height: '36px', borderRadius: '8px', border: '0.5px solid #FECACA', background: c.blanc, cursor: 'pointer', color: '#DC2626', fontSize: '16px' }}>🗑</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: '10px', alignItems: 'stretch' }}>
                {/* Colonne gauche : ingrédients */}
                <div style={{ background: c.blanc, borderRadius: '8px', padding: '10px', border: `0.5px solid ${c.bordure}` }}>
                  <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', marginBottom: '8px' }}>Ingrédients</div>
                  {ingsSection.length === 0 && (
                    <div style={{ fontSize: '12px', color: c.texteMuted, fontStyle: 'italic', padding: '6px 0' }}>Aucun ingrédient — ajoutez-en un ci-dessous.</div>
                  )}
                  {ingsSection.map(({ ing, gIdx }) => {
                    const ingData = listeIngredients.find(i => i.id === ing.ingredient_id)
                    const coutLigne = ingData?.prix_kg && ing.quantite ? (ingData.prix_kg * parseFloat(ing.quantite)) : null
                    return (
                      <div key={gIdx} style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: `0.5px solid ${c.bordure}` }}>
                        {/* Ligne 1 : nom ingrédient pleine largeur (lisibilité) */}
                        <div style={{ marginBottom: '6px' }}>
                          <IngredientSearch ingredients={listeIngredients} value={ing.ingredient_id} onChange={val => modifierIngredient(gIdx, 'ingredient_id', val)} />
                        </div>
                        {/* Ligne 2 : qté / unité / coût / supprimer */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 80px) minmax(0, 90px) 1fr 32px', gap: '6px', alignItems: 'center' }}>
                          <input type="number" value={ing.quantite} step="0.01" placeholder="Qté"
                            onChange={e => modifierIngredient(gIdx, 'quantite', e.target.value)}
                            style={{ padding: '8px 10px', borderRadius: '6px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', outline: 'none', color: c.texte, background: c.blanc, minWidth: 0 }}
                          />
                          <select value={ing.unite} onChange={e => modifierIngredient(gIdx, 'unite', e.target.value)}
                            style={{ padding: '8px 6px', borderRadius: '6px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', background: c.blanc, outline: 'none', color: c.texte, minWidth: 0 }}>
                            {UNITES.map(u => <option key={u}>{u}</option>)}
                          </select>
                          <div style={{ fontSize: '11px', color: coutLigne ? c.texte : c.texteMuted, textAlign: 'right', whiteSpace: 'nowrap', paddingRight: '4px' }}>
                            {coutLigne ? `${coutLigne.toFixed(2)} €` : '—'}
                          </div>
                          <button type="button" onClick={() => supprimerIngredient(gIdx)} style={{ background: 'transparent', border: `0.5px solid ${c.bordure}`, borderRadius: '6px', cursor: 'pointer', color: '#aaa', fontSize: '14px', height: '32px', width: '32px' }}>×</button>
                        </div>
                      </div>
                    )
                  })}
                  <button type="button" onClick={() => ajouterIngredientSection(section.tempId)} style={{ background: c.vertClair, color: c.vert, border: `0.5px solid ${c.vert}40`, borderRadius: '6px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer', marginTop: '4px' }}>
                    + Ingrédient
                  </button>
                  {coutSection > 0 && (
                    <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: `0.5px solid ${c.bordure}`, fontSize: '11px', color: c.texteMuted, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Coût section</span>
                      <strong style={{ color: c.texte }}>{coutSection.toFixed(2)} €</strong>
                    </div>
                  )}
                </div>

                {/* Colonne droite : descriptif */}
                <div style={{ background: c.blanc, borderRadius: '8px', padding: '10px', border: `0.5px solid ${c.bordure}`, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', marginBottom: '8px' }}>Descriptif / méthode</div>
                  <textarea
                    value={section.descriptif}
                    onChange={e => modifierSection(section.tempId, 'descriptif', e.target.value)}
                    placeholder="Méthode de préparation de cette section…"
                    rows={isMobile ? 4 : 8}
                    style={{ flex: 1, padding: '10px', borderRadius: '6px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', color: c.texte, background: c.blanc, lineHeight: '1.6', minHeight: '90px' }}
                  />
                </div>
              </div>
            </div>
          )
        })}
        {sections.length === 0 && (
          <div style={{ background: c.fond, borderRadius: '10px', padding: '20px', textAlign: 'center', fontSize: '13px', color: c.texteMuted, border: `0.5px dashed ${c.bordure}` }}>
            Aucune préparation pour l'instant. Cliquez sur « Ajouter une préparation » pour démarrer.
          </div>
        )}
        <button type="button" onClick={ajouterSection} style={{ background: c.accentClair, color: c.accent, border: `0.5px solid ${c.accent}40`, borderRadius: '8px', padding: '10px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
          + Ajouter une préparation
        </button>
      </div>
    </Card>
  )
}
