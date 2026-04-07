'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase, getClientId } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { useTheme } from '../../lib/useTheme'
import { useRole } from '../../lib/useRole'
import { useIsMobile } from '../../lib/useIsMobile'
import Navbar from '../../components/Navbar'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts'

export default function InventairePage() {
  const [inventaires, setInventaires] = useState([])
  const [dernierLignes, setDernierLignes] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtre, setFiltre] = useState('tous')
  const [deleting, setDeleting] = useState(null)
  const router = useRouter()
  const { c } = useTheme()
  const { role } = useRole()
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!role) return
    if (role !== 'admin' && role !== 'directeur') router.replace('/dashboard')
  }, [role, router])

  useEffect(() => { loadInventaires() }, [])

  const loadInventaires = async () => {
    const clientId = await getClientId()
    if (!clientId) { router.push('/'); return }

    const { data } = await supabase
      .from('inventaires')
      .select('*')
      .eq('client_id', clientId)
      .order('date_inventaire', { ascending: false })

    setInventaires(data || [])

    // Charger les lignes du dernier inventaire validé pour le dashboard
    const lastValidated = (data || []).find(i => i.statut === 'valide')
    if (lastValidated) {
      const { data: lignes } = await supabase
        .from('inventaire_lignes')
        .select('nom_ingredient, valeur_stock, ecart, cout_unitaire, quantite_theorique, est_critique')
        .eq('inventaire_id', lastValidated.id)
        .eq('client_id', clientId)
      setDernierLignes(lignes || [])
    } else {
      setDernierLignes([])
    }

    setLoading(false)
  }

  const deleteInventaire = async (inv, e) => {
    e.stopPropagation()
    const label = `${inv.type === 'tournant' ? 'Flash' : 'Complet'} — ${inv.section} (${formatDate(inv.date_inventaire)})`
    const msg = inv.statut === 'brouillon'
      ? `Supprimer ce brouillon ${label} ?`
      : `Supprimer l'inventaire validé ${label} ? Cette action est irréversible.`
    if (!window.confirm(msg)) return

    setDeleting(inv.id)
    try {
      const clientId = await getClientId()
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/inventaire/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ inventaireId: inv.id, clientId })
      })
      await loadInventaires()
    } finally {
      setDeleting(null)
    }
  }

  const brouillon = inventaires.find(i => i.statut === 'brouillon')
  const filtered = inventaires.filter(i => filtre === 'tous' || i.type === filtre)
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const formatEur = (v) => v != null ? v.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €' : '—'

  // ── KPIs ──────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const valeurStock = dernierLignes.reduce((s, l) => s + (Number(l.valeur_stock) || 0), 0)
    const ecartValeur = dernierLignes.reduce((s, l) => s + Math.abs((Number(l.ecart) || 0) * (Number(l.cout_unitaire) || 0)), 0)
    const nbCritiques = dernierLignes.filter(l =>
      l.ecart != null && l.quantite_theorique &&
      Math.abs(l.ecart / l.quantite_theorique) >= 0.15
    ).length
    const nbValides = inventaires.filter(i => i.statut === 'valide').length
    return { valeurStock, ecartValeur, nbCritiques, nbValides }
  }, [dernierLignes, inventaires])

  // ── Données graphiques ─────────────────────────────────────────────────
  const top10 = useMemo(() => [...dernierLignes]
    .sort((a, b) => (b.valeur_stock || 0) - (a.valeur_stock || 0))
    .slice(0, 10)
    .map(l => ({ name: l.nom_ingredient.length > 14 ? l.nom_ingredient.slice(0, 13) + '…' : l.nom_ingredient, value: Math.round(Number(l.valeur_stock) || 0) }))
  , [dernierLignes])

  const ecartDistrib = useMemo(() => {
    const nonNull = dernierLignes.filter(l => l.ecart != null && l.quantite_theorique)
    return [
      { name: 'OK (<5%)', value: nonNull.filter(l => Math.abs(l.ecart / l.quantite_theorique) < 0.05).length, color: '#16A34A' },
      { name: 'Attention', value: nonNull.filter(l => { const p = Math.abs(l.ecart / l.quantite_theorique); return p >= 0.05 && p < 0.15 }).length, color: '#D97706' },
      { name: 'Critique', value: nonNull.filter(l => Math.abs(l.ecart / l.quantite_theorique) >= 0.15).length, color: '#DC2626' },
      { name: 'Non saisi', value: dernierLignes.filter(l => l.ecart == null).length, color: '#E4E4E7' },
    ].filter(d => d.value > 0)
  }, [dernierLignes])

  const hasDashboardData = dernierLignes.length > 0

  if (loading) return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: c.texteMuted }}>Chargement...</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '1000px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '600', color: c.texte, margin: 0 }}>Inventaires</h1>
            <p style={{ fontSize: '12px', color: c.texteMuted, margin: '2px 0 0 0' }}>
              {hasDashboardData ? `Dernier inventaire validé · ${formatDate(inventaires.find(i => i.statut === 'valide')?.date_inventaire)}` : 'Aucun inventaire validé'}
            </p>
          </div>
          {role === 'admin' && (
            <button
              onClick={() => router.push('/inventaire/nouveau')}
              style={{ padding: '10px 20px', background: c.accent, color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}
            >
              + Nouvel inventaire
            </button>
          )}
        </div>

        {/* ── KPI Cards ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
          gap: '12px', marginBottom: '20px'
        }}>
          {[
            { label: 'Valorisation stock', value: hasDashboardData ? formatEur(kpis.valeurStock) : '—', sub: 'Dernier inventaire validé', icon: '📦', color: c.accent },
            { label: 'Écart valorisé', value: hasDashboardData ? formatEur(kpis.ecartValeur) : '—', sub: 'Différence réel vs théorique', icon: '⚖️', color: '#D97706' },
            { label: 'Écarts critiques', value: hasDashboardData ? kpis.nbCritiques : '—', sub: 'Lignes avec écart > 15%', icon: '⚠️', color: '#DC2626' },
            { label: 'Inventaires validés', value: kpis.nbValides, sub: 'Total historique', icon: '✅', color: '#16A34A' },
          ].map(kpi => (
            <div key={kpi.label} style={{
              background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`,
              padding: isMobile ? '14px' : '18px 20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', marginBottom: '6px' }}>{kpi.label}</div>
                  <div style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: '600', color: c.texte, lineHeight: 1 }}>{kpi.value}</div>
                  <div style={{ fontSize: '10px', color: c.texteMuted, marginTop: '4px' }}>{kpi.sub}</div>
                </div>
                <div style={{ fontSize: isMobile ? '20px' : '24px', opacity: 0.8 }}>{kpi.icon}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Charts (si données dispo) ── */}
        {hasDashboardData && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr',
            gap: '12px', marginBottom: '20px'
          }}>
            {/* BarChart Top 10 */}
            <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, padding: '16px 20px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: c.texte, marginBottom: '14px' }}>
                Top 10 — Valorisation stock
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={top10} margin={{ top: 4, right: 8, left: 0, bottom: 48 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#71717A' }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: '#71717A' }} tickFormatter={v => `${v}€`} width={48} />
                  <Tooltip formatter={(v) => [`${v} €`, 'Valeur stock']} />
                  <Bar dataKey="value" fill={c.accent} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* PieChart Répartition écarts */}
            <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, padding: '16px 20px' }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: c.texte, marginBottom: '14px' }}>
                Répartition des écarts
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={ecartDistrib}
                    cx="50%"
                    cy="45%"
                    outerRadius={isMobile ? 60 : 70}
                    dataKey="value"
                    label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {ecartDistrib.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                  <Tooltip formatter={(v, name) => [v + ' lignes', name]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── Banner brouillon ── */}
        {brouillon && (
          <div
            onClick={() => router.push(`/inventaire/${brouillon.id}/saisie`)}
            style={{
              padding: '16px', background: '#FFFBEB', border: '0.5px solid #FDE68A',
              borderRadius: '12px', marginBottom: '16px', cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}
          >
            <div>
              <div style={{ fontSize: '14px', fontWeight: '500', color: '#92400E' }}>
                Inventaire en cours ({brouillon.type === 'tournant' ? 'Flash' : 'Complet'})
              </div>
              <div style={{ fontSize: '12px', color: '#B45309', marginTop: '2px' }}>
                Commencé le {formatDate(brouillon.date_inventaire)} — cliquez pour reprendre
              </div>
            </div>
            <span style={{ fontSize: '20px' }}>→</span>
          </div>
        )}

        {/* ── Filtres ── */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
          {[{ id: 'tous', label: 'Tous' }, { id: 'tournant', label: 'Flash' }, { id: 'complet', label: 'Complets' }].map(f => (
            <button
              key={f.id}
              onClick={() => setFiltre(f.id)}
              style={{
                padding: '6px 14px', borderRadius: '20px', fontSize: '13px',
                border: `0.5px solid ${filtre === f.id ? c.accent : c.bordure}`,
                background: filtre === f.id ? c.accentClair : c.blanc,
                color: filtre === f.id ? c.accent : c.texteMuted,
                cursor: 'pointer', fontWeight: filtre === f.id ? '500' : '400'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* ── Liste ── */}
        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: c.texteMuted, fontSize: '14px' }}>
            Aucun inventaire pour le moment.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(inv => (
              <div
                key={inv.id}
                onClick={() => router.push(inv.statut === 'brouillon' ? `/inventaire/${inv.id}/saisie` : `/inventaire/${inv.id}`)}
                style={{
                  padding: '16px', background: c.blanc,
                  border: `0.5px solid ${c.bordure}`, borderRadius: '12px',
                  cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', gap: '12px'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: '500', color: c.texte }}>
                      {inv.type === 'tournant' ? 'Flash' : 'Complet'} — {inv.section}
                    </span>
                    <span style={{
                      fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
                      background: inv.statut === 'valide' ? '#DCFCE7' : '#FEF3C7',
                      color: inv.statut === 'valide' ? '#16A34A' : '#92400E',
                    }}>
                      {inv.statut === 'valide' ? 'Validé' : 'Brouillon'}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: c.texteMuted, marginTop: '4px' }}>
                    {formatDate(inv.date_inventaire)}
                    {inv.date_validation && ` — validé le ${formatDate(inv.date_validation)}`}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {role === 'admin' && inv.statut === 'brouillon' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); router.push(`/inventaire/${inv.id}/saisie`) }}
                      style={{
                        padding: '6px 10px', background: 'none',
                        border: `0.5px solid ${c.bordure}`, borderRadius: '8px',
                        fontSize: '13px', color: c.accent,
                        cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      Modifier
                    </button>
                  )}
                  {role === 'admin' && (
                    <button
                      onClick={(e) => deleteInventaire(inv, e)}
                      disabled={deleting === inv.id}
                      style={{
                        padding: '6px 10px', background: 'none',
                        border: `0.5px solid ${c.bordure}`, borderRadius: '8px',
                        fontSize: '13px', color: deleting === inv.id ? c.texteMuted : '#DC2626',
                        cursor: deleting === inv.id ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {deleting === inv.id ? '...' : 'Supprimer'}
                    </button>
                  )}
                  <span style={{ fontSize: '16px', color: c.texteMuted }}>›</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
