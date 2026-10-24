'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase, getClientId } from '../../../../lib/supabase'
import { crmPerimetre } from '../../../../lib/crmPerimetre'
import { useTheme } from '../../../../lib/useTheme'
import { usePermissions } from '../../../../lib/usePermissions'
import Navbar from '../../../../components/Navbar'
import { Card, Button, Badge, Alert } from '../../../../components/ui'
import EvenementForm from '../../../../components/crm/EvenementForm'
import {
  STATUTS, STATUTS_MAP, TYPES_PRESTATION_MAP, LIEUX_TYPES_MAP,
  STATUTS_DEVIS_MAP,
  formatDateFr, formatMontant, clientDisplayName, hexToRgba,
} from '../../../../lib/crmConstants'

export default function CrmEvenementDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id
  const { c } = useTheme()
  const { peutVoir, loading: permLoading } = usePermissions()

  const [authReady, setAuthReady] = useState(false)
  const [clientId, setClientId] = useState(null)
  const [perimetre, setPerimetre] = useState([])
  const [lieux, setLieux] = useState([])
  const [evenement, setEvenement] = useState(null)
  const [clientCrm, setClientCrm] = useState(null)
  const [clientsDispo, setClientsDispo] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('view')
  const [statutSaving, setStatutSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [devisLies, setDevisLies] = useState([])
  const [devisDetachables, setDevisDetachables] = useState([])
  const [linkSaving, setLinkSaving] = useState(false)
  const [showDevisPicker, setShowDevisPicker] = useState(false)

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

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    const cid = await getClientId()
    if (!cid) { setLoading(false); return }
    setClientId(cid)
    const { ids, lieux: lieuxGroupe } = await crmPerimetre(cid)
    setPerimetre(ids)
    setLieux(lieuxGroupe)

    const { data: ev, error: eErr } = await supabase
      .from('crm_evenements')
      .select('*')
      .eq('id', id).in('client_id', ids)
      .maybeSingle()

    if (eErr) { setError(eErr.message); setLoading(false); return }
    setEvenement(ev)

    if (ev?.crm_client_id) {
      const { data: cli } = await supabase
        .from('crm_clients')
        .select('id, type, nom, prenom, raison_sociale, email, telephone')
        .eq('id', ev.crm_client_id).in('client_id', ids)
        .maybeSingle()
      setClientCrm(cli)
    }

    // Pour le form d'édition
    const { data: allClients } = await supabase
      .from('crm_clients')
      .select('id, type, nom, prenom, raison_sociale')
      .in('client_id', ids)
    setClientsDispo(allClients || [])

    // Devis du tenant (filtrés après en mémoire : liés vs détachables du client courant)
    const { data: allDevis } = await supabase
      .from('crm_devis')
      .select('id, numero, crm_client_id, crm_evenement_id, statut, total_ttc, date_emission, sent_at')
      .in('client_id', ids)
      .order('date_emission', { ascending: false })
    const devAll = allDevis || []
    setDevisLies(devAll.filter((d) => d.crm_evenement_id === id))
    setDevisDetachables(devAll.filter((d) => !d.crm_evenement_id && d.crm_client_id === ev?.crm_client_id))

    setLoading(false)
  }, [id])

  useEffect(() => {
    if (!authReady || !peutVoir('crm')) return
    load()
  }, [authReady, peutVoir, load])

  async function handleSave(values) {
    const { error: err } = await supabase
      .from('crm_evenements')
      .update(values)
      .eq('id', id)
      .in('client_id', perimetre)
    if (err) throw err
    setMode('view')
    await load()
  }

  async function handleStatutChange(newStatut) {
    setStatutSaving(true)
    const { error: err } = await supabase
      .from('crm_evenements')
      .update({ statut: newStatut })
      .eq('id', id)
      .in('client_id', perimetre)
    if (!err) setEvenement((ev) => ({ ...ev, statut: newStatut }))
    else setError(err.message)
    setStatutSaving(false)
  }

  async function handleAttachDevis(devisId) {
    if (!devisId) return
    setLinkSaving(true)
    setError('')
    const { error: err } = await supabase
      .from('crm_devis')
      .update({ crm_evenement_id: id })
      .eq('id', devisId)
      .in('client_id', perimetre)
    setLinkSaving(false)
    if (err) { setError(err.message); return }
    setShowDevisPicker(false)
    await load()
  }

  async function handleDetachDevis(devisId) {
    setLinkSaving(true)
    setError('')
    const { error: err } = await supabase
      .from('crm_devis')
      .update({ crm_evenement_id: null })
      .eq('id', devisId)
      .in('client_id', perimetre)
    setLinkSaving(false)
    if (err) { setError(err.message); return }
    await load()
  }

  async function handleDelete() {
    const { error: err } = await supabase
      .from('crm_evenements')
      .delete()
      .eq('id', id)
      .in('client_id', perimetre)
    if (err) { setError(err.message); return }
    router.push('/crm/evenements')
  }

  const statut = useMemo(() => STATUTS_MAP[evenement?.statut], [evenement])
  const typePresta = useMemo(() => TYPES_PRESTATION_MAP[evenement?.type_prestation], [evenement])
  const lieu = useMemo(() => LIEUX_TYPES_MAP[evenement?.lieu_type], [evenement])

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
        <button type="button" onClick={() => router.push('/crm/evenements')} className="crm-back" style={{ color: c.texteMuted }}>
          ← Événements
        </button>

        {error && <Alert variant="error">{error}</Alert>}

        {loading ? (
          <div style={{ color: c.texteMuted, fontSize: 13, padding: 12 }}>Chargement…</div>
        ) : !evenement ? (
          <Alert variant="warn">Événement introuvable.</Alert>
        ) : mode === 'edit' ? (
          <>
            <div className="crm-header">
              <div className="crm-header__text">
                <h1 className="crm-header__title" style={{ color: c.texte }}>Modifier l’événement</h1>
              </div>
            </div>
            <EvenementForm
              c={c}
              initial={evenement}
              clientsDispo={clientsDispo}
              lieux={lieux}
              submitLabel="Enregistrer"
              onSubmit={handleSave}
              onCancel={() => setMode('view')}
            />
          </>
        ) : (
          <>
            <div className="crm-header">
              <div className="crm-header__text">
                <h1 className="crm-header__title" style={{ color: c.texte }}>{evenement.titre}</h1>
                <p className="crm-header__subtitle" style={{ color: c.texteMuted, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  {clientCrm && (
                    <button
                      type="button"
                      onClick={() => router.push(`/crm/clients/${clientCrm.id}`)}
                      style={{ background: 'transparent', border: 'none', color: c.accent, cursor: 'pointer', padding: 0, fontSize: 13, textDecoration: 'underline' }}
                    >
                      {clientDisplayName(clientCrm)}
                    </button>
                  )}
                  {typePresta && <span>· {typePresta.label}</span>}
                  {evenement.nb_convives && <span>· {evenement.nb_convives} convives</span>}
                </p>
              </div>
              <div className="crm-actions">
                <Button c={c} variant="ghost" onClick={() => router.push(`/crm/devis/nouveau?evenement=${id}`)}>+ Créer un devis</Button>
                <Button c={c} variant="ghost" onClick={() => setMode('edit')}>Modifier</Button>
              </div>
            </div>

            {/* Pipeline / statut */}
            <Card c={c} padding="md" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                <div className="sk-label-muted" style={{ color: c.texteMuted }}>Statut</div>
                {statut && (
                  <Badge bg={hexToRgba(statut.couleur, 0.14)} color={statut.couleur} size="lg">
                    {statut.label}
                  </Badge>
                )}
                <select
                  value={evenement.statut}
                  onChange={(e) => handleStatutChange(e.target.value)}
                  disabled={statutSaving}
                  className="sk-select"
                  style={{ background: c.blanc, border: `0.5px solid ${c.bordure}`, color: c.texte, marginLeft: 'auto' }}
                >
                  {STATUTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
            </Card>

            {/* Détails */}
            <Card c={c} padding="responsive" style={{ marginBottom: 20 }}>
              <div className="crm-kv">
                <Kv c={c} label="Date" value={formatDateFr(evenement.date_evenement)} />
                <Kv c={c} label="Heure" value={evenement.heure_debut ? evenement.heure_debut.slice(0, 5) : '—'} />
                <Kv c={c} label="Convives" value={evenement.nb_convives || '—'} />
                <Kv c={c} label="Type" value={typePresta?.label || '—'} />
                {lieux.length > 0 && (
                  <>
                    <Kv c={c} label="Maison / salle" value={lieux.find((l) => l.id === evenement.lieu_id)?.nom || '—'} />
                    <Kv c={c} label="CA pour" value={lieux.find((l) => l.client_id && l.client_id === evenement.etablissement_ca_id)?.nom || 'À choisir'} />
                  </>
                )}
                <Kv c={c} label="Lieu" value={lieu?.label || '—'} />
                <Kv c={c} label="Adresse du lieu" value={evenement.lieu_adresse || '—'} />
                <Kv c={c} label="Budget estimé" value={formatMontant(evenement.budget_estime)} />
                <Kv c={c} label="Montant devis" value={formatMontant(evenement.montant_devis)} />
                <Kv c={c} label="Montant final" value={formatMontant(evenement.montant_final)} />
              </div>

              {evenement.notes && (
                <div style={{ marginTop: 16 }}>
                  <div className="sk-label-muted" style={{ color: c.texteMuted, marginBottom: 6 }}>Notes</div>
                  <div style={{ color: c.texte, fontSize: 14, whiteSpace: 'pre-wrap' }}>{evenement.notes}</div>
                </div>
              )}
            </Card>

            {/* Contact client */}
            {clientCrm && (
              <Card c={c} padding="md" style={{ marginBottom: 20 }}>
                <div className="sk-label-muted" style={{ color: c.texteMuted, marginBottom: 8 }}>Contact client</div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 14 }}>
                  <span style={{ color: c.texte, fontWeight: 500 }}>{clientDisplayName(clientCrm)}</span>
                  {clientCrm.email && (
                    <a href={`mailto:${clientCrm.email}`} style={{ color: c.accent }}>{clientCrm.email}</a>
                  )}
                  {clientCrm.telephone && (
                    <a href={`tel:${clientCrm.telephone}`} style={{ color: c.accent }}>{clientCrm.telephone}</a>
                  )}
                </div>
              </Card>
            )}

            {/* Devis liés */}
            <Card c={c} padding="md" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                <div className="sk-panel-header" style={{ color: c.texte, margin: 0 }}>
                  Devis {devisLies.length > 0 && <span style={{ color: c.texteMuted, fontWeight: 400 }}>· {devisLies.length}</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {devisDetachables.length > 0 && (
                    <Button c={c} variant="ghost" size="sm" onClick={() => setShowDevisPicker((v) => !v)} disabled={linkSaving}>
                      {showDevisPicker ? 'Fermer' : 'Lier un devis existant'}
                    </Button>
                  )}
                  <Button c={c} variant="ghost" size="sm" onClick={() => router.push(`/crm/devis/nouveau?evenement=${id}`)}>
                    + Nouveau devis
                  </Button>
                </div>
              </div>

              {showDevisPicker && devisDetachables.length > 0 && (
                <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: `0.5px solid ${c.bordure}` }}>
                  <select
                    className="sk-select"
                    style={{ background: c.blanc, border: `0.5px solid ${c.bordure}`, color: c.texte, width: '100%', maxWidth: 400 }}
                    defaultValue=""
                    onChange={(e) => { if (e.target.value) handleAttachDevis(e.target.value) }}
                    disabled={linkSaving}
                  >
                    <option value="">Choisir un devis non lié…</option>
                    {devisDetachables.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.numero} — {formatMontant(d.total_ttc)} TTC ({STATUTS_DEVIS_MAP[d.statut]?.label || d.statut})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {devisLies.length === 0 ? (
                <div style={{ color: c.texteMuted, fontSize: 13, padding: '4px 0' }}>
                  Aucun devis lié à cet événement.
                </div>
              ) : (
                <div className="crm-list">
                  {devisLies.map((d) => {
                    const st = STATUTS_DEVIS_MAP[d.statut]
                    return (
                      <div
                        key={d.id}
                        className="crm-row"
                        style={{ background: c.blanc, borderColor: c.bordure, color: c.texte, cursor: 'default' }}
                      >
                        <button
                          type="button"
                          onClick={() => router.push(`/crm/devis/${d.id}`)}
                          style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', flex: 1, minWidth: 0 }}
                        >
                          <div className="crm-row__primary" style={{ color: c.texte }}>{d.numero}</div>
                          <div className="crm-row__secondary" style={{ color: c.texteMuted }}>
                            {formatDateFr(d.date_emission)} · {formatMontant(d.total_ttc)} TTC
                            {d.sent_at && ` · Envoyé le ${formatDateFr(d.sent_at)}`}
                          </div>
                        </button>
                        <div className="crm-row__meta" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {st && <Badge bg={hexToRgba(st.couleur, 0.12)} color={st.couleur} size="sm">{st.label}</Badge>}
                          <button
                            type="button"
                            onClick={() => handleDetachDevis(d.id)}
                            disabled={linkSaving}
                            title="Détacher ce devis de l'événement"
                            style={{ background: 'transparent', border: 'none', color: c.texteMuted, cursor: 'pointer', padding: 4, fontSize: 16, lineHeight: 1 }}
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>

            {/* Zone danger */}
            <div style={{ marginTop: 32, paddingTop: 16, borderTop: `0.5px solid ${c.bordure}` }}>
              {confirmDelete ? (
                <Alert variant="error" title="Confirmation">
                  Supprimer définitivement cet événement ?
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <Button c={c} variant="ghost" onClick={() => setConfirmDelete(false)}>Annuler</Button>
                    <Button c={c} variant="danger-solid" onClick={handleDelete}>Supprimer</Button>
                  </div>
                </Alert>
              ) : (
                <Button c={c} variant="danger" onClick={() => setConfirmDelete(true)}>Supprimer cet événement</Button>
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
