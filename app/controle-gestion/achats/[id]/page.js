'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase, getClientId } from '../../../../lib/supabase'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { useTheme } from '../../../../lib/useTheme'
import { useRole } from '../../../../lib/useRole'
import Navbar from '../../../../components/Navbar'

function formatEuro(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}
function formatQte(n) {
  if (n == null) return '—'
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })
}
function formatDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default function AchatsDetailPage() {
  const router = useRouter()
  const { id } = useParams()
  const isMobile = useIsMobile()
  const { c } = useTheme()
  const { role, loading: roleLoading } = useRole()

  const [authReady, setAuthReady] = useState(false)
  const [clientId, setClientId] = useState(null)
  const [facture, setFacture] = useState(null)
  const [lignes, setLignes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Fichier PDF/image
  const [fichierUrl, setFichierUrl] = useState(null)
  const [fichierIsPdf, setFichierIsPdf] = useState(false)

  // Edition header
  const [editing, setEditing] = useState(false)
  const [editFournisseur, setEditFournisseur] = useState('')
  const [editNumero, setEditNumero] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editStatut, setEditStatut] = useState('facture')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return
        if (!session) { router.replace('/'); return }
        const cid = await getClientId()
        if (!cancelled) { setClientId(cid); setAuthReady(true) }
      } catch {
        if (!cancelled) router.replace('/')
      }
    })()
    return () => { cancelled = true }
  }, [router])

  useEffect(() => {
    if (roleLoading || !role) return
    if (role !== 'admin' && role !== 'directeur') router.replace('/dashboard')
  }, [role, roleLoading, router])

  const loadFacture = useCallback(async () => {
    if (!authReady || !id || !clientId) return
    setLoading(true)
    setError('')

    const { data: fac, error: fErr } = await supabase
      .from('achats_factures')
      .select('id, fournisseur, numero_facture, date_facture, total_ht, statut, fichier_url, created_at')
      .eq('id', id)
      .eq('client_id', clientId)
      .maybeSingle()

    if (fErr) { setError(fErr.message); setLoading(false); return }
    if (!fac) { setError('Facture introuvable.'); setLoading(false); return }
    setFacture(fac)

    const { data: rows, error: lErr } = await supabase
      .from('achats_lignes')
      .select('id, designation, ingredient_id, quantite, unite, prix_unitaire_ht, remise, montant_ht, ingredients(nom)')
      .eq('facture_id', id)
      .eq('client_id', clientId)
      .order('designation')

    if (lErr) console.warn('Lignes :', lErr.message)
    setLignes(rows || [])
    setLoading(false)

    // Charge l'URL signée du fichier si disponible
    if (fac.fichier_url) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/achats/fichier-facture?clientId=${clientId}&factureId=${fac.id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const result = await res.json()
        if (result.url) {
          setFichierUrl(result.url)
          setFichierIsPdf(fac.fichier_url.endsWith('.pdf'))
        }
      } catch (e) {
        console.warn('Impossible de charger le fichier :', e.message)
      }
    }
  }, [authReady, id, clientId])

  useEffect(() => { loadFacture() }, [loadFacture])

  const openEdit = () => {
    setEditFournisseur(facture.fournisseur || '')
    setEditNumero(facture.numero_facture || '')
    setEditDate(facture.date_facture || '')
    setEditStatut(facture.statut || 'facture')
    setEditing(true)
  }

  const handleSaveEdit = async () => {
    setSaving(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/achats/update-facture', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ factureId: id, clientId, fournisseur: editFournisseur, numeroFacture: editNumero, dateFacture: editDate, statut: editStatut }),
      })
      if (!res.ok) { const r = await res.json(); throw new Error(r.error) }
      setEditing(false)
      await loadFacture()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Supprimer cette facture ? Toutes les lignes associées seront perdues.')) return
    setDeleting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/achats/delete-facture?factureId=${id}&clientId=${clientId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) router.replace('/controle-gestion/achats')
      else setError('Erreur lors de la suppression.')
    } finally {
      setDeleting(false)
    }
  }

  const handleConfirmFacture = async () => {
    if (!window.confirm('Confirmer ce BL comme facture définitive ?')) return
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/achats/update-facture', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ factureId: id, clientId, statut: 'facture' }),
      })
      await loadFacture()
    } finally {
      setSaving(false)
    }
  }

  if (!authReady) return (
    <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>Chargement…</div>
  )

  const ht = facture ? Number(facture.total_ht) || 0 : 0
  const isBl = facture?.statut === 'bl'

  const th  = { padding: isMobile ? '10px 8px' : '11px 14px', textAlign: 'left',  fontWeight: 600, fontSize: 11, color: c.texteMuted, textTransform: 'uppercase', borderBottom: `1px solid ${c.bordure}`, whiteSpace: 'nowrap' }
  const thR = { ...th, textAlign: 'right' }
  const td  = { padding: isMobile ? '11px 8px' : '12px 14px', fontSize: 14, color: c.texte, borderBottom: `1px solid ${c.bordure}` }
  const tdR = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  const tdM = { ...tdR, color: c.texteMuted }
  const inputS = { padding: '8px 10px', borderRadius: 8, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, fontSize: 14, width: '100%', boxSizing: 'border-box' }

  const hasFichier = !!fichierUrl

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ padding: isMobile ? '16px' : '24px 32px', maxWidth: hasFichier ? 1400 : 1100, margin: '0 auto' }}>

        {/* ── Barre actions ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
          <button onClick={() => router.push('/controle-gestion/achats')}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: c.texteMuted, fontSize: 13, padding: 0 }}>
            ← Retour aux achats
          </button>
          {role === 'admin' && !loading && facture && (
            <div style={{ display: 'flex', gap: 8 }}>
              {isBl && (
                <button onClick={handleConfirmFacture} disabled={saving}
                  style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, border: 'none', background: '#059669', color: '#fff', cursor: 'pointer', fontWeight: 500 }}>
                  ✓ Confirmer comme facture
                </button>
              )}
              <button onClick={() => editing ? setEditing(false) : openEdit()}
                style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer' }}>
                {editing ? 'Annuler' : '✏️ Modifier'}
              </button>
              <button onClick={handleDelete} disabled={deleting}
                style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', cursor: 'pointer' }}>
                {deleting ? '…' : 'Supprimer'}
              </button>
            </div>
          )}
        </div>

        {error && <p style={{ color: '#B91C1C', fontSize: 14, margin: '8px 0' }}>{error}</p>}
        {loading && <p style={{ color: c.texteMuted, fontSize: 14 }}>Chargement…</p>}

        {!loading && facture && (
          <>
            {/* ── Layout principal : contenu gauche / PDF droite ── */}
            <div style={{
              display: hasFichier && !isMobile ? 'grid' : 'block',
              gridTemplateColumns: hasFichier && !isMobile ? '1fr 1fr' : undefined,
              gap: 24,
              marginTop: 12,
              alignItems: 'start',
            }}>

              {/* ── Colonne gauche : en-tête + lignes ── */}
              <div>
                {/* Aperçu mobile en haut */}
                {hasFichier && isMobile && (
                  <div style={{ marginBottom: 16 }}>
                    {fichierIsPdf
                      ? <iframe src={fichierUrl} title="Facture" style={{ width: '100%', height: 300, borderRadius: 10, border: `1px solid ${c.bordure}` }} />
                      : <img src={fichierUrl} alt="Facture" style={{ width: '100%', borderRadius: 10, border: `1px solid ${c.bordure}`, objectFit: 'contain', background: c.blanc }} />
                    }
                  </div>
                )}

                {/* En-tête facture */}
                <div style={{ background: c.blanc, borderRadius: 12, border: `0.5px solid ${c.bordure}`, padding: isMobile ? 16 : 24, marginBottom: 24 }}>
                  {editing ? (
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.texteMuted }}>
                        Fournisseur
                        <input style={inputS} value={editFournisseur} onChange={e => setEditFournisseur(e.target.value)} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.texteMuted }}>
                        N° de facture / BL
                        <input style={inputS} value={editNumero} onChange={e => setEditNumero(e.target.value)} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.texteMuted }}>
                        Date
                        <input style={inputS} type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.texteMuted }}>
                        Type
                        <select style={inputS} value={editStatut} onChange={e => setEditStatut(e.target.value)}>
                          <option value="bl">Bon de livraison</option>
                          <option value="facture">Facture</option>
                        </select>
                      </label>
                      <div style={{ gridColumn: isMobile ? 'auto' : 'span 2', display: 'flex', justifyContent: 'flex-end' }}>
                        <button onClick={handleSaveEdit} disabled={saving}
                          style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: c.accent, color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
                          {saving ? 'Enregistrement…' : 'Enregistrer'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                          <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 600, color: c.texte }}>{facture.fournisseur || '—'}</div>
                          {isBl
                            ? <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#FEF3C7', color: '#92400E' }}>BL</span>
                            : <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#D1FAE5', color: '#065F46' }}>Facture</span>}
                        </div>
                        {facture.numero_facture && <div style={{ fontSize: 13, color: c.texteMuted }}>N° {facture.numero_facture}</div>}
                        <div style={{ fontSize: 13, color: c.texteMuted }}>{formatDate(facture.date_facture)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: c.texteMuted, fontWeight: 500, textTransform: 'uppercase' }}>Total HT</div>
                        <div style={{ fontSize: isMobile ? 20 : 26, fontWeight: 600, color: c.texte }}>{formatEuro(ht)}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Lignes */}
                <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: c.texte }}>Articles ({lignes.length})</h2>
                {lignes.length === 0 ? (
                  <p style={{ color: c.texteMuted, fontSize: 14 }}>Aucun article enregistré.</p>
                ) : (
                  <div style={{ background: c.blanc, borderRadius: 12, border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 540 : 0 }}>
                        <thead>
                          <tr style={{ background: c.fond }}>
                            <th style={th}>Désignation</th>
                            <th style={thR}>Qté</th>
                            <th style={th}>Unité</th>
                            <th style={thR}>Prix HT/u</th>
                            <th style={thR}>Remise</th>
                            <th style={thR}>Total HT</th>
                            <th style={th}>Ingrédient</th>
                          </tr>
                        </thead>
                        <tbody>
                          {lignes.map((l) => (
                            <tr key={l.id}>
                              <td style={{ ...td, fontWeight: 500 }}>{l.designation}</td>
                              <td style={tdM}>{formatQte(l.quantite)}</td>
                              <td style={tdM}>{l.unite || '—'}</td>
                              <td style={tdR}>{formatEuro(l.prix_unitaire_ht)}</td>
                              <td style={tdM}>{l.remise ? `${l.remise} %` : '—'}</td>
                              <td style={tdR}>{formatEuro(l.montant_ht)}</td>
                              <td style={td}>
                                {l.ingredients?.nom
                                  ? <span style={{ fontSize: 12, background: c.accentClair, color: c.accent, borderRadius: 4, padding: '2px 7px' }}>{l.ingredients.nom}</span>
                                  : <span style={{ color: c.bordure }}>—</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ fontWeight: 600, background: c.fond }}>
                            <td style={{ ...td, color: c.texte }} colSpan={5}>Total</td>
                            <td style={{ ...tdR, color: c.texte }}>{formatEuro(lignes.reduce((s, l) => s + (Number(l.montant_ht) || 0), 0))}</td>
                            <td style={td} />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Colonne droite : PDF sticky (desktop uniquement) ── */}
              {hasFichier && !isMobile && (
                <div style={{ position: 'sticky', top: 80, height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {fichierIsPdf ? (
                    <iframe
                      src={fichierUrl}
                      title="Facture PDF"
                      style={{ flex: 1, width: '100%', borderRadius: 10, border: `1px solid ${c.bordure}` }}
                    />
                  ) : (
                    <img
                      src={fichierUrl}
                      alt="Facture"
                      style={{ flex: 1, width: '100%', objectFit: 'contain', borderRadius: 10, border: `1px solid ${c.bordure}`, background: c.blanc }}
                    />
                  )}
                  <a
                    href={fichierUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ textAlign: 'center', fontSize: 12, color: c.texteMuted, padding: '6px 0', textDecoration: 'none' }}
                  >
                    ↗ Ouvrir en plein écran
                  </a>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
