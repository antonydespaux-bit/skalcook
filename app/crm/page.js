'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getClientId } from '../../lib/supabase'
import { useTheme } from '../../lib/useTheme'
import { useRole } from '../../lib/useRole'
import { useIsMobile } from '../../lib/useIsMobile'
import Navbar from '../../components/Navbar'
import { Card, Button, Badge, Alert } from '../../components/ui'
import {
  STATUTS_MAP, STATUTS_ENGAGES, KANBAN_STATUTS,
  STATUTS_DEVIS_MAP,
  formatMontant, formatDateFr, clientDisplayName, hexToRgba,
} from '../../lib/crmConstants'

export default function CrmDashboardPage() {
  const router = useRouter()
  const { c } = useTheme()
  const { role, loading: roleLoading } = useRole()
  const isMobile = useIsMobile()

  const [authReady, setAuthReady] = useState(false)
  const [clientId, setClientId] = useState(null)
  const [clients, setClients] = useState([])
  const [evenements, setEvenements] = useState([])
  const [devis, setDevis] = useState([])
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
      { data: cData, error: cErr },
      { data: eData, error: eErr },
      { data: dData, error: dErr },
    ] = await Promise.all([
      supabase.from('crm_clients')
        .select('id, type, nom, prenom, raison_sociale')
        .eq('client_id', cid),
      supabase.from('crm_evenements')
        .select('id, crm_client_id, titre, date_evenement, statut, type_prestation, nb_convives, montant_devis, montant_final, budget_estime, created_at')
        .eq('client_id', cid),
      supabase.from('crm_devis')
        .select('id, numero, crm_client_id, statut, total_ttc, date_emission, sent_at, created_at')
        .eq('client_id', cid),
    ])

    if (cErr || eErr || dErr) { setError((cErr || eErr || dErr).message); setLoading(false); return }
    setClients(cData || [])
    setEvenements(eData || [])
    setDevis(dData || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!authReady || !['admin', 'directeur'].includes(role || '')) return
    load()
  }, [authReady, role, load])

  const clientById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])

  const stats = useMemo(() => {
    const now = new Date()
    const debutMois = new Date(now.getFullYear(), now.getMonth(), 1)
    const finMois = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    const dansLeMois = evenements.filter((e) => {
      if (!e.date_evenement) return false
      const d = new Date(e.date_evenement)
      return d >= debutMois && d <= finMois
    })

    const caPrev = evenements
      .filter((e) => STATUTS_ENGAGES.includes(e.statut))
      .reduce((sum, e) => sum + (Number(e.montant_final) || Number(e.montant_devis) || Number(e.budget_estime) || 0), 0)

    const aVenir = evenements
      .filter((e) => e.date_evenement && new Date(e.date_evenement) >= now && !['annule', 'perdu'].includes(e.statut))
      .sort((a, b) => new Date(a.date_evenement) - new Date(b.date_evenement))

    const demandesRecentes = evenements
      .filter((e) => ['demande', 'devis_envoye'].includes(e.statut))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5)

    const parStatut = {}
    for (const s of KANBAN_STATUTS) parStatut[s.key] = 0
    for (const e of evenements) if (parStatut[e.statut] !== undefined) parStatut[e.statut] += 1

    // ─── Stats devis ───────────────────────────────────────────
    const SEPT_JOURS_MS = 7 * 24 * 60 * 60 * 1000

    const devisEnvoyesMois = devis.filter((d) => {
      if (!d.sent_at) return false
      const s = new Date(d.sent_at)
      return s >= debutMois && s <= finMois
    })
    const caDevisSigne = devis
      .filter((d) => d.statut === 'accepte')
      .reduce((sum, d) => sum + (Number(d.total_ttc) || 0), 0)
    const devisEnAttente = devis.filter((d) => {
      if (d.statut !== 'envoye' || !d.sent_at) return false
      return now.getTime() - new Date(d.sent_at).getTime() > SEPT_JOURS_MS
    })
    const devisComptesTransfo = devis.filter((d) => ['envoye', 'accepte', 'refuse', 'expire'].includes(d.statut))
    const devisAcceptes = devis.filter((d) => d.statut === 'accepte')
    const tauxTransfo = devisComptesTransfo.length > 0
      ? Math.round((devisAcceptes.length / devisComptesTransfo.length) * 100)
      : null

    const devisRecents = devis
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5)

    return {
      totalClients: clients.length,
      evenementsMois: dansLeMois.length,
      caPrev,
      aVenir: aVenir.slice(0, 5),
      demandesRecentes,
      parStatut,
      devisEnvoyesMoisCount: devisEnvoyesMois.length,
      devisEnvoyesMoisCA: devisEnvoyesMois.reduce((s, d) => s + (Number(d.total_ttc) || 0), 0),
      caDevisSigne,
      devisEnAttenteCount: devisEnAttente.length,
      tauxTransfo,
      devisRecents,
    }
  }, [evenements, clients, devis])

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
            <h1 className="crm-header__title" style={{ color: c.texte }}>CRM</h1>
            <p className="crm-header__subtitle" style={{ color: c.texteMuted }}>Clients, événements et pipeline traiteur</p>
          </div>
          <div className="crm-actions">
            <Button c={c} variant="ghost" onClick={() => router.push('/crm/clients/nouveau')}>+ Client</Button>
            <Button c={c} onClick={() => router.push('/crm/evenements/nouveau')}>+ Événement</Button>
          </div>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        {/* ─── KPI événements ──────────────────────────────────── */}
        <div className="crm-kpi-grid">
          <Kpi c={c} label="Clients" value={stats.totalClients} onClick={() => router.push('/crm/clients')} />
          <Kpi c={c} label="Événements ce mois-ci" value={stats.evenementsMois} onClick={() => router.push('/crm/evenements')} />
          <Kpi c={c} label="CA prévisionnel engagé" value={formatMontant(stats.caPrev)} />
          <Kpi c={c} label="Demandes en cours" value={stats.parStatut.demande + stats.parStatut.devis_envoye} onClick={() => router.push('/crm/evenements')} />
        </div>

        {/* ─── KPI devis ───────────────────────────────────────── */}
        <div className="crm-kpi-grid" style={{ marginTop: 12 }}>
          <Kpi
            c={c}
            label="Devis envoyés ce mois"
            value={stats.devisEnvoyesMoisCount}
            hint={stats.devisEnvoyesMoisCount > 0 ? `${formatMontant(stats.devisEnvoyesMoisCA)} TTC` : null}
            onClick={() => router.push('/crm/devis')}
          />
          <Kpi
            c={c}
            label="CA devis signés"
            value={formatMontant(stats.caDevisSigne)}
            hint="Statut accepté"
          />
          <Kpi
            c={c}
            label="Devis en attente > 7 j"
            value={stats.devisEnAttenteCount}
            accent={stats.devisEnAttenteCount > 0 ? '#DC2626' : null}
            onClick={stats.devisEnAttenteCount > 0 ? () => router.push('/crm/devis') : undefined}
          />
          <Kpi
            c={c}
            label="Taux de transformation"
            value={stats.tauxTransfo != null ? `${stats.tauxTransfo} %` : '—'}
            hint="Acceptés / envoyés + traités"
          />
        </div>

        {/* ─── Prochains événements ───────────────────────────── */}
        <div className="crm-section">
          <h2 className="crm-section__title" style={{ color: c.texte }}>Prochains événements</h2>
          {loading ? (
            <div style={{ color: c.texteMuted, fontSize: 13, padding: 12 }}>Chargement…</div>
          ) : stats.aVenir.length === 0 ? (
            <EmptyState c={c} title="Aucun événement à venir" text="Créez votre premier événement pour suivre votre pipeline." onAction={() => router.push('/crm/evenements/nouveau')} actionLabel="+ Nouvel événement" />
          ) : (
            <div className="crm-list">
              {stats.aVenir.map((e) => (
                <EventRow key={e.id} c={c} event={e} client={clientById[e.crm_client_id]} onClick={() => router.push(`/crm/evenements/${e.id}`)} />
              ))}
            </div>
          )}
        </div>

        {/* ─── Derniers devis ─────────────────────────────────── */}
        <div className="crm-section">
          <h2 className="crm-section__title" style={{ color: c.texte }}>Derniers devis</h2>
          {loading ? (
            <div style={{ color: c.texteMuted, fontSize: 13, padding: 12 }}>Chargement…</div>
          ) : stats.devisRecents.length === 0 ? (
            <EmptyState c={c} title="Aucun devis" text="Composez vos devis depuis vos fiches techniques." onAction={() => router.push('/crm/devis/nouveau')} actionLabel="+ Nouveau devis" />
          ) : (
            <div className="crm-list">
              {stats.devisRecents.map((d) => (
                <DevisRow key={d.id} c={c} devis={d} client={clientById[d.crm_client_id]} onClick={() => router.push(`/crm/devis/${d.id}`)} />
              ))}
            </div>
          )}
        </div>

        {/* ─── Demandes récentes ──────────────────────────────── */}
        <div className="crm-section">
          <h2 className="crm-section__title" style={{ color: c.texte }}>Demandes récentes</h2>
          {loading ? (
            <div style={{ color: c.texteMuted, fontSize: 13, padding: 12 }}>Chargement…</div>
          ) : stats.demandesRecentes.length === 0 ? (
            <Card c={c} padding="md">
              <span style={{ color: c.texteMuted, fontSize: 13 }}>Pas de demande en attente — tout est sous contrôle.</span>
            </Card>
          ) : (
            <div className="crm-list">
              {stats.demandesRecentes.map((e) => (
                <EventRow key={e.id} c={c} event={e} client={clientById[e.crm_client_id]} onClick={() => router.push(`/crm/evenements/${e.id}`)} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Kpi({ c, label, value, hint, accent, onClick }) {
  return (
    <Card c={c} padding="md" as={onClick ? 'button' : 'div'} onClick={onClick} style={onClick ? { cursor: 'pointer', textAlign: 'left', width: '100%' } : undefined}>
      <div className="sk-label-muted" style={{ color: c.texteMuted, marginBottom: 6 }}>{label}</div>
      <div className="sk-stat-value" style={{ color: accent || c.texte, fontSize: 26 }}>{value}</div>
      {hint && <div style={{ color: c.texteMuted, fontSize: 11, marginTop: 4 }}>{hint}</div>}
    </Card>
  )
}

function EventRow({ c, event, client, onClick }) {
  const statut = STATUTS_MAP[event.statut]
  return (
    <button
      type="button"
      onClick={onClick}
      className="crm-row"
      style={{ background: c.blanc, borderColor: c.bordure, color: c.texte }}
    >
      <div>
        <div className="crm-row__primary" style={{ color: c.texte }}>{event.titre}</div>
        <div className="crm-row__secondary" style={{ color: c.texteMuted }}>
          {clientDisplayName(client)}{event.nb_convives ? ` · ${event.nb_convives} convives` : ''}
        </div>
      </div>
      <div className="crm-row__secondary" style={{ color: c.texteMuted }}>
        {formatDateFr(event.date_evenement)}
      </div>
      <div className="crm-row__meta">
        {statut && (
          <Badge bg={hexToRgba(statut.couleur, 0.12)} color={statut.couleur} size="sm">
            {statut.label}
          </Badge>
        )}
      </div>
    </button>
  )
}

function DevisRow({ c, devis, client, onClick }) {
  const statut = STATUTS_DEVIS_MAP[devis.statut]
  return (
    <button
      type="button"
      onClick={onClick}
      className="crm-row"
      style={{ background: c.blanc, borderColor: c.bordure, color: c.texte }}
    >
      <div>
        <div className="crm-row__primary" style={{ color: c.texte }}>{devis.numero}</div>
        <div className="crm-row__secondary" style={{ color: c.texteMuted }}>
          {clientDisplayName(client)}
        </div>
      </div>
      <div className="crm-row__secondary" style={{ color: c.texteMuted }}>
        <div>{formatDateFr(devis.date_emission)}</div>
        <div>{formatMontant(devis.total_ttc)} TTC</div>
      </div>
      <div className="crm-row__meta">
        {statut && (
          <Badge bg={hexToRgba(statut.couleur, 0.12)} color={statut.couleur} size="sm">
            {statut.label}
          </Badge>
        )}
      </div>
    </button>
  )
}

function EmptyState({ c, title, text, onAction, actionLabel }) {
  return (
    <div className="crm-empty" style={{ borderColor: c.bordure, background: c.blanc }}>
      <div className="crm-empty__title" style={{ color: c.texte }}>{title}</div>
      <div className="crm-empty__text" style={{ color: c.texteMuted }}>{text}</div>
      {onAction && <Button c={c} onClick={onAction}>{actionLabel}</Button>}
    </div>
  )
}
