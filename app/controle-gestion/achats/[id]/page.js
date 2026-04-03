'use client'

import { useEffect, useState } from 'react'
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
  if (n == null || Number.isNaN(Number(n))) return '—'
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
  const [facture, setFacture] = useState(null)
  const [lignes, setLignes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  useEffect(() => {
    if (!authReady || !id) return
    ;(async () => {
      setLoading(true)
      setError('')
      const cid = await getClientId()
      if (!cid) { setLoading(false); return }

      const { data: fac, error: fErr } = await supabase
        .from('achats_factures')
        .select('id, fournisseur, numero_facture, date_facture, total_ht, taux_tva, created_at')
        .eq('id', id)
        .eq('client_id', cid)
        .maybeSingle()

      if (fErr) { setError(fErr.message); setLoading(false); return }
      if (!fac) { setError('Facture introuvable.'); setLoading(false); return }
      setFacture(fac)

      const { data: rows, error: lErr } = await supabase
        .from('achats_lignes')
        .select('id, designation, ingredient_id, quantite, unite, prix_unitaire_ht, montant_ht, ingredients(nom)')
        .eq('facture_id', id)
        .eq('client_id', cid)
        .order('designation')

      if (lErr) console.warn('Lignes :', lErr.message)
      setLignes(rows || [])
      setLoading(false)
    })()
  }, [authReady, id])

  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
        Chargement…
      </div>
    )
  }

  const ht = facture ? Number(facture.total_ht) || 0 : 0
  const tva = facture?.taux_tva != null ? Number(facture.taux_tva) : null
  const montantTva = tva != null ? ht * (tva / 100) : null
  const ttc = montantTva != null ? ht + montantTva : null

  const th = {
    padding: isMobile ? '10px 8px' : '11px 14px',
    textAlign: 'left', fontWeight: 600, fontSize: 11,
    color: c.texteMuted, textTransform: 'uppercase',
    borderBottom: `1px solid ${c.bordure}`, whiteSpace: 'nowrap',
  }
  const thR = { ...th, textAlign: 'right' }
  const td = { padding: isMobile ? '11px 8px' : '12px 14px', fontSize: 14, color: c.texte, borderBottom: `1px solid ${c.bordure}` }
  const tdR = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }
  const tdM = { ...tdR, color: c.texteMuted }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1100px', margin: '0 auto' }}>

        {/* Retour */}
        <button
          onClick={() => router.push('/controle-gestion/achats')}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: c.texteMuted, fontSize: 13, padding: '0 0 16px 0',
          }}
        >
          ← Retour aux achats
        </button>

        {error && <p style={{ color: '#B91C1C', fontSize: 14 }}>{error}</p>}
        {loading && <p style={{ color: c.texteMuted, fontSize: 14 }}>Chargement…</p>}

        {!loading && !error && facture && (
          <>
            {/* ── En-tête facture ── */}
            <div style={{
              background: c.blanc, borderRadius: 12, border: `0.5px solid ${c.bordure}`,
              padding: isMobile ? 16 : 24, marginBottom: 24,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: c.texteMuted, fontWeight: 500, textTransform: 'uppercase', marginBottom: 6 }}>Fournisseur</div>
                  <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 600, color: c.texte }}>{facture.fournisseur || '—'}</div>
                  {facture.numero_facture && (
                    <div style={{ fontSize: 13, color: c.texteMuted, marginTop: 4 }}>
                      N° {facture.numero_facture}
                    </div>
                  )}
                  <div style={{ fontSize: 13, color: c.texteMuted, marginTop: 2 }}>
                    {formatDate(facture.date_facture)}
                  </div>
                </div>

                {/* Totaux */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, auto)',
                  gap: '8px 24px',
                  textAlign: 'right',
                }}>
                  {[
                    { label: 'Total HT', value: formatEuro(ht), color: c.texte },
                    { label: tva != null ? `TVA (${tva} %)` : 'TVA', value: montantTva != null ? formatEuro(montantTva) : '—', color: c.texteMuted },
                    { label: 'Total TTC', value: ttc != null ? formatEuro(ttc) : '—', color: c.accent },
                  ].map(({ label, value, color }) => (
                    <div key={label}>
                      <div style={{ fontSize: 11, color: c.texteMuted, fontWeight: 500, textTransform: 'uppercase' }}>{label}</div>
                      <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 600, color }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Lignes articles ── */}
            <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600, color: c.texte }}>
              Articles ({lignes.length})
            </h2>

            {lignes.length === 0 ? (
              <p style={{ color: c.texteMuted, fontSize: 14 }}>Aucun article enregistré pour cette facture.</p>
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
                        <th style={thR}>Total HT</th>
                        <th style={th}>Ingrédient lié</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lignes.map((l) => (
                        <tr key={l.id}>
                          <td style={{ ...td, fontWeight: 500 }}>{l.designation}</td>
                          <td style={tdM}>{formatQte(l.quantite)}</td>
                          <td style={tdM}>{l.unite || '—'}</td>
                          <td style={tdR}>{formatEuro(l.prix_unitaire_ht)}</td>
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
                        <td style={{ ...td, color: c.texte }} colSpan={4}>Total</td>
                        <td style={{ ...tdR, color: c.texte }}>
                          {formatEuro(lignes.reduce((s, l) => s + (Number(l.montant_ht) || 0), 0))}
                        </td>
                        <td style={td} />
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
