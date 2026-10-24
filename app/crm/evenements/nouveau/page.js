'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, getClientId } from '../../../../lib/supabase'
import { crmPerimetre } from '../../../../lib/crmPerimetre'
import { useTheme } from '../../../../lib/useTheme'
import { usePermissions } from '../../../../lib/usePermissions'
import Navbar from '../../../../components/Navbar'
import EvenementForm from '../../../../components/crm/EvenementForm'

export default function NouvelEvenementPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedClientId = searchParams?.get('client_id') || ''
  const { c } = useTheme()
  const { peutVoir, loading: permLoading } = usePermissions()

  const [authReady, setAuthReady] = useState(false)
  const [clients, setClients] = useState([])
  const [lieux, setLieux] = useState([])
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
    if (!permLoading && !peutVoir('crm')) {
      router.replace('/dashboard')
    }
  }, [peutVoir, permLoading, router])

  const loadClients = useCallback(async () => {
    const cid = await getClientId()
    if (!cid) { setLoading(false); return }
    const { ids, lieux: lieuxGroupe } = await crmPerimetre(cid)
    setLieux(lieuxGroupe)
    const { data } = await supabase
      .from('crm_clients')
      .select('id, type, nom, prenom, raison_sociale')
      .in('client_id', ids)
      .order('created_at', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!authReady || !peutVoir('crm')) return
    loadClients()
  }, [authReady, peutVoir, loadClients])

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

  if (!authReady || permLoading) {
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
            lieux={lieux}
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
