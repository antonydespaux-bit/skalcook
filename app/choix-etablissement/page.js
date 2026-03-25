'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { theme, Logo, LogoBand } from '../../lib/theme.jsx'

// Hub multi-etablissements (selection explicite du client actif)
export default function ChoixEtablissementPage() {
  const router = useRouter()
  const c = theme.couleurs
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [etablissements, setEtablissements] = useState([])

  useEffect(() => {
    const init = async () => {
      try {
        const { data: userData, error: userErr } = await supabase.auth.getUser()
        const user = userData?.user
        if (userErr) {
          console.log('choix-etablissement:getUser error', userErr)
        }
        if (!user) {
          router.push('/login')
          return
        }
 
        const { data, error: accesErr } = await supabase
          .from('acces_clients')
          .select('*, clients(*)')
          .eq('user_id', user.id)

        console.log('choix-etablissement:acces_clients raw data', data)
        console.log('choix-etablissement:acces_clients error', accesErr)

        if (accesErr) {
          setError('Impossible de charger vos établissements.')
          setLoading(false)
          return
        }

        const rows = (data || []).filter((r) => r?.client_id)
        console.log('choix-etablissement:acces_clients filtered rows', rows)
        setEtablissements(rows)

        if (rows.length === 0) {
          setError('Aucun établissement associé à votre compte.')
        }
      } catch (e) {
        console.log('choix-etablissement:init exception', e)
        setError('Une erreur est survenue.')
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [])

  const choisirEtablissement = (clientId) => {
    try {
      localStorage.setItem('client_id', clientId)
    } catch (e) {
      // no-op
    }
    router.push('/dashboard')
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>
        <div style={{ fontSize: '14px', color: c.texteMuted }}>Chargement...</div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', background: c.fond,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '20px'
    }}>
      <LogoBand c={c} style={{ maxWidth: '420px', marginBottom: '14px', marginLeft: 'auto', marginRight: 'auto' }}>
        <Logo height={32} couleur="white" />
      </LogoBand>

      <div style={{ fontSize: '12px', color: c.texteMuted, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '28px' }}>
        Choisissez votre établissement
      </div>

      {error && (
        <div style={{
          background: '#FCEBEB',
          color: '#A32D2D',
          borderRadius: '8px',
          padding: '12px 14px',
          border: '0.5px solid #F09595',
          fontSize: '13px',
          marginBottom: '16px',
          maxWidth: '780px',
          width: '100%'
        }}>
          {error}
        </div>
      )}

      <div style={{
        width: '100%',
        maxWidth: '780px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: '14px'
      }}>
        {etablissements.map((row) => {
          const client = row.clients || {}
          const nom = client.nom_etablissement || client.nom || `Établissement ${row.client_id?.slice?.(0, 8) || ''}`
          return (
            <button
              key={row.client_id}
              onClick={() => choisirEtablissement(row.client_id)}
              style={{
                background: 'white',
                borderRadius: '14px',
                border: `1px solid ${c.bordure}`,
                textAlign: 'left',
                padding: '16px',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontSize: '15px', fontWeight: 600, color: c.texte, marginBottom: '6px' }}>{nom}</div>
              <div style={{ fontSize: '12px', color: c.texteMuted }}>Role: {row.role || 'utilisateur'}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

