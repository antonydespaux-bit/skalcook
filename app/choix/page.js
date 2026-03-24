'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo, LogoBand } from '../../lib/theme.jsx'
import { useRole } from '../../lib/useRole'

export default function ChoixPage() {
  const router = useRouter()
  const c = theme.couleurs
  const { role, nom, loading } = useRole()

  useEffect(() => {
    checkUser()
  }, [])

  useEffect(() => {
    if (!loading) {
      if (!role) { router.push('/'); return }
      if (role === 'cuisine') { router.push('/dashboard'); return }
      if (role === 'bar') { router.push('/bar/dashboard'); return }
    }
  }, [role, loading])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>
      <div style={{ fontSize: '14px', color: c.texteMuted }}>Chargement...</div>
    </div>
  )

  return (
    <div style={{
      minHeight: '100vh', background: c.fond,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '20px'
    }}>

      <LogoBand c={c} style={{
        maxWidth: '380px',
        marginBottom: '12px',
        marginLeft: 'auto',
        marginRight: 'auto',
      }}>
        <Logo height={32} couleur="white" />
      </LogoBand>
      
      <div style={{ fontSize: '12px', color: c.texteMuted, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '40px' }}>
        Bonjour {nom} — Choisissez votre espace
      </div>

      {/* Deux cases */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', width: '100%', maxWidth: '600px' }}>

        {/* Cuisine */}
        <div
          onClick={() => router.push('/dashboard')}
          style={{
            background: 'white', borderRadius: '16px', padding: '40px 24px',
            border: `2px solid ${c.bordure}`, cursor: 'pointer',
            textAlign: 'center', transition: 'all 0.2s ease'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = c.accent
            e.currentTarget.style.boxShadow = `0 8px 32px ${c.accent}30`
            e.currentTarget.style.transform = 'translateY(-4px)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = c.bordure
            e.currentTarget.style.boxShadow = 'none'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>👨‍🍳</div>
          <div style={{ fontSize: '20px', fontWeight: '500', color: c.principal, marginBottom: '8px', letterSpacing: '2px', textTransform: 'uppercase' }}>
            Cuisine
          </div>
          <div style={{ fontSize: '12px', color: c.texteMuted, lineHeight: '1.6' }}>
            Fiches techniques<br />Ingrédients & menus
          </div>
        </div>

        {/* Bar */}
        <div
          onClick={() => router.push('/bar/dashboard')}
          style={{
            background: 'white', borderRadius: '16px', padding: '40px 24px',
            border: `2px solid ${c.bordure}`, cursor: 'pointer',
            textAlign: 'center', transition: 'all 0.2s ease'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = '#7F77DD'
            e.currentTarget.style.boxShadow = '0 8px 32px #7F77DD30'
            e.currentTarget.style.transform = 'translateY(-4px)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = c.bordure
            e.currentTarget.style.boxShadow = 'none'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🍸</div>
          <div style={{ fontSize: '20px', fontWeight: '500', color: '#3C3489', marginBottom: '8px', letterSpacing: '2px', textTransform: 'uppercase' }}>
            Bar
          </div>
          <div style={{ fontSize: '12px', color: c.texteMuted, lineHeight: '1.6' }}>
            Cocktails & boissons<br />Carte des drinks
          </div>
        </div>
      </div>

      <button onClick={handleLogout} style={{
        marginTop: '32px', background: 'transparent', color: c.texteMuted,
        border: 'none', fontSize: '13px', cursor: 'pointer', textDecoration: 'underline'
      }}>
        Se déconnecter
      </button>
    </div>
  )
}
