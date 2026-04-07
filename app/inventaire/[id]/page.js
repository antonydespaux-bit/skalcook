'use client'
import { useState, useEffect } from 'react'
import { supabase, getClientId } from '../../../lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { useTheme } from '../../../lib/useTheme'
import { useIsMobile } from '../../../lib/useIsMobile'
import Navbar from '../../../components/Navbar'
import ChefLoader from '../../../components/ChefLoader'

export default function DetailInventairePage() {
  const params = useParams()
  const inventaireId = params.id
  const router = useRouter()
  const { c } = useTheme()
  const isMobile = useIsMobile()

  const [inventaire, setInventaire] = useState(null)
  const [lignes, setLignes] = useState([])
  const [loading, setLoading] = useState(true)
  const [validating, setValidating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const clientId = await getClientId()
    if (!clientId) { router.push('/'); return }

    const [{ data: inv }, { data: lig }] = await Promise.all([
      supabase.from('inventaires').select('*').eq('id', inventaireId).eq('client_id', clientId).maybeSingle(),
      supabase.from('inventaire_lignes').select('*').eq('inventaire_id', inventaireId).eq('client_id', clientId).order('nom_ingredient'),
    ])

    if (!inv) { router.push('/inventaire'); return }
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

  if (loading) return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
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

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section={inventaire?.section === 'bar' ? 'bar' : 'cuisine'} />

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '800px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '20px' }}>
          <button
            onClick={() => router.push('/inventaire')}
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

        {/* Tableau des lignes */}
        <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${c.bordure}` }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: c.texteMuted, fontWeight: '500', fontSize: '12px' }}>Ingrédient</th>
                <th style={{ padding: '12px 8px', textAlign: 'right', color: c.texteMuted, fontWeight: '500', fontSize: '12px' }}>Théo.</th>
                <th style={{ padding: '12px 8px', textAlign: 'right', color: c.texteMuted, fontWeight: '500', fontSize: '12px' }}>Réel</th>
                <th style={{ padding: '12px 8px', textAlign: 'right', color: c.texteMuted, fontWeight: '500', fontSize: '12px' }}>Écart</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', color: c.texteMuted, fontWeight: '500', fontSize: '12px' }}>Valeur</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map(l => {
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

        {/* Actions */}
        {isBrouillon && (
          <div style={{ display: 'flex', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
            <button
              onClick={() => router.push(`/inventaire/${inventaireId}/saisie`)}
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
