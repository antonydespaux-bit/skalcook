'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getClientId } from '../../../lib/supabase'
import { useTheme } from '../../../lib/useTheme'
import { useRole } from '../../../lib/useRole'
import Navbar from '../../../components/Navbar'
import { Card, Button, Badge, Alert } from '../../../components/ui'
import {
  STATUTS_DEVIS, STATUTS_DEVIS_MAP,
  formatDateFr, formatMontant, clientDisplayName, hexToRgba,
} from '../../../lib/crmConstants'

export default function CrmDevisListPage() {
  const router = useRouter()
  const { c } = useTheme()
  const { role, loading: roleLoading } = useRole()

  const [authReady, setAuthReady] = useState(false)
  const [devis, setDevis] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [recherche, setRecherche] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('tous')

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

    const [{ data: dData, error: dErr }, { data: cData, error: cErr }] = await Promise.all([
      supabase.from('crm_devis')
        .select('id, numero, crm_client_id, crm_evenement_id, statut, date_emission, date_validite, total_ttc')
        .eq('client_id', cid)
        .order('date_emission', { ascending: false }),
      supabase.from('crm_clients')
        .select('id, type, nom, prenom, raison_sociale')
        .eq('client_id', cid),
    ])
    if (dErr || cErr) { setError((dErr || cErr).message); setLoading(false); return }
    setDevis(dData || [])
    setClients(cData || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!authReady || !['admin', 'directeur'].includes(role || '')) return
    load()
  }, [authReady, role, load])

  const clientById = useMemo(() => Object.fromEntries(clients.map((cl) => [cl.id, cl])), [clients])

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return devis.filter((d) => {
      if (filtreStatut !== 'tous' && d.statut !== filtreStatut) return false
      if (!q) return true
      const hay = [d.numero, clientDisplayName(clientById[d.crm_client_id])].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [devis, recherche, filtreStatut, clientById])

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
        <div className="crm-header">
          <div className="crm-header__text">
            <h1 className="crm-header__title" style={{ color: c.texte }}>Devis</h1>
            <p className="crm-header__subtitle" style={{ color: c.texteMuted }}>
              {devis.length} devis
            </p>
          </div>
          <div className="crm-actions">
            <Button c={c} onClick={() => router.push('/crm/devis/nouveau')}>+ Nouveau devis</Button>
          </div>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        <div className="crm-toolbar">
          <input
            type="text"
            placeholder="Rechercher par numéro ou client…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            className="crm-toolbar__search"
            style={{ background: c.blanc, border: `0.5px solid ${c.bordure}`, color: c.texte }}
          />
          <select
            value={filtreStatut}
            onChange={(e) => setFiltreStatut(e.target.value)}
            className="sk-select"
            style={{ background: c.blanc, border: `0.5px solid ${c.bordure}`, color: c.texte }}
          >
            <option value="tous">Tous les statuts</option>
            {STATUTS_DEVIS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>

        {loading ? (
          <div style={{ color: c.texteMuted, fontSize: 13, padding: 12 }}>Chargement…</div>
        ) : devis.length === 0 ? (
          <div className="crm-empty" style={{ borderColor: c.bordure, background: c.blanc }}>
            <div className="crm-empty__title" style={{ color: c.texte }}>Aucun devis</div>
            <div className="crm-empty__text" style={{ color: c.texteMuted }}>
              Créez votre premier devis depuis une fiche technique ou en ligne libre.
            </div>
            <Button c={c} onClick={() => router.push('/crm/devis/nouveau')}>+ Nouveau devis</Button>
          </div>
        ) : filtres.length === 0 ? (
          <Card c={c} padding="md">
            <span style={{ color: c.texteMuted, fontSize: 13 }}>Aucun résultat.</span>
          </Card>
        ) : (
          <div className="crm-list">
            {filtres.map((d) => {
              const st = STATUTS_DEVIS_MAP[d.statut]
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => router.push(`/crm/devis/${d.id}`)}
                  className="crm-row"
                  style={{ background: c.blanc, borderColor: c.bordure, color: c.texte }}
                >
                  <div>
                    <div className="crm-row__primary" style={{ color: c.texte }}>{d.numero}</div>
                    <div className="crm-row__secondary" style={{ color: c.texteMuted }}>
                      {clientDisplayName(clientById[d.crm_client_id])}
                    </div>
                  </div>
                  <div className="crm-row__secondary" style={{ color: c.texteMuted }}>
                    <div>{formatDateFr(d.date_emission)}</div>
                    <div>{formatMontant(d.total_ttc)} TTC</div>
                  </div>
                  <div className="crm-row__meta">
                    {st && <Badge bg={hexToRgba(st.couleur, 0.12)} color={st.couleur} size="sm">{st.label}</Badge>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
