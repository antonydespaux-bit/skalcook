'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import * as XLSX from 'xlsx'
import { supabase, getClientId } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import { useRole } from '../../../lib/useRole'
import { badgeStyleFor, statutLabel } from '../../../lib/achatsHelpers'
import Navbar from '../../../components/Navbar'

function formatEuro(n) {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

function formatDate(s) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('fr-FR')
}

// Cellule d'en-tête cliquable pour trier sur la colonne `col`. Affiche un
// indicateur visuel (▲ asc, ▼ desc, ↕ inactif) à droite du libellé.
function SortHeader({ col, label, baseStyle, sortBy, sortDir, onSort, c, right = false }) {
  const active = sortBy === col
  return (
    <th
      onClick={() => onSort(col)}
      style={{
        ...baseStyle,
        cursor: 'pointer',
        userSelect: 'none',
        color: active ? c.texte : baseStyle.color,
      }}
      title={`Trier par ${label.toLowerCase()}`}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: right ? 'flex-end' : 'flex-start', width: '100%' }}>
        {label}
        <span style={{ fontSize: 9, opacity: active ? 1 : 0.35 }}>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </span>
    </th>
  )
}


// Statuts par défaut (tous actifs) — utilisés pour décider si on omet le
// param d'URL `statuts` (cas neutre).
const STATUTS_DEFAUT = ['bl', 'facture', 'avoir']

export default function AchatsListPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isMobile = useIsMobile()
  const { c } = useTheme()

  const { role, loading: roleLoading } = useRole()
  const [authReady, setAuthReady] = useState(false)
  const [clientId, setClientId] = useState(null)
  const [factures, setFactures] = useState([])
  const [nbLignesByFacture, setNbLignesByFacture] = useState({})
  const [tvaByFacture, setTvaByFacture] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Filtres + tri : initialisés depuis l'URL pour que le retour navigateur
  // (← Back) restaure naturellement l'état après être allé voir une facture.
  // Ne pas mettre searchParams en dépendance de useState : le lazy initializer
  // ne tourne qu'au premier mount, ce qui est exactement ce qu'on veut
  // (remount = page revisitée = re-init depuis l'URL fraîche).
  const [recherche, setRecherche] = useState(() => searchParams.get('q') || '')
  const [dateDebut, setDateDebut] = useState(() => searchParams.get('du') || '')
  const [dateFin, setDateFin] = useState(() => searchParams.get('au') || '')
  const [statutsActifs, setStatutsActifs] = useState(() => {
    const s = searchParams.get('statuts')
    if (!s) return STATUTS_DEFAUT
    const parsed = s.split(',').filter(v => STATUTS_DEFAUT.includes(v))
    return parsed.length > 0 ? parsed : STATUTS_DEFAUT
  })
  const [deleting, setDeleting] = useState(null)
  const [exporting, setExporting] = useState(false)
  // Sélection multi-BL pour fusion en une facture consolidée.
  // Set des id de BL cochés. Modal de fusion conditionnée à ≥ 2 sélectionnés.
  const [selectedBlIds, setSelectedBlIds] = useState(() => new Set())
  const [fusionModalOpen, setFusionModalOpen] = useState(false)
  const [fusionning, setFusionning] = useState(false)
  // Tri : colonne active + sens. Par défaut : date décroissante (= comportement
  // du .order() côté query Supabase).
  const [sortBy, setSortBy] = useState(() => searchParams.get('tri') || 'date_facture')
  const [sortDir, setSortDir] = useState(() => searchParams.get('sens') === 'asc' ? 'asc' : 'desc')

  // Synchronise les filtres vers l'URL (sans entrée d'historique supplémentaire
  // pour ne pas spammer le bouton back). Le retour depuis une facture remontera
  // le composant avec ces query params → state ré-initialisé correctement.
  useEffect(() => {
    const params = new URLSearchParams()
    if (recherche) params.set('q', recherche)
    if (dateDebut) params.set('du', dateDebut)
    if (dateFin) params.set('au', dateFin)
    const allStatuts =
      statutsActifs.length === STATUTS_DEFAUT.length
      && STATUTS_DEFAUT.every(s => statutsActifs.includes(s))
    if (!allStatuts) params.set('statuts', statutsActifs.join(','))
    if (sortBy !== 'date_facture') params.set('tri', sortBy)
    if (sortDir !== 'desc') params.set('sens', sortDir)

    const qs = params.toString()
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    if (newUrl !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, '', newUrl)
    }
  }, [recherche, dateDebut, dateFin, statutsActifs, sortBy, sortDir])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return
        if (!session) { router.replace('/'); return }
        setAuthReady(true)
      } catch {
        if (!cancelled) router.replace('/')
      }
    })()
    return () => { cancelled = true }
  }, [router])

  // Section consultable par tous les membres de l'établissement.
  // Les actions de modification sont gardees par `role === 'admin'` ci-dessous.

  const loadFactures = useCallback(async () => {
    setLoading(true)
    setError('')
    const cid = await getClientId()
    if (!cid) { setLoading(false); return }
    setClientId(cid)

    const { data: rows, error: fErr } = await supabase
      .from('achats_factures')
      .select('id, fournisseur, numero_facture, date_facture, total_ht, taux_tva, montant_tva, statut, facture_consolidee_id, created_at')
      .eq('client_id', cid)
      .is('deleted_at', null)
      .order('date_facture', { ascending: false })

    if (fErr) {
      setError(fErr.message)
      setLoading(false)
      return
    }

    const ids = (rows || []).map((r) => r.id)
    let counts = {}
    let tvaCalculeeByFacture = {}
    if (ids.length > 0) {
      const { data: lignes } = await supabase
        .from('achats_lignes')
        .select('facture_id, montant_ht, taux_tva')
        .in('facture_id', ids)
        .eq('client_id', cid)
      const tauxGlobalById = Object.fromEntries((rows || []).map(r => [r.id, Number(r.taux_tva) || 0]))
      for (const l of (lignes || [])) {
        counts[l.facture_id] = (counts[l.facture_id] || 0) + 1
        const taux = l.taux_tva != null ? Number(l.taux_tva) : tauxGlobalById[l.facture_id] || 0
        tvaCalculeeByFacture[l.facture_id] = (tvaCalculeeByFacture[l.facture_id] || 0) + (Number(l.montant_ht) || 0) * taux / 100
      }
    }
    // Si la facture a un montant_tva saisi, il prime sur le calcul.
    const tvaByFacture = {}
    for (const r of rows || []) {
      tvaByFacture[r.id] = r.montant_tva != null ? Number(r.montant_tva) : (tvaCalculeeByFacture[r.id] || 0)
    }

    setFactures(rows || [])
    setNbLignesByFacture(counts)
    setTvaByFacture(tvaByFacture)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!authReady) return
    loadFactures()
  }, [authReady, loadFactures])

  const handleExport = async () => {
    if (!clientId) return
    setExporting(true)
    setError('')
    try {
      if (facturesFiltrees.length === 0) {
        setError('Aucune facture à exporter.')
        return
      }
      // Pied de facture : 1 ligne = 1 facture, avec HT / TVA / TTC.
      // Le champ TVA est calculé en respectant les taux par ligne (déjà agrégé
      // dans tvaByFacture au load).
      const rows = facturesFiltrees.map((f) => {
        const ht  = Number(f.total_ht) || 0
        const tva = tvaByFacture[f.id] || 0
        return {
          'N° facture':   f.numero_facture || '',
          'Date':         f.date_facture || '',
          'Fournisseur':  f.fournisseur || '',
          'Statut':       statutLabel(f.statut),
          'HT':           ht,
          'TVA':          tva,
          'TTC':          ht + tva,
        }
      })

      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [
        { wch: 14 }, { wch: 12 }, { wch: 28 }, { wch: 9  },
        { wch: 12 }, { wch: 12 }, { wch: 12 },
      ]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Factures')
      const today = new Date().toISOString().slice(0, 10)
      XLSX.writeFile(wb, `achats_${today}.xlsx`)
    } catch (err) {
      setError(`Export impossible : ${err.message}`)
    } finally {
      setExporting(false)
    }
  }

  // Toggle d'une case BL. Garantit qu'on ne coche que des BL non fusionnés.
  const toggleSelect = (id, e) => {
    e.stopPropagation()
    setSelectedBlIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const clearSelection = () => setSelectedBlIds(new Set())

  // Stats sur la sélection courante : nb, fournisseurs distincts, totaux.
  const selectedBls = factures.filter((f) => selectedBlIds.has(f.id))
  const selectedFournisseurs = [...new Set(selectedBls.map((b) => (b.fournisseur || '').trim().toLowerCase()).filter(Boolean))]
  const sameFournisseur = selectedFournisseurs.length <= 1
  const selectedTotalHt = selectedBls.reduce((s, b) => s + (Number(b.total_ht) || 0), 0)
  const selectedTotalTva = selectedBls.reduce((s, b) => s + (tvaByFacture[b.id] || 0), 0)

  const handleFusion = async (numero, date, totalHt, montantTva) => {
    if (!clientId || selectedBlIds.size < 2) return
    setFusionning(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/achats/fusionner-bl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          clientId,
          blIds: [...selectedBlIds],
          numeroFacture: numero,
          dateFacture: date,
          totalHt,
          montantTva: montantTva ?? null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || j.message || 'Erreur lors de la fusion')
      }
      const result = await res.json()
      setFusionModalOpen(false)
      clearSelection()
      await loadFactures()
      // Redirige vers la facture créée pour vérif rapide
      if (result.facture_id) router.push(`/controle-gestion/achats/${result.facture_id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setFusionning(false)
    }
  }

  const handleDelete = async (f, e) => {
    e.stopPropagation()
    if (!window.confirm(`Supprimer la facture ${f.numero_facture || f.fournisseur} ? Cette action est irréversible.`)) return
    setDeleting(f.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/achats/delete-facture?factureId=${f.id}&clientId=${clientId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok) await loadFactures()
      else setError('Erreur lors de la suppression.')
    } finally {
      setDeleting(null)
    }
  }

  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
        Chargement…
      </div>
    )
  }

  const applyPreset = (preset) => {
    const today = new Date()
    const iso = (d) => d.toISOString().slice(0, 10)
    if (preset === 'mois') {
      const debut = new Date(today.getFullYear(), today.getMonth(), 1)
      setDateDebut(iso(debut))
      setDateFin(iso(today))
    } else if (preset === 'mois-precedent') {
      const debut = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const fin = new Date(today.getFullYear(), today.getMonth(), 0)
      setDateDebut(iso(debut))
      setDateFin(iso(fin))
    } else if (preset === '30j') {
      const debut = new Date(today)
      debut.setDate(debut.getDate() - 30)
      setDateDebut(iso(debut))
      setDateFin(iso(today))
    } else if (preset === '90j') {
      const debut = new Date(today)
      debut.setDate(debut.getDate() - 90)
      setDateDebut(iso(debut))
      setDateFin(iso(today))
    } else if (preset === 'annee') {
      setDateDebut(`${today.getFullYear()}-01-01`)
      setDateFin(iso(today))
    } else {
      setDateDebut('')
      setDateFin('')
    }
  }

  const facturesFiltrees = factures.filter((f) => {
    // Filtre texte
    if (recherche.trim()) {
      const q = recherche.toLowerCase()
      const match = (
        (f.fournisseur || '').toLowerCase().includes(q) ||
        (f.numero_facture || '').toLowerCase().includes(q)
      )
      if (!match) return false
    }
    // Filtre date (sur date_facture)
    if (dateDebut && (!f.date_facture || f.date_facture < dateDebut)) return false
    if (dateFin && (!f.date_facture || f.date_facture > dateFin)) return false
    // Filtre statut
    const s = f.statut || 'facture'
    if (!statutsActifs.includes(s)) return false
    return true
  })

  const toggleStatut = (k) => {
    setStatutsActifs((prev) => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])
  }

  // Sens par défaut pour chaque colonne (asc pour les textes, desc pour les
  // dates et montants, où on veut voir le plus récent / le plus gros en premier).
  const DEFAULT_SORT_DIR = {
    fournisseur: 'asc',
    numero_facture: 'asc',
    date_facture: 'desc',
    statut: 'asc',
    articles: 'desc',
    ht: 'desc',
    tva: 'desc',
    ttc: 'desc',
  }

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(col)
      setSortDir(DEFAULT_SORT_DIR[col] || 'asc')
    }
  }

  // Pas de useMemo / useCallback ici : on est placés après un early return
  // conditionnel (auth), les hooks ne peuvent pas être appelés. Le tri reste
  // peu coûteux à recalculer à chaque render (~quelques dizaines de factures).
  const getSortValue = (f, col) => {
    switch (col) {
      case 'fournisseur':    return (f.fournisseur || '').toLowerCase()
      case 'numero_facture': return (f.numero_facture || '').toLowerCase()
      case 'date_facture':   return f.date_facture || ''
      case 'statut':         return f.statut || 'facture'
      case 'articles':       return nbLignesByFacture[f.id] ?? 0
      case 'ht':             return Number(f.total_ht) || 0
      case 'tva':            return tvaByFacture[f.id] || 0
      case 'ttc':            return (Number(f.total_ht) || 0) + (tvaByFacture[f.id] || 0)
      default:               return ''
    }
  }

  const facturesAffichees = [...facturesFiltrees].sort((a, b) => {
    const va = getSortValue(a, sortBy)
    const vb = getSortValue(b, sortBy)
    let cmp
    if (typeof va === 'number' && typeof vb === 'number') {
      cmp = va - vb
    } else {
      cmp = String(va).localeCompare(String(vb), 'fr', { numeric: true, sensitivity: 'base' })
    }
    return sortDir === 'asc' ? cmp : -cmp
  })

  const totalHT = facturesAffichees.reduce((s, f) => s + (Number(f.total_ht) || 0), 0)
  const totalTVA = facturesAffichees.reduce((s, f) => s + (tvaByFacture[f.id] || 0), 0)
  const totalTTC = totalHT + totalTVA

  const th = {
    padding: isMobile ? '10px 8px' : '11px 14px',
    textAlign: 'left', fontWeight: 600, fontSize: 11,
    color: c.texteMuted, textTransform: 'uppercase',
    borderBottom: `1px solid ${c.bordure}`, whiteSpace: 'nowrap',
  }
  const thR = { ...th, textAlign: 'right' }
  const td = {
    padding: isMobile ? '11px 8px' : '13px 14px',
    fontSize: 14, color: c.texte,
    borderBottom: `1px solid ${c.bordure}`,
  }
  const tdR = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  const tdM = { ...tdR, color: c.texteMuted }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1200px', margin: '0 auto' }}>

        {/* En-tête */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 600, color: c.texte }}>
              Achats
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: c.texteMuted }}>
              Historique des factures importées
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => router.push('/controle-gestion/fournisseurs')}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 13,
                border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer',
              }}
            >
              🏢 Fournisseurs
            </button>
            <button
              onClick={() => router.push('/controle-gestion/mercuriale')}
              title="Comparer les prix d'achat d'un même article chez plusieurs fournisseurs"
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 13,
                border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer',
              }}
            >
              📊 Comparaison prix
            </button>
            <button
              onClick={handleExport}
              disabled={exporting || facturesFiltrees.length === 0}
              title={facturesFiltrees.length === 0 ? 'Aucune facture à exporter' : 'Exporter les factures filtrées en Excel'}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 13,
                border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte,
                cursor: exporting || facturesFiltrees.length === 0 ? 'not-allowed' : 'pointer',
                opacity: exporting || facturesFiltrees.length === 0 ? 0.6 : 1,
              }}
            >
              {exporting ? 'Export…' : '⬇ Exporter Excel'}
            </button>
            {role === 'admin' && (
              <>
                <button
                  onClick={() => router.push('/controle-gestion/achats/import?mode=manuel')}
                  style={{
                    padding: '8px 14px', borderRadius: 8, fontSize: 13,
                    border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer',
                  }}
                >
                  ✏️ Saisir manuellement
                </button>
                <button
                  onClick={() => router.push('/controle-gestion/achats/import-excel')}
                  title="Import en masse depuis un Excel (pied de facture)"
                  style={{
                    padding: '8px 14px', borderRadius: 8, fontSize: 13,
                    border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer',
                  }}
                >
                  📊 Importer Excel
                </button>
                <button
                  onClick={() => router.push('/controle-gestion/achats/import')}
                  style={{
                    padding: '8px 14px', borderRadius: 8, fontSize: 13,
                    border: 'none', background: c.accent, color: c.texte, cursor: 'pointer', fontWeight: 500,
                  }}
                >
                  + Importer (OCR)
                </button>
              </>
            )}
          </div>
        </div>

        {/* Barre de recherche */}
        <input
          type="search"
          placeholder="Rechercher par fournisseur ou n° facture…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '9px 14px', borderRadius: 8, fontSize: 13,
            border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte,
            marginBottom: 10, outline: 'none',
          }}
        />

        {/* Filtre par date */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.texteMuted }}>
            Du
            <input
              type="date"
              value={dateDebut}
              onChange={(e) => setDateDebut(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, fontSize: 13, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, outline: 'none' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.texteMuted }}>
            au
            <input
              type="date"
              value={dateFin}
              onChange={(e) => setDateFin(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, fontSize: 13, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, outline: 'none' }}
            />
          </label>
          {[
            { k: 'mois',           label: 'Ce mois' },
            { k: 'mois-precedent', label: 'Mois préc.' },
            { k: '30j',            label: '30 j' },
            { k: '90j',            label: '90 j' },
            { k: 'annee',          label: 'Année' },
          ].map((p) => (
            <button
              key={p.k}
              onClick={() => applyPreset(p.k)}
              style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer' }}
            >
              {p.label}
            </button>
          ))}
          {(dateDebut || dateFin) && (
            <button
              onClick={() => applyPreset('clear')}
              style={{ padding: '6px 10px', borderRadius: 8, fontSize: 12, border: `1px solid ${c.bordure}`, background: 'transparent', color: c.texteMuted, cursor: 'pointer' }}
            >
              ✕ Effacer
            </button>
          )}
        </div>

        {/* Filtre par statut */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: c.texteMuted }}>Statut</span>
          {[
            { k: 'bl',      label: 'BL' },
            { k: 'facture', label: 'Factures' },
            { k: 'avoir',   label: 'Avoirs' },
          ].map((p) => {
            const actif = statutsActifs.includes(p.k)
            return (
              <button
                key={p.k}
                onClick={() => toggleStatut(p.k)}
                style={{
                  padding: '6px 10px', borderRadius: 8, fontSize: 12,
                  border: `1px solid ${actif ? c.accent : c.bordure}`,
                  background: actif ? c.accentClair : c.blanc,
                  color: c.texte, cursor: 'pointer',
                }}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        {error && <p style={{ color: '#B91C1C', fontSize: 14, marginBottom: 16 }}>{error}</p>}

        {loading && <p style={{ color: c.texteMuted, fontSize: 14 }}>Chargement…</p>}

        {!loading && !error && (
          <>
            {facturesFiltrees.length === 0 ? (
              <p style={{ color: c.texteMuted, fontSize: 14 }}>
                {factures.length === 0
                  ? 'Aucune facture importée.'
                  : 'Aucune facture ne correspond à la recherche.'}
              </p>
            ) : isMobile ? (
              /* ── Vue cartes mobile ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Sélecteur de tri (équivalent mobile des en-têtes cliquables desktop) */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: c.texteMuted }}>
                  <span>Trier par</span>
                  <select
                    value={sortBy}
                    onChange={e => { setSortBy(e.target.value); setSortDir(DEFAULT_SORT_DIR[e.target.value] || 'asc') }}
                    style={{ padding: '6px 8px', borderRadius: 6, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, fontSize: 12 }}
                  >
                    <option value="fournisseur">Fournisseur</option>
                    <option value="numero_facture">N° de facture</option>
                    <option value="date_facture">Date</option>
                    <option value="statut">Statut</option>
                    <option value="ht">Montant HT</option>
                    <option value="ttc">Montant TTC</option>
                  </select>
                  <button
                    onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                    title={sortDir === 'asc' ? 'Croissant (A→Z, 0→9)' : 'Décroissant (Z→A, 9→0)'}
                    style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, fontSize: 12, cursor: 'pointer' }}
                  >
                    {sortDir === 'asc' ? '▲ A-Z' : '▼ Z-A'}
                  </button>
                </div>
                {facturesAffichees.map((f) => {
                  const ht = Number(f.total_ht) || 0
                  const tva = tvaByFacture[f.id] || 0
                  const ttc = ht + tva
                  const nb = nbLignesByFacture[f.id] ?? 0
                  const badgeStyle = badgeStyleFor(f.statut)
                  const isSelectableBl = role === 'admin' && f.statut === 'bl' && !f.facture_consolidee_id
                  const isSelected = selectedBlIds.has(f.id)
                  return (
                    <div
                      key={f.id}
                      onClick={() => router.push(`/controle-gestion/achats/${f.id}`)}
                      style={{
                        background: isSelected ? c.accentClair : c.blanc, borderRadius: 10,
                        border: `${isSelected ? '1.5px' : '0.5px'} solid ${isSelected ? c.accent : c.bordure}`,
                        padding: '14px 16px', cursor: 'pointer',
                      }}
                    >
                      {/* Ligne 1 : checkbox (BL seul) + fournisseur + badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                          {isSelectableBl && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => toggleSelect(f.id, e)}
                              onClick={(e) => e.stopPropagation()}
                              style={{ cursor: 'pointer', width: 18, height: 18 }}
                              aria-label={`Sélectionner BL ${f.numero_facture || ''}`}
                            />
                          )}
                          <span style={{ fontSize: 15, fontWeight: 600, color: c.texte, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {f.fournisseur || <span style={{ color: c.texteMuted, fontWeight: 400 }}>—</span>}
                          </span>
                        </div>
                        <span style={badgeStyle}>{statutLabel(f.statut)}</span>
                      </div>
                      {/* Ligne 2 : n° facture · date */}
                      <div style={{ fontSize: 13, color: c.texteMuted, marginBottom: 8 }}>
                        {f.numero_facture ? `N° ${f.numero_facture}` : '—'}{f.date_facture ? ` · ${formatDate(f.date_facture)}` : ''}
                      </div>
                      {/* Ligne 3 : articles + montants HT/TVA/TTC */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
                        <span style={{ fontSize: 13, color: c.texteMuted }}>{nb} article{nb !== 1 ? 's' : ''}</span>
                        <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          <div style={{ fontSize: 12, color: c.texteMuted }}>HT {formatEuro(ht)} · TVA {formatEuro(tva)}</div>
                          <div style={{ fontSize: 16, fontWeight: 600, color: c.texte }}>{formatEuro(ttc)} <span style={{ fontSize: 11, color: c.texteMuted, fontWeight: 400 }}>TTC</span></div>
                        </div>
                      </div>
                      {role === 'admin' && (
                        <div style={{ marginTop: 10, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <button
                            onClick={(e) => handleDelete(f, e)}
                            disabled={deleting === f.id}
                            style={{ background: 'none', border: `1px solid ${c.bordure}`, borderRadius: 6, padding: '4px 10px', fontSize: 12, color: '#B91C1C', cursor: 'pointer' }}
                          >
                            {deleting === f.id ? '…' : 'Supprimer'}
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
                {/* Total mobile */}
                <div style={{ background: c.fond, borderRadius: 10, border: `0.5px solid ${c.bordure}`, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: 13, color: c.texteMuted }}>{facturesFiltrees.length} facture{facturesFiltrees.length !== 1 ? 's' : ''}</span>
                  <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    <div style={{ fontSize: 12, color: c.texteMuted }}>HT {formatEuro(totalHT)} · TVA {formatEuro(totalTVA)}</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: c.texte }}>{formatEuro(totalTTC)} <span style={{ fontSize: 11, color: c.texteMuted, fontWeight: 400 }}>TTC</span></div>
                  </div>
                </div>
              </div>
            ) : (
              /* ── Vue tableau desktop ── */
              <div style={{ background: c.blanc, borderRadius: 12, border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: c.fond }}>
                        {role === 'admin' && <th style={{ ...th, width: 32, padding: '11px 8px' }} aria-label="Sélection" />}
                        <SortHeader col="fournisseur"    label="Fournisseur" baseStyle={th}  sortBy={sortBy} sortDir={sortDir} onSort={handleSort} c={c} />
                        <SortHeader col="numero_facture" label="N° Facture"  baseStyle={th}  sortBy={sortBy} sortDir={sortDir} onSort={handleSort} c={c} />
                        <SortHeader col="date_facture"   label="Date"        baseStyle={th}  sortBy={sortBy} sortDir={sortDir} onSort={handleSort} c={c} />
                        <SortHeader col="statut"         label="Statut"      baseStyle={th}  sortBy={sortBy} sortDir={sortDir} onSort={handleSort} c={c} />
                        <SortHeader col="articles"       label="Articles"    baseStyle={thR} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} c={c} right />
                        <SortHeader col="ht"             label="HT"          baseStyle={thR} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} c={c} right />
                        <SortHeader col="tva"            label="TVA"         baseStyle={thR} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} c={c} right />
                        <SortHeader col="ttc"            label="TTC"         baseStyle={thR} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} c={c} right />
                        {role === 'admin' && <th style={th} />}
                      </tr>
                    </thead>
                    <tbody>
                      {facturesAffichees.map((f, i) => {
                        const ht = Number(f.total_ht) || 0
                        const tva = tvaByFacture[f.id] || 0
                        const ttc = ht + tva
                        const nb = nbLignesByFacture[f.id] ?? 0
                        const isSelectableBl = role === 'admin' && f.statut === 'bl' && !f.facture_consolidee_id
                        const isSelected = selectedBlIds.has(f.id)
                        return (
                          <tr
                            key={f.id}
                            onClick={() => router.push(`/controle-gestion/achats/${f.id}`)}
                            style={{
                              cursor: 'pointer',
                              background: isSelected ? c.accentClair : (i % 2 === 0 ? c.blanc : c.fond),
                              transition: 'background 0.12s',
                            }}
                            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = c.accentClair }}
                            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = i % 2 === 0 ? c.blanc : c.fond }}
                          >
                            {role === 'admin' && (
                              <td style={{ ...td, padding: '11px 8px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                {isSelectableBl ? (
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => toggleSelect(f.id, e)}
                                    style={{ cursor: 'pointer', width: 16, height: 16 }}
                                    aria-label={`Sélectionner BL ${f.numero_facture || ''}`}
                                  />
                                ) : null}
                              </td>
                            )}
                            <td style={{ ...td, fontWeight: 500 }}>
                              {f.fournisseur || <span style={{ color: c.texteMuted }}>—</span>}
                            </td>
                            <td style={tdM}>{f.numero_facture || '—'}</td>
                            <td style={tdM}>{formatDate(f.date_facture)}</td>
                            <td style={td}>
                              <span style={badgeStyleFor(f.statut)}>{statutLabel(f.statut)}</span>
                            </td>
                            <td style={tdM}>{nb}</td>
                            <td style={tdR}>{formatEuro(ht)}</td>
                            <td style={tdR}>{formatEuro(tva)}</td>
                            <td style={tdR}>{formatEuro(ttc)}</td>
                            {role === 'admin' && (
                              <td style={{ ...td, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                <button
                                  onClick={(e) => handleDelete(f, e)}
                                  disabled={deleting === f.id}
                                  style={{ background: 'none', border: `1px solid ${c.bordure}`, borderRadius: 6, padding: '4px 10px', fontSize: 12, color: '#B91C1C', cursor: 'pointer' }}
                                >
                                  {deleting === f.id ? '…' : 'Supprimer'}
                                </button>
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ fontWeight: 600, background: c.fond }}>
                        {role === 'admin' && <td style={td} />}
                        <td style={{ ...td, color: c.texte }}>
                          {facturesFiltrees.length} facture{facturesFiltrees.length !== 1 ? 's' : ''}
                        </td>
                        <td style={td} colSpan={3} />
                        <td style={{ ...tdR, color: c.texte }}>{formatEuro(totalHT)}</td>
                        <td style={{ ...tdR, color: c.texte }}>{formatEuro(totalTVA)}</td>
                        <td style={{ ...tdR, color: c.texte }}>{formatEuro(totalTTC)}</td>
                        {role === 'admin' && <td style={td} />}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Barre flottante de fusion (visible dès qu'au moins 1 BL est coché) */}
      {selectedBlIds.size > 0 && (
        <div style={{
          position: 'fixed', left: 16, right: 16, bottom: 16,
          maxWidth: 720, margin: '0 auto',
          background: c.blanc, borderRadius: 12,
          border: `1px solid ${c.bordure}`,
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          padding: '12px 16px',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          zIndex: 50,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: c.texte }}>
              {selectedBlIds.size} BL sélectionné{selectedBlIds.size > 1 ? 's' : ''}
              {sameFournisseur && selectedBls[0]?.fournisseur && (
                <span style={{ fontWeight: 400, color: c.texteMuted, marginLeft: 6 }}>
                  — {selectedBls[0].fournisseur}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: c.texteMuted, marginTop: 2 }}>
              {sameFournisseur
                ? `Total HT : ${formatEuro(selectedTotalHt)} · TVA : ${formatEuro(selectedTotalTva)}`
                : `⚠ Fournisseurs différents (${selectedFournisseurs.length}) — fusion impossible`}
            </div>
          </div>
          <button
            onClick={clearSelection}
            style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 13,
              border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer',
            }}
          >
            Annuler
          </button>
          <button
            onClick={() => setFusionModalOpen(true)}
            disabled={selectedBlIds.size < 2 || !sameFournisseur}
            title={
              selectedBlIds.size < 2 ? 'Sélectionne au moins 2 BL'
              : !sameFournisseur ? 'Tous les BL doivent être du même fournisseur'
              : 'Fusionner les BL sélectionnés en une facture'
            }
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13,
              border: 'none',
              background: (selectedBlIds.size < 2 || !sameFournisseur) ? c.bordure : c.accent,
              color: c.texte, fontWeight: 600,
              cursor: (selectedBlIds.size < 2 || !sameFournisseur) ? 'not-allowed' : 'pointer',
              opacity: (selectedBlIds.size < 2 || !sameFournisseur) ? 0.6 : 1,
            }}
          >
            Fusionner en facture →
          </button>
        </div>
      )}

      {/* Modal de fusion */}
      {fusionModalOpen && (
        <FusionModal
          c={c}
          isMobile={isMobile}
          selectedBls={selectedBls}
          totalHt={selectedTotalHt}
          totalTva={selectedTotalTva}
          onClose={() => setFusionModalOpen(false)}
          onSubmit={handleFusion}
          submitting={fusionning}
        />
      )}
    </div>
  )
}

// ── Modal de fusion BL → facture ──────────────────────────────────────────
// Pré-rempli avec les sommes des BL sélectionnés. L'utilisateur peut
// ajuster numero, date, HT et TVA avant validation.
function FusionModal({ c, isMobile, selectedBls, totalHt, totalTva, onClose, onSubmit, submitting }) {
  const [numero, setNumero] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [ht, setHt] = useState(() => Number(totalHt || 0).toFixed(2))
  const [tva, setTva] = useState(() => Number(totalTva || 0).toFixed(2))
  const ttc = (Number(ht) || 0) + (Number(tva) || 0)

  const submit = (e) => {
    e.preventDefault()
    if (!numero.trim() || !date) return
    onSubmit(numero.trim(), date, Number(ht) || 0, Number(tva) || 0)
  }

  const input = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte,
    fontSize: 14, boxSizing: 'border-box',
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, zIndex: 100,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{
          background: c.blanc, borderRadius: 12, padding: isMobile ? 16 : 24,
          maxWidth: 480, width: '100%',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 600, color: c.texte }}>
          Fusionner {selectedBls.length} BL en facture
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: c.texteMuted }}>
          Fournisseur : <strong style={{ color: c.texte }}>{selectedBls[0]?.fournisseur || '—'}</strong><br />
          Les lignes des BL seront déplacées vers la nouvelle facture, et les BL passeront à zéro.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'block' }}>
            <div style={{ fontSize: 12, color: c.texteMuted, marginBottom: 4 }}>N° facture *</div>
            <input
              type="text" value={numero} onChange={(e) => setNumero(e.target.value)}
              placeholder="ex: FA-2026-042" required style={input}
            />
          </label>
          <label style={{ display: 'block' }}>
            <div style={{ fontSize: 12, color: c.texteMuted, marginBottom: 4 }}>Date facture *</div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required style={input} />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <label>
              <div style={{ fontSize: 12, color: c.texteMuted, marginBottom: 4 }}>Total HT</div>
              <input
                type="number" step="0.01" value={ht}
                onChange={(e) => setHt(e.target.value)} style={input}
              />
            </label>
            <label>
              <div style={{ fontSize: 12, color: c.texteMuted, marginBottom: 4 }}>Montant TVA</div>
              <input
                type="number" step="0.01" value={tva}
                onChange={(e) => setTva(e.target.value)} style={input}
              />
            </label>
            <label>
              <div style={{ fontSize: 12, color: c.texteMuted, marginBottom: 4 }}>TTC (auto)</div>
              <input
                type="text" readOnly value={ttc.toFixed(2)}
                style={{ ...input, background: c.fond, color: c.texteMuted }}
              />
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            type="button" onClick={onClose} disabled={submitting}
            style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 13,
              border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer',
            }}
          >
            Annuler
          </button>
          <button
            type="submit" disabled={submitting || !numero.trim() || !date}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13,
              border: 'none', background: c.accent, color: c.texte, fontWeight: 600,
              cursor: submitting ? 'wait' : 'pointer',
              opacity: (submitting || !numero.trim() || !date) ? 0.6 : 1,
            }}
          >
            {submitting ? 'Création…' : 'Créer la facture'}
          </button>
        </div>
      </form>
    </div>
  )
}
