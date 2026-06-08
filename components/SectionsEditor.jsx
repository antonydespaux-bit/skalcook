'use client'
import { useState } from 'react'
import IngredientSearch from './IngredientSearch'
import { Card } from './ui'
import { coutLigneEditor } from '../lib/cout'

const UNITES = ['kg', 'g', 'L', 'cl', 'ml', 'u', 'botte', 'pièce', 'portions']
const UNITES_RENDEMENT = ['g', 'kg', 'ml', 'cl', 'L', 'u', 'portions']

export default function SectionsEditor({
  sections,
  setSections,
  ingredients,
  setIngredients,
  listeIngredients,
  listeSousFiches = [],
  onPromoteSection,
  onImportSousFiche,
  c,
  isMobile,
}) {
  // Modale "rendement" pour la promotion d'une section en sous-fiche.
  const [promoteFor, setPromoteFor] = useState(null) // tempId de la section
  const [rendQte, setRendQte] = useState('')
  const [rendUnite, setRendUnite] = useState('g')
  const [promoBusy, setPromoBusy] = useState(false)
  // Picker d'import de sous-fiche existante.
  const [importOpen, setImportOpen] = useState(false)
  const [importSel, setImportSel] = useState('')
  const [importBusy, setImportBusy] = useState(false)

  const ajouterSection = () => {
    const tempId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    setSections([...sections, { tempId, nom: '', descriptif: '', sous_fiche_id: null }])
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

  const lignesDeSection = (tempId) => ingredients.filter(i => i.section_temp_id === tempId)

  const ouvrirPromotion = (section) => {
    const lignes = lignesDeSection(section.tempId)
    if (!(section.nom || '').trim()) { alert('Donnez d\'abord un nom à la préparation.'); return }
    if (lignes.filter(l => l.ingredient_id && l.quantite).length === 0) { alert('Ajoutez au moins un ingrédient avant de créer une sous-fiche.'); return }
    setPromoteFor(section.tempId)
    setRendQte('')
    setRendUnite('g')
  }

  const lancerPromotion = async (section) => {
    if (!rendQte || parseFloat(rendQte) <= 0) { alert('Indiquez la quantité produite.'); return }
    setPromoBusy(true)
    try {
      await onPromoteSection(section, lignesDeSection(section.tempId), { qte: rendQte, unite: rendUnite })
      setPromoteFor(null)
      setRendQte('')
    } catch (e) {
      alert('Erreur création sous-fiche : ' + (e?.message || e))
    } finally {
      setPromoBusy(false)
    }
  }

  const lancerImport = async () => {
    if (!importSel) return
    const sf = listeSousFiches.find(s => String(s.id) === String(importSel))
    if (!sf) return
    setImportBusy(true)
    try {
      await onImportSousFiche(sf)
      setImportOpen(false)
      setImportSel('')
    } catch (e) {
      alert('Erreur import : ' + (e?.message || e))
    } finally {
      setImportBusy(false)
    }
  }

  const peutPromouvoir = typeof onPromoteSection === 'function'
  const peutImporter = typeof onImportSousFiche === 'function' && listeSousFiches.length > 0

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
            return tot + coutLigneEditor(ingData, ing.quantite, ing.unite)
          }, 0)
          const estLiee = !!section.sous_fiche_id
          return (
            <div key={section.tempId} style={{ background: c.fond, borderRadius: '10px', padding: '14px', border: `0.5px solid ${c.bordure}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <input
                  type="text" value={section.nom}
                  onChange={e => modifierSection(section.tempId, 'nom', e.target.value)}
                  placeholder={`Préparation ${sIdx + 1} — ex : Garniture navet ail noir`}
                  style={{ flex: 1, minWidth: '160px', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', fontWeight: '500', outline: 'none', color: c.texte, background: c.blanc }}
                />
                {estLiee && (
                  <span title="Une sous-fiche réutilisable a été créée à partir de cette préparation." style={{ fontSize: '11px', fontWeight: '600', color: '#3C3489', background: '#EEEDFE', border: '0.5px solid #AFA9EC', borderRadius: '6px', padding: '5px 8px', whiteSpace: 'nowrap' }}>↗ réutilisable</span>
                )}
                <button type="button" onClick={() => monterSection(sIdx)} disabled={sIdx === 0}
                  style={{ width: '32px', height: '36px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, background: c.blanc, cursor: sIdx === 0 ? 'not-allowed' : 'pointer', color: c.texteMuted, opacity: sIdx === 0 ? 0.3 : 1 }}>↑</button>
                <button type="button" onClick={() => descendreSection(sIdx)} disabled={sIdx === sections.length - 1}
                  style={{ width: '32px', height: '36px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, background: c.blanc, cursor: sIdx === sections.length - 1 ? 'not-allowed' : 'pointer', color: c.texteMuted, opacity: sIdx === sections.length - 1 ? 0.3 : 1 }}>↓</button>
                <button type="button" onClick={() => supprimerSection(section.tempId)}
                  style={{ width: '36px', height: '36px', borderRadius: '8px', border: '0.5px solid #FECACA', background: c.blanc, cursor: 'pointer', color: '#DC2626', fontSize: '16px' }}>🗑</button>
              </div>

              {/* Action : rendre la section réutilisable (promotion en sous-fiche) */}
              {peutPromouvoir && !estLiee && promoteFor !== section.tempId && (
                <button type="button" onClick={() => ouvrirPromotion(section)}
                  style={{ background: '#EEEDFE', color: '#3C3489', border: '0.5px solid #AFA9EC', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer', marginBottom: '10px' }}>
                  ↗ Rendre réutilisable
                </button>
              )}
              {peutPromouvoir && promoteFor === section.tempId && (
                <div style={{ background: '#F6F5FE', border: '0.5px solid #AFA9EC', borderRadius: '8px', padding: '10px', marginBottom: '10px' }}>
                  <div style={{ fontSize: '12px', color: '#3C3489', marginBottom: '8px' }}>
                    Cette préparation produit quelle quantité au total ? (pour calculer le coût par unité)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <input type="number" step="0.01" value={rendQte} placeholder="ex. 2800"
                      onChange={e => setRendQte(e.target.value)}
                      style={{ width: '110px', padding: '8px 10px', borderRadius: '6px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', outline: 'none', color: c.texte, background: c.blanc }} />
                    <select value={rendUnite} onChange={e => setRendUnite(e.target.value)}
                      style={{ padding: '8px 6px', borderRadius: '6px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', background: c.blanc, outline: 'none', color: c.texte }}>
                      {UNITES_RENDEMENT.map(u => <option key={u}>{u}</option>)}
                    </select>
                    <button type="button" onClick={() => lancerPromotion(section)} disabled={promoBusy}
                      style={{ background: '#3C3489', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', cursor: promoBusy ? 'not-allowed' : 'pointer', fontWeight: '600', opacity: promoBusy ? 0.6 : 1 }}>
                      {promoBusy ? '…' : 'Créer la sous-fiche'}
                    </button>
                    <button type="button" onClick={() => setPromoteFor(null)} disabled={promoBusy}
                      style={{ background: 'transparent', color: c.texteMuted, border: `0.5px solid ${c.bordure}`, borderRadius: '6px', padding: '8px 12px', fontSize: '12px', cursor: 'pointer' }}>
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: '10px', alignItems: 'stretch' }}>
                {/* Colonne gauche : ingrédients */}
                <div style={{ background: c.blanc, borderRadius: '8px', padding: '10px', border: `0.5px solid ${c.bordure}` }}>
                  <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', marginBottom: '8px' }}>Ingrédients</div>
                  {ingsSection.length === 0 && (
                    <div style={{ fontSize: '12px', color: c.texteMuted, fontStyle: 'italic', padding: '6px 0' }}>Aucun ingrédient — ajoutez-en un ci-dessous.</div>
                  )}
                  {ingsSection.map(({ ing, gIdx }) => {
                    const ingData = listeIngredients.find(i => i.id === ing.ingredient_id)
                    const coutLigne = coutLigneEditor(ingData, ing.quantite, ing.unite) || null
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

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" onClick={ajouterSection} style={{ background: c.accentClair, color: c.accent, border: `0.5px solid ${c.accent}40`, borderRadius: '8px', padding: '10px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
            + Ajouter une préparation
          </button>
          {peutImporter && !importOpen && (
            <button type="button" onClick={() => setImportOpen(true)} style={{ background: '#EEEDFE', color: '#3C3489', border: '0.5px solid #AFA9EC', borderRadius: '8px', padding: '10px 16px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
              ⮈ Importer une sous-fiche
            </button>
          )}
        </div>
        {peutImporter && importOpen && (
          <div style={{ background: '#F6F5FE', border: '0.5px solid #AFA9EC', borderRadius: '8px', padding: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: '#3C3489' }}>Importer :</span>
            <select value={importSel} onChange={e => setImportSel(e.target.value)}
              style={{ flex: 1, minWidth: '180px', padding: '8px 10px', borderRadius: '6px', border: `0.5px solid ${c.bordure}`, fontSize: '13px', background: c.blanc, outline: 'none', color: c.texte }}>
              <option value="">— Choisir une sous-fiche —</option>
              {listeSousFiches.map(sf => <option key={sf.id} value={sf.id}>{sf.nom}</option>)}
            </select>
            <button type="button" onClick={lancerImport} disabled={importBusy || !importSel}
              style={{ background: '#3C3489', color: 'white', border: 'none', borderRadius: '6px', padding: '8px 12px', fontSize: '12px', cursor: (importBusy || !importSel) ? 'not-allowed' : 'pointer', fontWeight: '600', opacity: (importBusy || !importSel) ? 0.6 : 1 }}>
              {importBusy ? '…' : 'Importer'}
            </button>
            <button type="button" onClick={() => { setImportOpen(false); setImportSel('') }} disabled={importBusy}
              style={{ background: 'transparent', color: c.texteMuted, border: `0.5px solid ${c.bordure}`, borderRadius: '6px', padding: '8px 12px', fontSize: '12px', cursor: 'pointer' }}>
              Annuler
            </button>
          </div>
        )}
      </div>
    </Card>
  )
}
