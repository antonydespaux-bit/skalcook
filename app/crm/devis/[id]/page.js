'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase, getClientId } from '../../../../lib/supabase'
import { useTheme } from '../../../../lib/useTheme'
import { useRole } from '../../../../lib/useRole'
import Navbar from '../../../../components/Navbar'
import { Card, Button, Badge, Alert } from '../../../../components/ui'
import DevisForm from '../../../../components/crm/DevisForm'
import {
  STATUTS_DEVIS, STATUTS_DEVIS_MAP, TAUX_TVA,
  formatDateFr, formatMontant, clientDisplayName, hexToRgba,
} from '../../../../lib/crmConstants'

export default function CrmDevisDetailPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id
  const { c } = useTheme()
  const { role, loading: roleLoading } = useRole()

  const [authReady, setAuthReady] = useState(false)
  const [clientId, setClientId] = useState(null)
  const [devis, setDevis] = useState(null)
  const [lignes, setLignes] = useState([])
  const [clientCrm, setClientCrm] = useState(null)
  const [evenement, setEvenement] = useState(null)

  const [clientsDispo, setClientsDispo] = useState([])
  const [evenementsDispo, setEvenementsDispo] = useState([])
  const [fichesDispo, setFichesDispo] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mode, setMode] = useState('view')
  const [statutSaving, setStatutSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [sendModalOpen, setSendModalOpen] = useState(false)

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

    const { data: dev, error: dErr } = await supabase
      .from('crm_devis')
      .select('*')
      .eq('id', id).eq('client_id', cid)
      .maybeSingle()
    if (dErr) { setError(dErr.message); setLoading(false); return }
    setDevis(dev)

    if (!dev) { setLoading(false); return }

    const [
      { data: lignesData, error: lErr },
      { data: cli },
      { data: ev },
      { data: clientsData },
      { data: evenementsData },
      { data: fichesData },
    ] = await Promise.all([
      supabase.from('crm_devis_lignes')
        .select('*')
        .eq('devis_id', id)
        .order('ordre', { ascending: true }),
      dev.crm_client_id
        ? supabase.from('crm_clients')
            .select('id, type, nom, prenom, raison_sociale, email, telephone')
            .eq('id', dev.crm_client_id).eq('client_id', cid).maybeSingle()
        : Promise.resolve({ data: null }),
      dev.crm_evenement_id
        ? supabase.from('crm_evenements')
            .select('id, titre, date_evenement')
            .eq('id', dev.crm_evenement_id).eq('client_id', cid).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('crm_clients')
        .select('id, type, nom, prenom, raison_sociale')
        .eq('client_id', cid),
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
    if (lErr) { setError(lErr.message); setLoading(false); return }
    setLignes(lignesData || [])
    setClientCrm(cli || null)
    setEvenement(ev || null)
    setClientsDispo(clientsData || [])
    setEvenementsDispo(evenementsData || [])
    setFichesDispo(fichesData || [])
    setLoading(false)
  }, [id])

  useEffect(() => {
    if (!authReady || !['admin', 'directeur'].includes(role || '')) return
    load()
  }, [authReady, role, load])

  async function handleSave({ header, lignes: newLignes }) {
    // UPDATE header (on ne touche pas à numero/annee/sequence)
    const { error: hErr } = await supabase
      .from('crm_devis')
      .update(header)
      .eq('id', id)
      .eq('client_id', clientId)
    if (hErr) throw hErr

    // Replace lignes : delete all + insert new (plus simple que de differ)
    const { error: dLErr } = await supabase
      .from('crm_devis_lignes')
      .delete()
      .eq('devis_id', id)
      .eq('client_id', clientId)
    if (dLErr) throw dLErr

    if (newLignes.length > 0) {
      const { error: iLErr } = await supabase
        .from('crm_devis_lignes')
        .insert(newLignes.map((l) => ({ ...l, devis_id: id, client_id: clientId })))
      if (iLErr) throw iLErr
    }

    setMode('view')
    await load()
  }

  async function handleStatutChange(newStatut) {
    setStatutSaving(true)
    const { error: err } = await supabase
      .from('crm_devis')
      .update({ statut: newStatut })
      .eq('id', id)
      .eq('client_id', clientId)
    if (!err) setDevis((d) => ({ ...d, statut: newStatut }))
    else setError(err.message)
    setStatutSaving(false)
  }

  async function handleDelete() {
    const { error: err } = await supabase
      .from('crm_devis')
      .delete()
      .eq('id', id)
      .eq('client_id', clientId)
    if (err) { setError(err.message); return }
    router.push('/crm/devis')
  }

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Session expirée.')
    return { Authorization: `Bearer ${session.access_token}` }
  }

  async function handleDownloadPdf({ download = true } = {}) {
    if (!clientId) return
    setPdfLoading(true)
    setError('')
    try {
      const headers = await authHeaders()
      const url = `/api/crm/devis/${id}/pdf?client_id=${clientId}${download ? '&download=1' : ''}`
      const res = await fetch(url, { headers })
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(j.error || 'Erreur PDF')
      }
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      if (download) {
        const a = document.createElement('a')
        a.href = blobUrl
        a.download = `${devis?.numero || 'devis'}.pdf`
        document.body.appendChild(a)
        a.click()
        a.remove()
      } else {
        window.open(blobUrl, '_blank', 'noopener')
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    } catch (err) {
      setError(err.message || 'Erreur PDF')
    } finally {
      setPdfLoading(false)
    }
  }

  async function handleSend({ to, subject, message }) {
    const headers = { ...(await authHeaders()), 'Content-Type': 'application/json' }
    const res = await fetch(`/api/crm/devis/${id}/envoyer`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ client_id: clientId, to, subject, message }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
    setSendModalOpen(false)
    await load()
  }

  const statut = useMemo(() => STATUTS_DEVIS_MAP[devis?.statut], [devis])
  const allergenesAgreges = useMemo(() => {
    const set = new Set()
    for (const l of lignes) for (const a of l.allergenes || []) set.add(a)
    return Array.from(set)
  }, [lignes])
  const tauxTvaMap = useMemo(() => Object.fromEntries(TAUX_TVA.map((t) => [t.key, t.label])), [])

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
        <button type="button" onClick={() => router.push('/crm/devis')} className="crm-back" style={{ color: c.texteMuted }}>
          ← Devis
        </button>

        {error && <Alert variant="error">{error}</Alert>}

        {loading ? (
          <div style={{ color: c.texteMuted, fontSize: 13, padding: 12 }}>Chargement…</div>
        ) : !devis ? (
          <Alert variant="warn">Devis introuvable.</Alert>
        ) : mode === 'edit' ? (
          <>
            <div className="crm-header">
              <div className="crm-header__text">
                <h1 className="crm-header__title" style={{ color: c.texte }}>Modifier {devis.numero}</h1>
              </div>
            </div>
            <DevisForm
              c={c}
              initial={devis}
              initialLignes={lignes.map((l) => ({ ...l, _cout_portion: 0 }))}
              clientsDispo={clientsDispo}
              evenementsDispo={evenementsDispo}
              fichesDispo={fichesDispo}
              submitLabel="Enregistrer"
              onSubmit={handleSave}
              onCancel={() => setMode('view')}
            />
          </>
        ) : (
          <>
            <div className="crm-header">
              <div className="crm-header__text">
                <h1 className="crm-header__title" style={{ color: c.texte }}>{devis.numero}</h1>
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
                  {evenement && (
                    <>
                      <span>·</span>
                      <button
                        type="button"
                        onClick={() => router.push(`/crm/evenements/${evenement.id}`)}
                        style={{ background: 'transparent', border: 'none', color: c.accent, cursor: 'pointer', padding: 0, fontSize: 13, textDecoration: 'underline' }}
                      >
                        {evenement.titre}
                      </button>
                    </>
                  )}
                </p>
              </div>
              <div className="crm-actions">
                <Button c={c} variant="ghost" onClick={() => handleDownloadPdf({ download: true })} disabled={pdfLoading}>
                  {pdfLoading ? 'PDF…' : 'Télécharger PDF'}
                </Button>
                <Button c={c} variant="ghost" onClick={() => setMode('edit')}>Modifier</Button>
                <Button c={c} onClick={() => setSendModalOpen(true)}>
                  {devis.sent_at ? 'Renvoyer' : 'Envoyer par email'}
                </Button>
              </div>
            </div>

            {/* Envoi info (si déjà envoyé) */}
            {devis.sent_at && (
              <Card c={c} padding="md" style={{ marginBottom: 20, background: hexToRgba('#10B981', 0.06), borderColor: hexToRgba('#10B981', 0.3) }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13, color: c.texte }}>
                  <span style={{ fontWeight: 500 }}>✓ Envoyé</span>
                  <span style={{ color: c.texteMuted }}>
                    le {formatDateFr(devis.sent_at)}{devis.sent_to_email ? ` à ${devis.sent_to_email}` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDownloadPdf({ download: false })}
                    disabled={pdfLoading}
                    style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: c.accent, cursor: 'pointer', textDecoration: 'underline', fontSize: 13 }}
                  >
                    Voir le PDF
                  </button>
                </div>
              </Card>
            )}

            {/* Statut */}
            <Card c={c} padding="md" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                <div className="sk-label-muted" style={{ color: c.texteMuted }}>Statut</div>
                {statut && (
                  <Badge bg={hexToRgba(statut.couleur, 0.14)} color={statut.couleur} size="lg">
                    {statut.label}
                  </Badge>
                )}
                <select
                  value={devis.statut}
                  onChange={(e) => handleStatutChange(e.target.value)}
                  disabled={statutSaving}
                  className="sk-select"
                  style={{ background: c.blanc, border: `0.5px solid ${c.bordure}`, color: c.texte, marginLeft: 'auto' }}
                >
                  {STATUTS_DEVIS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
            </Card>

            {/* Dates */}
            <Card c={c} padding="responsive" style={{ marginBottom: 20 }}>
              <div className="crm-kv">
                <Kv c={c} label="Date d’émission" value={formatDateFr(devis.date_emission)} />
                <Kv c={c} label="Validité jusqu’au" value={formatDateFr(devis.date_validite)} />
                <Kv c={c} label="Conditions de paiement" value={devis.conditions_paiement || '—'} />
                <Kv c={c} label="Acompte" value={devis.acompte_pourcentage != null ? `${devis.acompte_pourcentage} %` : '—'} />
              </div>
              {devis.notes && (
                <div style={{ marginTop: 16 }}>
                  <div className="sk-label-muted" style={{ color: c.texteMuted, marginBottom: 6 }}>Notes internes</div>
                  <div style={{ color: c.texte, fontSize: 14, whiteSpace: 'pre-wrap' }}>{devis.notes}</div>
                </div>
              )}
            </Card>

            {/* Lignes */}
            <Card c={c} padding="md" style={{ marginBottom: 20 }}>
              <div className="sk-panel-header" style={{ color: c.texte }}>Détail des prestations</div>
              {lignes.length === 0 ? (
                <div style={{ color: c.texteMuted, fontSize: 13, padding: '12px 0' }}>Aucune ligne.</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th className="sk-th" style={{ color: c.texteMuted, textAlign: 'left' }}>Désignation</th>
                        <th className="sk-th" style={{ color: c.texteMuted, textAlign: 'right' }}>Qté</th>
                        <th className="sk-th" style={{ color: c.texteMuted, textAlign: 'right' }}>PU HT</th>
                        <th className="sk-th" style={{ color: c.texteMuted, textAlign: 'right' }}>TVA</th>
                        <th className="sk-th" style={{ color: c.texteMuted, textAlign: 'right' }}>Remise</th>
                        <th className="sk-th" style={{ color: c.texteMuted, textAlign: 'right' }}>Total HT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lignes.map((l) => (
                        <tr key={l.id}>
                          <td className="sk-td" style={{ color: c.texte, verticalAlign: 'top' }}>
                            <div style={{ fontWeight: 500 }}>{l.designation}</div>
                            {l.description && <div style={{ color: c.texteMuted, fontSize: 12, marginTop: 2 }}>{l.description}</div>}
                            {Array.isArray(l.allergenes) && l.allergenes.length > 0 && (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                                {l.allergenes.map((a) => (
                                  <Badge key={a} bg={hexToRgba('#DC2626', 0.12)} color="#DC2626" size="sm">{a}</Badge>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="sk-td" style={{ color: c.texte, textAlign: 'right' }}>{Number(l.quantite).toLocaleString('fr-FR')}</td>
                          <td className="sk-td" style={{ color: c.texte, textAlign: 'right' }}>{formatMontant(l.prix_unitaire_ht)}</td>
                          <td className="sk-td" style={{ color: c.texteMuted, textAlign: 'right', whiteSpace: 'nowrap' }}>{tauxTvaMap[Number(l.tva_taux)] || `${l.tva_taux} %`}</td>
                          <td className="sk-td" style={{ color: c.texteMuted, textAlign: 'right' }}>{l.remise_pct ? `${l.remise_pct} %` : '—'}</td>
                          <td className="sk-td" style={{ color: c.texte, textAlign: 'right', fontWeight: 500 }}>{formatMontant(l.total_ht)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Totaux */}
              <div className="crm-devis-totals" style={{ background: c.fond, borderColor: c.bordure, marginTop: 16 }}>
                <div className="crm-devis-totals__row" style={{ color: c.texteMuted }}>
                  <span>Total HT</span><span>{formatMontant(devis.total_ht)}</span>
                </div>
                <div className="crm-devis-totals__row" style={{ color: c.texteMuted }}>
                  <span>TVA</span><span>{formatMontant(devis.total_tva)}</span>
                </div>
                <div className="crm-devis-totals__row crm-devis-totals__row--ttc" style={{ color: c.texte, borderColor: c.bordure }}>
                  <span>Total TTC</span><span>{formatMontant(devis.total_ttc)}</span>
                </div>
                {allergenesAgreges.length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `0.5px solid ${c.bordure}`, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className="sk-label-muted" style={{ color: c.texteMuted, marginRight: 4 }}>Allergènes :</span>
                    {allergenesAgreges.map((a) => (
                      <Badge key={a} bg={hexToRgba('#DC2626', 0.12)} color="#DC2626" size="sm">{a}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            {/* Contact client */}
            {clientCrm && (clientCrm.email || clientCrm.telephone) && (
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

            {/* Modal envoi */}
            {sendModalOpen && (
              <SendDevisModal
                c={c}
                devis={devis}
                clientCrm={clientCrm}
                onClose={() => setSendModalOpen(false)}
                onSend={handleSend}
              />
            )}

            {/* Danger zone */}
            <div style={{ marginTop: 32, paddingTop: 16, borderTop: `0.5px solid ${c.bordure}` }}>
              {confirmDelete ? (
                <Alert variant="error" title="Confirmation">
                  Supprimer définitivement ce devis ?
                  <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                    <Button c={c} variant="ghost" onClick={() => setConfirmDelete(false)}>Annuler</Button>
                    <Button c={c} variant="danger-solid" onClick={handleDelete}>Supprimer</Button>
                  </div>
                </Alert>
              ) : (
                <Button c={c} variant="danger" onClick={() => setConfirmDelete(true)}>Supprimer ce devis</Button>
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

function SendDevisModal({ c, devis, clientCrm, onClose, onSend }) {
  const [to, setTo] = useState(clientCrm?.email || '')
  const [subject, setSubject] = useState(`Devis ${devis.numero}`)
  const [message, setMessage] = useState(
    `Bonjour${clientCrm?.prenom ? ' ' + clientCrm.prenom : ''},\n\nVous trouverez ci-joint votre devis pour votre événement. N'hésitez pas à revenir vers moi pour toute question.\n\nBien cordialement,`
  )
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')

  const inputStyle = { background: c.blanc, borderColor: c.bordure, color: c.texte }
  const labelStyle = { color: c.texte }

  async function submit(e) {
    e.preventDefault()
    setErr('')
    if (!to.trim()) { setErr('Destinataire requis.'); return }
    if (!subject.trim()) { setErr('Sujet requis.'); return }
    setSending(true)
    try {
      await onSend({ to: to.trim(), subject: subject.trim(), message: message.trim() })
    } catch (e2) {
      setErr(e2.message || 'Envoi échoué.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="crm-devis-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <form className="crm-devis-modal" style={{ background: c.blanc, border: `0.5px solid ${c.bordure}` }} onSubmit={submit}>
        <div>
          <h3 className="crm-devis-modal__title" style={{ color: c.texte }}>Envoyer le devis par email</h3>
          <p className="crm-devis-modal__subtitle" style={{ color: c.texteMuted }}>
            Le PDF sera généré puis joint automatiquement au message.
          </p>
        </div>

        <div className="crm-field">
          <label className="crm-field__label crm-field__label--required" style={labelStyle}>Destinataire</label>
          <input
            type="email" required
            className="crm-field__input" style={inputStyle}
            value={to} onChange={(e) => setTo(e.target.value)}
            placeholder="client@exemple.fr"
          />
        </div>

        <div className="crm-field">
          <label className="crm-field__label crm-field__label--required" style={labelStyle}>Sujet</label>
          <input
            type="text" required
            className="crm-field__input" style={inputStyle}
            value={subject} onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Message</label>
          <textarea
            className="crm-field__textarea" style={{ ...inputStyle, minHeight: 140 }}
            value={message} onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        {err && <div style={{ color: 'var(--sk-rouge-texte)', fontSize: 13 }}>{err}</div>}

        <div className="crm-actions">
          <Button c={c} variant="ghost" type="button" onClick={onClose} disabled={sending}>Annuler</Button>
          <Button c={c} type="submit" disabled={sending}>
            {sending ? 'Envoi…' : 'Envoyer'}
          </Button>
        </div>
      </form>
    </div>
  )
}
