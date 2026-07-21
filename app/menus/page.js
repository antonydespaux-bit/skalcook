'use client'
import { useState, useEffect } from 'react'
import { supabase, getClientId, getParametres } from '../../lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { useIsMobile } from '../../lib/useIsMobile'
import { useTheme } from '../../lib/useTheme'
import Navbar from '../../components/Navbar'
import ChefLoader from '../../components/ChefLoader'
import { getSeuilsFromParams } from '../../lib/foodCost'
import { DEFAULT_SEUILS } from '../../lib/constants'
import MenusGrid from '../../components/contenus/MenusGrid'
import CartesGrid from '../../components/contenus/CartesGrid'

export default function MenusEtCartesPage() {
  const [menus, setMenus] = useState([])
  const [cartes, setCartes] = useState([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const searchParams = useSearchParams()
  const isMobile = useIsMobile()
  const { c } = useTheme()

  const initialTab = searchParams.get('tab') === 'cartes' ? 'cartes' : 'menus'
  const [tab, setTab] = useState(initialTab)
  // Seuils food cost de l'établissement : les grilles notent le même food cost
  // que les fiches et doivent donc utiliser les mêmes seuils.
  const [seuils, setSeuils] = useState(DEFAULT_SEUILS.cuisine)

  useEffect(() => {
    checkUser()
    loadAll()
  }, [])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

  const loadAll = async () => {
    const clientId = await getClientId()
    if (!clientId) { setLoading(false); router.push('/'); return }

    try {
      const { seuilVert, seuilOrange } = getSeuilsFromParams(await getParametres(), 'cuisine')
      if (Number.isFinite(seuilVert) && Number.isFinite(seuilOrange)) {
        setSeuils({ vert: seuilVert, orange: seuilOrange })
      }
    } catch { /* seuils par défaut déjà en place */ }

    const [{ data: menusData }, { data: cartesData }] = await Promise.all([
      supabase.from('menus')
        .select(`*, menu_fiches(id, service, fiches(id, nom, categorie, cout_portion))`)
        .eq('client_id', clientId)
        .eq('archive', false)
        .order('created_at', { ascending: false }),
      supabase.from('cartes')
        .select(`*, carte_sections(id, titre, ordre, carte_items(id, nom, supplement, relation, ordre, fiche_id, fiches(id, nom, cout_portion)))`)
        .eq('client_id', clientId)
        .eq('archive', false)
        .order('created_at', { ascending: false }),
    ])
    setMenus(menusData || [])
    setCartes(cartesData || [])
    setLoading(false)
  }

  const handleDeleteMenu = async (id) => {
    if (!confirm('Supprimer ce menu ?')) return
    const clientId = await getClientId()
    if (!clientId) return
    await supabase.from('menus').delete().eq('id', id).eq('client_id', clientId)
    loadAll()
  }

  const handleDeleteCarte = async (id) => {
    if (!confirm('Supprimer cette carte ?')) return
    const clientId = await getClientId()
    if (!clientId) return
    await supabase.from('cartes').delete().eq('id', id).eq('client_id', clientId)
    loadAll()
  }

  const switchTab = (next) => {
    setTab(next)
    const url = next === 'cartes' ? '/menus?tab=cartes' : '/menus'
    window.history.replaceState(null, '', url)
  }

  const count = tab === 'menus' ? menus.length : cartes.length
  const createPath = tab === 'menus' ? '/menus/nouveau' : '/cartes/nouveau'
  const createLabel = tab === 'menus' ? '+ Nouveau menu' : '+ Nouvelle carte'

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '1000px', margin: '0 auto' }}>

        <div style={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          gap: isMobile ? '12px' : '0',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', background: c.blanc, borderRadius: '10px', padding: '4px', border: `0.5px solid ${c.bordure}`, alignSelf: isMobile ? 'stretch' : 'flex-start' }}>
            {[{ id: 'menus', label: 'Menus', count: menus.length }, { id: 'cartes', label: 'Cartes', count: cartes.length }].map(t => (
              <button key={t.id} onClick={() => switchTab(t.id)} style={{
                flex: isMobile ? 1 : 'none',
                background: tab === t.id ? c.principal : 'transparent',
                color: tab === t.id ? c.accent : c.texteMuted,
                border: 'none', borderRadius: '7px',
                padding: '8px 16px', fontSize: '13px',
                fontWeight: tab === t.id ? '600' : '500',
                cursor: 'pointer', whiteSpace: 'nowrap'
              }}>{t.label} <span style={{ opacity: 0.7, marginLeft: '4px' }}>({t.count})</span></button>
            ))}
          </div>
          <button onClick={() => router.push(createPath)} style={{
            background: c.accent, color: 'white', border: 'none',
            borderRadius: '8px', padding: isMobile ? '10px 16px' : '8px 16px', fontSize: '13px',
            cursor: 'pointer', fontWeight: '600', whiteSpace: 'nowrap'
          }}>{createLabel}</button>
        </div>

        {loading ? (
          <ChefLoader />
        ) : tab === 'menus' ? (
          <MenusGrid seuils={seuils} c={c} isMobile={isMobile} menus={menus} onDelete={handleDeleteMenu} onCreateClick={() => router.push('/menus/nouveau')} />
        ) : (
          <CartesGrid seuils={seuils} c={c} isMobile={isMobile} cartes={cartes} onDelete={handleDeleteCarte} onCreateClick={() => router.push('/cartes/nouveau')} />
        )}
      </div>
    </div>
  )
}
