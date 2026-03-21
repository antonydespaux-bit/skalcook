'use client'
import { useState, useEffect } from 'react'
import { supabase, getClientId } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../../lib/theme.jsx'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import { useRole } from '../../../lib/useRole'
import { log } from '../../../lib/useLog'

export default function BarIngredientsPage() {
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')
  const [selection, setSelection] = useState([])
  const [supprimant, setSupprimant] = useState(false)
  const [nouveauNom, setNouveauNom] = useState('')
  const [nouveauPrix, setNouveauPrix] = useState('')
  const [nouvelleUnite, setNouvelleUnite] = useState('cl')
  const [ajoutVisible, setAjoutVisible] = useState(false)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()
  const { role } = useRole()

  useEffect(() => {
    checkUser()
    loadIngredients()
  }, [])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

  const loadIngredients = async () => {
    const { data } = await supabase
      .from('ingredients_bar')
      .select('*')
      .eq('est_sous_fiche', false)
      .order('nom')
      .limit(5000)
    setIngredients(data || [])
    setSelection([])
    setLoading(false)
  }

  const ingredientsFiltres = ingredients.filter(i =>
    i.nom.toLowerCase().includes(recherche.toLowerCase())
  )

  const toggleSelection = (id) => {
    setSelection(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const toggleTout = () => {
    if (selection.length === ingredientsFiltres.length) setSelection([])
    else setSelection(ingredientsFiltres.map(i => i.id))
  }

  const supprimerSelection = async () => {
    if (!confirm(`Supprimer ${selection.length} ingrédient${selection.length > 1 ? 's' : ''} ?`)) return
    setSupprimant(true)
    await supabase.from('ingredients_bar').delete().in('id', selection)
    await log({
      action: 'SUPPRESSION', entite: 'ingredient_bar',
      entite_nom: `${selection.length} ingrédients`, section: 'bar',
      details: `IDs: ${selection.join(', ')}`
    })
    await loadIngredients()
    setSupprimant(false)
  }

  const ajouterIngredient = async () => {
    if (!nouveauNom) return
    setSaving(true)

    const clientId = await getClientId()
    if (!clientId) { setSaving(false); return }

    await supabase.from('ingredients_bar').insert([{
      nom: nouveauNom.trim(),
      prix_kg: nouveauPrix ? parseFloat(nouveauPrix.replace(',', '.')) : null,
      unite: nouvelleUnite,
      client_id: clientId
    }])

    await log({
      action: 'CREATION', entite: 'ingredient_bar',
      entite_nom: nouveauNom.trim(), section: 'bar'
    })

    setNouveauNom('')
    setNouveauPrix('')
    setNouvelleUnite('cl')
    setAjoutVisible(false)
    await loadIngredients()
    setSaving(false)
  }

  const peutModifier = role === 'admin' || role === 'bar'

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
        <div style={{ display: 'flex', gap: '8px' }}>
          {selection.length > 0 && peutModifier && (
            <button onClick={supprimerSelection} disabled={supprimant} style={{
              background: '#A32D2D', color: 'white', border: 'none',
              borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
            }}>
              {supprimant ? '...' : `Supprimer ${selection.length}`}
            </button>
          )}
          {peutModifier && (
            <button onClick={() => router.push('/bar/import')} style={{
              background: 'transparent', color: 'rgba(255,255,255,0.7)',
              border: '0.5px solid rgba(255,255,255,0.2)',
              borderRadius: '8px', padding: '8px 12px', fontSize: '13px', cursor: 'pointer'
            }}>{isMobile ? '📥' : 'Importer Excel'}</button>
          )}
          {peutModifier && (
            <button onClick={() => setAjoutVisible(!ajoutVisible)} style={{
              background: '#C4956A', color: '#3C3489', border: 'none',
              borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
            }}>+ {!isMobile && 'Nouvel ingrédient'}</button>
          )}
          <button onClick={() => router.push('/bar/dashboard')} style={{
            background: 'transparent', color: 'rgba(255,255,255,0.7)',
            border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '8px 12px', fontSize: '13px', cursor: 'pointer'
          }}>← {!isMobile && 'Retour'}</button>
        </div>
      </div>

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '1000px', margin: '0 auto' }}>

        {ajoutVisible && peutModifier && (
          <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '20px', border: '0.5px solid #7F77DD', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>Nouvel ingrédient bar</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Nom *</label>
                <input type="text" value={nouveauNom} onChange={e => setNouveauNom(e.target.value)}
                  placeholder="Ex : Rhum Havana Club"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Prix HT (€)</label>
                  <input type="text" value={nouveauPrix} onChange={e => setNouveauPrix(e.target.value)}
                    placeholder="Ex : 18.50"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Unité</label>
                  <select value={nouvelleUnite} onChange={e => setNouvelleUnite(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}>
                    {['cl', 'ml', 'L', 'g', 'kg', 'u', 'botte', 'pièce'].map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={ajouterIngredient} disabled={saving || !nouveauNom} style={{
                width: '100%', padding: '12px', background: saving || !nouveauNom ? c.texteMuted : '#7F77DD',
                color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: saving || !nouveauNom ? 'not-allowed' : 'pointer'
              }}>
                {saving ? '...' : 'Ajouter'}
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
          <input type="text" placeholder="Rechercher un ingrédient bar..."
            value={recherche} onChange={e => setRecherche(e.target.value)}
            style={{ flex: 1, padding: '10px 14px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}
          />
          <span style={{ fontSize: '12px', color: c.texteMuted, whiteSpace: 'nowrap' }}>
            {ingredientsFiltres.length}{selection.length > 0 && ` — ${selection.length} sél.`}
          </span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: c.texteMuted }}>Chargement...</div>
        ) : isMobile ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', padding: '8px 12px', background: c.blanc, borderRadius: '8px', border: `0.5px solid ${c.bordure}` }}>
              <input type="checkbox"
                checked={selection.length === ingredientsFiltres.length && ingredientsFiltres.length > 0}
                onChange={toggleTout}
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#7F77DD' }}
              />
              <span style={{ fontSize: '13px', color: c.texteMuted }}>
                {selection.length === ingredientsFiltres.length ? 'Tout désélectionner' : 'Tout sélectionner'}
              </span>
            </div>
            {ingredientsFiltres.map(ing => (
              <div key={ing.id} style={{
                background: selection.includes(ing.id) ? '#EEEDFE' : c.blanc,
                borderRadius: '8px', padding: '12px', border: `0.5px solid ${c.bordure}`,
                marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '12px'
              }}>
                <input type="checkbox" checked={selection.includes(ing.id)}
                  onChange={() => toggleSelection(ing.id)}
                  style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#7F77DD', flexShrink: 0 }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: '500', color: c.texte }}>{ing.nom}</div>
                  <div style={{ fontSize: '12px', color: c.texteMuted, marginTop: '2px' }}>
                    {ing.prix_kg ? `${Number(ing.prix_kg).toFixed(2)} €` : '—'} / {ing.unite || '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#3C3489' }}>
                  <th style={{ padding: '10px 16px', width: '40px' }}>
                    <input type="checkbox"
                      checked={selection.length === ingredientsFiltres.length && ingredientsFiltres.length > 0}
                      onChange={toggleTout}
                      style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#C4956A' }}
                    />
                  </th>
                  <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: '11px', color: '#C4956A', fontWeight: '500', textTransform: 'uppercase' }}>Nom</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '11px', color: '#C4956A', fontWeight: '500', textTransform: 'uppercase' }}>Prix HT</th>
                  <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: '11px', color: '#C4956A', fontWeight: '500', textTransform: 'uppercase' }}>Unité</th>
                </tr>
              </thead>
              <tbody>
                {ingredientsFiltres.map((ing, i) => (
                  <tr key={ing.id} style={{
                    borderBottom: i < ingredientsFiltres.length - 1 ? `0.5px solid ${c.bordure}` : 'none',
                    background: selection.includes(ing.id) ? '#EEEDFE' : c.blanc
                  }}>
                    <td style={{ padding: '10px 16px' }}>
                      <input type="checkbox" checked={selection.includes(ing.id)}
                        onChange={() => toggleSelection(ing.id)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#7F77DD' }}
                      />
                    </td>
                    <td style={{ padding: '10px 16px', fontWeight: '500', color: c.texte }}>{ing.nom}</td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: c.texte }}>
                      {ing.prix_kg ? `${Number(ing.prix_kg).toFixed(2)} €` : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'right', color: c.texteMuted }}>{ing.unite || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
