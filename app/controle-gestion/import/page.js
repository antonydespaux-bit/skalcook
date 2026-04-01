'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import Navbar from '../../../components/Navbar'
import VentesImporter from '../../../components/VentesImporter'

export default function ControleGestionImportPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return
        if (!session) {
          router.replace('/')
          return
        }
        setAuthReady(true)
      } catch {
        if (!cancelled) router.replace('/')
      }
    })()
    return () => { cancelled = true }
  }, [router])

  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
        Chargement…
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1100px', margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 20px', fontSize: isMobile ? 22 : 26, fontWeight: 600, color: c.texte }}>
          Importation des ventes Lightspeed
        </h1>
        <VentesImporter />
      </div>
    </div>
  )
}
