'use client'
import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { supabase, getClientId, fetchAllRows } from '../../../lib/supabase'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useTheme } from '../../../lib/useTheme'
import { useIsMobile } from '../../../lib/useIsMobile'
import Navbar from '../../../components/Navbar'
import ChefLoader from '../../../components/ChefLoader'

export default function DetailInventairePage() {
  const params = useParams()
  const inventaireId = params.id
  const router = useRouter()
  const searchParams = useSearchParams()
  const { c } = useTheme()
  const isMobile = useIsMobile()

  // Préserve le contexte ?section= entre la liste et le détail/saisie pour
  // que la navbar reste cohérente (cf. #113). Le param URL prime sur la
  // section de l'inventaire — sinon un admin venant de bar perdrait son
  // contexte en ouvrant un inventaire 'global'.
  const sectionParam = searchParams.get('section')
  const queryString = sectionParam === 'bar' || sectionParam === 'cuisine' ? `?section=${sectionParam}` : ''
  const navbarSection = inv => {
    if (sectionParam === 'bar') return 'bar'
    if (sectionParam === 'cuisine') return 'cuisine'
    return inv?.section === 'bar' ? 'bar' : 'cuisine'
  }

  const [inventaire, setInventaire] = useState(null)
  const [lignes, setLignes] = useState([])
  const [recherche, setRecherche] = useState('')
  const [loading, setLoading] = useState(true)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const clientId = await getClientId()
    if (!clientId) { router.push('/'); return }

    const [{ data: inv }, lig] = await Promise.all([
      supabase.from('inventaires').select('*').eq('id', inventaireId).eq('client_id', clientId).maybeSingle(),
      fetchAllRows((from, to) =>
        supabase.from('inventaire_lignes').select('*').eq('inventaire_id', inventaireId).eq('client_id', clientId).order('nom_ingredient').order('id').range(from, to)
      ),
    ])

    if (!inv) { router.push(`/inventaire${queryString}`); return }
    setInventaire(inv)
    setLignes(lig || [])
    setLoading(false)
  }

  const handleValider = async () => {
    setValidating(true)
    setError('')
    try {
      const clientId = await getClientId()
      const { data: { session } } = await supabase.auth.getSession()

      const res = await fetch('/api/inventaire/valider', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ inventaireId, clientId })
      })

      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Erreur.'); setValidating(false); return }

      await loadData()
    } catch (err) {
      setError('Erreur réseau.')
      setValidating(false)
    }
  }

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'

  const exportXlsx = () => {
    if (!inventaire || lignes.length === 0) return
    const header = [
      'Ingrédient', 'Unité', 'Prix unitaire (€)',
      'Qté théorique', 'Qté réelle', 'Écart',
      'Écart valorisé (€)', 'Valeur stock (€)',
    ]
    const rows = lignes.map(l => {
      const ecart = l.ecart != null ? Number(l.ecart) : null
      const cout = l.cout_unitaire != null ? Number(l.cout_unitaire) : null
      return [
        l.nom_ingredient || '',
        l.unite || '',
        cout,
        l.quantite_theorique != null ? Number(l.quantite_theorique) : null,
        l.quantite_reelle != null ? Number(l.quantite_reelle) : null,
        ecart,
        ecart != null && cout != null ? +(ecart * cout).toFixed(2) : null,
        l.valeur_stock != null ? Number(l.valeur_stock) : null,
      ]
    })
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
    ws['!cols'] = [
      { wch: 32 }, { wch: 10 }, { wch: 14 },
      { wch: 14 }, { wch: 14 }, { wch: 10 },
      { wch: 16 }, { wch: 14 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inventaire')
    const safeDate = (inventaire.date_inventaire || '').slice(0, 10) || 'sans-date'
    const safeSection = (inventaire.section || 'inventaire').replace(/[^a-z0-9-]/gi, '-').toLowerCase()
    XLSX.writeFile(wb, `inventaire_${safeSection}_${safeDate}.xlsx`)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section={sectionParam === 'bar' ? 'bar' : 'cuisine'} />
      <ChefLoader />
    </div>
  )

  // Stats
  const lignesSaisies = lignes.filter(l => l.quantite_reelle != null)
  const lignesNonSaisies = lignes.filter(l => l.quantite_reelle == null)
  const valeurStockTotal = lignesSaisies.reduce((s, l) => s + (Number(l.valeur_stock) || 0), 0)
  const ecartTotal = lignesSaisies.reduce((s, l) => s + ((l.ecart != null ? Number(l.ecart) : 0) * (Number(l.cout_unitaire) || 0)), 0)

  const lignesOk = lignesSaisies.filter(l => {
    if (l.ecart == null || !l.quantite_theorique) return true
    return Math.abs(l.ecart / l.quantite_theorique) < 0.05
  })
  const lignesWarning = lignesSaisies.filter(l => {
    if (l.ecart == null || !l.quantite_theorique) return false
    const pct = Math.abs(l.ecart / l.quantite_theorique)
    return pct >= 0.05 && pct < 0.15
  })
  const lignesCritiques = lignesSaisies.filter(l => {
    if (l.ecart == null || !l.quantite_theorique) return false
    return Math.abs(l.ecart / l.quantite_theorique) >= 0.15
  })

  const isBrouillon = inventaire?.statut === 'brouillon'

  const rechercheNorm = recherche.trim().toLowerCase()
  const lignesAffichees = rechercheNorm
    ? lignes.filter(l => (l.nom_ingredient || '').toLowerCase().includes(rechercheNorm))
    : lignes

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section={navbarSection(inventaire)} />

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '800px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '20px' }}>
          <button
            onClick={() => router.push(`/inventaire${queryString}`)}
            style={{ background: 'none', border: 'none', color: c.texteMuted, fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '12px' }}
          >
            ← Inventaires
          </button>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h1 style={{ fontSize: '18px', fontWeight: '600', color: c.texte, margin: '0 0 4px 0' }}>
                Inventaire {inventaire.type === 'tournant' ? 'Flash' : 'Complet'} — {inventaire.section}
              </h1>
              <div style={{ fontSize: '13px', color: c.texteMuted }}>
                {formatDate(inventaire.date_inventaire)}
                {inventaire.date_validation && ` — validé le ${formatDate(inventaire.date_validation)}`}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {lignes.length > 0 && (
                <button
                  onClick={exportXlsx}
                  style={{
                    padding: '6px 12px', background: c.blanc,
                    border: `0.5px solid ${c.bordure}`, color: c.texte,
                    borderRadius: '20px', fontSize: '12px', fontWeight: '500',
                    cursor: 'pointer',
                  }}
                >
                  📤 Export Excel
                </button>
              )}
              <span style={{
                fontSize: '12px', padding: '4px 12px', borderRadius: '20px',
                background: isBrouillon ? '#FEF3C7' : '#DCFCE7',
                color: isBrouillon ? '#92400E' : '#16A34A',
                fontWeight: '500',
              }}>
                {isBrouillon ? 'Brouillon' : 'Validé'}
              </span>
            </div>
          </div>
        </div>

        {error && (
          <div style={{ padding: '12px', background: '#FEE2E2', border: '0.5px solid #FECACA', borderRadius: '10px', color: '#DC2626', fontSize: '13px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {/* Stats résumées */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '20px' }}>
          <div style={{ padding: '16px', background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: '600', color: c.texte }}>{valeurStockTotal.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</div>
            <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px' }}>Valeur stock</div>
          </div>
          <div style={{ padding: '16px', background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: '600', color: ecartTotal < 0 ? '#DC2626' : '#16A34A' }}>
              {ecartTotal > 0 ? '+' : ''}{ecartTotal.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €
            </div>
            <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px' }}>Écart valorisé</div>
          </div>
          <div style={{ padding: '16px', background: '#DCFCE7', borderRadius: '12px', border: '0.5px solid #86EFAC', textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: '600', color: '#16A34A' }}>{lignesOk.length}</div>
            <div style={{ fontSize: '11px', color: '#16A34A', marginTop: '4px' }}>OK</div>
          </div>
          <div style={{ padding: '16px', background: lignesCritiques.length > 0 ? '#FEE2E2' : '#FEF3C7', borderRadius: '12px', border: `0.5px solid ${lignesCritiques.length > 0 ? '#FECACA' : '#FDE68A'}`, textAlign: 'center' }}>
            <div style={{ fontSize: '20px', fontWeight: '600', color: lignesCritiques.length > 0 ? '#DC2626' : '#D97706' }}>
              {lignesWarning.length + lignesCritiques.length}
            </div>
            <div style={{ fontSize: '11px', color: lignesCritiques.length > 0 ? '#DC2626' : '#D97706', marginTop: '4px' }}>Écarts</div>
          </div>
        </div>

        {/* Recherche */}
        {lignes.length > 0 && (
          <input
            type="text"
            placeholder="Rechercher un ingrédient..."
            value={recherche}
            onChange={e => setRecherche(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px', borderRadius: '10px',
              border: `0.5px solid ${c.bordure}`, fontSize: '14px',
              outline: 'none', color: c.texte, background: c.blanc,
              marginBottom: '12px', boxSizing: 'border-box'
            }}
          />
        )}

        {/* Tableau des lignes */}
        <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${c.bordure}` }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: c.texteMuted, fontWeight: '500', fontSize: '12px' }}>Ingrédient</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', color: c.texteMuted, fontWeight: '500', fontSize: '12px', whiteSpace: 'nowrap' }}>Prix U.</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', color: c.texteMuted, fontWeight: '500', fontSize: '12px' }}>Théo.</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', color: c.texteMuted, fontWeight: '500', fontSize: '12px' }}>Réel</th>
                  <th style={{ padding: '12px 8px', textAlign: 'right', color: c.texteMuted, fontWeight: '500', fontSize: '12px' }}>Écart</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', color: c.texteMuted, fontWeight: '500', fontSize: '12px' }}>Valeur</th>
                </tr>
              </thead>
              <tbody>
                {lignesAffichees.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '20px 16px', textAlign: 'center', color: c.texteMuted, fontSize: '13px' }}>
                      Aucun ingrédient ne correspond à « {recherche} ».
                    </td>
                  </tr>
                )}
                {lignesAffichees.map(l => {
                  const ecart = l.ecart != null ? Number(l.ecart) : null
                  const ecartPct = ecart != null && l.quantite_theorique
                    ? Math.abs(ecart / Number(l.quantite_theorique)) * 100 : null
                  const couleur = ecartPct == null ? c.texte
                    : ecartPct < 5 ? '#16A34A'
                    : ecartPct < 15 ? '#D97706'
                    : '#DC2626'

                  return (
                    <tr key={l.id} style={{ borderBottom: `0.5px solid ${c.bordure}` }}>
                      <td style={{ padding: '10px 16px', color: c.texte }}>
                        {l.nom_ingredient}
                        {l.est_critique && <span style={{ fontSize: '9px', background: '#FEF3C7', color: '#92400E', padding: '1px 5px', borderRadius: '8px', marginLeft: '6px' }}>P</span>}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', color: c.texteMuted, whiteSpace: 'nowrap' }}>
                        {l.cout_unitaire != null ? `${Number(l.cout_unitaire).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €${l.unite ? `/${l.unite}` : ''}` : '—'}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', color: c.texteMuted }}>
                        {l.quantite_theorique != null ? Number(l.quantite_theorique).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—'} {l.unite}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', color: c.texte, fontWeight: '500' }}>
                        {l.quantite_reelle != null ? Number(l.quantite_reelle).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : '—'} {l.quantite_reelle != null ? l.unite : ''}
                      </td>
                      <td style={{ padding: '10px 8px', textAlign: 'right', color: couleur, fontWeight: '500' }}>
                        {ecart != null ? `${ecart > 0 ? '+' : ''}${ecart.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: c.texte }}>
                        {l.valeur_stock != null ? `${Number(l.valeur_stock).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        {isBrouillon && (
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
            <button
              onClick={() => router.push(`/inventaire/${inventaireId}/saisie${queryString}`)}
              style={{
                flex: 1, padding: '14px', background: c.blanc,
                border: `1px solid ${c.accent}`, color: c.accent,
                borderRadius: '12px', fontSize: '14px', fontWeight: '500',
                cursor: 'pointer', minWidth: '140px'
              }}
            >
              ← Corriger
            </button>
            <button
              onClick={handleValider}
              disabled={validating}
              style={{
                flex: 1, padding: '14px',
                background: validating ? c.texteMuted : '#16A34A',
                color: 'white', border: 'none', borderRadius: '12px',
                fontSize: '14px', fontWeight: '500',
                cursor: validating ? 'not-allowed' : 'pointer', minWidth: '140px'
              }}
            >
              {validating ? 'Validation...' : 'Valider et clore'}
            </button>
          </div>
        )}

        {lignesNonSaisies.length > 0 && isBrouillon && (
          <div style={{ fontSize: '12px', color: '#D97706', textAlign: 'center', marginTop: '10px' }}>
            {lignesNonSaisies.length} ligne(s) non saisie(s) — elles seront comptées à 0.
          </div>
        )}
      </div>
    </div>
  )
}
