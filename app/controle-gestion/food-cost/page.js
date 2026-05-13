'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getClientId } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import { useRole } from '../../../lib/useRole'
import Navbar from '../../../components/Navbar'
import { getPeriodDates, toIsoDate } from '../../../lib/caAnalyses'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatEuro(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

function formatPct(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(1)} %`
}

function defaultPeriod() {
  // Par défaut : mois précédent (couverture complète du dernier mois clos)
  return getPeriodDates('mois-precedent')
}

// Debounce simple pour les autosaves
function useDebouncedCallback(fn, delay) {
  const [timer, setTimer] = useState(null)
  return useCallback((...args) => {
    if (timer) clearTimeout(timer)
    const t = setTimeout(() => fn(...args), delay)
    setTimer(t)
  }, [fn, delay, timer])
}

// ─── Composant ──────────────────────────────────────────────────────────────

export default function FoodCostPage() {
  const router = useRouter()
  const { c } = useTheme()
  const isMobile = useIsMobile()
  const { role, loading: roleLoading } = useRole()

  const [authReady, setAuthReady] = useState(false)
  const [clientId, setClientId] = useState(null)
  const [error, setError] = useState('')

  // Période
  const initial = useMemo(() => defaultPeriod(), [])
  const [periodeDebut, setPeriodeDebut] = useState(initial.debut)
  const [periodeFin, setPeriodeFin] = useState(initial.fin)

  // Rapport courant
  const [rapportId, setRapportId] = useState(null)
  const [inventaireDebut, setInventaireDebut] = useState('')
  const [inventaireFin, setInventaireFin] = useState('')
  const [notes, setNotes] = useState('')
  const [ajustements, setAjustements] = useState([])

  // Totaux calculés serveur
  const [caFoodHt, setCaFoodHt] = useState(0)
  const [achatsHt, setAchatsHt] = useState(0)

  const [loading, setLoading] = useState(false)
  const [savingInv, setSavingInv] = useState(false)

  // Saisie nouvelle ligne d'ajustement
  const [newLibelle, setNewLibelle] = useState('')
  const [newMontant, setNewMontant] = useState('')
  const [newCommentaire, setNewCommentaire] = useState('')
  const [addingAjustement, setAddingAjustement] = useState(false)

  // ── Auth ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancel = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancel) return
      if (!session) { router.replace('/'); return }
      const cid = await getClientId()
      if (cancel) return
      setClientId(cid)
      setAuthReady(true)
    })()
    return () => { cancel = true }
  }, [router])

  useEffect(() => {
    if (roleLoading || !role) return
    if (role !== 'admin' && role !== 'directeur') router.replace('/dashboard')
  }, [role, roleLoading, router])

  // ── Charge / crée le rapport pour la période courante ──────────────────
  const loadRapport = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }

      // 1. Upsert (idempotent) → récupère le rapport_id
      const upsertRes = await fetch('/api/food-cost/rapport', {
        method: 'POST',
        headers,
        body: JSON.stringify({ clientId, periodeDebut, periodeFin }),
      })
      const upsertJson = await upsertRes.json()
      if (!upsertRes.ok) throw new Error(upsertJson.error || `HTTP ${upsertRes.status}`)
      const rid = upsertJson.rapport_id

      // 2. GET full data (rapport + ajustements + totaux)
      const url = new URL('/api/food-cost/rapport', window.location.origin)
      url.searchParams.set('rapportId', rid)
      url.searchParams.set('clientId', clientId)
      const getRes = await fetch(url.toString(), { headers })
      const getJson = await getRes.json()
      if (!getRes.ok) throw new Error(getJson.error || `HTTP ${getRes.status}`)

      setRapportId(rid)
      setInventaireDebut(getJson.rapport.inventaire_debut_ht ?? '')
      setInventaireFin(getJson.rapport.inventaire_fin_ht ?? '')
      setNotes(getJson.rapport.notes ?? '')
      setAjustements(getJson.ajustements ?? [])
      setCaFoodHt(getJson.totaux.ca_food_ht)
      setAchatsHt(getJson.totaux.achats_ht)
    } catch (e) {
      setError(`Chargement impossible : ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [clientId, periodeDebut, periodeFin])

  useEffect(() => {
    if (!authReady || !clientId) return
    loadRapport()
  }, [authReady, clientId, loadRapport])

  // ── Save inventaires + notes (debounced) ───────────────────────────────
  const patchRapport = useCallback(async (updates) => {
    if (!rapportId || !clientId) return
    setSavingInv(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/food-cost/rapport', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ rapportId, clientId, ...updates }),
      })
    } finally {
      setSavingInv(false)
    }
  }, [rapportId, clientId])

  const debouncedPatch = useDebouncedCallback(patchRapport, 500)

  const onInventaireDebutChange = (v) => {
    setInventaireDebut(v)
    debouncedPatch({ inventaireDebutHt: v === '' ? null : Number(v) })
  }
  const onInventaireFinChange = (v) => {
    setInventaireFin(v)
    debouncedPatch({ inventaireFinHt: v === '' ? null : Number(v) })
  }
  const onNotesChange = (v) => {
    setNotes(v)
    debouncedPatch({ notes: v })
  }

  // ── Ajustements CRUD ───────────────────────────────────────────────────
  const addAjustement = async () => {
    if (!rapportId || !clientId) return
    const libelle = newLibelle.trim()
    const montant = Number(newMontant)
    if (!libelle) { setError('Libellé requis pour l\'ajustement.'); return }
    if (!Number.isFinite(montant)) { setError('Montant numérique requis.'); return }
    setAddingAjustement(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/food-cost/ajustement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ clientId, rapportId, libelle, montant, commentaire: newCommentaire.trim() }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setAjustements(prev => [...prev, json])
      setNewLibelle(''); setNewMontant(''); setNewCommentaire('')
    } catch (e) {
      setError(`Ajout impossible : ${e.message}`)
    } finally {
      setAddingAjustement(false)
    }
  }

  const deleteAjustement = async (id) => {
    if (!window.confirm('Supprimer cet ajustement ?')) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch(`/api/food-cost/ajustement?ajustementId=${id}&clientId=${clientId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      setAjustements(prev => prev.filter(a => a.id !== id))
    } catch (e) {
      setError(`Suppression impossible : ${e.message}`)
    }
  }

  // ── Presets de période ─────────────────────────────────────────────────
  const applyPreset = (k) => {
    const p = getPeriodDates(k)
    if (!p) return
    setPeriodeDebut(p.debut)
    setPeriodeFin(p.fin)
  }

  // ── Calculs dérivés (live) ─────────────────────────────────────────────
  const totaux = useMemo(() => {
    const invD = inventaireDebut === '' || inventaireDebut == null ? 0 : Number(inventaireDebut)
    const invF = inventaireFin === '' || inventaireFin == null ? 0 : Number(inventaireFin)
    const sumAjust = ajustements.reduce((s, a) => s + (Number(a.montant) || 0), 0)
    const coutMatiere = invD + achatsHt - invF + sumAjust
    const ratio = caFoodHt > 0 ? (coutMatiere / caFoodHt) * 100 : null
    return { invD, invF, sumAjust, coutMatiere, ratio }
  }, [inventaireDebut, inventaireFin, ajustements, achatsHt, caFoodHt])

  const hasInventaires = inventaireDebut !== '' && inventaireFin !== ''

  // ── Styles ─────────────────────────────────────────────────────────────
  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
        Chargement…
      </div>
    )
  }

  const card = {
    background: c.blanc, borderRadius: 12, border: `0.5px solid ${c.bordure}`,
    padding: isMobile ? 16 : 24, marginBottom: 16,
  }
  const input = {
    padding: '8px 12px', borderRadius: 8, fontSize: 14,
    border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, outline: 'none',
    width: '100%', boxSizing: 'border-box',
  }
  const btnPrimary = {
    padding: '8px 14px', borderRadius: 8, fontSize: 13, border: 'none',
    background: c.accent, color: c.texte, cursor: 'pointer', fontWeight: 500,
  }
  const btnSecondary = {
    padding: '6px 12px', borderRadius: 8, fontSize: 12,
    border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer',
  }

  // Couleur du ratio : <30 vert, <35 orange clair, <40 orange, ≥40 rouge
  const ratioColor = totaux.ratio == null
    ? c.texteMuted
    : totaux.ratio < 30 ? '#15803D'
    : totaux.ratio < 35 ? '#CA8A04'
    : totaux.ratio < 40 ? '#C2410C'
    : '#B91C1C'

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ padding: isMobile ? 16 : 24, maxWidth: 1100, margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 600, color: c.texte }}>
          Ratio Food Cost
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: c.texteMuted }}>
          Coût matière sur CA Food. Inventaires début/fin + ajustements libres.
        </p>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* ── Période ───────────────────────────────────────────────────── */}
        <div style={card}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: c.texteMuted }}>
              Du
              <input type="date" value={periodeDebut} onChange={(e) => setPeriodeDebut(e.target.value)}
                style={{ ...input, width: 'auto', padding: '6px 10px' }} />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: c.texteMuted }}>
              au
              <input type="date" value={periodeFin} onChange={(e) => setPeriodeFin(e.target.value)}
                style={{ ...input, width: 'auto', padding: '6px 10px' }} />
            </label>
            {[
              { k: 'mois-en-cours',  label: 'Ce mois' },
              { k: 'mois-precedent', label: 'Mois préc.' },
              { k: '30j',            label: '30 j' },
              { k: 'trimestre',      label: 'Trimestre' },
              { k: 'annee',          label: 'Année' },
            ].map(p => (
              <button key={p.k} onClick={() => applyPreset(p.k)} style={btnSecondary}>{p.label}</button>
            ))}
          </div>
          {loading && <div style={{ fontSize: 12, color: c.texteMuted }}>Chargement des données…</div>}
        </div>

        {/* ── KPI ───────────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          <KpiCard label="CA Food HT" value={formatEuro(caFoodHt)} c={c} />
          <KpiCard label="Achats HT cumulés" value={formatEuro(achatsHt)} c={c} />
          <KpiCard label="Coût matière" value={formatEuro(totaux.coutMatiere)} c={c} sub={
            <span style={{ fontSize: 11, color: c.texteMuted }}>
              inv. début + achats − inv. fin + Σ ajust.
            </span>
          } />
          <KpiCard
            label="Ratio food cost"
            value={formatPct(totaux.ratio)}
            valueColor={ratioColor}
            c={c}
            sub={!hasInventaires ? (
              <span style={{ fontSize: 11, color: '#B45309' }}>⚠ inventaires manquants — ratio approximatif</span>
            ) : null}
          />
        </div>

        {/* ── Inventaires ──────────────────────────────────────────────── */}
        <div style={card}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: c.texte }}>
            Variation de stock
          </h3>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: c.texteMuted }}>
            Valeurs HT. Laisse vide si tu n&apos;as pas fait d&apos;inventaire physique.
            {savingInv && <span style={{ marginLeft: 8, fontStyle: 'italic' }}>· enregistrement…</span>}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, color: c.texteMuted, fontWeight: 500 }}>Inventaire début (HT €)</span>
              <input type="number" step="0.01" value={inventaireDebut} onChange={(e) => onInventaireDebutChange(e.target.value)} placeholder="ex. 12000.00" style={input} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, color: c.texteMuted, fontWeight: 500 }}>Inventaire fin (HT €)</span>
              <input type="number" step="0.01" value={inventaireFin} onChange={(e) => onInventaireFinChange(e.target.value)} placeholder="ex. 11500.00" style={input} />
            </label>
          </div>
        </div>

        {/* ── Ajustements ──────────────────────────────────────────────── */}
        <div style={card}>
          <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: c.texte }}>
            Ajustements
          </h3>
          <p style={{ margin: '0 0 14px', fontSize: 12, color: c.texteMuted }}>
            Montant signé : <strong>positif</strong> = ajout au coût (ex. transferts entrants), <strong>négatif</strong> = déduction (ex. repas staff, casse, cadeaux clients).
          </p>

          {ajustements.length > 0 && (
            <div style={{ overflowX: 'auto', marginBottom: 14, border: `1px solid ${c.bordure}`, borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: c.fond }}>
                    <th style={th(c)}>Libellé</th>
                    <th style={{ ...th(c), textAlign: 'right' }}>Montant</th>
                    <th style={th(c)}>Commentaire</th>
                    <th style={{ ...th(c), width: 60 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {ajustements.map((a) => (
                    <tr key={a.id}>
                      <td style={td(c)}>{a.libelle}</td>
                      <td style={{ ...td(c), textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: Number(a.montant) < 0 ? '#15803D' : '#B91C1C' }}>
                        {Number(a.montant) > 0 ? '+' : ''}{formatEuro(a.montant)}
                      </td>
                      <td style={{ ...td(c), color: c.texteMuted, fontSize: 12 }}>{a.commentaire || '—'}</td>
                      <td style={td(c)}>
                        <button onClick={() => deleteAjustement(a.id)} style={{ background: 'none', border: 'none', color: '#B91C1C', cursor: 'pointer', fontSize: 12 }}>Suppr.</button>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: c.fond, fontWeight: 600 }}>
                    <td style={td(c)}>Total ajustements</td>
                    <td style={{ ...td(c), textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {totaux.sumAjust > 0 ? '+' : ''}{formatEuro(totaux.sumAjust)}
                    </td>
                    <td style={td(c)} colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Form d'ajout */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 3fr auto', gap: 8, alignItems: 'end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: c.texteMuted, fontWeight: 500 }}>Libellé</span>
              <input value={newLibelle} onChange={(e) => setNewLibelle(e.target.value)} placeholder="ex. Repas staff" style={input} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: c.texteMuted, fontWeight: 500 }}>Montant (signé)</span>
              <input type="number" step="0.01" value={newMontant} onChange={(e) => setNewMontant(e.target.value)} placeholder="-350.00" style={input} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: c.texteMuted, fontWeight: 500 }}>Commentaire (optionnel)</span>
              <input value={newCommentaire} onChange={(e) => setNewCommentaire(e.target.value)} placeholder="précision" style={input} />
            </label>
            <button onClick={addAjustement} disabled={addingAjustement || !newLibelle.trim() || !newMontant} style={{ ...btnPrimary, opacity: (addingAjustement || !newLibelle.trim() || !newMontant) ? 0.6 : 1 }}>
              {addingAjustement ? '…' : '+ Ajouter'}
            </button>
          </div>
        </div>

        {/* ── Notes libres ─────────────────────────────────────────────── */}
        <div style={card}>
          <h3 style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600, color: c.texte }}>Notes</h3>
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder="Commentaire libre sur ce rapport food cost"
            rows={3}
            style={{ ...input, fontFamily: 'inherit', resize: 'vertical' }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Sous-composants ────────────────────────────────────────────────────────

function KpiCard({ label, value, valueColor, sub, c }) {
  return (
    <div style={{ background: c.blanc, borderRadius: 12, border: `0.5px solid ${c.bordure}`, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: c.texteMuted, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: valueColor || c.texte, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div style={{ marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

const th = (c) => ({
  padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11,
  color: c.texteMuted, textTransform: 'uppercase',
  borderBottom: `1px solid ${c.bordure}`, whiteSpace: 'nowrap',
})
const td = (c) => ({
  padding: '10px 12px', fontSize: 13, color: c.texte,
  borderBottom: `1px solid ${c.bordure}`,
})
