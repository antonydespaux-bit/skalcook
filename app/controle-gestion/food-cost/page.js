'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getClientId } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import { useRole } from '../../../lib/useRole'
import Navbar from '../../../components/Navbar'
import { getPeriodDates } from '../../../lib/caAnalyses'
import {
  buildFoodCostWorkbook,
  downloadFoodCostXlsx,
  buildFoodCostPrintHtml,
  openPrintWindow,
} from '../../../lib/foodCostExport'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatEuro(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

function formatPct(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(1)} %`
}

function formatDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

const MOIS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
function formatMonth(ym) {
  const [y, m] = ym.split('-')
  return `${MOIS_FR[Number(m) - 1]} ${y}`
}

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function defaultPeriod() {
  return getPeriodDates('mois-precedent')
}

// Debounce utilitaire — ref-based pour ne pas réinitialiser le timer à chaque render.
function useDebouncedCallback(fn, delay) {
  const timerRef = useRef(null)
  const fnRef = useRef(fn)
  useEffect(() => { fnRef.current = fn }, [fn])
  return useCallback((...args) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => fnRef.current(...args), delay)
  }, [delay])
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
  const [okMsg, setOkMsg] = useState('')

  // Mode : 'new' = brouillon non sauvegardé / 'edit' = rapport chargé depuis archive
  const [mode, setMode] = useState('new')
  const [currentRapportId, setCurrentRapportId] = useState(null)

  // Période + saisies
  const initial = useMemo(() => defaultPeriod(), [])
  const [periodeDebut, setPeriodeDebut] = useState(initial.debut)
  const [periodeFin, setPeriodeFin] = useState(initial.fin)
  const [inventaireDebut, setInventaireDebut] = useState('')
  const [inventaireFin, setInventaireFin] = useState('')
  const [notes, setNotes] = useState('')

  // Ajustements de la période courante (chargés par date)
  const [ajustements, setAjustements] = useState([])

  // Totaux calculés serveur
  const [caFoodHt, setCaFoodHt] = useState(0)
  const [achatsHt, setAchatsHt] = useState(0)

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [autosaving, setAutosaving] = useState(false)

  // Saisie nouvelle ligne d'ajustement
  const [newDate, setNewDate] = useState(todayIso())
  const [newLibelle, setNewLibelle] = useState('')
  const [newMontant, setNewMontant] = useState('')
  const [newCommentaire, setNewCommentaire] = useState('')
  const [addingAjustement, setAddingAjustement] = useState(false)

  // Édition inline d'un ajustement
  const [editingId, setEditingId] = useState(null)
  const [editDate, setEditDate] = useState('')
  const [editLibelle, setEditLibelle] = useState('')
  const [editMontant, setEditMontant] = useState('')
  const [editCommentaire, setEditCommentaire] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Archives
  const [archives, setArchives] = useState([])
  const [archivesLoading, setArchivesLoading] = useState(false)

  // Accordéon "Tous les ajustements"
  const [allAjustements, setAllAjustements] = useState([])
  const [allAjLoading, setAllAjLoading] = useState(false)
  const [allAjOpen, setAllAjOpen] = useState(false)
  const [expandedMonths, setExpandedMonths] = useState(() => new Set())

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

  // Helper : headers authentifiés
  const authHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }
  }, [])

  // ── Charge la preview (ajustements + totaux) pour la période en mode 'new'
  const loadPreview = useCallback(async (debut, fin) => {
    if (!clientId) return
    setLoading(true)
    setError('')
    try {
      const headers = await authHeaders()
      const url = new URL('/api/food-cost/preview', window.location.origin)
      url.searchParams.set('clientId', clientId)
      url.searchParams.set('periodeDebut', debut)
      url.searchParams.set('periodeFin', fin)
      const res = await fetch(url.toString(), { headers })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setAjustements(json.ajustements ?? [])
      setCaFoodHt(json.totaux.ca_food_ht)
      setAchatsHt(json.totaux.achats_ht)
    } catch (e) {
      setError(`Chargement impossible : ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [clientId, authHeaders])

  // ── Charge un rapport existant (mode 'edit')
  const loadRapport = useCallback(async (rapportId) => {
    if (!clientId || !rapportId) return
    setLoading(true)
    setError('')
    setOkMsg('')
    try {
      const headers = await authHeaders()
      const url = new URL('/api/food-cost/rapport', window.location.origin)
      url.searchParams.set('rapportId', rapportId)
      url.searchParams.set('clientId', clientId)
      const res = await fetch(url.toString(), { headers })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setMode('edit')
      setCurrentRapportId(rapportId)
      setPeriodeDebut(json.rapport.periode_debut)
      setPeriodeFin(json.rapport.periode_fin)
      setInventaireDebut(json.rapport.inventaire_debut_ht ?? '')
      setInventaireFin(json.rapport.inventaire_fin_ht ?? '')
      setNotes(json.rapport.notes ?? '')
      setAjustements(json.ajustements ?? [])
      setCaFoodHt(json.totaux.ca_food_ht)
      setAchatsHt(json.totaux.achats_ht)
    } catch (e) {
      setError(`Chargement impossible : ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [clientId, authHeaders])

  // ── Charge la liste des archives
  const loadArchives = useCallback(async () => {
    if (!clientId) return
    setArchivesLoading(true)
    try {
      const headers = await authHeaders()
      const url = new URL('/api/food-cost/rapports', window.location.origin)
      url.searchParams.set('clientId', clientId)
      const res = await fetch(url.toString(), { headers })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setArchives(json.rapports ?? [])
    } catch (e) {
      console.warn('Erreur chargement archives :', e?.message || e)
    } finally {
      setArchivesLoading(false)
    }
  }, [clientId, authHeaders])

  // ── Charge tous les ajustements du client (accordéon "Tous les ajustements")
  const loadAllAjustements = useCallback(async () => {
    if (!clientId) return
    setAllAjLoading(true)
    try {
      const headers = await authHeaders()
      const url = new URL('/api/food-cost/ajustements', window.location.origin)
      url.searchParams.set('clientId', clientId)
      const res = await fetch(url.toString(), { headers })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      const list = json.ajustements ?? []
      setAllAjustements(list)
      // Ouvre par défaut le mois le plus récent
      if (list.length > 0 && expandedMonths.size === 0) {
        setExpandedMonths(new Set([list[0].date_ajustement.slice(0, 7)]))
      }
    } catch (e) {
      console.warn('Erreur chargement ajustements :', e?.message || e)
    } finally {
      setAllAjLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, authHeaders])

  // Premier chargement : preview de la période par défaut + archives + tous les ajustements
  useEffect(() => {
    if (!authReady || !clientId) return
    loadPreview(periodeDebut, periodeFin)
    loadArchives()
    loadAllAjustements()
    // intentionnellement pas de [periodeDebut, periodeFin] ici — voir hook ci-dessous
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, clientId])

  // Refetch quand la période change
  useEffect(() => {
    if (!authReady || !clientId) return
    if (mode === 'new') loadPreview(periodeDebut, periodeFin)
    // en mode 'edit' : le patch de période recharge les ajustements lui-même
  }, [periodeDebut, periodeFin, mode, authReady, clientId, loadPreview])

  // ── Auto-save (mode 'edit') des inventaires + notes + période ──────────
  const patchRapport = useCallback(async (updates) => {
    if (!currentRapportId || !clientId) return
    setAutosaving(true)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/food-cost/rapport', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ rapportId: currentRapportId, clientId, ...updates }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      // Si la période a changé en mode 'edit', il faut recharger les ajustements
      // pour la nouvelle fenêtre.
      if (updates.periodeDebut || updates.periodeFin) {
        await loadPreview(updates.periodeDebut || periodeDebut, updates.periodeFin || periodeFin)
      }
    } catch (e) {
      setError(`Enregistrement impossible : ${e.message}`)
    } finally {
      setAutosaving(false)
    }
  }, [currentRapportId, clientId, authHeaders, loadPreview, periodeDebut, periodeFin])

  const debouncedPatch = useDebouncedCallback(patchRapport, 500)

  const onInventaireDebutChange = (v) => {
    setInventaireDebut(v)
    if (mode === 'edit') debouncedPatch({ inventaireDebutHt: v === '' ? null : Number(v) })
  }
  const onInventaireFinChange = (v) => {
    setInventaireFin(v)
    if (mode === 'edit') debouncedPatch({ inventaireFinHt: v === '' ? null : Number(v) })
  }
  const onNotesChange = (v) => {
    setNotes(v)
    if (mode === 'edit') debouncedPatch({ notes: v })
  }
  const onPeriodeDebutChange = (v) => {
    setPeriodeDebut(v)
    if (mode === 'edit') debouncedPatch({ periodeDebut: v })
  }
  const onPeriodeFinChange = (v) => {
    setPeriodeFin(v)
    if (mode === 'edit') debouncedPatch({ periodeFin: v })
  }

  // ── Boutons Nouveau / Sauvegarder / Supprimer rapport ──────────────────
  const handleNouveau = () => {
    setMode('new')
    setCurrentRapportId(null)
    const p = defaultPeriod()
    setPeriodeDebut(p.debut)
    setPeriodeFin(p.fin)
    setInventaireDebut('')
    setInventaireFin('')
    setNotes('')
    setError('')
    setOkMsg('')
  }

  const handleSauvegarder = async () => {
    if (!clientId) return
    setSaving(true)
    setError('')
    setOkMsg('')
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/food-cost/rapport', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clientId,
          periodeDebut,
          periodeFin,
          inventaireDebutHt: inventaireDebut === '' ? null : Number(inventaireDebut),
          inventaireFinHt: inventaireFin === '' ? null : Number(inventaireFin),
          notes,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)

      if (json.duplicate) {
        // Un rapport existe déjà → on le charge en mode 'edit'.
        await loadRapport(json.rapport_id)
        setOkMsg('Un rapport existait déjà pour cette période — chargé en édition.')
      } else {
        setMode('edit')
        setCurrentRapportId(json.rapport_id)
        setOkMsg('Rapport sauvegardé.')
      }
      await loadArchives()
    } catch (e) {
      setError(`Sauvegarde impossible : ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleSupprimerRapport = async () => {
    if (!currentRapportId || !clientId) return
    if (!window.confirm('Supprimer ce rapport food cost ? Les ajustements datés restent conservés.')) return
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/food-cost/rapport', {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ rapportId: currentRapportId, clientId }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      setOkMsg('Rapport supprimé.')
      handleNouveau()
      await loadArchives()
    } catch (e) {
      setError(`Suppression impossible : ${e.message}`)
    }
  }

  // ── Ajustements CRUD ───────────────────────────────────────────────────
  const addAjustement = async () => {
    if (!clientId) return
    const libelle = newLibelle.trim()
    const montant = Number(newMontant)
    if (!libelle) { setError('Libellé requis pour l\'ajustement.'); return }
    if (!Number.isFinite(montant)) { setError('Montant numérique requis.'); return }
    if (!newDate) { setError('Date requise pour l\'ajustement.'); return }
    setAddingAjustement(true)
    setError('')
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/food-cost/ajustement', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          clientId,
          rapportId: currentRapportId,
          dateAjustement: newDate,
          libelle,
          montant,
          commentaire: newCommentaire.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)

      // Inclure l'ajustement dans la liste de la période uniquement s'il tombe dedans.
      if (json.date_ajustement >= periodeDebut && json.date_ajustement <= periodeFin) {
        setAjustements(prev => [...prev, json].sort((a, b) => a.date_ajustement.localeCompare(b.date_ajustement)))
      }
      // Toujours mettre à jour la liste globale (ordre chrono décroissant)
      setAllAjustements(prev => [json, ...prev].sort((a, b) =>
        b.date_ajustement.localeCompare(a.date_ajustement) || b.created_at.localeCompare(a.created_at)
      ))
      setNewLibelle(''); setNewMontant(''); setNewCommentaire(''); setNewDate(todayIso())
    } catch (e) {
      setError(`Ajout impossible : ${e.message}`)
    } finally {
      setAddingAjustement(false)
    }
  }

  const startEditAjustement = (a) => {
    setEditingId(a.id)
    setEditDate(a.date_ajustement)
    setEditLibelle(a.libelle)
    setEditMontant(String(a.montant))
    setEditCommentaire(a.commentaire || '')
  }

  const cancelEditAjustement = () => {
    setEditingId(null)
    setEditDate(''); setEditLibelle(''); setEditMontant(''); setEditCommentaire('')
  }

  const saveEditAjustement = async () => {
    if (!editingId || !clientId) return
    const libelle = editLibelle.trim()
    const montant = Number(editMontant)
    if (!libelle) { setError('Libellé requis.'); return }
    if (!Number.isFinite(montant)) { setError('Montant numérique requis.'); return }
    if (!editDate) { setError('Date requise.'); return }
    setSavingEdit(true)
    setError('')
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/food-cost/ajustement', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          clientId,
          ajustementId: editingId,
          dateAjustement: editDate,
          libelle,
          montant,
          commentaire: editCommentaire.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)

      // L'ajustement reste-t-il dans la période courante ?
      const stillInPeriode = json.date_ajustement >= periodeDebut && json.date_ajustement <= periodeFin
      setAjustements(prev => {
        const filtered = prev.filter(a => a.id !== editingId)
        if (stillInPeriode) {
          return [...filtered, json].sort((a, b) => a.date_ajustement.localeCompare(b.date_ajustement))
        }
        return filtered
      })
      // Toujours synchroniser la liste globale
      setAllAjustements(prev => {
        const filtered = prev.filter(a => a.id !== editingId)
        return [...filtered, json].sort((a, b) =>
          b.date_ajustement.localeCompare(a.date_ajustement) || b.created_at.localeCompare(a.created_at)
        )
      })
      cancelEditAjustement()
    } catch (e) {
      setError(`Modification impossible : ${e.message}`)
    } finally {
      setSavingEdit(false)
    }
  }

  const deleteAjustement = async (id) => {
    if (!window.confirm('Supprimer cet ajustement ?')) return
    try {
      const headers = await authHeaders()
      await fetch(`/api/food-cost/ajustement?ajustementId=${id}&clientId=${clientId}`, {
        method: 'DELETE',
        headers,
      })
      setAjustements(prev => prev.filter(a => a.id !== id))
      setAllAjustements(prev => prev.filter(a => a.id !== id))
    } catch (e) {
      setError(`Suppression impossible : ${e.message}`)
    }
  }

  // ── Exports Excel / PDF ────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false)

  const fetchExportData = useCallback(async () => {
    const headers = await authHeaders()
    const url = new URL('/api/food-cost/export-data', window.location.origin)
    url.searchParams.set('clientId', clientId)
    url.searchParams.set('periodeDebut', periodeDebut)
    url.searchParams.set('periodeFin', periodeFin)
    const res = await fetch(url.toString(), { headers })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
    return json
  }, [authHeaders, clientId, periodeDebut, periodeFin])

  const handleExportExcel = async () => {
    if (!clientId) return
    setExporting(true)
    setError(''); setOkMsg('')
    try {
      const data = await fetchExportData()
      const wb = await buildFoodCostWorkbook({
        periodeDebut,
        periodeFin,
        caFoodHt: data.totaux.ca_food_ht,
        achatsHt: data.totaux.achats_ht,
        inventaireDebut,
        inventaireFin,
        notes,
        factures: data.factures,
        ajustements: data.ajustements,
      })
      await downloadFoodCostXlsx(wb, `food-cost_${periodeDebut}_${periodeFin}.xlsx`)
      setOkMsg('Export Excel téléchargé.')
    } catch (e) {
      setError(`Export Excel impossible : ${e.message}`)
    } finally {
      setExporting(false)
    }
  }

  const handlePrintPdf = async () => {
    if (!clientId) return
    setExporting(true)
    setError(''); setOkMsg('')
    try {
      const data = await fetchExportData()
      const html = buildFoodCostPrintHtml({
        periodeDebut,
        periodeFin,
        caFoodHt: data.totaux.ca_food_ht,
        achatsHt: data.totaux.achats_ht,
        inventaireDebut,
        inventaireFin,
        notes,
        factures: data.factures,
        ajustements: data.ajustements,
      })
      openPrintWindow(html)
    } catch (e) {
      setError(`Impression impossible : ${e.message}`)
    } finally {
      setExporting(false)
    }
  }

  // ── Presets de période ─────────────────────────────────────────────────
  const applyPreset = (k) => {
    const p = getPeriodDates(k)
    if (!p) return
    onPeriodeDebutChange(p.debut)
    onPeriodeFinChange(p.fin)
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

  // Groupement par mois pour l'accordéon "Tous les ajustements"
  const ajustementsParMois = useMemo(() => {
    const groups = new Map() // "YYYY-MM" → { lignes: [], total: 0 }
    for (const a of allAjustements) {
      const ym = a.date_ajustement.slice(0, 7)
      if (!groups.has(ym)) groups.set(ym, { lignes: [], total: 0 })
      const g = groups.get(ym)
      g.lignes.push(a)
      g.total += Number(a.montant) || 0
    }
    // Map → array trié par mois décroissant (déjà dans le bon ordre car allAjustements est trié desc)
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [allAjustements])

  const toggleMonth = (ym) => {
    setExpandedMonths(prev => {
      const next = new Set(prev)
      if (next.has(ym)) next.delete(ym)
      else next.add(ym)
      return next
    })
  }

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
  const btnDanger = {
    padding: '8px 14px', borderRadius: 8, fontSize: 13, border: `1px solid #FECACA`,
    background: '#FEF2F2', color: '#B91C1C', cursor: 'pointer', fontWeight: 500,
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
      <div style={{ padding: isMobile ? 16 : 24, maxWidth: 1300, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 600, color: c.texte }}>
              Ratio Food Cost
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: c.texteMuted }}>
              {mode === 'edit'
                ? `Rapport sauvegardé · ${formatDate(periodeDebut)} → ${formatDate(periodeFin)}`
                : 'Nouveau rapport (brouillon non sauvegardé)'}
              {autosaving && <span style={{ marginLeft: 8, fontStyle: 'italic' }}>· enregistrement…</span>}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={handleExportExcel} disabled={exporting} style={{ ...btnSecondary, opacity: exporting ? 0.6 : 1 }}>
              {exporting ? '…' : '⬇ Excel'}
            </button>
            <button onClick={handlePrintPdf} disabled={exporting} style={{ ...btnSecondary, opacity: exporting ? 0.6 : 1 }}>
              {exporting ? '…' : '🖨 Imprimer / PDF'}
            </button>
            {mode === 'edit' && (
              <button onClick={handleNouveau} style={btnSecondary}>Nouveau</button>
            )}
            {mode === 'new' ? (
              <button onClick={handleSauvegarder} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>
                {saving ? '…' : '💾 Sauvegarder'}
              </button>
            ) : (
              <button onClick={handleSupprimerRapport} style={btnDanger}>Supprimer</button>
            )}
          </div>
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}
        {okMsg && (
          <div style={{ background: '#DCFCE7', color: '#166534', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
            {okMsg}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 280px', gap: 16, alignItems: 'flex-start' }}>
          {/* ── Colonne principale ─────────────────────────────────────── */}
          <div>
            {/* Période */}
            <div style={card}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: c.texteMuted }}>
                  Du
                  <input type="date" value={periodeDebut} onChange={(e) => onPeriodeDebutChange(e.target.value)}
                    style={{ ...input, width: 'auto', padding: '6px 10px' }} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: c.texteMuted }}>
                  au
                  <input type="date" value={periodeFin} onChange={(e) => onPeriodeFinChange(e.target.value)}
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

            {/* KPI */}
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

            {/* Inventaires */}
            <div style={card}>
              <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: c.texte }}>
                Variation de stock
              </h3>
              <p style={{ margin: '0 0 14px', fontSize: 12, color: c.texteMuted }}>
                Valeurs HT. Laisse vide si tu n&apos;as pas fait d&apos;inventaire physique.
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

            {/* Ajustements */}
            <div style={card}>
              <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: c.texte }}>
                Ajustements
              </h3>
              <p style={{ margin: '0 0 14px', fontSize: 12, color: c.texteMuted }}>
                Chaque ajustement est daté et persistant. Il est inclus dans tout rapport dont la période couvre sa date.
                Montant signé : <strong>positif</strong> = ajout au coût (transferts entrants), <strong>négatif</strong> = déduction (repas staff, casse, cadeaux).
              </p>

              {ajustements.length > 0 && (
                <div style={{ overflowX: 'auto', marginBottom: 14, border: `1px solid ${c.bordure}`, borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: c.fond }}>
                        <th style={{ ...th(c), width: 110 }}>Date</th>
                        <th style={th(c)}>Libellé</th>
                        <th style={{ ...th(c), textAlign: 'right', width: 120 }}>Montant</th>
                        <th style={th(c)}>Commentaire</th>
                        <th style={{ ...th(c), width: 130 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ajustements.map((a) => editingId === a.id ? (
                        <tr key={a.id} style={{ background: c.fond }}>
                          <td style={td(c)}>
                            <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} style={{ ...input, padding: '4px 8px', fontSize: 12 }} />
                          </td>
                          <td style={td(c)}>
                            <input value={editLibelle} onChange={(e) => setEditLibelle(e.target.value)} style={{ ...input, padding: '4px 8px', fontSize: 12 }} />
                          </td>
                          <td style={td(c)}>
                            <input type="number" step="0.01" value={editMontant} onChange={(e) => setEditMontant(e.target.value)} style={{ ...input, padding: '4px 8px', fontSize: 12, textAlign: 'right' }} />
                          </td>
                          <td style={td(c)}>
                            <input value={editCommentaire} onChange={(e) => setEditCommentaire(e.target.value)} style={{ ...input, padding: '4px 8px', fontSize: 12 }} />
                          </td>
                          <td style={td(c)}>
                            <button onClick={saveEditAjustement} disabled={savingEdit} style={{ background: 'none', border: 'none', color: '#15803D', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>
                              {savingEdit ? '…' : 'OK'}
                            </button>
                            <button onClick={cancelEditAjustement} style={{ background: 'none', border: 'none', color: c.texteMuted, cursor: 'pointer', fontSize: 12 }}>Annuler</button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={a.id}>
                          <td style={{ ...td(c), fontSize: 12, color: c.texteMuted }}>{formatDate(a.date_ajustement)}</td>
                          <td style={td(c)}>{a.libelle}</td>
                          <td style={{ ...td(c), textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: Number(a.montant) < 0 ? '#15803D' : '#B91C1C' }}>
                            {Number(a.montant) > 0 ? '+' : ''}{formatEuro(a.montant)}
                          </td>
                          <td style={{ ...td(c), color: c.texteMuted, fontSize: 12 }}>{a.commentaire || '—'}</td>
                          <td style={td(c)}>
                            <button onClick={() => startEditAjustement(a)} style={{ background: 'none', border: 'none', color: c.texte, cursor: 'pointer', fontSize: 12, marginRight: 8 }}>Modifier</button>
                            <button onClick={() => deleteAjustement(a.id)} style={{ background: 'none', border: 'none', color: '#B91C1C', cursor: 'pointer', fontSize: 12 }}>Suppr.</button>
                          </td>
                        </tr>
                      ))}
                      <tr style={{ background: c.fond, fontWeight: 600 }}>
                        <td style={td(c)} colSpan={2}>Total ajustements</td>
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
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '110px 2fr 1fr 3fr auto', gap: 8, alignItems: 'end' }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11, color: c.texteMuted, fontWeight: 500 }}>Date</span>
                  <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={input} />
                </label>
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
                <button onClick={addAjustement} disabled={addingAjustement || !newLibelle.trim() || !newMontant || !newDate} style={{ ...btnPrimary, opacity: (addingAjustement || !newLibelle.trim() || !newMontant || !newDate) ? 0.6 : 1 }}>
                  {addingAjustement ? '…' : '+ Ajouter'}
                </button>
              </div>
            </div>

            {/* Notes */}
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

            {/* Accordéon : Tous les ajustements (toutes périodes confondues) */}
            <div style={card}>
              <button
                onClick={() => setAllAjOpen(o => !o)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: c.texte,
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 600 }}>
                  {allAjOpen ? '▾' : '▸'}  Tous les ajustements
                  <span style={{ marginLeft: 8, fontSize: 12, color: c.texteMuted, fontWeight: 400 }}>
                    ({allAjustements.length})
                  </span>
                </span>
                <span style={{ fontSize: 12, color: c.texteMuted }}>
                  {allAjOpen ? 'Replier' : 'Déplier'}
                </span>
              </button>

              {allAjOpen && (
                <div style={{ marginTop: 14 }}>
                  {allAjLoading ? (
                    <div style={{ fontSize: 12, color: c.texteMuted }}>Chargement…</div>
                  ) : ajustementsParMois.length === 0 ? (
                    <div style={{ fontSize: 12, color: c.texteMuted, fontStyle: 'italic' }}>
                      Aucun ajustement enregistré pour ce client.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {ajustementsParMois.map(([ym, group]) => {
                        const isOpen = expandedMonths.has(ym)
                        return (
                          <div key={ym} style={{ border: `1px solid ${c.bordure}`, borderRadius: 8, overflow: 'hidden' }}>
                            <button
                              onClick={() => toggleMonth(ym)}
                              style={{
                                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                background: c.fond, border: 'none', padding: '10px 14px', cursor: 'pointer', color: c.texte,
                              }}
                            >
                              <span style={{ fontSize: 13, fontWeight: 600 }}>
                                {isOpen ? '▾' : '▸'}  {formatMonth(ym)}
                                <span style={{ marginLeft: 8, fontSize: 11, color: c.texteMuted, fontWeight: 400 }}>
                                  · {group.lignes.length} ligne{group.lignes.length > 1 ? 's' : ''}
                                </span>
                              </span>
                              <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', color: group.total < 0 ? '#15803D' : group.total > 0 ? '#B91C1C' : c.texteMuted }}>
                                {group.total > 0 ? '+' : ''}{formatEuro(group.total)}
                              </span>
                            </button>
                            {isOpen && (
                              <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                  <thead>
                                    <tr>
                                      <th style={{ ...th(c), width: 110 }}>Date</th>
                                      <th style={th(c)}>Libellé</th>
                                      <th style={{ ...th(c), textAlign: 'right', width: 120 }}>Montant</th>
                                      <th style={th(c)}>Commentaire</th>
                                      <th style={{ ...th(c), width: 130 }}></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {group.lignes.map((a) => editingId === a.id ? (
                                      <tr key={a.id} style={{ background: c.fond }}>
                                        <td style={td(c)}>
                                          <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} style={{ ...input, padding: '4px 8px', fontSize: 12 }} />
                                        </td>
                                        <td style={td(c)}>
                                          <input value={editLibelle} onChange={(e) => setEditLibelle(e.target.value)} style={{ ...input, padding: '4px 8px', fontSize: 12 }} />
                                        </td>
                                        <td style={td(c)}>
                                          <input type="number" step="0.01" value={editMontant} onChange={(e) => setEditMontant(e.target.value)} style={{ ...input, padding: '4px 8px', fontSize: 12, textAlign: 'right' }} />
                                        </td>
                                        <td style={td(c)}>
                                          <input value={editCommentaire} onChange={(e) => setEditCommentaire(e.target.value)} style={{ ...input, padding: '4px 8px', fontSize: 12 }} />
                                        </td>
                                        <td style={td(c)}>
                                          <button onClick={saveEditAjustement} disabled={savingEdit} style={{ background: 'none', border: 'none', color: '#15803D', cursor: 'pointer', fontSize: 12, marginRight: 6 }}>
                                            {savingEdit ? '…' : 'OK'}
                                          </button>
                                          <button onClick={cancelEditAjustement} style={{ background: 'none', border: 'none', color: c.texteMuted, cursor: 'pointer', fontSize: 12 }}>Annuler</button>
                                        </td>
                                      </tr>
                                    ) : (
                                      <tr key={a.id}>
                                        <td style={{ ...td(c), fontSize: 12, color: c.texteMuted }}>{formatDate(a.date_ajustement)}</td>
                                        <td style={td(c)}>{a.libelle}</td>
                                        <td style={{ ...td(c), textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: Number(a.montant) < 0 ? '#15803D' : '#B91C1C' }}>
                                          {Number(a.montant) > 0 ? '+' : ''}{formatEuro(a.montant)}
                                        </td>
                                        <td style={{ ...td(c), color: c.texteMuted, fontSize: 12 }}>{a.commentaire || '—'}</td>
                                        <td style={td(c)}>
                                          <button onClick={() => startEditAjustement(a)} style={{ background: 'none', border: 'none', color: c.texte, cursor: 'pointer', fontSize: 12, marginRight: 8 }}>Modifier</button>
                                          <button onClick={() => deleteAjustement(a.id)} style={{ background: 'none', border: 'none', color: '#B91C1C', cursor: 'pointer', fontSize: 12 }}>Suppr.</button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Sidebar Archives ───────────────────────────────────────── */}
          <div style={{ ...card, position: isMobile ? 'static' : 'sticky', top: 16, marginBottom: 0 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: c.texte, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Historique
            </h3>
            {archivesLoading ? (
              <div style={{ fontSize: 12, color: c.texteMuted }}>Chargement…</div>
            ) : archives.length === 0 ? (
              <div style={{ fontSize: 12, color: c.texteMuted, fontStyle: 'italic' }}>
                Aucun rapport sauvegardé. Saisis une période et clique sur « Sauvegarder » pour démarrer ton historique.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: isMobile ? 'none' : 'calc(100vh - 220px)', overflowY: 'auto' }}>
                {archives.map((r) => (
                  <ArchiveRow
                    key={r.id}
                    c={c}
                    rapport={r}
                    active={r.id === currentRapportId}
                    onLoad={() => loadRapport(r.id)}
                  />
                ))}
              </div>
            )}
          </div>
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

function ArchiveRow({ c, rapport, active, onLoad }) {
  const [d, m, y] = formatDateParts(rapport.periode_debut)
  const [d2, m2, y2] = formatDateParts(rapport.periode_fin)
  const sameYear = y === y2
  const label = sameYear
    ? `${d}/${m} → ${d2}/${m2}/${y2}`
    : `${d}/${m}/${y} → ${d2}/${m2}/${y2}`
  const hasInv = rapport.inventaire_debut_ht != null && rapport.inventaire_fin_ht != null
  return (
    <button
      onClick={onLoad}
      style={{
        textAlign: 'left',
        padding: '8px 10px',
        borderRadius: 8,
        border: active ? `1px solid ${c.accent}` : `1px solid ${c.bordure}`,
        background: active ? c.fond : c.blanc,
        color: c.texte,
        cursor: 'pointer',
        fontSize: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 11, color: c.texteMuted }}>
        {hasInv ? 'Inventaires complets' : 'Inventaires partiels'}
        {rapport.notes ? ' · note' : ''}
      </span>
    </button>
  )
}

function formatDateParts(iso) {
  if (!iso) return ['—', '—', '—']
  return iso.split('-').reverse()
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
