'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/useTheme'
import { useRole } from '../lib/useRole'
import { useIsMobile } from '../lib/useIsMobile'


// Puis utilisez c.principal au lieu de NAV, c.accent au lieu de ACCENT
const NAV = c.principal || '#18181B'
const ACCENT = c.accent || '#6366F1'
const ACCENT_LIGHT = c.accentClair || '#EEF2FF'

export default function NavbarCuisine() {
  const router = useRouter()
  const pathname = usePathname()
  const { c, nomEtablissement, logoUrl } = useTheme()
  const { role } = useRole()
  const isMobile = useIsMobile()
  const [menuOuvert, setMenuOuvert] = useState(false)
  const [groupeOuvert, setGroupeOuvert] = useState(null)

  const peutModifier = role === 'admin' || role === 'cuisine'

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const isActive = (paths) => {
    const arr = Array.isArray(paths) ? paths : [paths]
    return arr.some(p => {
      if (p === '/dashboard') return pathname === '/dashboard'
      return pathname.startsWith(p)
    })
  }

  const groupes = [
    {
      label: 'Fiches',
      paths: ['/fiches', '/sous-fiches', '/archives'],
      items: [
        { label: 'Toutes les fiches', path: '/fiches' },
        { label: 'Sous-fiches', path: '/sous-fiches' },
        { label: 'Archives', path: '/archives' },
      ]
    },
    {
      label: 'Contenus',
      paths: ['/menus', '/recap', '/ingredients', '/import', '/avis'],
      items: [
        { label: 'Menus', path: '/menus' },
        { label: 'Récap food cost', path: '/recap' },
        ...(peutModifier ? [{ label: 'Ingrédients', path: '/ingredients' }] : []),
        { label: 'Avis clients', path: '/avis' },
      ]
    },
    ...(role === 'admin' ? [{
      label: 'Admin',
      paths: ['/parametres', '/admin', '/admin/logs', '/admin/ardoise'],
      items: [
        { label: 'Paramètres', path: '/parametres' },
        { label: 'Utilisateurs', path: '/admin' },
        { label: 'Activité', path: '/admin/logs' },
        { label: 'Ardoise', path: '/admin/ardoise' },
      ]
    }] : []),
  ]

  const dropdownStyle = {
    position: 'absolute', top: '100%', left: 0, marginTop: '8px',
    background: '#FFFFFF', border: '0.5px solid #E4E4E7',
    borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    minWidth: '180px', zIndex: 200, overflow: 'hidden', padding: '4px',
  }

  return (
    <>
      <div className="no-print" style={{
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
            onClick={(e) => { e.stopPropagation(); router.push('/dashboard') }}
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
                background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <span style={{ fontSize: '14px' }}>🍽️</span>
              </div>
            )}
            {!isMobile && (
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'white', letterSpacing: '0.3px' }}>
                {nomEtablissement}
              </span>
            )}
          </button>

          {!isMobile && <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)', margin: '0 4px' }} />}

          {/* Dashboard */}
          {!isMobile && (
            <button
              onClick={(e) => { e.stopPropagation(); router.push('/dashboard') }}
              style={{
                background: 'transparent', border: 'none',
                borderBottom: isActive('/dashboard') ? `2px solid ${ACCENT}` : '2px solid transparent',
                borderRadius: '0', padding: '0 12px', height: '56px',
                fontSize: '13px', fontWeight: isActive('/dashboard') ? '500' : '400',
                color: isActive('/dashboard') ? 'white' : 'rgba(255,255,255,0.55)',
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
                    borderBottom: active ? `2px solid ${ACCENT}` : '2px solid transparent',
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
                          background: isActive(item.path) ? ACCENT_LIGHT : 'transparent',
                          color: isActive(item.path) ? ACCENT : '#18181B',
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

          {/* Lien Bar */}
          {!isMobile && (role === 'admin' || role === 'directeur') && (
            <button
              onClick={(e) => { e.stopPropagation(); router.push('/bar/dashboard') }}
              style={{
                background: 'transparent', border: 'none',
                borderBottom: '2px solid transparent',
                borderRadius: '0', padding: '0 12px', height: '56px',
                fontSize: '13px', fontWeight: '400',
                color: 'rgba(255,255,255,0.55)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >🍸 Bar</button>
          )}
        </div>

        {/* Droite */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!isMobile && peutModifier && (
            <button
              onClick={(e) => { e.stopPropagation(); router.push('/fiches/nouvelle') }}
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
        <div className="no-print" style={{
          background: NAV, padding: '12px 16px 20px',
          borderBottom: '0.5px solid rgba(255,255,255,0.06)',
          position: 'sticky', top: '56px', zIndex: 99
        }}>
          {peutModifier && (
            <button onClick={() => { setMenuOuvert(false); router.push('/fiches/nouvelle') }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: ACCENT, color: 'white', border: 'none',
                borderRadius: '8px', padding: '12px 16px',
                fontSize: '14px', fontWeight: '500', cursor: 'pointer', marginBottom: '4px'
              }}
            >+ Nouvelle fiche</button>
          )}
          <button onClick={() => { setMenuOuvert(false); router.push('/dashboard') }}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              background: isActive('/dashboard') ? 'rgba(99,102,241,0.15)' : 'transparent',
              color: isActive('/dashboard') ? 'white' : 'rgba(255,255,255,0.7)',
              border: 'none', borderRadius: '8px', padding: '12px 16px',
              fontSize: '14px', cursor: 'pointer', marginBottom: '4px'
            }}
          >Dashboard</button>
          {groupes.flatMap(g => g.items).map((item) => (
            <button key={item.path}
              onClick={() => { setMenuOuvert(false); router.push(item.path) }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: isActive(item.path) ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: isActive(item.path) ? 'white' : 'rgba(255,255,255,0.6)',
                border: 'none', borderRadius: '8px', padding: '11px 16px',
                fontSize: '14px', cursor: 'pointer', marginBottom: '2px'
              }}
            >{item.label}</button>
          ))}
          {(role === 'admin' || role === 'directeur') && (
            <button onClick={() => { setMenuOuvert(false); router.push('/bar/dashboard') }}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: 'transparent', color: 'rgba(255,255,255,0.6)',
                border: 'none', borderRadius: '8px', padding: '11px 16px',
                fontSize: '14px', cursor: 'pointer', marginBottom: '2px'
              }}
            >🍸 Bar</button>
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
