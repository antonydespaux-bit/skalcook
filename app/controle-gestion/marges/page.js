'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getClientId } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import Navbar from '../../../components/Navbar'

/** Fallback temporaire si `getClientId()` est vide (debug multi-établissement). À retirer une fois le client résolu. */
const DEBUG_FALLBACK_CLIENT_ID = 'fa725e66-2cad-4ea4-892a-7eb3e90496a7'

function normalizeFicheEmbed(fichesField) {
  if (fichesField == null) return null
  if (Array.isArray(fichesField)) return fichesField.length ? fichesField[0] : null
  return fichesField
}

function todayIsoDate() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatEuro(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

function formatPct(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return `${Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`
}

/**
 * Agrège les lignes ventes_journalieres par fiche pour la journée :
 * CA net = somme (quantite_vendue * prix_vente_net).
 * Coût matière = cout_portion (HT) * somme des quantités — aligné sur public.fiches.cout_portion.
 */
function aggregateByFiche(rows) {
  const map = new Map()
  for (const row of rows) {
    const fid = row.fiche_id
    const q = Number(row.quantite_vendue) || 0
    const pu = Number(row.prix_vente_net) || 0
    const lineCa = q * pu
    const fiche = normalizeFicheEmbed(row.fiches)
    const nom = fiche?.nom ?? null
    const coutPortion =
      fiche && fiche.cout_portion != null ? Number(fiche.cout_portion) : null

    const missingLabel = fid ? `Fiche non trouvée (ID: ${fid})` : '—'

    if (!map.has(fid)) {
      map.set(fid, {
        fiche_id: fid,
        designation: nom ?? missingLabel,
        quantiteVendue: 0,
        caNet: 0,
        coutPortion,
      })
    }
    const agg = map.get(fid)
    agg.quantiteVendue += q
    agg.caNet += lineCa
    if (nom) agg.designation = nom
    if (agg.coutPortion == null && coutPortion != null) agg.coutPortion = coutPortion
  }

  return Array.from(map.values())
    .map((r) => {
      const coutMatiere =
        r.coutPortion != null ? r.quantiteVendue * r.coutPortion : null
      const margeBrute =
        coutMatiere != null ? r.caNet - coutMatiere : null
      const margePct =
        margeBrute != null && r.caNet > 0 ? (margeBrute / r.caNet) * 100 : null
      return { ...r, coutMatiere, margeBrute, margePct }
    })
    .sort((a, b) => a.designation.localeCompare(b.designation, 'fr'))
}

export default function MargesVentesPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()
  const [authReady, setAuthReady] = useState(false)
  const [clientId, setClientId] = useState(null)
  const [jour, setJour] = useState(todayIsoDate)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rawRows, setRawRows] = useState([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return
        if (!session) {
          router.replace('/')
          return
        }
        setAuthReady(true)
      } catch {
        if (!cancelled) router.replace('/')
      }
    })()
    return () => { cancelled = true }
  }, [router])

  const loadVentes = useCallback(async () => {
    setError('')
    let cid = await getClientId()
    console.log('getClientId() →', cid ?? '(vide)')
    if (!cid) {
      console.warn('getClientId vide — utilisation du client debug temporaire:', DEBUG_FALLBACK_CLIENT_ID)
      cid = DEBUG_FALLBACK_CLIENT_ID
    }
    setClientId(cid)

    setLoading(true)

    const cleanJour = String(jour).trim()

    console.log("FETCH SQL : select * from ventes_journalieres where client_id =", cid, "and jour =", cleanJour)

    const { data: ventesBrutes, error: qErr } = await supabase
      .from('ventes_journalieres')
      .select('id, fiche_id, quantite_vendue, prix_vente_net, created_at')
      .eq('client_id', cid)
      .filter('jour', 'eq', cleanJour)
      .order('created_at', { ascending: true })

    if (qErr) {
      console.error(qErr)
      setError(qErr.message || 'Impossible de charger les ventes.')
      setRawRows([])
      setLoading(false)
      return
    }

    const ventes = ventesBrutes || []
    console.log('Ventes journalières (brut) :', ventes.length, 'ligne(s)')

    if (ventes.length === 0) {
      const { count } = await supabase
        .from('ventes_journalieres')
        .select('*', { count: 'exact', head: true })
        .eq('jour', cleanJour)
      console.log("TEST GLOBAL (sans filtre client) :", count, "lignes trouvées pour ce jour.")
    }

    const ficheIds = [...new Set(ventes.map((v) => v.fiche_id).filter(Boolean))]
    let ficheById = {}
    if (ficheIds.length > 0) {
      const { data: fichesRows, error: fErr } = await supabase
        .from('fiches')
        .select('id, nom, cout_portion')
        .in('id', ficheIds)

      if (fErr) {
        console.warn('Chargement fiches (complémentaire) :', fErr.message)
      } else {
        ficheById = Object.fromEntries((fichesRows || []).map((f) => [f.id, f]))
      }
    }

    const merged = ventes.map((v) => ({
      ...v,
      fiches: ficheById[v.fiche_id] ?? null,
    }))

    setRawRows(merged)
    setLoading(false)
  }, [jour])

  useEffect(() => {
    if (!authReady) return
    loadVentes()
  }, [authReady, loadVentes])

  const lignes = useMemo(() => aggregateByFiche(rawRows), [rawRows])

  const totaux = useMemo(() => {
    let q = 0
    let ca = 0
    let cout = 0
    let hasCout = true
    for (const L of lignes) {
      q += L.quantiteVendue
      ca += L.caNet
      if (L.coutMatiere != null) cout += L.coutMatiere
      else hasCout = false
    }
    const marge = hasCout ? ca - cout : null
    const margePct = marge != null && ca > 0 ? (marge / ca) * 100 : null
    return { quantiteVendue: q, caNet: ca, coutMatiere: hasCout ? cout : null, margeBrute: marge, margePct }
  }, [lignes])

  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
        Chargement…
      </div>
    )
  }

  const th = {
    padding: isMobile ? '10px 8px' : '12px 14px',
    textAlign: 'left',
    fontWeight: 600,
    fontSize: 12,
    color: c.texteMuted,
    borderBottom: `1px solid ${c.bordure}`,
    whiteSpace: 'nowrap',
  }
  const td = {
    padding: isMobile ? '10px 8px' : '12px 14px',
    fontSize: 14,
    color: c.texte,
    borderBottom: `1px solid ${c.bordure}`,
  }
  const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1200px', margin: '0 auto' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: isMobile ? 22 : 26, fontWeight: 600, color: c.texte }}>
          Marges sur ventes journalières
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: c.texteMuted, maxWidth: '720px' }}>
          Données issues de <code style={{ fontSize: 12 }}>ventes_journalieres</code>, coût matière depuis{' '}
          <code style={{ fontSize: 12 }}>fiches.cout_portion</code> (coût portion HT).
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px 20px', marginBottom: '20px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: c.texte }}>
            <span style={{ color: c.texteMuted }}>Jour</span>
            <input
              type="date"
              value={jour}
              onChange={(e) => setJour(e.target.value)}
              style={{
                padding: '8px 10px',
                borderRadius: 8,
                border: `1px solid ${c.bordure}`,
                background: c.blanc,
                color: c.texte,
                fontSize: 14,
              }}
            />
          </label>
        </div>

        {!clientId && (
          <p style={{ color: c.texteMuted, fontSize: 14 }}>
            Sélectionnez un établissement (profil, lien avec <code style={{ fontSize: 12 }}>client_id</code>) pour afficher les marges.
          </p>
        )}

        {error && (
          <p style={{ color: '#B91C1C', fontSize: 14, marginBottom: 16 }}>{error}</p>
        )}

        {clientId && loading && (
          <p style={{ color: c.texteMuted, fontSize: 14 }}>Chargement des ventes…</p>
        )}

        {clientId && !loading && !error && lignes.length === 0 && (
          <p style={{ color: c.texteMuted, fontSize: 14 }}>Aucune vente enregistrée pour cette date.</p>
        )}

        {clientId && !loading && lignes.length > 0 && (
          <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${c.bordure}`, background: c.blanc }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 640 : 0 }}>
              <thead>
                <tr style={{ background: c.fond }}>
                  <th style={th}>Désignation</th>
                  <th style={{ ...th, textAlign: 'right' }}>Qté vendue</th>
                  <th style={{ ...th, textAlign: 'right' }}>CA net</th>
                  <th style={{ ...th, textAlign: 'right' }}>Coût matière total</th>
                  <th style={{ ...th, textAlign: 'right' }}>Marge brute</th>
                  <th style={{ ...th, textAlign: 'right' }}>Marge</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((L) => (
                  <tr key={L.fiche_id}>
                    <td style={td}>{L.designation}</td>
                    <td style={tdNum}>
                      {Number(L.quantiteVendue).toLocaleString('fr-FR', { maximumFractionDigits: 4 })}
                    </td>
                    <td style={tdNum}>{formatEuro(L.caNet)}</td>
                    <td style={tdNum}>{formatEuro(L.coutMatiere)}</td>
                    <td style={tdNum}>{formatEuro(L.margeBrute)}</td>
                    <td style={tdNum}>{formatPct(L.margePct)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 600, background: c.fond }}>
                  <td style={{ ...td, color: c.texte }}>Total</td>
                  <td style={{ ...tdNum, color: c.texte }}>
                    {Number(totaux.quantiteVendue).toLocaleString('fr-FR', { maximumFractionDigits: 4 })}
                  </td>
                  <td style={{ ...tdNum, color: c.texte }}>{formatEuro(totaux.caNet)}</td>
                  <td style={{ ...tdNum, color: c.texte }}>{formatEuro(totaux.coutMatiere)}</td>
                  <td style={{ ...tdNum, color: c.texte }}>{formatEuro(totaux.margeBrute)}</td>
                  <td style={{ ...tdNum, color: c.texte }}>{formatPct(totaux.margePct)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
