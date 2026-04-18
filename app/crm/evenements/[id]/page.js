'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase, getClientId } from '../../../../lib/supabase'
import { useTheme } from '../../../../lib/useTheme'
import { useRole } from '../../../../lib/useRole'
import Navbar from '../../../../components/Navbar'
import { Card, Button, Badge, Alert } from '../../../../components/ui'
import EvenementForm from '../../../../components/crm/EvenementForm'
import {
  STATUTS, STATUTS_MAP, TYPES_PRESTATION_MAP, LIEUX_TYPES_MAP,
  formatDateFr, formatMontant, clientDisplayName, hexToRgba,
} from '../../../../lib/crmConstants'

export default function CrmEvenementDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id
  const { c } = useTheme()
  const { role, loading: roleLoading } = useRole()

  const [authReady, setAuthReady] = useState(false)
  const [clientId, setClientId] = useState(null)
  const [evenement, setEvenement] = useState(null)
  const [clientCrm, setClientCrm] = useState(null)
  const [clientsDispo, setClientsDispo] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('view')
  const [statutSaving, setStatutSaving] = useState(false)
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

    const { data: ev, error: eErr } = await supabase
      .from('crm_evenements')
      .select('*')
      .eq('id', id).eq('client_id', cid)
      .maybeSingle()

    if (eErr) { setError(eErr.message); setLoading(false); return }
    setEvenement(ev)

    if (ev?.crm_client_id) {
      const { data: cli } = await supabase
        .from('crm_clients')
        .select('id, type, nom, prenom, raison_sociale, email, telephone')
        .eq('id', ev.crm_client_id).eq('client_id', cid)
        .maybeSingle()
      setClientCrm(cli)
    }

    // Pour le form d'édition
    const { data: allClients } = await supabase
      .from('crm_clients')
      .select('id, type, nom, prenom, raison_sociale')
      .eq('client_id', cid)
    setClientsDispo(allClients || [])
    setLoading(false)
  }, [id])

  useEffect(() => {
    if (!authReady || !['admin', 'directeur'].includes(role || '')) return
    load()
  }, [authReady, role, load])

  async function handleSave(values) {
    const { error: err } = await supabase
      .from('crm_evenements')
      .update(values)
      .eq('id', id)
      .eq('client_id', clientId)
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
      .eq('client_id', clientId)
    if (!err) setEvenement((ev) => ({ ...ev, statut: newStatut }))
    else setError(err.message)
    setStatutSaving(false)
  }

  async function handleDelete() {
    const { error: err } = await supabase
      .from('crm_evenements')
      .delete()
      .eq('id', id)
      .eq('client_id', clientId)
    if (err) { setError(err.message); return }
    router.push('/crm/evenements')
  }

  const statut = useMemo(() => STATUTS_MAP[evenement?.statut], [evenement])
  const typePresta = useMemo(() => TYPES_PRESTATION_MAP[evenement?.type_prestation], [evenement])
  const lieu = useMemo(() => LIEUX_TYPES_MAP[evenement?.lieu_type], [evenement])

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
