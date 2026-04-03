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
      .select('id, fournisseur, numero_facture, date_facture, total_ht, created_at')
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
            ) : (
              <div style={{ background: c.blanc, borderRadius: 12, border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 560 : 0 }}>
                    <thead>
                      <tr style={{ background: c.fond }}>
                        <th style={th}>Fournisseur</th>
                        <th style={th}>N° Facture</th>
                        <th style={th}>Date</th>
                        <th style={thR}>Articles</th>
                        <th style={thR}>Total HT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {facturesFiltrees.map((f, i) => {
                        const ht = Number(f.total_ht) || 0
                        const tva = f.taux_tva != null ? Number(f.taux_tva) : null
                        const montantTva = tva != null ? ht * (tva / 100) : null
                        const ttc = montantTva != null ? ht + montantTva : null
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
                            <td style={tdM}>{nb}</td>
                            <td style={tdR}>{formatEuro(ht)}</td>
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
