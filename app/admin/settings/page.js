'use client'
export const dynamic = 'force-dynamic'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase' // Ton client supabase
import { theme } from '../../../lib/theme'
const c = theme.couleurs


export default function SettingsPage() {
  const [settings, setSettings] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    // 1. On récupère le profil de l'user pour avoir son site_id
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('site_id, sites(nom)')
      .eq('id', user.id)
      .single()

    // 2. On récupère les réglages de son site
    const { data: siteSettings } = await supabase
      .from('site_settings')
      .select('*')
      .eq('site_id', profile.site_id)

    setSettings(siteSettings)
    setLoading(loading => false)
  }

  const handleUpdate = async (id, newValue) => {
    const { error } = await supabase
      .from('site_settings')
      .update({ valeur: parseFloat(newValue) })
      .eq('id', id)

    if (!error) {
      setMessage('✅ Réglage mis à jour !')
      setTimeout(() => setMessage(''), 3000)
    }
  }

  if (loading) return <p>Chargement du panneau de contrôle...</p>

  return (
    <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ color: c.primary }}>Réglages de l'établissement</h1>
      <p style={{ color: '#666' }}>Modifiez ici les variables de calcul de vos marges.</p>

      {message && <div style={{ padding: '10px', background: '#d4edda', borderRadius: '8px', marginBottom: '15px' }}>{message}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {settings.map((s) => (
          <div key={s.id} style={{ borderBottom: '1px solid #eee', paddingBottom: '15px' }}>
            <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '5px' }}>
              {s.description} ({s.cle})
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="number"
                defaultValue={s.valeur}
                onBlur={(e) => handleUpdate(s.id, e.target.value)}
                style={{
                  padding: '10px',
                  borderRadius: '8px',
                  border: `1px solid ${c.border}`,
                  width: '100px'
                }}
              />
              <span>€</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
