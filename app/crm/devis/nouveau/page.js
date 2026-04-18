'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, getClientId } from '../../../../lib/supabase'
import { useTheme } from '../../../../lib/useTheme'
import { useRole } from '../../../../lib/useRole'
import Navbar from '../../../../components/Navbar'
import { Alert } from '../../../../components/ui'
import DevisForm from '../../../../components/crm/DevisForm'
import { formatDevisNumero } from '../../../../lib/crmConstants'

export default function NouveauDevisPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedEvenementId = searchParams?.get('evenement') || ''
  const preselectedClientId = searchParams?.get('client_id') || ''
  const { c } = useTheme()
  const { role, loading: roleLoading } = useRole()

  const [authReady, setAuthReady] = useState(false)
  const [clientId, setClientId] = useState(null)
  const [devisPrefix, setDevisPrefix] = useState('DEV')
  const [crmClients, setCrmClients] = useState([])
  const [crmEvenements, setCrmEvenements] = useState([])
  const [fiches, setFiches] = useState([])
  const [initial, setInitial] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const cid = await getClientId()
    if (!cid) { setLoading(false); return }
    setClientId(cid)

    const [
      { data: tenant, error: tErr },
      { data: clientsData, error: cErr },
      { data: evenementsData, error: eErr },
      { data: fichesData, error: fErr },
    ] = await Promise.all([
      supabase.from('clients').select('devis_prefix').eq('id', cid).maybeSingle(),
      supabase.from('crm_clients')
        .select('id, type, nom, prenom, raison_sociale')
        .eq('client_id', cid)
        .order('created_at', { ascending: false }),
      supabase.from('crm_evenements')
        .select('id, crm_client_id, titre, date_evenement')
        .eq('client_id', cid),
      supabase.from('fiches')
        .select('id, nom, cout_portion, prix_ttc, allergenes')
        .eq('client_id', cid)
        .eq('archive', false)
        .eq('is_sub_fiche', false)
        .order('nom', { ascending: true }),
    ])
    if (tErr || cErr || eErr || fErr) {
      setError((tErr || cErr || eErr || fErr).message)
      setLoading(false)
      return
    }
    setDevisPrefix(tenant?.devis_prefix || 'DEV')
    setCrmClients(clientsData || [])
    setCrmEvenements(evenementsData || [])
    setFiches(fichesData || [])

    // Pré-remplissage depuis l'URL
    if (preselectedEvenementId) {
      const ev = (evenementsData || []).find((e) => e.id === preselectedEvenementId)
      if (ev) setInitial({ crm_client_id: ev.crm_client_id, crm_evenement_id: ev.id })
    } else if (preselectedClientId) {
      setInitial({ crm_client_id: preselectedClientId })
    }

    setLoading(false)
  }, [preselectedEvenementId, preselectedClientId])

  useEffect(() => {
    if (!authReady || !['admin', 'directeur'].includes(role || '')) return
    load()
  }, [authReady, role, load])

  async function handleSubmit({ header, lignes }) {
    if (!clientId) throw new Error('Établissement introuvable.')
    const { data: { user } } = await supabase.auth.getUser()

    // 1. Allocation atomique du numéro pour l'année
    const annee = Number((header.date_emission || '').slice(0, 4)) || new Date().getFullYear()
    const { data: seq, error: sErr } = await supabase
      .rpc('crm_next_devis_numero', { p_client_id: clientId, p_annee: annee })
    if (sErr) throw sErr
    const numero = formatDevisNumero(devisPrefix, annee, seq)

    // 2. Insert header
    const { data: devisRow, error: hErr } = await supabase
      .from('crm_devis')
      .insert({
        ...header,
        client_id: clientId,
        created_by: user?.id || null,
        numero,
        annee,
        sequence: seq,
      })
      .select('id')
      .single()
    if (hErr) throw hErr

    // 3. Insert lignes
    if (lignes.length > 0) {
      const { error: lErr } = await supabase
        .from('crm_devis_lignes')
        .insert(lignes.map((l) => ({ ...l, devis_id: devisRow.id, client_id: clientId })))
      if (lErr) {
        // Rollback best-effort : on supprime le header orphelin
        await supabase.from('crm_devis').delete().eq('id', devisRow.id)
        throw lErr
      }
    }

    router.push(`/crm/devis/${devisRow.id}`)
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
          onClick={() => router.push('/crm/devis')}
          className="crm-back"
          style={{ color: c.texteMuted }}
        >← Devis</button>
        <div className="crm-header">
          <div className="crm-header__text">
            <h1 className="crm-header__title" style={{ color: c.texte }}>Nouveau devis</h1>
            <p className="crm-header__subtitle" style={{ color: c.texteMuted }}>
              Numéro {devisPrefix}-{new Date().getFullYear()}-XXX attribué à la sauvegarde.
            </p>
          </div>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        {loading ? (
          <div style={{ color: c.texteMuted, fontSize: 13, padding: 12 }}>Chargement…</div>
        ) : (
          <DevisForm
            c={c}
            initial={initial}
            clientsDispo={crmClients}
            evenementsDispo={crmEvenements}
            fichesDispo={fiches}
            lockClient={!!preselectedEvenementId}
            lockEvenement={!!preselectedEvenementId}
            submitLabel="Créer le devis"
            onSubmit={handleSubmit}
            onCancel={() => router.push('/crm/devis')}
          />
        )}
      </div>
    </div>
  )
}
