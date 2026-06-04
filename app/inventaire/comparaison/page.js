'use client'
import { useState, useEffect, useMemo } from 'react'
import { supabase, getClientId } from '../../../lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTheme } from '../../../lib/useTheme'
import { useRole } from '../../../lib/useRole'
import { useIsMobile } from '../../../lib/useIsMobile'
import Navbar from '../../../components/Navbar'
import ChefLoader from '../../../components/ChefLoader'

export default function ComparaisonInventairesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { c } = useTheme()
  const { role } = useRole()
  const isMobile = useIsMobile()

  const sectionParam = searchParams.get('section')
  const sectionFiltre = sectionParam === 'bar' || sectionParam === 'cuisine' ? sectionParam : null
  const navbarSection = sectionFiltre || (role === 'bar' ? 'bar' : 'cuisine')
  const queryString = sectionFiltre ? `?section=${sectionFiltre}` : ''

  const [inventaires, setInventaires] = useState([])
  const [idA, setIdA] = useState('')
  const [idB, setIdB] = useState('')
  const [lignesA, setLignesA] = useState(null)
  const [lignesB, setLignesB] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingLignes, setLoadingLignes] = useState(false)

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const formatEur = (v) => v != null ? v.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €' : '—'
  const formatQte = (v) => v != null ? Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—'

  // ── Charge les inventaires validés (les seuls comparables) ────────────────
  useEffect(() => {
    (async () => {
      const clientId = await getClientId()
      if (!clientId) { router.push('/'); return }
      let query = supabase
        .from('inventaires')
        .select('id, type, section, date_inventaire, statut')
        .eq('client_id', clientId)
        .eq('statut', 'valide')
      if (sectionFiltre) query = query.in('section', [sectionFiltre, 'global'])
      const { data } = await query.order('date_inventaire', { ascending: false })
      const list = data || []
      setInventaires(list)
      // Défaut : B = plus récent, A = précédent
      if (list.length >= 2) { setIdB(list[0].id); setIdA(list[1].id) }
      else if (list.length === 1) { setIdB(list[0].id) }
      setLoading(false)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionFiltre])

  // ── Charge les lignes des deux inventaires sélectionnés ───────────────────
  useEffect(() => {
    if (!idA || !idB || idA === idB) { setLignesA(null); setLignesB(null); return }
    (async () => {
      setLoadingLignes(true)
      const clientId = await getClientId()
      const cols = 'ingredient_id, nom_ingredient, unite, quantite_reelle, cout_unitaire, valeur_stock'
      const [resA, resB] = await Promise.all([
        supabase.from('inventaire_lignes').select(cols).eq('client_id', clientId).eq('inventaire_id', idA),
        supabase.from('inventaire_lignes').select(cols).eq('client_id', clientId).eq('inventaire_id', idB),
      ])
      setLignesA(resA.data || [])
      setLignesB(resB.data || [])
      setLoadingLignes(false)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idA, idB])

  const invA = inventaires.find(i => i.id === idA)
  const invB = inventaires.find(i => i.id === idB)

  // ── Calcul de la comparaison ──────────────────────────────────────────────
  const compare = useMemo(() => {
    if (!lignesA || !lignesB) return null
    // Clé de rapprochement : ingredient_id en priorité, sinon nom normalisé
    const key = (l) => l.ingredient_id || ('nom:' + (l.nom_ingredient || '').toLowerCase().trim())
    const map = new Map()
    const ensure = (l) => {
      const k = key(l)
      if (!map.has(k)) map.set(k, { nom: l.nom_ingredient, unite: l.unite, qtyA: null, valA: 0, qtyB: null, valB: 0 })
      return map.get(k)
    }
    for (const l of lignesA) {
      const e = ensure(l)
      e.qtyA = (e.qtyA || 0) + (Number(l.quantite_reelle) || 0)
      e.valA += Number(l.valeur_stock) || 0
    }
    for (const l of lignesB) {
      const e = ensure(l)
      e.nom = l.nom_ingredient || e.nom
      e.unite = l.unite || e.unite
      e.qtyB = (e.qtyB || 0) + (Number(l.quantite_reelle) || 0)
      e.valB += Number(l.valeur_stock) || 0
    }
    const rows = Array.from(map.values()).map(e => ({
      ...e,
      varQty: (e.qtyB || 0) - (e.qtyA || 0),
      varVal: e.valB - e.valA,
    }))
    rows.sort((a, b) => Math.abs(b.varVal) - Math.abs(a.varVal))
    const totA = rows.reduce((s, r) => s + r.valA, 0)
    const totB = rows.reduce((s, r) => s + r.valB, 0)
    return { rows, totA, totB, totVar: totB - totA }
  }, [lignesA, lignesB])

  const selectStyle = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc,
    outline: 'none', color: c.texte, cursor: 'pointer',
  }
  const invLabel = (i) => `${i.type === 'tournant' ? 'Flash' : 'Complet'} — ${i.section} · ${formatDate(i.date_inventaire)}`

  if (loading) return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section={navbarSection} />
      <ChefLoader />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section={navbarSection} />
      <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1000px', margin: '0 auto' }}>

        <button onClick={() => router.push(`/inventaire${queryString}`)}
          style={{ background: 'none', border: 'none', color: c.texteMuted, fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '12px' }}>
          ← Inventaires
        </button>

        <h1 style={{ fontSize: '20px', fontWeight: '600', color: c.texte, margin: '0 0 6px 0' }}>
          Comparer deux inventaires
        </h1>
        <p style={{ fontSize: '13px', color: c.texteMuted, margin: '0 0 20px 0' }}>
          Sélectionne deux inventaires validés pour voir la variation de stock (quantité et valeur) entre les deux.
        </p>

        {inventaires.length < 2 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: c.texteMuted, fontSize: '14px', background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}` }}>
            Il faut au moins 2 inventaires validés pour faire une comparaison.
          </div>
        ) : (
          <>
            {/* Sélecteurs A / B */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto 1fr', gap: '12px', alignItems: 'end', marginBottom: '20px' }}>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Inventaire de référence (A)</label>
                <select value={idA} onChange={e => setIdA(e.target.value)} style={selectStyle}>
                  <option value="">— choisir —</option>
                  {inventaires.map(i => <option key={i.id} value={i.id} disabled={i.id === idB}>{invLabel(i)}</option>)}
                </select>
              </div>
              <div style={{ textAlign: 'center', fontSize: '18px', color: c.texteMuted, paddingBottom: '8px' }}>→</div>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Inventaire comparé (B)</label>
                <select value={idB} onChange={e => setIdB(e.target.value)} style={selectStyle}>
                  <option value="">— choisir —</option>
                  {inventaires.map(i => <option key={i.id} value={i.id} disabled={i.id === idA}>{invLabel(i)}</option>)}
                </select>
              </div>
            </div>

            {idA && idB && idA === idB && (
              <div style={{ padding: '12px 16px', background: '#FEF3C7', border: '0.5px solid #FDE68A', borderRadius: '8px', fontSize: '13px', color: '#92400E', marginBottom: '16px' }}>
                Choisis deux inventaires différents.
              </div>
            )}

            {loadingLignes && <ChefLoader message="Calcul de la comparaison..." />}

            {!loadingLignes && compare && (
              <>
                {/* Totaux */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
                  {[
                    { label: 'Valorisation A', value: formatEur(compare.totA), sub: formatDate(invA?.date_inventaire), color: c.texte },
                    { label: 'Valorisation B', value: formatEur(compare.totB), sub: formatDate(invB?.date_inventaire), color: c.texte },
                    { label: 'Variation totale', value: (compare.totVar >= 0 ? '+' : '') + formatEur(compare.totVar), sub: 'B − A', color: compare.totVar >= 0 ? '#16A34A' : '#DC2626' },
                  ].map(kpi => (
                    <div key={kpi.label} style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, padding: isMobile ? '14px' : '18px 20px' }}>
                      <div className="sk-label-muted" style={{ color: c.texteMuted, marginBottom: '6px' }}>{kpi.label}</div>
                      <div style={{ fontSize: isMobile ? '20px' : '26px', fontWeight: '600', color: kpi.color, lineHeight: 1 }}>{kpi.value}</div>
                      <div style={{ fontSize: '10px', color: c.texteMuted, marginTop: '4px' }}>{kpi.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Tableau de variation */}
                <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: `0.5px solid ${c.bordure}`, fontSize: '13px', fontWeight: '600', color: c.texte }}>
                    Variation par article ({compare.rows.length})
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: c.fond }}>
                          <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase' }}>Article</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Qté A</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Qté B</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Δ Qté</th>
                          <th style={{ padding: '8px 16px', textAlign: 'right', fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Δ Valeur</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compare.rows.map((r, i) => {
                          const onlyA = r.qtyB == null
                          const onlyB = r.qtyA == null
                          return (
                            <tr key={i} style={{ borderTop: `0.5px solid ${c.bordure}` }}>
                              <td style={{ padding: '8px 16px', color: c.texte }}>
                                {r.nom}
                                {onlyA && <span style={{ fontSize: '10px', color: c.texteMuted, marginLeft: '6px' }}>(absent de B)</span>}
                                {onlyB && <span style={{ fontSize: '10px', color: '#16A34A', marginLeft: '6px' }}>(nouveau)</span>}
                                {r.unite && <span style={{ fontSize: '11px', color: c.texteMuted, marginLeft: '6px' }}>· {r.unite}</span>}
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', color: c.texteMuted, whiteSpace: 'nowrap' }}>{formatQte(r.qtyA)}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', color: c.texteMuted, whiteSpace: 'nowrap' }}>{formatQte(r.qtyB)}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap', color: r.varQty > 0 ? '#16A34A' : r.varQty < 0 ? '#DC2626' : c.texteMuted }}>
                                {r.varQty > 0 ? '+' : ''}{formatQte(r.varQty)}
                              </td>
                              <td style={{ padding: '8px 16px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: '500', color: r.varVal > 0 ? '#16A34A' : r.varVal < 0 ? '#DC2626' : c.texteMuted }}>
                                {r.varVal >= 0 ? '+' : ''}{formatEur(r.varVal)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
