'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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


export default function AchatsListPage() {
  const router = useRouter()
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
  const [recherche, setRecherche] = useState('')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [statutsActifs, setStatutsActifs] = useState(['bl', 'facture', 'avoir'])
  const [deleting, setDeleting] = useState(null)
  const [exporting, setExporting] = useState(false)

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
      .select('id, fournisseur, numero_facture, date_facture, total_ht, taux_tva, montant_tva, statut, created_at')
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

  const totalHT = facturesFiltrees.reduce((s, f) => s + (Number(f.total_ht) || 0), 0)
  const totalTVA = facturesFiltrees.reduce((s, f) => s + (tvaByFacture[f.id] || 0), 0)
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
                {facturesFiltrees.map((f) => {
                  const ht = Number(f.total_ht) || 0
                  const tva = tvaByFacture[f.id] || 0
                  const ttc = ht + tva
                  const nb = nbLignesByFacture[f.id] ?? 0
                  const badgeStyle = badgeStyleFor(f.statut)
                  return (
                    <div
                      key={f.id}
                      onClick={() => router.push(`/controle-gestion/achats/${f.id}`)}
                      style={{
                        background: c.blanc, borderRadius: 10, border: `0.5px solid ${c.bordure}`,
                        padding: '14px 16px', cursor: 'pointer',
                      }}
                    >
                      {/* Ligne 1 : fournisseur + badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 15, fontWeight: 600, color: c.texte }}>
                          {f.fournisseur || <span style={{ color: c.texteMuted, fontWeight: 400 }}>—</span>}
                        </span>
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
                        <th style={th}>Fournisseur</th>
                        <th style={th}>N° Facture</th>
                        <th style={th}>Date</th>
                        <th style={th}>Statut</th>
                        <th style={thR}>Articles</th>
                        <th style={thR}>HT</th>
                        <th style={thR}>TVA</th>
                        <th style={thR}>TTC</th>
                        {role === 'admin' && <th style={th} />}
                      </tr>
                    </thead>
                    <tbody>
                      {facturesFiltrees.map((f, i) => {
                        const ht = Number(f.total_ht) || 0
                        const tva = tvaByFacture[f.id] || 0
                        const ttc = ht + tva
                        const nb = nbLignesByFacture[f.id] ?? 0
                        return (
                          <tr
                            key={f.id}
                            onClick={() => router.push(`/controle-gestion/achats/${f.id}`)}
                            style={{
                              cursor: 'pointer',
                              background: i % 2 === 0 ? c.blanc : c.fond,
                              transition: 'background 0.12s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = c.accentClair}
                            onMouseLeave={(e) => e.currentTarget.style.background = i % 2 === 0 ? c.blanc : c.fond}
                          >
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
    </div>
  )
}
