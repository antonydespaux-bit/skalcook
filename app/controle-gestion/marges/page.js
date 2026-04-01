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

function formatQte(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })
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

/**
 * Calcule la consommation théorique par ingrédient à partir des fiches vendues.
 * Formule : (quantiteVendue × fi.quantite) / fiche.nb_portions
 * Les fiches sans nb_portions (null ou 0) sont ignorées.
 */
function computeConsoTheorique(lignes, ficheIngsMap, ficheNbPortions) {
  const map = new Map()
  for (const ligne of lignes) {
    const nbPortions = ficheNbPortions[ligne.fiche_id]
    if (!nbPortions || nbPortions <= 0) continue
    for (const fi of (ficheIngsMap[ligne.fiche_id] || [])) {
      const conso = (ligne.quantiteVendue * (Number(fi.quantite) || 0)) / nbPortions
      const ingId = fi.ingredient_id
      if (!map.has(ingId)) {
        map.set(ingId, {
          ingredient_id: ingId,
          nom: fi.ingredients?.nom ?? `Ingrédient (${ingId})`,
          unite: fi.unite ?? '—',
          qteTotale: 0,
        })
      }
      map.get(ingId).qteTotale += conso
    }
  }
  return Array.from(map.values()).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
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
  const [ficheIngsMap, setFicheIngsMap] = useState({})

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
    const nextDay = new Date(cleanJour)
    nextDay.setDate(nextDay.getDate() + 1)
    const nextDayStr = nextDay.toISOString().slice(0, 10)

    console.log('FETCH SQL : select * from ventes_journalieres where client_id =', cid, 'and jour >=', cleanJour, 'and jour <', nextDayStr)

    const { data: ventesBrutes, error: qErr } = await supabase
      .from('ventes_journalieres')
      .select('id, fiche_id, quantite_vendue, prix_vente_net, created_at')
      .eq('client_id', cid)
      .gte('jour', cleanJour)
      .lt('jour', nextDayStr)
      .order('created_at', { ascending: true })

    if (qErr) {
      console.error(qErr)
      setError(qErr.message || 'Impossible de charger les ventes.')
      setRawRows([])
      setFicheIngsMap({})
      setLoading(false)
      return
    }

    const ventes = ventesBrutes || []
    console.log('Ventes journalières (brut) :', ventes.length, 'ligne(s)')

    if (ventes.length === 0) {
      // Test 1 : count global sans filtre → détecte si RLS bloque tout
      const { count: countGlobal } = await supabase
        .from('ventes_journalieres')
        .select('*', { count: 'exact', head: true })
      console.log('TEST GLOBAL (sans aucun filtre) :', countGlobal, 'lignes visibles.')

      // Test 2 : range sur jour sans filtre client → détecte type mismatch
      const { count: countJour } = await supabase
        .from('ventes_journalieres')
        .select('*', { count: 'exact', head: true })
        .gte('jour', cleanJour)
        .lt('jour', nextDayStr)
      console.log('TEST range jour (sans filtre client) :', countJour, 'lignes pour ce jour.')
    }

    const ficheIds = [...new Set(ventes.map((v) => v.fiche_id).filter(Boolean))]
    let ficheById = {}

    if (ficheIds.length > 0) {
      // Fetch fiches (avec nb_portions pour le calcul des consommations)
      const { data: fichesRows, error: fErr } = await supabase
        .from('fiches')
        .select('id, nom, cout_portion, nb_portions')
        .in('id', ficheIds)

      if (fErr) {
        console.warn('Chargement fiches (complémentaire) :', fErr.message)
      } else {
        ficheById = Object.fromEntries((fichesRows || []).map((f) => [f.id, f]))
      }

      // Fetch compositions (fiche_ingredients + nom ingrédient)
      const { data: fiRows, error: fiErr } = await supabase
        .from('fiche_ingredients')
        .select('fiche_id, ingredient_id, quantite, unite, ingredients(id, nom)')
        .in('fiche_id', ficheIds)
        .eq('client_id', cid)

      if (fiErr) {
        console.warn('Chargement fiche_ingredients :', fiErr.message)
        setFicheIngsMap({})
      } else {
        console.log('fiche_ingredients chargés :', (fiRows || []).length, 'ligne(s)')
        const grouped = {}
        for (const fi of (fiRows || [])) {
          if (!grouped[fi.fiche_id]) grouped[fi.fiche_id] = []
          grouped[fi.fiche_id].push(fi)
        }
        setFicheIngsMap(grouped)
      }
    } else {
      setFicheIngsMap({})
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

  // nb_portions par fiche_id, dérivé des rawRows (les fiches sont déjà embeddées)
  const ficheNbPortions = useMemo(() => {
    const map = {}
    for (const row of rawRows) {
      const fiche = normalizeFicheEmbed(row.fiches)
      if (fiche?.nb_portions != null && row.fiche_id)
        map[row.fiche_id] = Number(fiche.nb_portions)
    }
    return map
  }, [rawRows])

  const consoLignes = useMemo(
    () => computeConsoTheorique(lignes, ficheIngsMap, ficheNbPortions),
    [lignes, ficheIngsMap, ficheNbPortions]
  )

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
  const tdMuted = { ...tdNum, color: c.texteMuted }

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

        {/* ── Tableau des marges ── */}
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

        {/* ── Section Consommations Théoriques ── */}
        {clientId && !loading && (
          <div style={{ marginTop: 40 }}>
            <h2 style={{ margin: '0 0 6px', fontSize: isMobile ? 18 : 22, fontWeight: 600, color: c.texte }}>
              Analyse des consommations théoriques
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: c.texteMuted, maxWidth: '720px' }}>
              Consommation calculée d&apos;après les recettes (
              <code style={{ fontSize: 12 }}>fiche_ingredients</code>) et les ventes du jour.
              Formule&nbsp;: <em>qté vendue × quantité recette / nb&nbsp;portions</em>.
            </p>

            {consoLignes.length === 0 ? (
              <p style={{ color: c.texteMuted, fontSize: 14 }}>
                {lignes.length === 0
                  ? 'Aucune vente pour cette date.'
                  : 'Aucune composition de fiche disponible pour calculer les consommations (vérifiez que les fiches ont des ingrédients et un nombre de portions renseigné).'}
              </p>
            ) : (
              <div style={{ overflowX: 'auto', borderRadius: 12, border: `1px solid ${c.bordure}`, background: c.blanc }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: isMobile ? 560 : 0 }}>
                  <thead>
                    <tr style={{ background: c.fond }}>
                      <th style={th}>Ingrédient</th>
                      <th style={{ ...th, textAlign: 'right' }}>Qté théorique</th>
                      <th style={th}>Unité</th>
                      <th style={{ ...th, textAlign: 'right', color: c.texteMuted }}>Achats réels</th>
                      <th style={{ ...th, textAlign: 'right', color: c.texteMuted }}>Écart</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consoLignes.map((L) => (
                      <tr key={L.ingredient_id}>
                        <td style={td}>{L.nom}</td>
                        <td style={tdNum}>{formatQte(L.qteTotale)}</td>
                        <td style={td}>{L.unite}</td>
                        <td style={tdMuted}>—</td>
                        <td style={tdMuted}>—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
