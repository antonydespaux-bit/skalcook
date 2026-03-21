'use client'
import { useRouter, usePathname } from 'next/navigation'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Logo } from '../lib/theme.jsx'
import { useTheme } from '../lib/useTheme'
import { useRole } from '../lib/useRole'
import { useIsMobile } from '../lib/useIsMobile'

export default function NavbarBar() {
  const router = useRouter()
  const pathname = usePathname()
  const { c } = useTheme()
  const { role } = useRole()
  const isMobile = useIsMobile()
  const [menuOuvert, setMenuOuvert] = useState(false)

  const peutModifier = role === 'admin' || role === 'bar'

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  const isActive = (path) => {
    if (path === '/bar/dashboard') return pathname === '/bar/dashboard'
    return pathname.startsWith(path)
  }

const navItems = [
  { label: 'Dashboard', path: '/bar/dashboard' },
  ...(peutModifier ? [{ label: '+ Nouvelle fiche', path: '/bar/fiches/nouvelle', accent: true }] : []),
  { label: 'Fiches', path: '/bar/fiches' },
  { label: 'Sous-fiches', path: '/bar/sous-fiches' },
  { label: 'Récap', path: '/bar/recap' },
  ...(peutModifier ? [{ label: 'Ingrédients', path: '/bar/ingredients' }] : []),
  { label: 'Archives', path: '/bar/archives' },
  ...(role === 'admin' ? [{ label: '🍽️ Cuisine', path: '/choix' }] : []),
  ...(role === 'directeur' ? [{ label: '🍽️ Cuisine', path: '/dashboard' }] : []),
  { label: 'Déconnexion', path: null, action: handleLogout },
]

  const btnStyle = (item) => {
    const active = item.path && isActive(item.path)
    if (item.accent) return {
      background: '#C4956A', color: '#3C3489', border: 'none',
      borderRadius: '8px', padding: '8px 14px', fontSize: '13px',
      fontWeight: '600', cursor: 'pointer'
    }
    if (active) return {
      background: 'rgba(127, 119, 221, 0.35)',
      color: 'white',
      border: '0.5px solid rgba(127, 119, 221, 0.6)',
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
      background: '#C4956A', color: '#3C3489',
      border: 'none', borderRadius: '8px', padding: '12px 16px',
      fontSize: '14px', fontWeight: '600', cursor: 'pointer', marginBottom: '4px'
    }
    if (active) return {
      display: 'block', width: '100%', textAlign: 'left',
      background: 'rgba(127, 119, 221, 0.35)', color: 'white',
      border: '0.5px solid rgba(127, 119, 221, 0.6)',
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
      <div style={{
        background: '#3C3489', borderBottom: '0.5px solid #7F77DD40',
        padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <Logo height={28} couleur="white" onClick={() => router.push('/bar/dashboard')} />
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
        <div style={{
          background: '#3C3489', padding: '8px 16px 16px',
          borderBottom: '0.5px solid #7F77DD40',
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
