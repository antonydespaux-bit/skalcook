'use client'
import { useState, useEffect } from 'react'
import { supabase, getParametres } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../../lib/theme.jsx'

export default function NouveauMenu() {
  const [nom, setNom] = useState('')
  const [saison, setSaison] = useState('Printemps 2026')
  const [prixVente, setPrixVente] = useState('')
  const [description, setDescription] = useState('')
  const [fiches, setFiches] = useState([])
  const [selection, setSelection] = useState({ Entrée: '', Plat: '', Dessert: '' })
  const [params, setParams] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const c = theme.couleurs
  const saisons = theme.saisons
  const services = ['Entrée', 'Plat', 'Dessert']

  useEffect(() => {
    checkUser()
    loadFiches()
    loadParams()
  }, [])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

  const loadParams = async () => {
    const p = await getParametres()
    setParams(p)
  }

  const loadFiches = async () => {
    const { data } = await supabase
      .from('fiches')
      .select('*')
      .neq('categorie', 'Sous-fiche')
      .order('nom')
    setFiches(data || [])
  }

  const calculerCout = () => {
    return services.reduce((total, service) => {
      const ficheId = selection[service]
      const fiche = fiches.find(f => f.id === ficheId)
      return total + (fiche?.cout_portion || 0)
    }, 0)
  }

  const foodCost = () => {
    const cout = calculerCout()
    if (!prixVente || !cout) return null
    const prixHT = parseFloat(prixVente) / 1.10
    return (cout / prixHT * 100).toFixed(1)
  }

  const prixIndicatif = () => {
    const cout = calculerCout()
    if (!cout) return null
    const seuil = parseFloat(params['seuil_vert_cuisine'] || 28) / 100
    const tva = 1 + parseFloat(params['tva_restauration'] || 10) / 100
    return (cout / seuil * tva).toFixed(2)
  }

  const handleSubmit = async () => {
    if (!nom) { setError('Le nom du menu est obligatoire'); return }
    setLoading(true)
    setError('')

    const { data: menu, error: errMenu } = await supabase
      .from('menus')
      .insert([{
        nom,
        saison,
        prix_vente: prixVente ? parseFloat(prixVente) : null,
        description
      }])
      .select()
      .single()

    if (errMenu) {
      setError('Erreur : ' + errMenu.message)
      setLoading(false)
      return
    }

    const menuFiches = services
      .filter(service => selection[service])
      .map((service, index) => ({
        menu_id: menu.id,
        fiche_id: selection[service],
        service,
        ordre: index
      }))

    if (menuFiches.length > 0) {
      await supabase.from('menu_fiches').insert(menuFiches)
    }

    router.push('/menus')
  }

  const cout = calculerCout()
  const fc = foodCost()
  const prixIndic = prixIndicatif()
  const seuilVert = parseFloat(params['seuil_vert_cuisine'] || 28)
  const seuilOrange = parseFloat(params['seuil_orange_cuisine'] || 35)

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

      <div style={{
        background: c.principal,
        borderBottom: `0.5px solid ${c.accent}40`,
        padding: '0 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Logo height={30} couleur="white" onClick={() => router.push('/fiches')} />
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '13px' }}>|</span>
          <button onClick={() => router.push('/menus')} style={{
            background: 'transparent', border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '6px 12px', fontSize: '13px',
            cursor: 'pointer', color: 'rgba(255,255,255,0.7)'
          }}>← Retour</button>
          <span style={{ fontSize: '15px', fontWeight: '500', color: 'white' }}>Nouveau menu</span>
        </div>
        <button onClick={handleSubmit} disabled={loading} style={{
          background: loading ? c.texteMuted : c.accent,
          color: c.principal, border: 'none', borderRadius: '8px',
          padding: '8px 20px', fontSize: '13px', fontWeight: '600',
          cursor: loading ? 'not-allowed' : 'pointer'
        }}>
          {loading ? 'Enregistrement...' : 'Enregistrer le menu'}
        </button>
      </div>

      <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>

        {error && (
          <div style={{
            background: '#FCEBEB', color: '#A32D2D', borderRadius: '8px',
            padding: '12px 16px', fontSize: '13px', marginBottom: '20px'
          }}>{error}</div>
        )}

        {/* Informations */}
        <div style={{
          background: 'white', borderRadius: '12px', padding: '24px',
          border: `0.5px solid ${c.bordure}`, marginBottom: '16px'
        }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '16px' }}>
            Informations du menu
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Nom du menu *</label>
              <input
                type="text" value={nom} onChange={e => setNom(e.target.value)}
                placeholder="Ex : Menu Dégustation, Menu Midi..."
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte }}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Saison</label>
              <select value={saison} onChange={e => setSaison(e.target.value)} style={{
                width: '100%', padding: '10px 12px', borderRadius: '8px',
                border: `0.5px solid ${c.bordure}`, fontSize: '14px',
                background: 'white', outline: 'none', color: c.texte
              }}>
                {saisons.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Prix de vente TTC (€)</label>
              <input
                type="number" value={prixVente} onChange={e => setPrixVente(e.target.value)}
                placeholder="Ex : 65.00" step="0.01"
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte }}
              />
              {prixIndic && (
                <div style={{ fontSize: '11px', color: c.vert, marginTop: '4px' }}>
                  Prix indicatif ({seuilVert}% food cost) : <strong>{prixIndic} €</strong>
                </div>
              )}
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Description</label>
              <textarea
                value={description} onChange={e => setDescription(e.target.value)}
                placeholder="Description du menu..." rows={2}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', color: c.texte }}
              />
            </div>
          </div>
        </div>

        {/* Composition */}
        <div style={{
          background: 'white', borderRadius: '12px', padding: '24px',
          border: `0.5px solid ${c.bordure}`, marginBottom: '16px'
        }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '16px' }}>
            Composition du menu
          </div>
          {services.map(service => (
            <div key={service} style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {service}
              </label>
              <select
                value={selection[service]}
                onChange={e => setSelection({ ...selection, [service]: e.target.value })}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px',
                  border: `0.5px solid ${c.bordure}`, fontSize: '14px',
                  background: 'white', outline: 'none', color: c.texte
                }}
              >
                <option value="">-- Choisir une fiche --</option>
                {fiches.map(f => (
                  <option key={f.id} value={f.id}>{f.nom} {f.categorie ? `(${f.categorie})` : ''}</option>
                ))}
              </select>
              {selection[service] && (
                <div style={{ fontSize: '12px', color: c.texteMuted, marginTop: '4px', paddingLeft: '4px' }}>
                  Coût : {(fiches.find(f => f.id === selection[service])?.cout_portion || 0).toFixed(2)} €
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Récapitulatif */}
        <div style={{
          background: 'white', borderRadius: '12px', padding: '20px',
          border: `0.5px solid ${c.bordure}`, display: 'flex', gap: '20px', flexWrap: 'wrap'
        }}>
          <div>
            <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Coût matière total</div>
            <div style={{ fontSize: '24px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{cout.toFixed(2)} €</div>
          </div>
          {prixVente && (
            <div>
              <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Prix HT</div>
              <div style={{ fontSize: '24px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{(parseFloat(prixVente) / 1.10).toFixed(2)} €</div>
            </div>
          )}
          {prixIndic && (
            <div style={{ background: c.vertClair, borderRadius: '8px', padding: '14px' }}>
              <div style={{ fontSize: '11px', color: c.vert, fontWeight: '500', textTransform: 'uppercase' }}>Prix indicatif TTC</div>
              <div style={{ fontSize: '24px', fontWeight: '500', marginTop: '4px', color: c.vert }}>{prixIndic} €</div>
              <div style={{ fontSize: '10px', color: c.vert, opacity: 0.8, marginTop: '2px' }}>Basé sur {seuilVert}% food cost</div>
            </div>
          )}
          {fc && (
            <div style={{
              background: fc < seuilVert ? '#EAF3DE' : fc < seuilOrange ? '#FAEEDA' : '#FCEBEB',
              borderRadius: '8px', padding: '14px'
            }}>
              <div style={{ fontSize: '11px', fontWeight: '500', textTransform: 'uppercase', color: fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D' }}>Food cost global</div>
              <div style={{ fontSize: '24px', fontWeight: '500', marginTop: '4px', color: fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D' }}>{fc} %</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
