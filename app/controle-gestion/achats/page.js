'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getClientId } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import { useRole } from '../../../lib/useRole'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [recherche, setRecherche] = useState('')
  const [deleting, setDeleting] = useState(null)

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

  useEffect(() => {
    if (roleLoading || !role) return
    if (role !== 'admin' && role !== 'directeur') router.replace('/dashboard')
  }, [role, roleLoading, router])

  const loadFactures = useCallback(async () => {
    setLoading(true)
    setError('')
    const cid = await getClientId()
    if (!cid) { setLoading(false); return }
    setClientId(cid)

    const { data: rows, error: fErr } = await supabase
      .from('achats_factures')
      .select('id, fournisseur, numero_facture, date_facture, total_ht, statut, created_at')
      .eq('client_id', cid)
      .order('date_facture', { ascending: false })

    if (fErr) {
      setError(fErr.message)
      setLoading(false)
      return
    }

    const ids = (rows || []).map((r) => r.id)
    let counts = {}
    if (ids.length > 0) {
      const { data: lignes } = await supabase
        .from('achats_lignes')
        .select('facture_id')
        .in('facture_id', ids)
        .eq('client_id', cid)
      for (const l of (lignes || [])) {
        counts[l.facture_id] = (counts[l.facture_id] || 0) + 1
      }
    }

    setFactures(rows || [])
    setNbLignesByFacture(counts)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!authReady) return
    loadFactures()
  }, [authReady, loadFactures])

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

  const facturesFiltrees = factures.filter((f) => {
    if (!recherche.trim()) return true
    const q = recherche.toLowerCase()
    return (
      (f.fournisseur || '').toLowerCase().includes(q) ||
      (f.numero_facture || '').toLowerCase().includes(q)
    )
  })

  const totalHT = facturesFiltrees.reduce((s, f) => s + (Number(f.total_ht) || 0), 0)

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
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => router.push('/controle-gestion/fournisseurs')}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 13,
                border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer',
              }}
            >
              🏢 Fournisseurs
            </button>
            {role === 'admin' && (
              <button
                onClick={() => router.push('/controle-gestion/achats/import')}
                style={{
                  padding: '8px 14px', borderRadius: 8, fontSize: 13,
                  border: 'none', background: c.accent, color: '#fff', cursor: 'pointer', fontWeight: 500,
                }}
              >
                + Nouvelle facture
              </button>
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
            marginBottom: 16, outline: 'none',
          }}
        />

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
                  const nb = nbLignesByFacture[f.id] ?? 0
                  const badgeStyle = f.statut === 'bl'
                    ? { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#FEF3C7', color: '#92400E' }
                    : { fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#D1FAE5', color: '#065F46' }
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
                        <span style={badgeStyle}>{f.statut === 'bl' ? 'BL' : 'Facture'}</span>
                      </div>
                      {/* Ligne 2 : n° facture · date */}
                      <div style={{ fontSize: 13, color: c.texteMuted, marginBottom: 8 }}>
                        {f.numero_facture ? `N° ${f.numero_facture}` : '—'}{f.date_facture ? ` · ${formatDate(f.date_facture)}` : ''}
                      </div>
                      {/* Ligne 3 : articles + total */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: c.texteMuted }}>{nb} article{nb !== 1 ? 's' : ''}</span>
                        <span style={{ fontSize: 15, fontWeight: 600, color: c.texte, fontVariantNumeric: 'tabular-nums' }}>{formatEuro(ht)}</span>
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
                <div style={{ background: c.fond, borderRadius: 10, border: `0.5px solid ${c.bordure}`, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: c.texteMuted }}>{facturesFiltrees.length} facture{facturesFiltrees.length !== 1 ? 's' : ''}</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: c.texte }}>{formatEuro(totalHT)}</span>
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
                        <th style={thR}>Total HT</th>
                        {role === 'admin' && <th style={th} />}
                      </tr>
                    </thead>
                    <tbody>
                      {facturesFiltrees.map((f, i) => {
                        const ht = Number(f.total_ht) || 0
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
                              {f.statut === 'bl'
                                ? <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#FEF3C7', color: '#92400E' }}>BL</span>
                                : <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: '#D1FAE5', color: '#065F46' }}>Facture</span>}
                            </td>
                            <td style={tdM}>{nb}</td>
                            <td style={tdR}>{formatEuro(ht)}</td>
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
