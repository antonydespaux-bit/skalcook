'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getClientId } from '../../../lib/supabase'
import { useTheme } from '../../../lib/useTheme'
import { useRole } from '../../../lib/useRole'
import { useIsMobile } from '../../../lib/useIsMobile'
import Navbar from '../../../components/Navbar'
import { Card, Button, Badge, Alert } from '../../../components/ui'
import {
  STATUTS_MAP, KANBAN_STATUTS, STATUTS, TYPES_PRESTATION_MAP,
  formatDateFr, formatMontant, clientDisplayName, hexToRgba,
} from '../../../lib/crmConstants'

export default function CrmEvenementsPage() {
  const router = useRouter()
  const { c } = useTheme()
  const { role, loading: roleLoading } = useRole()
  const isMobile = useIsMobile()

  const [authReady, setAuthReady] = useState(false)
  const [evenements, setEvenements] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [vue, setVue] = useState('kanban') // 'kanban' | 'liste'
  const [recherche, setRecherche] = useState('')
  const [filtreStatut, setFiltreStatut] = useState('tous')
  const [filtreClos, setFiltreClos] = useState(false) // si true, montre annule/perdu en vue liste

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

  useEffect(() => {
    if (isMobile) setVue('liste')
  }, [isMobile])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const cid = await getClientId()
    if (!cid) { setLoading(false); return }

    const [{ data: eData, error: eErr }, { data: cData, error: cErr }] = await Promise.all([
      supabase.from('crm_evenements')
        .select('id, crm_client_id, titre, date_evenement, statut, type_prestation, nb_convives, montant_devis, montant_final, budget_estime, lieu_type, created_at')
        .eq('client_id', cid)
        .order('date_evenement', { ascending: true, nullsFirst: false }),
      supabase.from('crm_clients')
        .select('id, type, nom, prenom, raison_sociale')
        .eq('client_id', cid),
    ])
    if (eErr || cErr) { setError((eErr || cErr).message); setLoading(false); return }
    setEvenements(eData || [])
    setClients(cData || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!authReady || !['admin', 'directeur'].includes(role || '')) return
    load()
  }, [authReady, role, load])

  const clientById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients])

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return evenements.filter((e) => {
      if (filtreStatut !== 'tous' && e.statut !== filtreStatut) return false
      if (!q) return true
      const hay = [e.titre, clientDisplayName(clientById[e.crm_client_id])].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [evenements, recherche, filtreStatut, clientById])

  const filtresListe = useMemo(() => {
    if (filtreClos) return filtres
    return filtres.filter((e) => !['annule', 'perdu'].includes(e.statut))
  }, [filtres, filtreClos])

  const parStatut = useMemo(() => {
    const map = {}
    for (const s of KANBAN_STATUTS) map[s.key] = []
    for (const e of filtres) if (map[e.statut]) map[e.statut].push(e)
    return map
  }, [filtres])

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
            <h1 className="crm-header__title" style={{ color: c.texte }}>Événements</h1>
            <p className="crm-header__subtitle" style={{ color: c.texteMuted }}>
              Pipeline traiteur · {evenements.length} événement{evenements.length > 1 ? 's' : ''}
            </p>
          </div>
          <div className="crm-actions">
            <Button c={c} onClick={() => router.push('/crm/evenements/nouveau')}>+ Nouvel événement</Button>
          </div>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        <div className="crm-toolbar">
          <input
            type="text"
            placeholder="Rechercher…"
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
            {STATUTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>

          {!isMobile && (
            <div className="crm-tabs" style={{ background: c.fond, border: `0.5px solid ${c.bordure}`, marginLeft: 'auto' }}>
              <button
                type="button"
                className="crm-tabs__btn"
                onClick={() => setVue('kanban')}
                style={{
                  background: vue === 'kanban' ? c.blanc : 'transparent',
                  color: vue === 'kanban' ? c.texte : c.texteMuted,
                  fontWeight: vue === 'kanban' ? 500 : 400,
                  boxShadow: vue === 'kanban' ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
                }}
              >Kanban</button>
              <button
                type="button"
                className="crm-tabs__btn"
                onClick={() => setVue('liste')}
                style={{
                  background: vue === 'liste' ? c.blanc : 'transparent',
                  color: vue === 'liste' ? c.texte : c.texteMuted,
                  fontWeight: vue === 'liste' ? 500 : 400,
                  boxShadow: vue === 'liste' ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
                }}
              >Liste</button>
            </div>
          )}
        </div>

        {loading ? (
          <div style={{ color: c.texteMuted, fontSize: 13, padding: 12 }}>Chargement…</div>
        ) : evenements.length === 0 ? (
          <div className="crm-empty" style={{ borderColor: c.bordure, background: c.blanc }}>
            <div className="crm-empty__title" style={{ color: c.texte }}>Aucun événement</div>
            <div className="crm-empty__text" style={{ color: c.texteMuted }}>Commencez à construire votre pipeline traiteur.</div>
            <Button c={c} onClick={() => router.push('/crm/evenements/nouveau')}>+ Nouvel événement</Button>
          </div>
        ) : vue === 'kanban' ? (
          <div className="crm-kanban">
            {KANBAN_STATUTS.map((s) => {
              const items = parStatut[s.key] || []
              return (
                <div
                  key={s.key}
                  className="crm-kanban__col"
                  style={{ background: c.blanc, borderColor: c.bordure }}
                >
                  <div
                    className="crm-kanban__col-header"
                    style={{ color: s.couleur, borderColor: c.bordure }}
                  >
                    <span>{s.label}</span>
                    <span className="crm-kanban__count" style={{ background: hexToRgba(s.couleur, 0.12), color: s.couleur }}>
                      {items.length}
                    </span>
                  </div>
                  <div className="crm-kanban__cards">
                    {items.length === 0 ? (
                      <div style={{ color: c.texteMuted, fontSize: 12, padding: '8px 4px' }}>—</div>
                    ) : items.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        className="crm-kanban__card"
                        onClick={() => router.push(`/crm/evenements/${e.id}`)}
                        style={{ background: c.fond, borderColor: c.bordure, color: c.texte }}
                      >
                        <div className="crm-kanban__card-title" style={{ color: c.texte }}>{e.titre}</div>
                        <div style={{ color: c.texteMuted, fontSize: 12 }}>
                          {clientDisplayName(clientById[e.crm_client_id])}
                        </div>
                        <div className="crm-kanban__card-meta" style={{ color: c.texteMuted }}>
                          <span>{formatDateFr(e.date_evenement)}</span>
                          {e.nb_convives && <span>· {e.nb_convives} pers.</span>}
                          {(e.montant_devis || e.budget_estime) && (
                            <span>· {formatMontant(e.montant_final || e.montant_devis || e.budget_estime)}</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: c.texteMuted, cursor: 'pointer' }}>
                <input type="checkbox" checked={filtreClos} onChange={(e) => setFiltreClos(e.target.checked)} />
                Afficher annulés / perdus
              </label>
            </div>
            {filtresListe.length === 0 ? (
              <Card c={c} padding="md">
                <span style={{ color: c.texteMuted, fontSize: 13 }}>Aucun résultat.</span>
              </Card>
            ) : (
              <div className="crm-list">
                {filtresListe.map((e) => {
                  const st = STATUTS_MAP[e.statut]
                  const type = TYPES_PRESTATION_MAP[e.type_prestation]
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => router.push(`/crm/evenements/${e.id}`)}
                      className="crm-row"
                      style={{ background: c.blanc, borderColor: c.bordure, color: c.texte }}
                    >
                      <div>
                        <div className="crm-row__primary" style={{ color: c.texte }}>{e.titre}</div>
                        <div className="crm-row__secondary" style={{ color: c.texteMuted }}>
                          {clientDisplayName(clientById[e.crm_client_id])}
                          {type ? ` · ${type.label}` : ''}
                          {e.nb_convives ? ` · ${e.nb_convives} convives` : ''}
                        </div>
                      </div>
                      <div className="crm-row__secondary" style={{ color: c.texteMuted }}>
                        {formatDateFr(e.date_evenement)}
                        {(e.montant_final || e.montant_devis || e.budget_estime) && (
                          <div>{formatMontant(e.montant_final || e.montant_devis || e.budget_estime)}</div>
                        )}
                      </div>
                      <div className="crm-row__meta">
                        {st && <Badge bg={hexToRgba(st.couleur, 0.12)} color={st.couleur} size="sm">{st.label}</Badge>}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
