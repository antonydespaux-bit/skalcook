'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, getClientId } from '../../../../lib/supabase'
import { useTheme } from '../../../../lib/useTheme'
import { useRole } from '../../../../lib/useRole'
import Navbar from '../../../../components/Navbar'
import EvenementForm from '../../../../components/crm/EvenementForm'

export default function NouvelEvenementPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedClientId = searchParams?.get('client_id') || ''
  const { c } = useTheme()
  const { role, loading: roleLoading } = useRole()

  const [authReady, setAuthReady] = useState(false)
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

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

  const loadClients = useCallback(async () => {
    const cid = await getClientId()
    if (!cid) { setLoading(false); return }
    const { data } = await supabase
      .from('crm_clients')
      .select('id, type, nom, prenom, raison_sociale')
      .eq('client_id', cid)
      .order('created_at', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!authReady || !['admin', 'directeur'].includes(role || '')) return
    loadClients()
  }, [authReady, role, loadClients])

  async function handleSubmit(values) {
    const cid = await getClientId()
    if (!cid) throw new Error('Établissement introuvable.')
    const { data: { user } } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('crm_evenements')
      .insert({ ...values, client_id: cid, created_by: user?.id || null })
      .select('id')
      .single()

    if (error) throw error
    router.push(`/crm/evenements/${data.id}`)
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
          onClick={() => router.push('/crm/evenements')}
          className="crm-back"
          style={{ color: c.texteMuted }}
        >← Événements</button>
        <div className="crm-header">
          <div className="crm-header__text">
            <h1 className="crm-header__title" style={{ color: c.texte }}>Nouvel événement</h1>
            <p className="crm-header__subtitle" style={{ color: c.texteMuted }}>
              Rattachez l’événement à un client puis complétez les informations connues.
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ color: c.texteMuted, fontSize: 13, padding: 12 }}>Chargement…</div>
        ) : (
          <EvenementForm
            c={c}
            clientsDispo={clients}
            initial={preselectedClientId ? { crm_client_id: preselectedClientId } : {}}
            lockClient={!!preselectedClientId}
            submitLabel="Créer l’événement"
            onSubmit={handleSubmit}
            onCancel={() => router.push('/crm/evenements')}
          />
        )}
      </div>
    </div>
  )
}
