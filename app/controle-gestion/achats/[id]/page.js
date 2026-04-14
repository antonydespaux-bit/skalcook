'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase, getClientId } from '../../../../lib/supabase'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { useTheme } from '../../../../lib/useTheme'
import { useRole } from '../../../../lib/useRole'
import { normDesig, makeLigneId } from '../../../../lib/achatsHelpers'
import Navbar from '../../../../components/Navbar'
import BackButton from '../../../../components/BackButton'

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
  const [editTauxTva, setEditTauxTva] = useState(5.5)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Edition lignes
  const [editLignes, setEditLignes] = useState([])      // copies editables
  const [ingredientsById, setIngredientsById] = useState({})
  const [linkingIngFor, setLinkingIngFor] = useState(null)
  const [linkSearch, setLinkSearch] = useState('')

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

  // Section consultable par tous les membres. Modifications gardees par `role === 'admin'`.

  const loadFacture = useCallback(async () => {
    if (!authReady || !id || !clientId) return
    setLoading(true)
    setError('')

    const { data: fac, error: fErr } = await supabase
      .from('achats_factures')
      .select('id, fournisseur, numero_facture, date_facture, total_ht, statut, taux_tva, fichier_url, created_at')
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

    // Construit l'URL proxy (même origine → pas de CSP)
    if (fac.fichier_url) {
      const { data: { session } } = await supabase.auth.getSession()
      // On passe le token en query param car l'iframe ne peut pas envoyer de header Authorization
      setFichierUrl(`/api/achats/fichier-facture?clientId=${clientId}&factureId=${fac.id}&token=${session.access_token}`)
      setFichierIsPdf(fac.fichier_url.endsWith('.pdf'))
    }
  }, [authReady, id, clientId])

  useEffect(() => { loadFacture() }, [loadFacture])

  // Charge le catalogue d'ingrédients (pour la liaison en mode édition)
  const loadIngredients = useCallback(async () => {
    if (!clientId) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/achats/reconciliation-data?client_id=${clientId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) return
      const { ingredients } = await res.json()
      setIngredientsById(Object.fromEntries((ingredients || []).map((i) => [i.id, i])))
    } catch (err) {
      console.warn('loadIngredients:', err)
    }
  }, [clientId])

  useEffect(() => { if (authReady && clientId) loadIngredients() }, [authReady, clientId, loadIngredients])

  const openEdit = () => {
    setEditFournisseur(facture.fournisseur || '')
    setEditNumero(facture.numero_facture || '')
    setEditDate(facture.date_facture || '')
    setEditStatut(facture.statut || 'facture')
    setEditTauxTva(facture.taux_tva ?? 5.5)
    setEditLignes(
      lignes.map((l) => ({
        _id: makeLigneId(),
        designation: l.designation || '',
        quantite: Number(l.quantite) || 0,
        unite: l.unite || '',
        prix_unitaire_ht: Number(l.prix_unitaire_ht) || 0,
        remise: Number(l.remise) || 0,
        ingredient_id: l.ingredient_id || null,
        ingredient_nom: l.ingredients?.nom || null,
      }))
    )
    setLinkingIngFor(null)
    setLinkSearch('')
    setEditing(true)
  }

  const updateEditLigne = (lid, field, value) => {
    setEditLignes((prev) => prev.map((l) => (l._id === lid ? { ...l, [field]: value } : l)))
  }
  const removeEditLigne = (lid) => {
    setEditLignes((prev) => prev.filter((l) => l._id !== lid))
  }
  const addEditLigne = () => {
    setEditLignes((prev) => [
      ...prev,
      { _id: makeLigneId(), designation: '', quantite: 1, unite: '', prix_unitaire_ht: 0, remise: 0, ingredient_id: null, ingredient_nom: null },
    ])
  }
  const linkIngredientToEdit = (lid, ing) => {
    setEditLignes((prev) => prev.map((l) => (l._id === lid ? { ...l, ingredient_id: ing.id, ingredient_nom: ing.nom } : l)))
    setLinkingIngFor(null)
    setLinkSearch('')
  }
  const unlinkEditLigne = (lid) => {
    setEditLignes((prev) => prev.map((l) => (l._id === lid ? { ...l, ingredient_id: null, ingredient_nom: null } : l)))
  }

  // Totaux édition (HT/TVA/TTC)
  const editTotalHt = useMemo(
    () => editLignes.reduce((s, l) => {
      const r = Number(l.remise) || 0
      return s + (Number(l.quantite) || 0) * (Number(l.prix_unitaire_ht) || 0) * (1 - r / 100)
    }, 0),
    [editLignes]
  )
  const editMontantTva = editTotalHt * (Number(editTauxTva) || 0) / 100
  const editTotalTtc = editTotalHt + editMontantTva

  const handleSaveEdit = async () => {
    setSaving(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const lignesPayload = editLignes
        .filter((l) => l.designation.trim())
        .map((l) => ({
          designation: l.designation.trim(),
          ingredient_id: l.ingredient_id || null,
          quantite: Number(l.quantite) || 0,
          unite: l.unite || null,
          prix_unitaire_ht: Number(l.prix_unitaire_ht) || 0,
          remise: Number(l.remise) || 0,
        }))
      const res = await fetch('/api/achats/update-facture', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          factureId: id,
          clientId,
          fournisseur: editFournisseur,
          numeroFacture: editNumero,
          dateFacture: editDate,
          statut: editStatut,
          tauxTva: Number(editTauxTva) || 0,
          lignes: lignesPayload,
        }),
      })
      if (!res.ok) { const r = await res.json(); throw new Error(r.error || 'Erreur enregistrement') }
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
          <BackButton
            fallback="/controle-gestion/achats"
            label="← Retour aux achats"
            style={{ background: 'transparent', border: 'none', color: c.texteMuted, fontSize: 13, padding: 0 }}
          />
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
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.texteMuted, gridColumn: isMobile ? 'auto' : 'span 2' }}>
                        TVA (%)
                        <input style={{ ...inputS, maxWidth: 140 }} type="number" min="0" max="100" step="0.1" value={editTauxTva} onChange={e => setEditTauxTva(e.target.value)} />
                      </label>
                      <div style={{ gridColumn: isMobile ? 'auto' : 'span 2', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: c.texteMuted, fontVariantNumeric: 'tabular-nums' }}>
                          <span>HT : <strong style={{ color: c.texte }}>{formatEuro(editTotalHt)}</strong></span>
                          <span>TVA : <strong style={{ color: c.texte }}>{formatEuro(editMontantTva)}</strong></span>
                          <span>TTC : <strong style={{ color: c.texte }}>{formatEuro(editTotalTtc)}</strong></span>
                        </div>
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
                        {facture.taux_tva != null && (
                          <div style={{ fontSize: 12, color: c.texteMuted, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                            TVA {Number(facture.taux_tva).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} % · TTC <strong style={{ color: c.texte }}>{formatEuro(ht * (1 + Number(facture.taux_tva) / 100))}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Lignes */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: c.texte }}>
                    Articles ({editing ? editLignes.length : lignes.length})
                  </h2>
                  {editing && (
                    <button onClick={addEditLigne}
                      style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer', fontSize: 13 }}>
                      + Ajouter une ligne
                    </button>
                  )}
                </div>

                {editing ? (
                  /* ── Mode édition ── */
                  editLignes.length === 0 ? (
                    <p style={{ color: c.texteMuted, fontSize: 14 }}>Aucune ligne. Cliquez sur « + Ajouter une ligne ».</p>
                  ) : (
                    <div style={{ background: c.blanc, borderRadius: 12, border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
                          <thead>
                            <tr style={{ background: c.fond }}>
                              <th style={th}>Désignation</th>
                              <th style={thR}>Qté</th>
                              <th style={th}>Unité</th>
                              <th style={thR}>Prix HT/u</th>
                              <th style={thR}>Remise %</th>
                              <th style={thR}>Total HT</th>
                              <th style={th}>Ingrédient</th>
                              <th style={th} />
                            </tr>
                          </thead>
                          <tbody>
                            {editLignes.map((l) => {
                              const totalLigne = (Number(l.quantite) || 0) * (Number(l.prix_unitaire_ht) || 0) * (1 - (Number(l.remise) || 0) / 100)
                              return (
                                <tr key={l._id}>
                                  <td style={td}>
                                    <input
                                      style={{ ...inputS, fontSize: 13, padding: '6px 8px' }}
                                      value={l.designation}
                                      onChange={e => updateEditLigne(l._id, 'designation', e.target.value)}
                                    />
                                  </td>
                                  <td style={{ ...td, textAlign: 'right' }}>
                                    <input
                                      style={{ ...inputS, fontSize: 13, padding: '6px 8px', textAlign: 'right', width: 70 }}
                                      type="number" min="0" step="0.001"
                                      value={l.quantite}
                                      onChange={e => updateEditLigne(l._id, 'quantite', e.target.value)}
                                    />
                                  </td>
                                  <td style={td}>
                                    <input
                                      style={{ ...inputS, fontSize: 13, padding: '6px 8px', width: 60 }}
                                      value={l.unite}
                                      placeholder="kg"
                                      onChange={e => updateEditLigne(l._id, 'unite', e.target.value)}
                                    />
                                  </td>
                                  <td style={{ ...td, textAlign: 'right' }}>
                                    <input
                                      style={{ ...inputS, fontSize: 13, padding: '6px 8px', textAlign: 'right', width: 80 }}
                                      type="number" min="0" step="0.01"
                                      value={l.prix_unitaire_ht}
                                      onChange={e => updateEditLigne(l._id, 'prix_unitaire_ht', e.target.value)}
                                    />
                                  </td>
                                  <td style={{ ...td, textAlign: 'right' }}>
                                    <input
                                      style={{ ...inputS, fontSize: 13, padding: '6px 8px', textAlign: 'right', width: 60 }}
                                      type="number" min="0" max="100" step="0.1"
                                      value={l.remise}
                                      onChange={e => updateEditLigne(l._id, 'remise', e.target.value)}
                                    />
                                  </td>
                                  <td style={{ ...tdR, fontVariantNumeric: 'tabular-nums' }}>{formatEuro(totalLigne)}</td>
                                  <td style={td}>
                                    {linkingIngFor === l._id ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}>
                                        <input
                                          autoFocus
                                          style={{ ...inputS, fontSize: 12, padding: '4px 6px' }}
                                          value={linkSearch}
                                          placeholder="Rechercher un ingrédient…"
                                          onChange={e => setLinkSearch(e.target.value)}
                                          onKeyDown={e => { if (e.key === 'Escape') { setLinkingIngFor(null); setLinkSearch('') } }}
                                        />
                                        <div style={{ maxHeight: 140, overflowY: 'auto', border: `1px solid ${c.bordure}`, borderRadius: 6, background: c.blanc }}>
                                          {Object.values(ingredientsById)
                                            .filter(ing => !linkSearch.trim() || normDesig(ing.nom).includes(normDesig(linkSearch)))
                                            .sort((a, b) => a.nom.localeCompare(b.nom))
                                            .slice(0, 20)
                                            .map(ing => (
                                              <button key={ing.id} onClick={() => linkIngredientToEdit(l._id, ing)}
                                                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', fontSize: 12, background: 'transparent', border: 'none', borderBottom: `1px solid ${c.bordure}`, cursor: 'pointer', color: c.texte }}
                                              >{ing.nom}</button>
                                            ))
                                          }
                                          {Object.values(ingredientsById).filter(ing => !linkSearch.trim() || normDesig(ing.nom).includes(normDesig(linkSearch))).length === 0 && (
                                            <p style={{ margin: 0, padding: '6px 8px', fontSize: 11, color: c.texteMuted }}>Aucun résultat</p>
                                          )}
                                        </div>
                                        <button onClick={() => { setLinkingIngFor(null); setLinkSearch('') }}
                                          style={{ padding: '2px 6px', fontSize: 11, background: 'transparent', border: `1px solid ${c.bordure}`, borderRadius: 4, cursor: 'pointer' }}>✕ Annuler</button>
                                      </div>
                                    ) : l.ingredient_id ? (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 12, background: c.accentClair, color: c.accent, borderRadius: 4, padding: '2px 7px' }}>{l.ingredient_nom || '—'}</span>
                                        <button onClick={() => { setLinkingIngFor(l._id); setLinkSearch('') }}
                                          style={{ fontSize: 10, padding: '1px 5px', background: 'transparent', border: `1px solid ${c.bordure}`, color: c.texteMuted, borderRadius: 4, cursor: 'pointer' }}>Changer</button>
                                        <button onClick={() => unlinkEditLigne(l._id)}
                                          style={{ fontSize: 10, padding: '1px 5px', background: 'transparent', border: `1px solid ${c.bordure}`, color: c.texteMuted, borderRadius: 4, cursor: 'pointer' }}>✕</button>
                                      </div>
                                    ) : (
                                      <button onClick={() => { setLinkingIngFor(l._id); setLinkSearch('') }}
                                        style={{ fontSize: 11, padding: '3px 8px', background: '#EFF6FF', border: `1px solid #BFDBFE`, color: '#1D4ED8', borderRadius: 4, cursor: 'pointer' }}>🔗 Lier</button>
                                    )}
                                  </td>
                                  <td style={{ ...td, textAlign: 'center' }}>
                                    <button onClick={() => removeEditLigne(l._id)}
                                      style={{ background: 'transparent', border: 'none', color: '#B91C1C', cursor: 'pointer', fontSize: 16 }}>×</button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                          <tfoot>
                            <tr style={{ fontWeight: 600, background: c.fond }}>
                              <td style={{ ...td, color: c.texte }} colSpan={5}>Total HT</td>
                              <td style={{ ...tdR, color: c.texte }}>{formatEuro(editTotalHt)}</td>
                              <td style={td} colSpan={2} />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )
                ) : lignes.length === 0 ? (
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
