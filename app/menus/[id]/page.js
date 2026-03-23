'use client'
import { useState, useEffect } from 'react'
import { supabase, getParametres, getClientId } from '../../../lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { theme, Logo } from '../../../lib/theme.jsx'
import { useTheme } from '../../../lib/useTheme'
import { log } from '../../../lib/useLog'

export default function MenuDetail() {
  const { nomEtablissement } = useTheme()
  const [menu, setMenu] = useState(null)
  const [menuFiches, setMenuFiches] = useState([])
  const [toutesLesFiches, setToutesLesFiches] = useState([])
  const [params, setParams] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [nom, setNom] = useState('')
  const [saison, setSaison] = useState('')
  const [prixVente, setPrixVente] = useState('')
  const [description, setDescription] = useState('')
  const [selection, setSelection] = useState({ Entrée: '', Plat: '', Dessert: '' })
  const router = useRouter()
  const params_route = useParams()
  const c = theme.couleurs
  const services = ['Entrée', 'Plat', 'Dessert']

  useEffect(() => {
    const style = document.createElement('style')
    style.innerHTML = `@media print { .no-print { display: none !important; } body { background: white !important; } @page { margin: 15mm; } }`
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
    checkUser()
    loadData()
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

  const loadData = async () => {
    const { data: menuData } = await supabase
      .from('menus')
      .select(`*, menu_fiches(id, service, ordre, fiches(id, nom, categorie, cout_portion, prix_ttc))`)
      .eq('id', params_route.id)
      .single()

    if (!menuData) { router.push('/menus'); return }

    setMenu(menuData)
    setMenuFiches(menuData.menu_fiches || [])
    setNom(menuData.nom)
    setSaison(menuData.saison || '')
    setPrixVente(menuData.prix_vente || '')
    setDescription(menuData.description || '')

    const sel = { Entrée: '', Plat: '', Dessert: '' }
    menuData.menu_fiches?.forEach(mf => {
      if (sel.hasOwnProperty(mf.service)) sel[mf.service] = mf.fiches?.id || ''
    })
    setSelection(sel)

    const { data: fichesData } = await supabase
      .from('fiches')
      .select('*')
      .neq('categorie', 'Sous-fiche')
      .order('nom')
    setToutesLesFiches(fichesData || [])
    setLoading(false)
  }

  const calculerCout = () => {
    return menuFiches.reduce((total, mf) => {
      return total + (mf.fiches?.cout_portion || 0)
    }, 0)
  }

  const calculerCoutSelection = () => {
    return services.reduce((total, service) => {
      const ficheId = selection[service]
      const fiche = toutesLesFiches.find(f => f.id === ficheId)
      return total + (fiche?.cout_portion || 0)
    }, 0)
  }

  const foodCost = (cout, prix) => {
    if (!prix || !cout) return null
    return (cout / (prix / 1.10) * 100).toFixed(1)
  }

  const prixIndicatif = (cout) => {
    if (!cout) return null
    const seuil = parseFloat(params['seuil_vert_cuisine'] || 28) / 100
    const tva = 1 + parseFloat(params['tva_restauration'] || 10) / 100
    return (cout / seuil * tva).toFixed(2)
  }

  const handleSave = async () => {
    setSaving(true)

    const clientId = await getClientId()
    if (!clientId) { setSaving(false); return }

    await supabase.from('menus').update({
      nom, saison,
      prix_vente: prixVente ? parseFloat(prixVente) : null,
      description
    }).eq('id', params_route.id)

    await supabase.from('menu_fiches').delete().eq('menu_id', params_route.id)

    const menuFichesAInserer = services
      .filter(service => selection[service])
      .map((service, index) => ({
        menu_id: params_route.id,
        fiche_id: selection[service],
        service,
        ordre: index,
        client_id: clientId
      }))

    if (menuFichesAInserer.length > 0) {
      await supabase.from('menu_fiches').insert(menuFichesAInserer)
    }

    await log({
      action: 'MODIFICATION', entite: 'menu', entite_id: params_route.id,
      entite_nom: nom, section: 'cuisine',
      details: `Saison: ${saison}`
    })

    await loadData()
    setSaving(false)
    setEditing(false)
  }

  const handleDelete = async () => {
    if (!confirm('Supprimer ce menu ?')) return
    await supabase.from('menus').delete().eq('id', params_route.id)
    await log({
      action: 'SUPPRESSION', entite: 'menu', entite_id: params_route.id,
      entite_nom: menu.nom, section: 'cuisine'
    })
    router.push('/menus')
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>
      <div style={{ fontSize: '14px', color: c.texteMuted }}>Chargement...</div>
    </div>
  )

  const cout = editing ? calculerCoutSelection() : calculerCout()
  const prixActuel = editing ? (prixVente ? parseFloat(prixVente) : null) : menu.prix_vente
  const fc = foodCost(cout, prixActuel)
  const prixIndic = prixIndicatif(cout)
  const seuilVert = parseFloat(params['seuil_vert_cuisine'] || 28)
  const seuilOrange = parseFloat(params['seuil_orange_cuisine'] || 35)

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

<div className="no-print" style={{
        background: c.principal, borderBottom: `0.5px solid ${c.accent}40`,
        padding: '0 24px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Logo height={30} couleur="white" nom={nomEtablissement} onClick={() => router.push("/fiches")} />
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
          <button onClick={() => router.push('/menus')} style={{
            background: 'transparent', border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '6px 12px', fontSize: '13px',
            cursor: 'pointer', color: 'rgba(255,255,255,0.7)'
          }}>← Retour</button>
          <span style={{ fontSize: '15px', fontWeight: '500', color: 'white' }}>{menu.nom}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {editing ? (
            <>
              <button onClick={handleSave} disabled={saving} style={{
                background: saving ? c.texteMuted : c.accent, color: c.principal,
                border: 'none', borderRadius: '8px', padding: '8px 16px',
                fontSize: '13px', fontWeight: '600', cursor: 'pointer'
              }}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button>
              <button onClick={() => setEditing(false)} style={{
                background: 'transparent', color: 'rgba(255,255,255,0.7)',
                border: '0.5px solid rgba(255,255,255,0.2)',
                borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer'
              }}>Annuler</button>
            </>
          ) : (
            <>
              <button onClick={() => window.print()} style={{
                background: c.accent, color: c.principal, border: 'none',
                borderRadius: '8px', padding: '8px 16px', fontSize: '13px',
                fontWeight: '600', cursor: 'pointer'
              }}>Imprimer</button>
              <button onClick={() => setEditing(true)} style={{
                background: 'transparent', color: 'rgba(255,255,255,0.7)',
                border: '0.5px solid rgba(255,255,255,0.2)',
                borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer'
              }}>Modifier</button>
              <button onClick={handleDelete} style={{
                background: 'transparent', color: '#F09595',
                border: '0.5px solid rgba(255,255,255,0.2)',
                borderRadius: '8px', padding: '8px 16px', fontSize: '13px', cursor: 'pointer'
              }}>Supprimer</button>
            </>
          )}
        </div>
      </div>

      <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>

        {/* Informations */}
        <div style={{
          background: 'white', borderRadius: '12px', padding: '24px',
          border: `0.5px solid ${c.bordure}`, marginBottom: '16px'
        }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '16px' }}>
            Informations du menu
          </div>

          {editing ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Nom</label>
                <input type="text" value={nom} onChange={e => setNom(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte }} />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Saison</label>
                <select value={saison} onChange={e => setSaison(e.target.value)} style={{
                  width: '100%', padding: '10px 12px', borderRadius: '8px',
                  border: `0.5px solid ${c.bordure}`, fontSize: '14px',
                  background: 'white', outline: 'none', color: c.texte
                }}>
                  {theme.saisons.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Prix de vente TTC (€)</label>
                <input type="number" value={prixVente} onChange={e => setPrixVente(e.target.value)} step="0.01"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte }} />
                {prixIndic && (
                  <div style={{ fontSize: '11px', color: c.vert, marginTop: '4px' }}>
                    Prix indicatif ({seuilVert}% food cost) : <strong>{prixIndic} €</strong>
                  </div>
                )}
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', color: c.texte }} />
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h1 style={{ fontSize: '22px', fontWeight: '500', color: c.texte, marginBottom: '8px' }}>{menu.nom}</h1>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {menu.saison && (
                      <span style={{ background: c.accentClair, color: c.principal, borderRadius: '20px', padding: '3px 12px', fontSize: '12px', fontWeight: '500' }}>
                        {menu.saison}
                      </span>
                    )}
                  </div>
                </div>
                {menu.prix_vente && (
                  <div style={{ background: c.principal, color: c.accent, borderRadius: '10px', padding: '10px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', opacity: 0.7 }}>Prix TTC</div>
                    <div style={{ fontSize: '24px', fontWeight: '500' }}>{Number(menu.prix_vente).toFixed(2)} €</div>
                  </div>
                )}
              </div>
              {menu.description && (
                <div style={{ background: c.fond, borderRadius: '8px', padding: '12px 16px', fontSize: '13px', color: c.texteMuted, marginTop: '12px' }}>
                  {menu.description}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Composition */}
        <div style={{
          background: 'white', borderRadius: '12px', padding: '24px',
          border: `0.5px solid ${c.bordure}`, marginBottom: '16px'
        }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '16px' }}>
            Composition
          </div>

          {editing ? (
            services.map(service => (
              <div key={service} style={{ marginBottom: '14px' }}>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                  {service}
                </label>
                <select value={selection[service]}
                  onChange={e => setSelection({ ...selection, [service]: e.target.value })}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: '8px',
                    border: `0.5px solid ${c.bordure}`, fontSize: '14px',
                    background: 'white', outline: 'none', color: c.texte
                  }}
                >
                  <option value="">-- Choisir une fiche --</option>
                  {toutesLesFiches.map(f => (
                    <option key={f.id} value={f.id}>{f.nom} ({f.categorie})</option>
                  ))}
                </select>
                {selection[service] && (
                  <div style={{ fontSize: '12px', color: c.texteMuted, marginTop: '4px', paddingLeft: '4px' }}>
                    Coût : {(toutesLesFiches.find(f => f.id === selection[service])?.cout_portion || 0).toFixed(2)} €
                  </div>
                )}
              </div>
            ))
          ) : (
            services.map(service => {
              const mf = menuFiches.find(m => m.service === service)
              return (
                <div key={service} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 0', borderBottom: `0.5px solid ${c.bordure}`
                }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', width: '60px', textTransform: 'uppercase' }}>{service}</span>
                    <span style={{ fontSize: '14px', fontWeight: '500', color: c.texte }}>
                      {mf ? mf.fiches?.nom : <span style={{ color: '#ccc', fontStyle: 'italic', fontWeight: '400' }}>Non défini</span>}
                    </span>
                  </div>
                  {mf?.fiches?.cout_portion && (
                    <span style={{ fontSize: '13px', color: c.texteMuted }}>
                      {Number(mf.fiches.cout_portion).toFixed(2)} €
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Récapitulatif */}
        <div style={{
          background: 'white', borderRadius: '12px', padding: '20px',
          border: `0.5px solid ${c.bordure}`,
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px'
        }}>
          <div style={{ background: c.fond, borderRadius: '8px', padding: '14px' }}>
            <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Coût total</div>
            <div style={{ fontSize: '20px', fontWeight: '500', marginTop: '4px', color: c.texte }}>{cout.toFixed(2)} €</div>
          </div>
          {prixActuel && (
            <div style={{ background: c.fond, borderRadius: '8px', padding: '14px' }}>
              <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Prix HT</div>
              <div style={{ fontSize: '20px', fontWeight: '500', marginTop: '4px', color: c.texte }}>
                {(prixActuel / 1.10).toFixed(2)} €
              </div>
            </div>
          )}
          {prixIndic && (
            <div style={{ background: c.vertClair, borderRadius: '8px', padding: '14px' }}>
              <div style={{ fontSize: '11px', color: c.vert, fontWeight: '500', textTransform: 'uppercase' }}>Prix indicatif TTC</div>
              <div style={{ fontSize: '20px', fontWeight: '500', marginTop: '4px', color: c.vert }}>{prixIndic} €</div>
              <div style={{ fontSize: '10px', color: c.vert, opacity: 0.8, marginTop: '2px' }}>Basé sur {seuilVert}% food cost</div>
            </div>
          )}
          {fc && (
            <div style={{
              background: fc < seuilVert ? '#EAF3DE' : fc < seuilOrange ? '#FAEEDA' : '#FCEBEB',
              borderRadius: '8px', padding: '14px'
            }}>
              <div style={{ fontSize: '11px', fontWeight: '500', textTransform: 'uppercase', color: fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D' }}>
                Food cost
              </div>
              <div style={{ fontSize: '20px', fontWeight: '500', marginTop: '4px', color: fc < seuilVert ? '#3B6D11' : fc < seuilOrange ? '#854F0B' : '#A32D2D' }}>
                {fc} %
              </div>
            </div>
          )}
        </div>

        <div style={{ marginTop: '16px', textAlign: 'center', fontSize: '11px', color: '#bbb' }}>
          {nomEtablissement} — {menu.nom} — {new Date().toLocaleDateString('fr-FR')}
        </div>
      </div>
    </div>
  )
}
