'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Logo } from '../lib/theme.jsx'
import { useTheme } from '../lib/useTheme'
import { useRole } from '../lib/useRole'
import { useIsMobile } from '../lib/useIsMobile'

export default function NavbarCuisine() {
  const router = useRouter()
  const pathname = usePathname()
  const { c } = useTheme()
  const { role } = useRole()
  const isMobile = useIsMobile()
  const [menuOuvert, setMenuOuvert] = useState(false)

  const peutModifier = role === 'admin' || role === 'cuisine'

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const isActive = (path) => {
    if (path === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(path)
  }

  const navItems = [
    { label: 'Dashboard', path: '/dashboard' },
    ...(peutModifier ? [{ label: '+ Nouvelle fiche', path: '/fiches/nouvelle', accent: true }] : []),
    { label: 'Fiches', path: '/fiches' },
    { label: 'Sous-fiches', path: '/sous-fiches' },
    { label: 'Menus', path: '/menus' },
    { label: 'Récap', path: '/recap' },
    ...(peutModifier ? [{ label: 'Ingrédients', path: '/ingredients' }] : []),
    { label: 'Archives', path: '/archives' },
    ...(role === 'admin' ? [{ label: '🍸 Bar', path: '/bar/dashboard' }] : []),
    { label: '⭐ Avis', path: '/avis' },
    ...(role === 'admin' ? [{ label: 'Paramètres', path: '/parametres' }] : []),
    ...(role === 'admin' ? [{ label: '👥 Utilisateurs', path: '/admin' }] : []),
    { label: 'Déconnexion', path: null, action: handleLogout },
  ]

  const btnStyle = (item) => {
    const active = item.path && isActive(item.path)
    if (item.accent) return {
      background: c.accent, color: c.principal, border: 'none',
      borderRadius: '8px', padding: '8px 14px', fontSize: '13px',
      fontWeight: '600', cursor: 'pointer'
    }
    if (active) return {
      background: 'rgba(196, 149, 106, 0.25)',
      color: 'white',
      border: '0.5px solid rgba(196, 149, 106, 0.5)',
      borderRadius: '8px', padding: '8px 14px', fontSize: '13px',
      fontWeight: '600', cursor: 'pointer'
    }
    return {
      background: 'transparent', color: 'rgba(255,255,255,0.7)',
      border: '0.5px solid rgba(255,255,255,0.2)',
      borderRadius: '8px', padding: '8px 14px', fontSize: '13px',
      fontWeight: '400', cursor: 'pointer'
    }
  }

  const btnMobileStyle = (item) => {
    const active = item.path && isActive(item.path)
    if (item.accent) return {
      display: 'block', width: '100%', textAlign: 'left',
      background: c.accent, color: c.principal,
      border: 'none', borderRadius: '8px', padding: '12px 16px',
      fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginBottom: '4px'
    }
    if (active) return {
      display: 'block', width: '100%', textAlign: 'left',
      background: 'rgba(196, 149, 106, 0.25)', color: 'white',
      border: '0.5px solid rgba(196, 149, 106, 0.5)',
      borderRadius: '8px', padding: '12px 16px',
      fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginBottom: '4px'
    }
    return {
      display: 'block', width: '100%', textAlign: 'left',
      background: 'transparent', color: 'rgba(255,255,255,0.85)',
      border: 'none', borderRadius: '8px', padding: '12px 16px',
      fontSize: '14px', fontWeight: '400', cursor: 'pointer', marginBottom: '4px'
    }
  }

  return (
    <>
      <div className="no-print" style={{
        background: c.principal, borderBottom: `0.5px solid ${c.accent}40`,
        padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <Logo height={28} couleur="white" onClick={() => router.push('/dashboard')} />
        {isMobile ? (
          <button onClick={() => setMenuOuvert(!menuOuvert)} style={{
            background: 'transparent', border: '0.5px solid rgba(255,255,255,0.3)',
            borderRadius: '8px', padding: '8px 12px', cursor: 'pointer',
            color: 'white', fontSize: '18px'
          }}>☰</button>
        ) : (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'nowrap', overflowX: 'auto' }}>
            {navItems.map((item, i) => (
              <button key={i}
                onClick={() => item.action ? item.action() : router.push(item.path)}
                style={btnStyle(item)}
              >{item.label}</button>
            ))}
          </div>
        )}
      </div>

      {isMobile && menuOuvert && (
        <div className="no-print" style={{
          background: c.principal, padding: '8px 16px 16px',
          borderBottom: `0.5px solid ${c.accent}40`,
          position: 'sticky', top: '56px', zIndex: 99
        }}>
          {navItems.map((item, i) => (
            <button key={i}
              onClick={() => { setMenuOuvert(false); item.action ? item.action() : router.push(item.path) }}
              style={btnMobileStyle(item)}
            >{item.label}</button>
          ))}
        </div>
      )}
    </>
  )
}
