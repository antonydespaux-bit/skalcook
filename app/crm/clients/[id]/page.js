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
  STATUTS_MAP, STATUTS_DEVIS_MAP, ACTIVITY_TYPES_MAP, ACTIVITY_TYPES_MANUELS,
  formatDateFr, formatDateTimeFr, formatMontant, clientDisplayName, hexToRgba,
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
  const [devis, setDevis] = useState([])
  const [activities, setActivities] = useState([])
  const [currentUserId, setCurrentUserId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('view') // view | edit
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showActivityForm, setShowActivityForm] = useState(false)
  const [activitySaving, setActivitySaving] = useState(false)

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

    const { data: { user } } = await supabase.auth.getUser()
    setCurrentUserId(user?.id || null)

    const [
      { data: cli, error: cErr },
      { data: evts, error: eErr },
      { data: devs, error: dErr },
      { data: acts, error: aErr },
    ] = await Promise.all([
      supabase.from('crm_clients').select('*').eq('id', id).eq('client_id', cid).maybeSingle(),
      supabase.from('crm_evenements')
        .select('id, titre, date_evenement, statut, type_prestation, nb_convives, montant_devis, montant_final, budget_estime, created_at')
        .eq('crm_client_id', id).eq('client_id', cid)
        .order('date_evenement', { ascending: false, nullsFirst: false }),
      supabase.from('crm_devis')
        .select('id, numero, crm_evenement_id, statut, date_emission, date_validite, total_ttc, sent_at, sent_to_email')
        .eq('crm_client_id', id).eq('client_id', cid)
        .order('date_emission', { ascending: false }),
      supabase.from('crm_client_activities')
        .select('id, type, titre, description, occurred_at, crm_devis_id, crm_evenement_id, created_by, created_at')
        .eq('crm_client_id', id)
        .order('occurred_at', { ascending: false }),
    ])

    if (cErr || eErr || dErr || aErr) { setError((cErr || eErr || dErr || aErr).message); setLoading(false); return }
    setClient(cli)
    setEvenements(evts || [])
    setDevis(devs || [])
    setActivities(acts || [])
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

  async function handleAddActivity(values) {
    setActivitySaving(true)
    setError('')
    const { error: err } = await supabase
      .from('crm_client_activities')
      .insert({
        client_id: clientId,
        crm_client_id: id,
        type: values.type,
        titre: values.titre.trim() || null,
        description: values.description.trim() || null,
        occurred_at: values.occurred_at ? new Date(values.occurred_at).toISOString() : new Date().toISOString(),
        created_by: currentUserId,
      })
    setActivitySaving(false)
    if (err) { setError(err.message); return }
    setShowActivityForm(false)
    await load()
  }

  async function handleDeleteActivity(activityId) {
    const { error: err } = await supabase
      .from('crm_client_activities')
      .delete()
      .eq('id', activityId)
    if (err) { setError(err.message); return }
    await load()
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

            {/* Historique des activités */}
            <div className="crm-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <h2 className="crm-section__title" style={{ color: c.texte, margin: 0 }}>
                  Historique {activities.length > 0 && <span style={{ color: c.texteMuted, fontWeight: 400 }}>· {activities.length}</span>}
                </h2>
                {!showActivityForm && (
                  <Button c={c} variant="ghost" size="sm" onClick={() => setShowActivityForm(true)}>
                    + Ajouter une activité
                  </Button>
                )}
              </div>

              {showActivityForm && (
                <ActivityForm
                  c={c}
                  saving={activitySaving}
                  onSubmit={handleAddActivity}
                  onCancel={() => setShowActivityForm(false)}
                />
              )}

              {activities.length === 0 && !showActivityForm ? (
                <div className="crm-empty" style={{ borderColor: c.bordure, background: c.blanc }}>
                  <div className="crm-empty__title" style={{ color: c.texte }}>Aucune activité</div>
                  <div className="crm-empty__text" style={{ color: c.texteMuted }}>
                    Loguez vos appels, relances, rendez-vous — les envois de devis apparaissent automatiquement.
                  </div>
                  <Button c={c} onClick={() => setShowActivityForm(true)}>+ Ajouter une activité</Button>
                </div>
              ) : activities.length > 0 && (
                <div className="crm-list">
                  {activities.map((a) => (
                    <ActivityRow
                      key={a.id}
                      c={c}
                      activity={a}
                      canDelete={a.created_by && a.created_by === currentUserId}
                      onOpen={(act) => {
                        if (act.crm_devis_id) router.push(`/crm/devis/${act.crm_devis_id}`)
                        else if (act.crm_evenement_id) router.push(`/crm/evenements/${act.crm_evenement_id}`)
                      }}
                      onDelete={() => handleDeleteActivity(a.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Devis du client */}
            <div className="crm-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <h2 className="crm-section__title" style={{ color: c.texte, margin: 0 }}>
                  Devis {devis.length > 0 && <span style={{ color: c.texteMuted, fontWeight: 400 }}>· {devis.length}</span>}
                </h2>
                <Button c={c} variant="ghost" size="sm" onClick={() => router.push(`/crm/devis/nouveau?client_id=${client.id}`)}>
                  + Nouveau devis
                </Button>
              </div>
              {devis.length === 0 ? (
                <div className="crm-empty" style={{ borderColor: c.bordure, background: c.blanc }}>
                  <div className="crm-empty__title" style={{ color: c.texte }}>Aucun devis</div>
                  <div className="crm-empty__text" style={{ color: c.texteMuted }}>
                    Composez un premier devis pour ce client depuis vos fiches techniques.
                  </div>
                  <Button c={c} onClick={() => router.push(`/crm/devis/nouveau?client_id=${client.id}`)}>+ Nouveau devis</Button>
                </div>
              ) : (
                <div className="crm-list">
                  {devis.map((d) => {
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
                            {formatDateFr(d.date_emission)}
                            {d.sent_at && ` · Envoyé le ${formatDateFr(d.sent_at)}`}
                            {d.sent_to_email && ` à ${d.sent_to_email}`}
                          </div>
                        </div>
                        <div className="crm-row__secondary" style={{ color: c.texteMuted }}>
                          {formatMontant(d.total_ttc)} TTC
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

function ActivityRow({ c, activity, canDelete, onOpen, onDelete }) {
  const meta = ACTIVITY_TYPES_MAP[activity.type] || { label: activity.type, couleur: c.texteMuted, icon: '•' }
  const clickable = !!(activity.crm_devis_id || activity.crm_evenement_id)
  const handleClick = clickable ? () => onOpen(activity) : undefined

  return (
    <div
      className="crm-row"
      style={{ background: c.blanc, borderColor: c.bordure, color: c.texte, cursor: clickable ? 'pointer' : 'default', alignItems: 'flex-start' }}
      onClick={handleClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() } } : undefined}
    >
      <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: hexToRgba(meta.couleur, 0.12), fontSize: 16,
        }}>
          {meta.icon}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="crm-row__primary" style={{ color: c.texte, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>{activity.titre || meta.label}</span>
            <Badge bg={hexToRgba(meta.couleur, 0.12)} color={meta.couleur} size="sm">
              {meta.label}
            </Badge>
          </div>
          {activity.description && (
            <div className="crm-row__secondary" style={{ color: c.texteMuted, whiteSpace: 'pre-wrap' }}>
              {activity.description}
            </div>
          )}
        </div>
      </div>
      <div className="crm-row__meta" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: c.texteMuted, fontSize: 12, whiteSpace: 'nowrap' }}>
          {formatDateTimeFr(activity.occurred_at)}
        </span>
        {canDelete && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            title="Supprimer cette activité"
            style={{ background: 'transparent', border: 'none', color: c.texteMuted, cursor: 'pointer', padding: 4, fontSize: 16, lineHeight: 1 }}
          >
            ×
          </button>
        )}
      </div>
    </div>
  )
}

function ActivityForm({ c, saving, onSubmit, onCancel }) {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const localInput = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`

  const [type, setType] = useState(ACTIVITY_TYPES_MANUELS[0]?.key || 'note')
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [occurredAt, setOccurredAt] = useState(localInput)

  const inputStyle = { background: c.blanc, borderColor: c.bordure, color: c.texte }
  const labelStyle = { color: c.texte }

  function submit(e) {
    e.preventDefault()
    onSubmit({ type, titre, description, occurred_at: occurredAt })
  }

  return (
    <Card c={c} padding="md" style={{ marginBottom: 12 }}>
      <form onSubmit={submit} className="crm-form" style={{ gap: 12 }}>
        <div className="crm-form__grid crm-form__grid--2">
          <div className="crm-field">
            <label className="crm-field__label" style={labelStyle}>Type</label>
            <select className="crm-field__select" style={inputStyle} value={type} onChange={(e) => setType(e.target.value)}>
              {ACTIVITY_TYPES_MANUELS.map((t) => (
                <option key={t.key} value={t.key}>{t.icon} {t.label}</option>
              ))}
            </select>
          </div>
          <div className="crm-field">
            <label className="crm-field__label" style={labelStyle}>Date & heure</label>
            <input
              type="datetime-local"
              className="crm-field__input" style={inputStyle}
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>
        </div>
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Titre (optionnel)</label>
          <input
            type="text" className="crm-field__input" style={inputStyle}
            value={titre} onChange={(e) => setTitre(e.target.value)}
            placeholder="Rappelé pour confirmer menu"
          />
        </div>
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Description</label>
          <textarea
            className="crm-field__textarea" style={inputStyle}
            value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Points discutés, engagements pris…"
          />
        </div>
        <div className="crm-actions">
          <Button c={c} variant="ghost" type="button" onClick={onCancel} disabled={saving}>Annuler</Button>
          <Button c={c} type="submit" disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
