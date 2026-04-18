'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getClientId } from '../../../../lib/supabase'
import { useTheme } from '../../../../lib/useTheme'
import { useRole } from '../../../../lib/useRole'
import Navbar from '../../../../components/Navbar'
import ClientForm from '../../../../components/crm/ClientForm'

export default function NouveauClientPage() {
  const router = useRouter()
  const { c } = useTheme()
  const { role, loading: roleLoading } = useRole()
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) { router.replace('/'); return }
      setAuthReady(true)
    })()
    return () => { cancelled = true }
  }, [router])

  useEffect(() => {
    if (!roleLoading && role && !['admin', 'directeur'].includes(role)) {
      router.replace('/dashboard')
    }
  }, [role, roleLoading, router])

  async function handleSubmit(values) {
    const cid = await getClientId()
    if (!cid) throw new Error('Établissement introuvable.')
    const { data: { user } } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('crm_clients')
      .insert({ ...values, client_id: cid, created_by: user?.id || null })
      .select('id')
      .single()

    if (error) throw error
    router.push(`/crm/clients/${data.id}`)
  }

  if (!authReady || roleLoading) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
        Chargement…
      </div>
    )
  }

  return (
    <div style={{ background: c.fond, minHeight: '100vh' }}>
      <Navbar section="cuisine" />
      <div className="crm-page">
        <button
          type="button"
          onClick={() => router.push('/crm/clients')}
          className="crm-back"
          style={{ color: c.texteMuted }}
        >← Clients</button>
        <div className="crm-header">
          <div className="crm-header__text">
            <h1 className="crm-header__title" style={{ color: c.texte }}>Nouveau client</h1>
            <p className="crm-header__subtitle" style={{ color: c.texteMuted }}>Particulier ou entreprise — les coordonnées peuvent être complétées plus tard.</p>
          </div>
        </div>

        <ClientForm
          c={c}
          submitLabel="Créer le client"
          onSubmit={handleSubmit}
          onCancel={() => router.push('/crm/clients')}
        />
      </div>
    </div>
  )
}
