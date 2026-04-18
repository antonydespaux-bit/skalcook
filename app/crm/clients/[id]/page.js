'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase, getClientId } from '../../../../lib/supabase'
import { useTheme } from '../../../../lib/useTheme'
import { useRole } from '../../../../lib/useRole'
import Navbar from '../../../../components/Navbar'
import { Card, Button, Badge, Alert } from '../../../../components/ui'
import ClientForm from '../../../../components/crm/ClientForm'
import {
  STATUTS_MAP, formatDateFr, formatMontant, clientDisplayName, hexToRgba,
} from '../../../../lib/crmConstants'

export default function CrmClientDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id
  const { c } = useTheme()
  const { role, loading: roleLoading } = useRole()

  const [authReady, setAuthReady] = useState(false)
  const [clientId, setClientId] = useState(null)
  const [client, setClient] = useState(null)
  const [evenements, setEvenements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('view') // view | edit
  const [confirmDelete, setConfirmDelete] = useState(false)

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
    if (!id) return
    setLoading(true)
    setError('')
    const cid = await getClientId()
    if (!cid) { setLoading(false); return }
    setClientId(cid)

    const [{ data: cli, error: cErr }, { data: evts, error: eErr }] = await Promise.all([
      supabase.from('crm_clients').select('*').eq('id', id).eq('client_id', cid).maybeSingle(),
      supabase.from('crm_evenements')
        .select('id, titre, date_evenement, statut, type_prestation, nb_convives, montant_devis, montant_final, budget_estime, created_at')
        .eq('crm_client_id', id).eq('client_id', cid)
        .order('date_evenement', { ascending: false, nullsFirst: false }),
    ])

    if (cErr || eErr) { setError((cErr || eErr).message); setLoading(false); return }
    setClient(cli)
    setEvenements(evts || [])
    setLoading(false)
  }, [id])

  useEffect(() => {
    if (!authReady || !['admin', 'directeur'].includes(role || '')) return
    load()
  }, [authReady, role, load])

  async function handleSave(values) {
    const { error: err } = await supabase
      .from('crm_clients')
      .update(values)
      .eq('id', id)
      .eq('client_id', clientId)
    if (err) throw err
    setMode('view')
    await load()
  }

  async function handleDelete() {
    const { error: err } = await supabase
      .from('crm_clients')
      .delete()
      .eq('id', id)
      .eq('client_id', clientId)
    if (err) { setError(err.message); return }
    router.push('/crm/clients')
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
        <button type="button" onClick={() => router.push('/crm/clients')} className="crm-back" style={{ color: c.texteMuted }}>
          ← Clients
        </button>

        {error && <Alert variant="error">{error}</Alert>}

        {loading ? (
          <div style={{ color: c.texteMuted, fontSize: 13, padding: 12 }}>Chargement…</div>
        ) : !client ? (
          <Alert variant="warn">Client introuvable.</Alert>
        ) : mode === 'edit' ? (
          <>
            <div className="crm-header">
              <div className="crm-header__text">
                <h1 className="crm-header__title" style={{ color: c.texte }}>Modifier le client</h1>
              </div>
            </div>
            <ClientForm
              c={c}
              initial={client}
              submitLabel="Enregistrer"
              onSubmit={handleSave}
              onCancel={() => setMode('view')}
            />
          </>
        ) : (
          <>
            <div className="crm-header">
              <div className="crm-header__text">
                <h1 className="crm-header__title" style={{ color: c.texte }}>{clientDisplayName(client)}</h1>
                <p className="crm-header__subtitle" style={{ color: c.texteMuted }}>
                  <Badge
                    bg={client.type === 'entreprise' ? hexToRgba('#6366F1', 0.12) : hexToRgba('#10B981', 0.12)}
                    color={client.type === 'entreprise' ? '#6366F1' : '#10B981'}
                    size="sm"
                  >
                    {client.type === 'entreprise' ? 'Entreprise' : 'Particulier'}
                  </Badge>
                  {client.source && (
                    <span style={{ marginLeft: 8 }}>Source : {client.source}</span>
                  )}
                </p>
              </div>
              <div className="crm-actions">
                <Button c={c} variant="ghost" onClick={() => setMode('edit')}>Modifier</Button>
                <Button c={c} onClick={() => router.push(`/crm/evenements/nouveau?client_id=${client.id}`)}>+ Événement</Button>
              </div>
            </div>

            {/* Infos client */}
            <Card c={c} padding="responsive" style={{ marginBottom: 20 }}>
              <div className="crm-kv">
                {client.type === 'entreprise' && (
                  <>
                    <Kv c={c} label="Raison sociale" value={client.raison_sociale} />
                    <Kv c={c} label="SIRET" value={client.siret} />
                  </>
                )}
                <Kv c={c} label="Contact" value={[client.prenom, client.nom].filter(Boolean).join(' ') || '—'} />
                <Kv c={c} label="E-mail" value={client.email ? <a href={`mailto:${client.email}`} style={{ color: c.accent }}>{client.email}</a> : '—'} />
                <Kv c={c} label="Téléphone" value={client.telephone ? <a href={`tel:${client.telephone}`} style={{ color: c.accent }}>{client.telephone}</a> : '—'} />
                <Kv c={c} label="Adresse" value={[client.adresse, [client.code_postal, client.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'} />
                <Kv c={c} label="Créé le" value={formatDateFr(client.created_at)} />
              </div>

              {(client.tags || []).length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="sk-label-muted" style={{ color: c.texteMuted, marginBottom: 6 }}>Tags</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {client.tags.map((t) => (
                      <Badge key={t} bg={hexToRgba(c.accent || '#6366F1', 0.12)} color={c.accent || '#6366F1'} size="sm">{t}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {client.notes && (
                <div style={{ marginTop: 16 }}>
                  <div className="sk-label-muted" style={{ color: c.texteMuted, marginBottom: 6 }}>Notes</div>
                  <div style={{ color: c.texte, fontSize: 14, whiteSpace: 'pre-wrap' }}>{client.notes}</div>
                </div>
              )}
            </Card>

            {/* Événements du client */}
            <div className="crm-section">
              <h2 className="crm-section__title" style={{ color: c.texte }}>
                Événements {evenements.length > 0 && <span style={{ color: c.texteMuted, fontWeight: 400 }}>· {evenements.length}</span>}
              </h2>
              {evenements.length === 0 ? (
                <div className="crm-empty" style={{ borderColor: c.bordure, background: c.blanc }}>
                  <div className="crm-empty__title" style={{ color: c.texte }}>Aucun événement</div>
                  <div className="crm-empty__text" style={{ color: c.texteMuted }}>Créez un premier événement pour ce client.</div>
                  <Button c={c} onClick={() => router.push(`/crm/evenements/nouveau?client_id=${client.id}`)}>+ Nouvel événement</Button>
                </div>
              ) : (
                <div className="crm-list">
                  {evenements.map((e) => {
                    const st = STATUTS_MAP[e.statut]
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
                            {formatDateFr(e.date_evenement)}{e.nb_convives ? ` · ${e.nb_convives} convives` : ''}
                          </div>
                        </div>
                        <div className="crm-row__secondary" style={{ color: c.texteMuted }}>
                          {formatMontant(e.montant_final || e.montant_devis || e.budget_estime)}
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

            {/* Zone danger */}
            <div style={{ marginTop: 32, paddingTop: 16, borderTop: `0.5px solid ${c.bordure}` }}>
              {confirmDelete ? (
                <Alert variant="error" title="Confirmation">
                  Supprimer ce client supprimera aussi {evenements.length > 0 ? `${evenements.length} événement(s) associé(s)` : 'ses données'}.
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <Button c={c} variant="ghost" onClick={() => setConfirmDelete(false)}>Annuler</Button>
                    <Button c={c} variant="danger-solid" onClick={handleDelete}>Supprimer définitivement</Button>
                  </div>
                </Alert>
              ) : (
                <Button c={c} variant="danger" onClick={() => setConfirmDelete(true)}>Supprimer ce client</Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Kv({ c, label, value }) {
  return (
    <div>
      <div className="crm-kv__key" style={{ color: c.texteMuted }}>{label}</div>
      <div className="crm-kv__value" style={{ color: c.texte }}>{value || '—'}</div>
    </div>
  )
}
