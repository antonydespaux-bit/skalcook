'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/useTheme'
import { useRole } from '../lib/useRole'
import { useIsMobile } from '../lib/useIsMobile'
import { useTenant } from '../lib/useTenant'

export default function NavbarBar() {
  const router = useRouter()
  const pathname = usePathname()
  const { c, nomEtablissement, logoUrl } = useTheme()
  const { tenant } = useTenant()
  const { role } = useRole()
  const isMobile = useIsMobile()
  const [menuOuvert, setMenuOuvert] = useState(false)
  const [groupeOuvert, setGroupeOuvert] = useState(null)
  const SUPERADMIN_EMAIL = 'antony.despaux@hotmail.fr'
  const [showReturnSuperAdmin, setShowReturnSuperAdmin] = useState(false)

  const NAV = c.principal || '#18181B'
  const ACCENT_BAR = c.violet || '#7C3AED'
  const ACCENT_BAR_LIGHT = c.violetClair || '#EDE9FE'

  const modules = tenant?.modules_actifs || ['fiches', 'sous-fiches', 'recap', 'ingredients']
  const hasModule = (id) => modules.includes(id)

  const peutModifier = role === 'admin' || role === 'bar'

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  useEffect(() => {
    let alive = true
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!alive) return
      const email = (user?.email || '').toLowerCase().trim()
      setShowReturnSuperAdmin(email === SUPERADMIN_EMAIL)
    }).catch(() => {
      if (!alive) return
      setShowReturnSuperAdmin(false)
    })
    return () => { alive = false }
  }, [])

  const isActive = (paths) => {
    const arr = Array.isArray(paths) ? paths : [paths]
    return arr.some(p => {
      if (p === '/bar/dashboard') return pathname === '/bar/dashboard'
      return pathname.startsWith(p)
    })
  }

  const groupes = [
    {
      label: 'Fiches bar',
      paths: ['/bar/fiches', '/bar/sous-fiches', '/bar/archives'],
      items: [
        ...(hasModule('fiches') ? [{ label: 'Toutes les fiches', path: '/bar/fiches' }] : []),
        ...(hasModule('sous-fiches') ? [{ label: 'Sous-fiches', path: '/bar/sous-fiches' }] : []),
        { label: 'Archives', path: '/bar/archives' },
      ]
    },
    {
      label: 'Contenus',
      paths: ['/bar/recap', '/bar/ingredients', '/bar/import'],
      items: [
        ...(hasModule('recap') ? [{ label: 'Récap food cost', path: '/bar/recap' }] : []),
        ...(hasModule('ingredients') && peutModifier ? [{ label: 'Ingrédients', path: '/bar/ingredients' }] : []),
      ]
    },
  ].filter(groupe => groupe.items.length > 0)

  const dropdownStyle = {
    position: 'absolute', top: '100%', left: 0, marginTop: '8px',
    background: '#FFFFFF', border: '0.5px solid #E4E4E7',
    borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    minWidth: '180px', zIndex: 200, overflow: 'hidden', padding: '4px',
  }

  return (
    <>
      <div style={{
        background: NAV, borderBottom: '0.5px solid rgba(255,255,255,0.06)',
        padding: '0 20px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
        position: 'sticky', top: 0, zIndex: 100
      }}
        onClick={() => groupeOuvert && setGroupeOuvert(null)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>

          {/* Logo / Nom établissement */}
          <button
            onClick={(e) => { e.stopPropagation(); router.push('/bar/dashboard') }}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '6px 10px', borderRadius: '8px',
              display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            {logoUrl ? (
              <img src={logoUrl} alt={nomEtablissement}
                style={{ height: '28px', width: 'auto', objectFit: 'contain', borderRadius: '4px' }}
              />
            ) : (
              <div style={{
                width: '28px', height: '28px', borderRadius: '6px',
                background: ACCENT_BAR, display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <span style={{ fontSize: '14px' }}>🍸</span>
              </div>
            )}
            {!isMobile && (
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'white', letterSpacing: '0.3px' }}>
                {nomEtablissement}
              </span>
            )}
          </button>

          {/* Badge BAR */}
          {!isMobile && (
            <div style={{
              padding: '2px 8px', borderRadius: '20px',
              background: ACCENT_BAR_LIGHT, marginRight: '4px'
            }}>
              <span style={{ fontSize: '11px', fontWeight: '500', color: ACCENT_BAR }}>BAR</span>
            </div>
          )}

          {!isMobile && <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />}

          {/* Dashboard */}
          {!isMobile && (
            <button
              onClick={(e) => { e.stopPropagation(); router.push('/bar/dashboard') }}
              style={{
                background: 'transparent', border: 'none',
                borderBottom: isActive('/bar/dashboard') ? `2px solid ${ACCENT_BAR}` : '2px solid transparent',
                borderRadius: '0', padding: '0 12px', height: '56px',
                fontSize: '13px', fontWeight: isActive('/bar/dashboard') ? '500' : '400',
                color: isActive('/bar/dashboard') ? 'white' : 'rgba(255,255,255,0.55)',
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
                  onClick={(e) => { e.stopPropagation(); setGroupeOuvert(ouvert ? null : groupe.label) }}
                  style={{
                    background: ouvert ? 'rgba(255,255,255,0.06)' : 'transparent',
                    border: 'none',
                    borderBottom: active ? `2px solid ${ACCENT_BAR}` : '2px solid transparent',
                    borderRadius: '0', padding: '0 12px', height: '56px',
                    fontSize: '13px', fontWeight: active ? '500' : '400',
                    color: active ? 'white' : 'rgba(255,255,255,0.55)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                    transition: 'all 0.15s',
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
                        onClick={() => { setGroupeOuvert(null); router.push(item.path) }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '9px 12px', border: 'none', borderRadius: '6px',
                          background: isActive(item.path) ? ACCENT_BAR_LIGHT : 'transparent',
                          color: isActive(item.path) ? ACCENT_BAR : '#18181B',
                          fontSize: '13px', fontWeight: isActive(item.path) ? '500' : '400',
                          cursor: 'pointer',
                        }}
                      >{item.label}</button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Lien Cuisine */}
          {!isMobile && (role === 'admin' || role === 'directeur') && (
            <button
              onClick={(e) => { e.stopPropagation(); router.push('/dashboard') }}
              style={{
                background: 'transparent', border: 'none',
                borderBottom: '2px solid transparent',
                borderRadius: '0', padding: '0 12px', height: '56px',
                fontSize: '13px', fontWeight: '400',
                color: 'rgba(255,255,255,0.55)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >🍽️ Cuisine</button>
          )}
        </div>

        {/* Droite */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!isMobile && peutModifier && (
            <button
              onClick={(e) => { e.stopPropagation(); router.push('/bar/fiches/nouvelle') }}
              style={{
                background: ACCENT_BAR, color: 'white', border: 'none',
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
            <button
              onClick={() => router.push('/superadmin')}
              style={{
                background: 'rgba(99,102,241,0.2)',
                color: 'rgba(165,180,252,1)',
                border: '0.5px solid rgba(99,102,241,0.35)',
                borderRadius: '8px',
                padding: '7px 12px',
                fontSize: '13px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              ← Retour SuperAdmin
            </button>
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

      {/* Menu mobile */}
      {isMobile && menuOuvert && (
        <div style={{
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
            >
              ← Retour SuperAdmin
            </button>
          )}
          {peutModifier && (
            <button onClick={() => { setMenuOuvert(false); router.push('/bar/fiches/nouvelle') }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: ACCENT_BAR, color: 'white', border: 'none',
                borderRadius: '8px', padding: '12px 16px',
                fontSize: '14px', fontWeight: '500', cursor: 'pointer', marginBottom: '4px'
              }}
            >+ Nouvelle fiche bar</button>
          )}
          <button onClick={() => { setMenuOuvert(false); router.push('/bar/dashboard') }}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              background: isActive('/bar/dashboard') ? 'rgba(124,58,237,0.15)' : 'transparent',
              color: isActive('/bar/dashboard') ? 'white' : 'rgba(255,255,255,0.7)',
              border: 'none', borderRadius: '8px', padding: '12px 16px',
              fontSize: '14px', cursor: 'pointer', marginBottom: '4px'
            }}
          >Dashboard</button>
          {groupes.flatMap(g => g.items).map((item) => (
            <button key={item.path}
              onClick={() => { setMenuOuvert(false); router.push(item.path) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: isActive(item.path) ? 'rgba(124,58,237,0.15)' : 'transparent',
                color: isActive(item.path) ? 'white' : 'rgba(255,255,255,0.6)',
                border: 'none', borderRadius: '8px', padding: '11px 16px',
                fontSize: '14px', cursor: 'pointer', marginBottom: '2px'
              }}
            >{item.label}</button>
          ))}
          {(role === 'admin' || role === 'directeur') && (
            <button onClick={() => { setMenuOuvert(false); router.push('/dashboard') }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: 'transparent', color: 'rgba(255,255,255,0.6)',
                border: 'none', borderRadius: '8px', padding: '11px 16px',
                fontSize: '14px', cursor: 'pointer', marginBottom: '2px'
              }}
            >🍽️ Cuisine</button>
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
