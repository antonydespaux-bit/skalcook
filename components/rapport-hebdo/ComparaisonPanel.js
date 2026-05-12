'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  buildRapportData, buildJoursFermesIso, formatEur, formatNombre, formatPct, formatPeriode,
} from '../../lib/rapportHebdo'

// Panel de comparaison multi-périodes : sous l'éditeur de rapport courant.
// L'utilisateur peut ajouter 1 à N périodes additionnelles et voir un
// tableau côte à côte des KPIs clés (CA, couverts, TM total).
//
// `currentPeriode` : période principale du rapport (rappelée en colonne 1
// pour servir de référence)
// `periodes` : tableau de périodes additionnelles [{ debut, fin }]
// `onPeriodesChange` : setter pour les mettre à jour
export default function ComparaisonPanel({ c, isMobile, clientId, currentPeriode, periodes, onPeriodesChange }) {
  // Données chargées par période (Map<key, { caRows, budgetRows, lieuxMap }>)
  const [datasets, setDatasets] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const allPeriodes = useMemo(() => [
    { debut: currentPeriode.debut, fin: currentPeriode.fin, isMain: true },
    ...periodes.map((p) => ({ ...p, isMain: false })),
  ], [currentPeriode, periodes])

  const loadDataset = useCallback(async (debut, fin) => {
    const [y1] = debut.split('-').map(Number)
    const [y2] = fin.split('-').map(Number)
    const annees = Array.from(new Set([y1, y2]))
    const [lieuxRes, caRes, budgetRes, jfRes, jfhRes] = await Promise.all([
      supabase.from('lieux_service').select('id, nom, parent_lieu_service_id').eq('client_id', clientId).eq('actif', true),
      supabase.from('ca_journalier')
        .select('jour, service, lieu_service_id, couverts, ca_food, ca_bev_20, ca_bev_10, ca_autre')
        .eq('client_id', clientId).gte('jour', debut).lte('jour', fin),
      supabase.from('ca_budgets')
        .select('annee, mois, jour_semaine, lieu_service_id, service, couverts_cible, ca_food_cible, ca_bev_20_cible, ca_bev_10_cible, ca_autre_cible')
        .eq('client_id', clientId).in('annee', annees),
      supabase.from('ca_jours_fermes').select('date, motif').eq('client_id', clientId).gte('date', debut).lte('date', fin),
      supabase.from('ca_jours_fermes_hebdo').select('jour_semaine, motif').eq('client_id', clientId),
    ])
    if (lieuxRes.error) throw lieuxRes.error
    if (caRes.error) throw caRes.error
    if (budgetRes.error) throw budgetRes.error
    if (jfRes.error) throw jfRes.error
    if (jfhRes.error) throw jfhRes.error
    // lieuxMap : remappe les enfants vers le label du parent (Table du chef
    // → "Salle à manger") pour que les agrégations groupent analytiquement.
    const noms = new Map((lieuxRes.data || []).map((l) => [l.id, l.nom]))
    const lieuToParent = new Map((lieuxRes.data || []).map((l) => [l.id, l.parent_lieu_service_id || l.id]))
    const lieuxMap = new Map((lieuxRes.data || []).map((l) => [
      l.id, noms.get(l.parent_lieu_service_id || l.id) || l.nom,
    ]))
    // Remappe lieu_service_id sur chaque row vers le parent
    const remap = (r) => ({ ...r, lieu_service_id: lieuToParent.get(r.lieu_service_id) || r.lieu_service_id })
    return {
      caRows: (caRes.data || []).map(remap),
      budgetRows: (budgetRes.data || []).map(remap),
      lieuxMap,
      joursFermesRows: jfRes.data || [],
      joursFermesHebdoRows: jfhRes.data || [],
    }
  }, [clientId])

  useEffect(() => {
    let cancel = false
    ;(async () => {
      setLoading(true); setError('')
      try {
        const out = {}
        for (const p of allPeriodes) {
          const key = `${p.debut}_${p.fin}`
          if (datasets[key]) { out[key] = datasets[key]; continue }
          const ds = await loadDataset(p.debut, p.fin)
          if (cancel) return
          out[key] = ds
        }
        if (cancel) return
        setDatasets(out)
      } catch (e) {
        if (cancel) return
        setError(e.message || 'Erreur de chargement comparaison')
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allPeriodes.map((p) => `${p.debut}_${p.fin}`).join('|'), clientId])

  const addPeriode = () => {
    // Par défaut : 7 jours avant la dernière période ajoutée
    const last = periodes[periodes.length - 1] || currentPeriode
    const finPrev = new Date(last.debut)
    finPrev.setDate(finPrev.getDate() - 1)
    const debutPrev = new Date(finPrev)
    debutPrev.setDate(finPrev.getDate() - 6)
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    onPeriodesChange([...periodes, { debut: fmt(debutPrev), fin: fmt(finPrev) }])
  }

  const removePeriode = (i) => {
    onPeriodesChange(periodes.filter((_, idx) => idx !== i))
  }

  const updatePeriode = (i, patch) => {
    onPeriodesChange(periodes.map((p, idx) => idx === i ? { ...p, ...patch } : p))
  }

  const reports = useMemo(() => {
    return allPeriodes.map((p) => {
      const key = `${p.debut}_${p.fin}`
      const ds = datasets[key]
      if (!ds) return { periode: p, data: null }
      const joursFermesIso = buildJoursFermesIso(
        ds.joursFermesRows, ds.joursFermesHebdoRows, p.debut, p.fin,
      )
      const data = buildRapportData({
        caRows: ds.caRows,
        budgetRows: ds.budgetRows,
        lieuxMap: ds.lieuxMap,
        debut: p.debut, fin: p.fin,
        joursFermesIso,
      })
      return { periode: p, data }
    })
  }, [allPeriodes, datasets])

  // Rendu : tableau avec une ligne par KPI et une colonne par période
  const headStyle = { padding: '8px 10px', background: c.fond, fontSize: 11, fontWeight: 600, color: c.texteMuted, textTransform: 'uppercase', letterSpacing: 0.3, borderBottom: `1px solid ${c.bordure}` }
  const cellStyle = { padding: '8px 10px', fontSize: 13, color: c.texte, borderBottom: `0.5px solid ${c.bordure}` }
  const kpiNameStyle = { ...cellStyle, fontWeight: 600 }
  const numStyle = { ...cellStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

  const kpiRow = (label, picker, fmt, ratioPicker) => (
    <tr>
      <td style={kpiNameStyle}>{label}</td>
      {reports.map((r, i) => {
        const v = r.data ? picker(r.data) : null
        const ratio = ratioPicker && r.data ? ratioPicker(r.data) : null
        return (
          <td key={i} style={numStyle}>
            {v != null ? fmt(v) : '—'}
            {ratio != null && (
              <span style={{ fontSize: 11, color: ratio >= 0 ? c.vert : c.rouge, marginLeft: 6, fontWeight: 600 }}>
                {formatPct(ratio)}
              </span>
            )}
          </td>
        )
      })}
    </tr>
  )

  return (
    <div style={{ marginTop: 20, background: c.blanc, border: `0.5px solid ${c.bordure}`, borderRadius: 12, padding: isMobile ? 12 : 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 600, color: c.texte }}>Comparaison multi-périodes</h2>
          <p style={{ margin: 0, fontSize: 12, color: c.texteMuted }}>
            Ajoute jusqu&apos;à plusieurs périodes pour comparer les indicateurs clés côte à côte.
          </p>
        </div>
        <button onClick={addPeriode}
          style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, border: 'none', background: c.accent, color: c.texte, fontWeight: 600, cursor: 'pointer' }}>
          + Ajouter une période
        </button>
      </div>

      {/* Sélecteurs périodes additionnelles */}
      {periodes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {periodes.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: c.fond, padding: '8px 10px', borderRadius: 8 }}>
              <span style={{ fontSize: 11, color: c.texteMuted, minWidth: 80 }}>Période {i + 2} :</span>
              <input type="date" value={p.debut} onChange={(e) => updatePeriode(i, { debut: e.target.value })}
                style={{ padding: '5px 8px', borderRadius: 6, fontSize: 12, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte }} />
              <span style={{ fontSize: 11, color: c.texteMuted }}>au</span>
              <input type="date" value={p.fin} onChange={(e) => updatePeriode(i, { fin: e.target.value })}
                style={{ padding: '5px 8px', borderRadius: 6, fontSize: 12, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte }} />
              <div style={{ flex: 1 }} />
              <button onClick={() => removePeriode(i)}
                style={{ background: 'transparent', border: `0.5px solid ${c.bordure}`, borderRadius: 6, padding: '3px 8px', fontSize: 11, color: c.texteMuted, cursor: 'pointer' }}>
                Retirer
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: '#FCEBEB', color: '#A32D2D', borderRadius: 8, fontSize: 12 }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ padding: 12, fontSize: 13, color: c.texteMuted }}>Chargement des données…</div>
      )}

      {/* Tableau */}
      <div style={{ overflowX: 'auto', border: `0.5px solid ${c.bordure}`, borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...headStyle, textAlign: 'left' }}>Indicateur</th>
              {allPeriodes.map((p, i) => (
                <th key={i} style={{ ...headStyle, textAlign: 'right' }}>
                  {p.isMain ? '⭐ ' : ''}{formatPeriode(p.debut, p.fin)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {kpiRow('CA TTC réel',          (d) => d.ca.real,         formatEur)}
            {kpiRow('CA TTC budget',        (d) => d.ca.budget,       formatEur)}
            {kpiRow('Δ vs budget',          (d) => d.ca.delta,        formatEur, (d) => d.ca.ratio)}
            {kpiRow('Couverts midi',        (d) => d.couverts.midi.real,    formatNombre, (d) => d.couverts.midi.ratio)}
            {kpiRow('Couverts soir',        (d) => d.couverts.soir.real,    formatNombre, (d) => d.couverts.soir.ratio)}
            {kpiRow('Couverts total',       (d) => d.couverts.total.real,   formatNombre, (d) => d.couverts.total.ratio)}
            {kpiRow('TM Food midi',         (d) => d.tmFb.midi.real_tm_food, formatEur,    (d) => d.tmFb.midi.ratio_food)}
            {kpiRow('TM Bev midi',          (d) => d.tmFb.midi.real_tm_bev,  formatEur,    (d) => d.tmFb.midi.ratio_bev)}
            {kpiRow('TM Food soir',         (d) => d.tmFb.soir.real_tm_food, formatEur,    (d) => d.tmFb.soir.ratio_food)}
            {kpiRow('TM Bev soir',          (d) => d.tmFb.soir.real_tm_bev,  formatEur,    (d) => d.tmFb.soir.ratio_bev)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
