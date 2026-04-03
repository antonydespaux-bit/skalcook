'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { supabase, getClientId } from '../lib/supabase'
import { isSuperadminEmail } from '../lib/superadmin'
import { useTheme } from '../lib/useTheme'
import { useRole } from '../lib/useRole'
import { useIsMobile } from '../lib/useIsMobile'
import { useTenant } from '../lib/useTenant'

function hrefWithClient(path, clientId) {
  if (!clientId || typeof path !== 'string' || path.startsWith('http')) return path
  if (path === '/' || path === '/superadmin') return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}client_id=${encodeURIComponent(clientId)}`
}

/**
 * Barre de navigation unifiée.
 * @param {{ section: 'cuisine' | 'bar' }} props
 */
export default function Navbar({ section = 'cuisine' }) {
  const isBar = section === 'bar'

  const router = useRouter()
  const pathname = usePathname()
  const { c, nomEtablissement, logoUrl } = useTheme()
  const { tenant } = useTenant()
  const { role } = useRole()
  const isMobile = useIsMobile()
  const [menuOuvert, setMenuOuvert] = useState(false)
  const [groupeOuvert, setGroupeOuvert] = useState(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 56, left: 0 })
  const [showReturnSuperAdmin, setShowReturnSuperAdmin] = useState(false)
  const [navClientId, setNavClientId] = useState(null)

  const toggleGroupe = useCallback((e, label) => {
    e.stopPropagation()
    if (groupeOuvert === label) {
      setGroupeOuvert(null)
    } else {
      const rect = e.currentTarget.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 8, left: rect.left })
      setGroupeOuvert(label)
    }
  }, [groupeOuvert])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const id = await getClientId()
      if (!alive) return
      setNavClientId(id)
      if (id) console.log("Navigation vers établissement :", id)
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('tenant_refresh'))
    })()
    return () => { alive = false }
  }, [pathname])

  // ─── Couleurs ────────────────────────────────────────────────────────────────
  const NAV           = c.principal || '#18181B'
  const ACCENT        = isBar ? (c.violet || '#7C3AED')       : (c.accent || '#6366F1')
  const ACCENT_LIGHT  = isBar ? (c.violetClair || '#EDE9FE')  : (c.accentClair || '#EEF2FF')
  const ACCENT_MOB_BG = isBar ? 'rgba(124,58,237,0.15)'       : 'rgba(99,102,241,0.15)'

  // ─── Routes de base ──────────────────────────────────────────────────────────
  const DASHBOARD_PATH     = isBar ? '/bar/dashboard'      : '/dashboard'
  const NOUVELLE_FICHE_PATH = isBar ? '/bar/fiches/nouvelle' : '/fiches/nouvelle'
  const CROSS_PATH         = isBar ? '/dashboard'          : '/bar/dashboard'
  const CROSS_LABEL        = isBar ? '🍽️ Cuisine'          : '🍸 Bar'
  const LOGO_EMOJI         = isBar ? '🍸'                   : '🍽️'

  // ─── Modules / Rôles ─────────────────────────────────────────────────────────
  const DEFAULT_CUISINE_MODULES = ['fiches', 'sous-fiches', 'recap', 'ingredients', 'menus', 'cartes', 'avis', 'ardoise']
  const modules     = tenant?.modules_actifs || (isBar ? ['fiches', 'sous-fiches', 'recap', 'ingredients'] : DEFAULT_CUISINE_MODULES)
  const hasModule   = (id) => modules.includes(id)
  const hasBar      = typeof tenant?.has_bar === 'boolean' ? tenant.has_bar : hasModule('bar')
  const peutModifier = isBar ? (role === 'admin' || role === 'bar') : (role === 'admin' || role === 'cuisine')

  const pushWithClient = (path) => {
    const finalPath = hrefWithClient(path, navClientId)
    console.log('Lien cliqué vers :', finalPath)
    router.push(finalPath)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  useEffect(() => {
    if (!groupeOuvert) return
    const handler = () => setGroupeOuvert(null)
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [groupeOuvert])

  useEffect(() => {
    let alive = true
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!alive) return
      setShowReturnSuperAdmin(isSuperadminEmail((user?.email || '').toLowerCase().trim()))
    }).catch(() => { if (!alive) return; setShowReturnSuperAdmin(false) })
    return () => { alive = false }
  }, [])

  const isActive = (paths) => {
    const arr = Array.isArray(paths) ? paths : [paths]
    return arr.some(p => {
      if (p === DASHBOARD_PATH) return pathname === DASHBOARD_PATH
      return pathname.startsWith(p)
    })
  }

  // ─── Navigation items ────────────────────────────────────────────────────────
  const groupes = isBar
    ? [
        {
          label: 'Fiches bar',
          paths: ['/bar/fiches', '/bar/sous-fiches', '/bar/archives'],
          items: [
            ...(hasModule('fiches')      ? [{ label: 'Toutes les fiches', path: '/bar/fiches' }]   : []),
            ...(hasModule('sous-fiches') ? [{ label: 'Sous-fiches',       path: '/bar/sous-fiches' }] : []),
            { label: 'Archives', path: '/bar/archives' },
          ]
        },
        {
          label: 'Contenus',
          paths: ['/bar/recap', '/bar/ingredients', '/bar/import'],
          items: [
            ...(hasModule('recap')                     ? [{ label: 'Récap food cost', path: '/bar/recap' }]       : []),
            ...(hasModule('ingredients') && peutModifier ? [{ label: 'Ingrédients',  path: '/bar/ingredients' }] : []),
          ]
        },
      ].filter(g => g.items.length > 0)
    : [
        {
          label: 'Fiches',
          paths: ['/fiches', '/sous-fiches', '/archives'],
          items: [
            ...(hasModule('fiches')      ? [{ label: 'Toutes les fiches', path: '/fiches' }]     : []),
            ...(hasModule('sous-fiches') ? [{ label: 'Sous-fiches',       path: '/sous-fiches' }] : []),
            { label: 'Archives', path: '/archives' },
          ]
        },
        {
          label: 'Contenus',
          paths: ['/menus', '/cartes', '/recap', '/ingredients', '/import', '/avis'],
          items: [
            ...(hasModule('menus')                     ? [{ label: 'Menus',           path: '/menus' }]        : []),
            ...(hasModule('cartes')                    ? [{ label: 'Cartes',          path: '/cartes' }]       : []),
            ...(hasModule('recap')                     ? [{ label: 'Récap food cost', path: '/recap' }]        : []),
            ...(hasModule('ingredients') && peutModifier ? [{ label: 'Ingrédients',  path: '/ingredients' }] : []),
            ...(hasModule('avis')                      ? [{ label: 'Avis clients',    path: '/avis' }]         : []),
          ]
        },
        ...(role === 'admin' ? [{
          label: 'Admin',
          paths: ['/parametres', '/admin', '/admin/logs', '/admin/ardoise'],
          items: [
            { label: 'Paramètres',   path: '/parametres' },
            { label: 'Utilisateurs', path: '/admin' },
            { label: 'Activité',     path: '/admin/logs' },
            ...(hasModule('ardoise') ? [{ label: 'Ardoise', path: '/admin/ardoise' }] : []),
          ]
        }] : []),
        ...(hasModule('controle-gestion') ? [{
          label: 'Gestion',
          paths: ['/controle-gestion/marges', '/controle-gestion/import', '/controle-gestion/achats'],
          items: [
            { label: 'Dashboard Marges', path: '/controle-gestion/marges' },
            { label: 'Import ventes',    path: '/controle-gestion/import' },
            { label: 'Achats',           path: '/controle-gestion/achats/import' },
          ]
        }] : []),
      ].filter(g => g.items.length > 0)

  // ─── Styles réutilisés ───────────────────────────────────────────────────────
  const dropdownStyle = {
    position: 'fixed', top: dropdownPos.top, left: dropdownPos.left,
    background: '#FFFFFF', border: '0.5px solid #E4E4E7',
    borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    minWidth: '180px', zIndex: 9999, overflow: 'hidden', padding: '4px',
  }

  const mobileItemStyle = (active) => ({
    display: 'block', width: '100%', textAlign: 'left',
    background: active ? ACCENT_MOB_BG : 'transparent',
    color: active ? 'white' : 'rgba(255,255,255,0.6)',
    border: 'none', borderRadius: '8px', padding: '11px 16px',
    fontSize: '14px', cursor: 'pointer', marginBottom: '2px'
  })

  return (
    <>
      {/* ─── Barre principale ─────────────────────────────────────────────── */}
      <div className="no-print" style={{
        background: NAV, borderBottom: '0.5px solid rgba(255,255,255,0.06)',
        padding: isMobile ? '0 12px' : '0 20px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
        position: 'sticky', top: 0, zIndex: 100,
        maxWidth: '100%', boxSizing: 'border-box', minWidth: 0,
      }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, flex: '1 1 auto', overflow: 'hidden' }}>

          {/* Logo / Nom établissement */}
          <button
            onClick={(e) => { e.stopPropagation(); pushWithClient(DASHBOARD_PATH) }}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer', padding: isMobile ? '6px 6px' : '6px 10px', borderRadius: '8px',
              display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, maxWidth: '100%',
            }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt={nomEtablissement} style={{ height: '28px', maxWidth: isMobile ? '120px' : 'none', width: 'auto', objectFit: 'contain', borderRadius: '4px' }} />
            ) : (
              <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '14px' }}>{LOGO_EMOJI}</span>
              </div>
            )}
            {!isMobile && (
              <span style={{
                fontSize: '14px', fontWeight: '600', color: 'white', letterSpacing: '0.3px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{nomEtablissement}</span>
            )}
          </button>

          {/* Badge BAR (section bar uniquement) */}
          {isBar && !isMobile && (
            <div style={{ padding: '2px 8px', borderRadius: '20px', background: ACCENT_LIGHT, marginRight: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: '500', color: ACCENT }}>BAR</span>
            </div>
          )}

          {!isMobile && <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />}

          {/* Dashboard */}
          {!isMobile && (
            <button
              onClick={(e) => { e.stopPropagation(); pushWithClient(DASHBOARD_PATH) }}
              style={{
                background: 'transparent', border: 'none',
                borderBottom: isActive(DASHBOARD_PATH) ? `2px solid ${ACCENT}` : '2px solid transparent',
                borderRadius: '0', padding: '0 12px', height: '56px',
                fontSize: '13px', fontWeight: isActive(DASHBOARD_PATH) ? '500' : '400',
                color: isActive(DASHBOARD_PATH) ? 'white' : 'rgba(255,255,255,0.55)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >Dashboard</button>
          )}

          {/* Groupes dropdown */}
          {!isMobile && groupes.map((groupe) => {
            const active = isActive(groupe.paths)
            const ouvert = groupeOuvert === groupe.label
            return (
              <div key={groupe.label} style={{ position: 'relative' }}>
                <button
                  onClick={(e) => toggleGroupe(e, groupe.label)}
                  style={{
                    background: ouvert ? 'rgba(255,255,255,0.06)' : 'transparent',
                    border: 'none',
                    borderBottom: active ? `2px solid ${ACCENT}` : '2px solid transparent',
                    borderRadius: '0', padding: '0 12px', height: '56px',
                    fontSize: '13px', fontWeight: active ? '500' : '400',
                    color: active ? 'white' : 'rgba(255,255,255,0.55)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s',
                  }}
                >
                  {groupe.label}
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d={ouvert ? "M2 7L5 4L8 7" : "M2 4L5 7L8 4"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
                {ouvert && (
                  <div style={dropdownStyle} onClick={e => e.stopPropagation()}>
                    {groupe.items.map((item) => (
                      <button key={item.path}
                        onClick={() => { setGroupeOuvert(null); pushWithClient(item.path) }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '9px 12px', border: 'none', borderRadius: '6px',
                          background: isActive(item.path) ? ACCENT_LIGHT : 'transparent',
                          color: isActive(item.path) ? ACCENT : '#18181B',
                          fontSize: '13px', fontWeight: isActive(item.path) ? '500' : '400', cursor: 'pointer',
                        }}
                      >{item.label}</button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Cross-section link (cuisine → bar / bar → cuisine) */}
          {!isMobile && (role === 'admin' || role === 'directeur') && (isBar || hasBar) && (
            <button
              onClick={(e) => { e.stopPropagation(); pushWithClient(CROSS_PATH) }}
              style={{
                background: 'transparent', border: 'none', borderBottom: '2px solid transparent',
                borderRadius: '0', padding: '0 12px', height: '56px',
                fontSize: '13px', fontWeight: '400',
                color: 'rgba(255,255,255,0.55)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >{CROSS_LABEL}</button>
          )}
        </div>

        {/* Droite */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {!isMobile && peutModifier && (
            <button
              onClick={(e) => { e.stopPropagation(); pushWithClient(NOUVELLE_FICHE_PATH) }}
              style={{
                background: ACCENT, color: 'white', border: 'none',
                borderRadius: '8px', padding: '7px 14px',
                fontSize: '13px', fontWeight: '500', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            ><span style={{ fontSize: '16px', lineHeight: 1 }}>+</span> Nouvelle fiche</button>
          )}
          {!isMobile && (
            <button onClick={handleLogout} style={{
              background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.55)',
              border: '0.5px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer',
            }}>Déconnexion</button>
          )}
          {!isMobile && showReturnSuperAdmin && (
            <button onClick={() => router.push('/superadmin')}
              style={{
                background: 'rgba(99,102,241,0.2)', color: 'rgba(165,180,252,1)',
                border: '0.5px solid rgba(99,102,241,0.35)',
                borderRadius: '8px', padding: '7px 12px', fontSize: '13px', cursor: 'pointer', fontWeight: '500'
              }}
            >← Retour SuperAdmin</button>
          )}
          {isMobile && (
            <button onClick={() => setMenuOuvert(!menuOuvert)} style={{
              background: menuOuvert ? 'rgba(255,255,255,0.1)' : 'transparent',
              border: '0.5px solid rgba(255,255,255,0.15)',
              borderRadius: '8px', padding: '8px 12px', cursor: 'pointer',
              color: 'white', fontSize: '16px'
            }}>☰</button>
          )}
        </div>
      </div>

      {/* ─── Menu mobile ──────────────────────────────────────────────────── */}
      {isMobile && menuOuvert && (
        <div className="no-print" style={{
          background: NAV, padding: '12px 16px 20px',
          borderBottom: '0.5px solid rgba(255,255,255,0.06)',
          position: 'sticky', top: '56px', zIndex: 99
        }}>
          {showReturnSuperAdmin && (
            <button
              onClick={() => { setMenuOuvert(false); router.push('/superadmin') }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: 'rgba(99,102,241,0.2)', color: '#A5B4FC',
                border: '0.5px solid rgba(99,102,241,0.3)',
                borderRadius: '8px', padding: '12px 16px',
                fontSize: '14px', cursor: 'pointer', marginBottom: '8px'
              }}
            >← Retour SuperAdmin</button>
          )}
          {peutModifier && (
            <button onClick={() => { setMenuOuvert(false); pushWithClient(NOUVELLE_FICHE_PATH) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: ACCENT, color: 'white', border: 'none',
                borderRadius: '8px', padding: '12px 16px',
                fontSize: '14px', fontWeight: '500', cursor: 'pointer', marginBottom: '4px'
              }}
            >+ Nouvelle fiche{isBar ? ' bar' : ''}</button>
          )}
          <button onClick={() => { setMenuOuvert(false); pushWithClient(DASHBOARD_PATH) }}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              background: isActive(DASHBOARD_PATH) ? ACCENT_MOB_BG : 'transparent',
              color: isActive(DASHBOARD_PATH) ? 'white' : 'rgba(255,255,255,0.7)',
              border: 'none', borderRadius: '8px', padding: '12px 16px',
              fontSize: '14px', cursor: 'pointer', marginBottom: '4px'
            }}
          >Dashboard</button>
          {groupes.flatMap(g => g.items).map((item) => (
            <button key={item.path}
              onClick={() => { setMenuOuvert(false); pushWithClient(item.path) }}
              style={mobileItemStyle(isActive(item.path))}
            >{item.label}</button>
          ))}
          {(role === 'admin' || role === 'directeur') && (isBar || hasBar) && (
            <button onClick={() => { setMenuOuvert(false); pushWithClient(CROSS_PATH) }}
              style={mobileItemStyle(false)}
            >{CROSS_LABEL}</button>
          )}
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />
          <button onClick={handleLogout}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              background: 'transparent', color: 'rgba(255,255,255,0.4)',
              border: 'none', borderRadius: '8px', padding: '11px 16px',
              fontSize: '14px', cursor: 'pointer'
            }}
          >Déconnexion</button>
        </div>
      )}
    </>
  )
}
