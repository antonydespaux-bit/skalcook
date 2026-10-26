'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { supabase, getClientId } from '../../../../lib/supabase'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { useTheme } from '../../../../lib/useTheme'
import { usePermissions } from '../../../../lib/usePermissions'
import { texteSurAccent } from '../../../../lib/theme'
import { log } from '../../../../lib/useLog'
import Navbar from '../../../../components/Navbar'
import { decodeFileBytes, parseCsv } from '../../../../lib/csvImport'
import {
  COLONNES_CA,
  REGLAGES_DEFAUT,
  construireCellules,
  detecterTypeFichier,
  devinerColonne,
  devinerLieu,
  lireDepartements,
  lireTickets,
  periodeDuNomFichier,
  regrouperTickets,
} from '../../../../lib/caImportLightspeed'

const CHAMPS = ['couverts', ...COLONNES_CA]
const LIBELLES_CHAMPS = {
  couverts: 'cgVentes.common.covers',
  ca_food: 'cgVentes.common.caFood',
  ca_bev_20: 'cgVentes.saisie.caAlcool20',
  ca_bev_10: 'cgVentes.saisie.caSoft10',
  ca_autre: 'cgVentes.saisie.caOther',
}
const OPTIONS_COLONNES = [...COLONNES_CA, 'ignorer']
const CHAMP_COMPENSE = { ca_bev_10: 'ca_food', ca_autre: 'ca_bev_20' }

async function empreinte(buf) {
  const h = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const hhmm = (t) => String(t || '').slice(0, 5)
const totalCellule = (v) => COLONNES_CA.reduce((s, k) => s + Number(v[k] || 0), 0)

export default function ImportCaLightspeedPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'fr'
  const { loading: permLoading, peutModifier } = usePermissions()
  const peutEcrire = !permLoading && peutModifier('ventes')

  const [clientId, setClientId] = useState(null)
  const [lieux, setLieux] = useState([])
  const [reglagesBase, setReglagesBase] = useState(REGLAGES_DEFAUT)
  const [reglagesOuverts, setReglagesOuverts] = useState(null)
  const [historique, setHistorique] = useState([])
  const [fichiers, setFichiers] = useState([])
  const [choix, setChoix] = useState({})
  const [corrections, setCorrections] = useState({})
  const [joursExclus, setJoursExclus] = useState({})
  const [ticketsOuverts, setTicketsOuverts] = useState({})
  const [existants, setExistants] = useState([])
  const [erreur, setErreur] = useState('')
  const [message, setMessage] = useState('')
  const [enCours, setEnCours] = useState(false)

  const eur = useCallback(
    (n) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(n || 0),
    [locale]
  )
  const dateLongue = useCallback(
    (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    [locale]
  )

  // ── Chargement : établissement, lieux, réglages, historique ──────────────
  useEffect(() => {
    let annule = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/'); return }
      const cid = await getClientId()
      if (annule || !cid) return
      setClientId(cid)
      const [lieuxRes, reglRes, histRes] = await Promise.all([
        supabase.from('lieux_service').select('id, nom, ordre').eq('client_id', cid).eq('actif', true).order('ordre').order('nom'),
        supabase.from('ca_import_reglages').select('*').eq('client_id', cid).maybeSingle(),
        supabase.from('ca_imports').select('fichiers, created_at').eq('client_id', cid).order('created_at', { ascending: false }).limit(500),
      ])
      if (annule) return
      if (lieuxRes.error) { setErreur(lieuxRes.error.message); return }
      setLieux(lieuxRes.data || [])
      if (reglRes.data) setReglagesBase({ ...REGLAGES_DEFAUT, ...reglRes.data, coupure_jour: hhmm(reglRes.data.coupure_jour), fin_midi: hhmm(reglRes.data.fin_midi) })
      setHistorique(histRes.data || [])
    })()
    return () => { annule = true }
  }, [router])

  const nomLieu = useCallback((id) => lieux.find((l) => l.id === id)?.nom || '—', [lieux])

  // ── Lecture des fichiers déposés ──────────────────────────────────────────
  const ajouterFichiers = async (liste) => {
    setErreur(''); setMessage('')
    const nouveaux = []
    for (const f of liste) {
      const buf = await f.arrayBuffer()
      const { headers, rows } = parseCsv(decodeFileBytes(buf))
      const type = detecterTypeFichier(headers)
      const periode = periodeDuNomFichier(f.name)
      const hash = await empreinte(buf)
      const deja = historique.find((h) => (h.fichiers || []).some((x) => x.empreinte === hash))
      let probleme = ''
      let contenu = null
      if (!type) probleme = t('cgVentes.importTickets.fichierInconnu')
      else if (type === 'tickets') {
        contenu = lireTickets(headers, rows)
        if (contenu.tickets.length === 0) probleme = t('cgVentes.importTickets.aucunTicket')
      } else {
        if (!periode || periode.debut !== periode.fin) probleme = t('cgVentes.importTickets.departementsUnJour')
        else contenu = lireDepartements(headers, rows)
      }
      nouveaux.push({ nom: f.name, type, periode, empreinte: hash, deja: deja?.created_at || null, probleme, contenu })
    }
    setFichiers((prev) => [...prev.filter((p) => !nouveaux.some((n) => n.empreinte === p.empreinte)), ...nouveaux])
  }

  const retirerFichier = (hash) => setFichiers((prev) => prev.filter((f) => f.empreinte !== hash))

  // ── Calculs ───────────────────────────────────────────────────────────────
  const tickets = useMemo(() => {
    const vus = new Map()
    for (const f of fichiers) if (f.type === 'tickets' && f.contenu) for (const tk of f.contenu.tickets) vus.set(tk.id || `${f.empreinte}-${vus.size}`, tk)
    return [...vus.values()]
  }, [fichiers])

  const groupes = useMemo(() => regrouperTickets(tickets, reglagesBase), [tickets, reglagesBase])

  const departementsParJour = useMemo(() => {
    const out = {}
    for (const f of fichiers) if (f.type === 'departements' && f.contenu) out[f.periode.debut] = f.contenu
    return out
  }, [fichiers])

  // Profils / départements vus dans les fichiers mais absents des réglages
  const profilsNouveaux = useMemo(() => {
    const out = new Map()
    for (const g of groupes) if (!reglagesBase.lieux[g.profilCle] && !out.has(g.profilCle)) out.set(g.profilCle, g.profil)
    return [...out.entries()]
  }, [groupes, reglagesBase.lieux])

  const departementsNouveaux = useMemo(() => {
    const out = new Map()
    for (const deps of Object.values(departementsParJour))
      for (const d of deps) if (!reglagesBase.departements[d.cle] && !out.has(d.cle)) out.set(d.cle, d)
    return [...out.values()]
  }, [departementsParJour, reglagesBase.departements])

  // Les nouveautés reçoivent une proposition, enregistrée avec l'import
  const reglages = useMemo(() => {
    if (profilsNouveaux.length === 0 && departementsNouveaux.length === 0) return reglagesBase
    const lieuxR = { ...reglagesBase.lieux }
    for (const [k, libelle] of profilsNouveaux) lieuxR[k] = { libelle: libelle || '', defaut: devinerLieu(libelle, lieux), possibles: [], nouveau: true }
    const deps = { ...reglagesBase.departements }
    for (const d of departementsNouveaux) deps[d.cle] = { libelle: d.libelle, colonne: devinerColonne(d.libelle, d.taux), nouveau: true }
    return { ...reglagesBase, lieux: lieuxR, departements: deps }
  }, [reglagesBase, profilsNouveaux, departementsNouveaux, lieux])
  const setReglages = (maj) => setReglagesBase(maj(reglages))
  const aVerifier = Object.values(reglages.lieux).some((l) => l.nouveau) || Object.values(reglages.departements).some((d) => d.nouveau)
  const reglagesVisibles = reglagesOuverts ?? aVerifier

  const destinations = useMemo(() => {
    const out = {}
    for (const g of groupes) {
      const r = reglages.lieux[g.profilCle]
      out[g.cle] = choix[g.cle] || r?.defaut || null
    }
    return out
  }, [groupes, reglages.lieux, choix])

  const cellules = useMemo(
    () => construireCellules(groupes, destinations, departementsParJour, reglages.departements),
    [groupes, destinations, departementsParJour, reglages.departements]
  )

  const jours = useMemo(() => [...new Set(groupes.map((g) => g.jour))].sort(), [groupes])

  // Saisies existantes sur les journées concernées
  useEffect(() => {
    if (!clientId || jours.length === 0) return
    let annule = false
    supabase
      .from('ca_journalier')
      .select('jour, lieu_service_id, service, couverts, ca_food, ca_bev_20, ca_bev_10, ca_autre')
      .eq('client_id', clientId)
      .gte('jour', jours[0])
      .lte('jour', jours[jours.length - 1])
      .then(({ data, error }) => {
        if (annule) return
        if (error) setErreur(error.message)
        else setExistants((data || []).filter((e) => jours.includes(e.jour)))
      })
    return () => { annule = true }
  }, [clientId, jours])

  const existantsJours = useMemo(() => existants.filter((e) => jours.includes(e.jour)), [existants, jours])

  // Lignes de l'aperçu, par journée : nouvelles cellules + saisies existantes
  // qui ne sont plus alimentées (remises à zéro pour garder le total juste).
  const lignesParJour = useMemo(() => {
    const out = {}
    for (const jour of jours) out[jour] = new Map()
    for (const cel of cellules) {
      const k = `${cel.jour}|${cel.lieu_service_id}|${cel.service}`
      out[cel.jour].set(k, { cle: k, jour: cel.jour, lieu_service_id: cel.lieu_service_id, service: cel.service, calcul: cel, actuel: null })
    }
    for (const e of existantsJours) {
      const k = `${e.jour}|${e.lieu_service_id}|${e.service}`
      const ligne = out[e.jour]?.get(k)
      if (ligne) ligne.actuel = e
      else out[e.jour]?.set(k, { cle: k, jour: e.jour, lieu_service_id: e.lieu_service_id, service: e.service, calcul: null, actuel: e })
    }
    const ordre = Object.fromEntries(lieux.map((l, i) => [l.id, i]))
    return Object.fromEntries(Object.entries(out).map(([j, m]) => [j, [...m.values()].sort((a, b) =>
      (a.service === b.service ? 0 : a.service === 'lunch' ? -1 : 1) || (ordre[a.lieu_service_id] ?? 99) - (ordre[b.lieu_service_id] ?? 99))]))
  }, [jours, cellules, existantsJours, lieux])

  const valeur = useCallback((ligne, champ) => {
    const corr = corrections[ligne.cle]?.[champ]
    if (corr !== undefined && corr !== '') return Number(corr)
    return ligne.calcul ? Number(ligne.calcul[champ] || 0) : 0
  }, [corrections])

  // Corriger Soft ou Autres retire la même somme du Food ou de l'Alcool de
  // la ligne (même taux de TVA) : le total de la ligne ne bouge pas.
  const corriger = (ligne, champ, v) => {
    const maj = { [champ]: v }
    const paire = CHAMP_COMPENSE[champ]
    if (paire) {
      const avant = valeur(ligne, champ)
      const apres = v === '' ? Number(ligne.calcul?.[champ] || 0) : Number(v)
      if (Number.isFinite(apres)) maj[paire] = (Math.round((valeur(ligne, paire) - (apres - avant)) * 100) / 100).toFixed(2)
    }
    setCorrections((p) => ({ ...p, [ligne.cle]: { ...p[ligne.cle], ...maj } }))
  }

  const groupesSansLieu = groupes.filter((g) => !destinations[g.cle])

  // ── Réglages ──────────────────────────────────────────────────────────────
  const majLieuReglage = (k, patch) => setReglages((r) => ({ ...r, lieux: { ...r.lieux, [k]: { ...r.lieux[k], ...patch } } }))
  const majDepartement = (k, patch) => setReglages((r) => ({ ...r, departements: { ...r.departements, [k]: { ...r.departements[k], ...patch } } }))

  const reglagesAEnregistrer = () => {
    const propre = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => {
      const { nouveau, ...reste } = v
      return [k, reste]
    }))
    return {
      client_id: clientId,
      coupure_jour: reglages.coupure_jour,
      fin_midi: reglages.fin_midi,
      lieux: propre(reglages.lieux),
      departements: propre(reglages.departements),
    }
  }

  const enregistrerReglages = async () => {
    setErreur(''); setMessage('')
    const { error } = await supabase.from('ca_import_reglages').upsert(reglagesAEnregistrer(), { onConflict: 'client_id' })
    if (error) { setErreur(error.message); return }
    setReglages((r) => {
      const sans = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { ...v, nouveau: false }]))
      return { ...r, lieux: sans(r.lieux), departements: sans(r.departements) }
    })
    setMessage(t('cgVentes.importTickets.reglagesEnregistres'))
  }

  // ── Validation ────────────────────────────────────────────────────────────
  const joursAImporter = jours.filter((j) => !joursExclus[j])

  const valider = async () => {
    setErreur(''); setMessage('')
    if (groupesSansLieu.some((g) => joursAImporter.includes(g.jour))) { setErreur(t('cgVentes.importTickets.lieuManquant')); return }
    const rows = []
    let total = 0
    for (const jour of joursAImporter) {
      for (const l of lignesParJour[jour] || []) {
        const row = { client_id: clientId, jour, lieu_service_id: l.lieu_service_id, service: l.service }
        for (const ch of CHAMPS) row[ch] = ch === 'couverts' ? Math.round(valeur(l, ch)) : Math.round(valeur(l, ch) * 100) / 100
        if (CHAMPS.some((ch) => row[ch] < 0)) { setErreur(t('cgVentes.importTickets.negatif', { jour: dateLongue(jour) })); return }
        total += totalCellule(row)
        rows.push(row)
      }
    }
    if (rows.length === 0) return
    setEnCours(true)
    try {
      const { error } = await supabase.from('ca_journalier').upsert(rows, { onConflict: 'client_id,jour,lieu_service_id,service' })
      if (error) throw error
      const { error: rErr } = await supabase.from('ca_import_reglages').upsert(reglagesAEnregistrer(), { onConflict: 'client_id' })
      if (rErr) throw rErr
      const fichiersImport = fichiers.filter((f) => f.contenu).map((f) => ({ nom: f.nom, empreinte: f.empreinte, type: f.type }))
      await supabase.from('ca_imports').insert({
        client_id: clientId, jour_debut: joursAImporter[0], jour_fin: joursAImporter[joursAImporter.length - 1],
        fichiers: fichiersImport, cellules: rows.length, total: Math.round(total * 100) / 100,
      })
      await log({ action: 'IMPORT', entite: 'ca_journalier', entite_nom: 'Import Lightspeed', details: { jours: joursAImporter, cellules: rows.length, total } })
      setMessage(t('cgVentes.importTickets.importe', { jours: joursAImporter.length, total: eur(total) }))
      setFichiers([]); setChoix({}); setCorrections({}); setJoursExclus({})
      setHistorique((h) => [{ fichiers: fichiersImport, created_at: new Date().toISOString() }, ...h])
      setReglages((r) => {
        const sans = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { ...v, nouveau: false }]))
        return { ...r, lieux: sans(r.lieux), departements: sans(r.departements) }
      })
    } catch (e) {
      setErreur(e.message || String(e))
    } finally {
      setEnCours(false)
    }
  }

  // ── Rendu ─────────────────────────────────────────────────────────────────
  const carte = { background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 12, padding: isMobile ? 14 : 18, marginBottom: 16 }
  const champ = { padding: '6px 8px', borderRadius: 8, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, fontSize: 13 }
  const bouton = (actif, plein = true) => ({
    padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: actif ? 'pointer' : 'default', opacity: actif ? 1 : 0.5,
    border: plein ? 'none' : `1px solid ${c.bordure}`, background: plein ? c.accent : c.blanc, color: plein ? texteSurAccent(c) : c.texte,
  })
  const servicesLibelle = { lunch: t('cgVentes.common.lunch'), dinner: t('cgVentes.common.dinner') }
  const etiquette = (fond, texte) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: fond, color: texte })

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ padding: isMobile ? 16 : 24, maxWidth: 1200, margin: '0 auto' }}>
        <Link href="/controle-gestion/ventes" style={{ fontSize: 13, color: c.texteMuted, textDecoration: 'none' }}>
          ← {t('cgVentes.importTickets.retour')}
        </Link>
        <h1 style={{ margin: '8px 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 600, color: c.texte }}>
          {t('cgVentes.importTickets.titre')}
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: c.texteMuted, lineHeight: 1.5 }}>
          {t('cgVentes.importTickets.intro')}
        </p>

        {erreur && <div style={{ ...carte, background: c.rougeClair, borderColor: c.rouge, color: c.rouge, fontSize: 14 }}>{erreur}</div>}
        {message && <div style={{ ...carte, background: c.vertClair, borderColor: c.vert, color: c.vert, fontSize: 14 }}>{message}</div>}

        {/* 1. Fichiers */}
        <div style={carte}>
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); ajouterFichiers([...e.dataTransfer.files]) }}
            style={{ display: 'block', border: `2px dashed ${c.bordure}`, borderRadius: 10, padding: 22, textAlign: 'center', cursor: 'pointer', color: c.texteMuted, fontSize: 14 }}
          >
            <input type="file" accept=".csv,text/csv" multiple style={{ display: 'none' }}
              onChange={(e) => { ajouterFichiers([...e.target.files]); e.target.value = '' }} />
            <div style={{ fontWeight: 600, color: c.texte, marginBottom: 4 }}>{t('cgVentes.importTickets.deposer')}</div>
            {t('cgVentes.importTickets.deposerAide')}
          </label>
          {fichiers.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {fichiers.map((f) => (
                <div key={f.empreinte} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, color: c.texte }}>
                  <span style={etiquette(f.probleme ? c.rougeClair : c.accentClair, f.probleme ? c.rouge : c.texte)}>
                    {f.type === 'tickets' ? t('cgVentes.importTickets.typeTickets') : f.type === 'departements' ? t('cgVentes.importTickets.typeDepartements') : '?'}
                  </span>
                  <span style={{ wordBreak: 'break-all' }}>{f.nom}</span>
                  {f.type === 'tickets' && f.contenu && <span style={{ color: c.texteMuted }}>{t('cgVentes.importTickets.nbTickets', { count: f.contenu.tickets.length })}</span>}
                  {f.contenu?.erreurs?.length > 0 && <span style={{ color: c.orange }}>{t('cgVentes.importTickets.lignesIgnorees', { lignes: f.contenu.erreurs.join(', ') })}</span>}
                  {f.deja && <span style={etiquette(c.orangeClair, c.orange)}>{t('cgVentes.importTickets.dejaImporte', { date: new Date(f.deja).toLocaleDateString(locale) })}</span>}
                  {f.probleme && <span style={{ color: c.rouge }}>{f.probleme}</span>}
                  <button onClick={() => retirerFichier(f.empreinte)} style={{ marginLeft: 'auto', border: 'none', background: 'none', color: c.texteMuted, cursor: 'pointer', fontSize: 13 }}>
                    {t('cgVentes.common.delete')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. Réglages de l'établissement */}
        <div style={carte}>
          <button onClick={() => setReglagesOuverts(!reglagesVisibles)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 15, fontWeight: 600, color: c.texte }}>
            {reglagesVisibles ? '▾' : '▸'} {t('cgVentes.importTickets.reglages')}
            {aVerifier && (
              <span style={{ ...etiquette(c.orangeClair, c.orange), marginLeft: 8 }}>{t('cgVentes.importTickets.aVerifier')}</span>
            )}
          </button>
          {reglagesVisibles && (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 18, fontSize: 13, color: c.texte }}>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <label>{t('cgVentes.importTickets.coupureJour')}{' '}
                  <input type="time" value={reglages.coupure_jour} onChange={(e) => setReglages((r) => ({ ...r, coupure_jour: e.target.value }))} style={champ} />
                </label>
                <label>{t('cgVentes.importTickets.finMidi')}{' '}
                  <input type="time" value={reglages.fin_midi} onChange={(e) => setReglages((r) => ({ ...r, fin_midi: e.target.value }))} style={champ} />
                </label>
              </div>

              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('cgVentes.importTickets.lieuxTitre')}</div>
                <div style={{ color: c.texteMuted, marginBottom: 8 }}>{t('cgVentes.importTickets.lieuxAide')}</div>
                {Object.keys(reglages.lieux).length === 0 && <div style={{ color: c.texteMuted }}>{t('cgVentes.importTickets.rienEncore')}</div>}
                {Object.entries(reglages.lieux).map(([k, r]) => (
                  <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0', borderTop: `1px solid ${c.bordure}` }}>
                    <span style={{ minWidth: 150, fontWeight: 500 }}>{r.libelle || t('cgVentes.importTickets.sansProfil')}</span>
                    {r.nouveau && <span style={etiquette(c.orangeClair, c.orange)}>{t('cgVentes.importTickets.nouveau')}</span>}
                    <span style={{ color: c.texteMuted }}>→</span>
                    <select value={r.defaut || ''} onChange={(e) => majLieuReglage(k, { defaut: e.target.value || null })} style={champ}>
                      <option value="">{t('cgVentes.importTickets.choisirLieu')}</option>
                      {lieux.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
                    </select>
                    <span style={{ color: c.texteMuted }}>{t('cgVentes.importTickets.ouAussi')}</span>
                    {lieux.filter((l) => l.id !== r.defaut).map((l) => (
                      <label key={l.id} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                        <input type="checkbox" checked={(r.possibles || []).includes(l.id)}
                          onChange={(e) => majLieuReglage(k, { possibles: e.target.checked ? [...(r.possibles || []), l.id] : (r.possibles || []).filter((x) => x !== l.id) })} />
                        {l.nom}
                      </label>
                    ))}
                  </div>
                ))}
              </div>

              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('cgVentes.importTickets.departementsTitre')}</div>
                <div style={{ color: c.texteMuted, marginBottom: 8 }}>{t('cgVentes.importTickets.departementsAide')}</div>
                {Object.keys(reglages.departements).length === 0 && <div style={{ color: c.texteMuted }}>{t('cgVentes.importTickets.rienEncore')}</div>}
                {Object.entries(reglages.departements).map(([k, d]) => (
                  <div key={k} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0', borderTop: `1px solid ${c.bordure}` }}>
                    <span style={{ minWidth: 150, fontWeight: 500 }}>{d.libelle}</span>
                    {d.nouveau && <span style={etiquette(c.orangeClair, c.orange)}>{t('cgVentes.importTickets.nouveau')}</span>}
                    <span style={{ color: c.texteMuted }}>→</span>
                    <select value={d.colonne} onChange={(e) => majDepartement(k, { colonne: e.target.value })} style={champ}>
                      {OPTIONS_COLONNES.map((col) => (
                        <option key={col} value={col}>{col === 'ignorer' ? t('cgVentes.importTickets.ignorer') : t(LIBELLES_CHAMPS[col])}</option>
                      ))}
                    </select>
                    {d.colonne !== 'ignorer' && (
                      <select value={d.lieu || ''} onChange={(e) => majDepartement(k, { lieu: e.target.value || null })} style={champ}>
                        <option value="">{t('cgVentes.importTickets.reparti')}</option>
                        {lieux.map((l) => <option key={l.id} value={l.id}>{t('cgVentes.importTickets.surLieu', { lieu: l.nom })}</option>)}
                      </select>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <button onClick={enregistrerReglages} disabled={!peutEcrire || !clientId} style={bouton(peutEcrire && !!clientId, false)}>
                  {t('cgVentes.importTickets.enregistrerReglages')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 3. Aperçu par journée */}
        {jours.map((jour) => {
          const lignes = lignesParJour[jour] || []
          const groupesJour = groupes.filter((g) => g.jour === jour)
          const totalTickets = groupesJour.reduce((s, g) => s + g.total, 0) / 100
          const couvertsTickets = groupesJour.reduce((s, g) => s + g.couverts, 0)
          const deps = departementsParJour[jour]
          const totalDeps = deps ? deps.filter((d) => reglages.departements[d.cle]?.colonne !== 'ignorer').reduce((s, d) => s + d.montant, 0) / 100 : null
          const aChoisir = groupesJour.filter((g) => (reglages.lieux[g.profilCle]?.possibles || []).length > 0 || !destinations[g.cle])
          const exclu = !!joursExclus[jour]
          const remplace = existantsJours.some((e) => e.jour === jour)
          const totalApercu = lignes.reduce((s, l) => s + COLONNES_CA.reduce((x, ch) => x + valeur(l, ch), 0), 0)
          return (
            <div key={jour} style={{ ...carte, opacity: exclu ? 0.55 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600, color: c.texte, textTransform: 'capitalize' }}>
                  <input type="checkbox" checked={!exclu} onChange={(e) => setJoursExclus((p) => ({ ...p, [jour]: !e.target.checked }))} />
                  {dateLongue(jour)}
                </label>
                {remplace && <span style={etiquette(c.orangeClair, c.orange)}>{t('cgVentes.importTickets.remplaceSaisie')}</span>}
                {!deps && <span style={etiquette(c.fond, c.texteMuted)}>{t('cgVentes.importTickets.sansDepartements')}</span>}
                <span style={{ marginLeft: 'auto', fontSize: 13, color: c.texteMuted }}>
                  {t('cgVentes.importTickets.resumeJour', { total: eur(totalTickets), couverts: couvertsTickets })}
                  {totalDeps != null && Math.abs(totalDeps - totalTickets) >= 0.01 && (
                    <strong style={{ color: c.rouge, marginLeft: 8 }}>{t('cgVentes.importTickets.ecartDepartements', { total: eur(totalDeps) })}</strong>
                  )}
                </span>
              </div>

              {aChoisir.length > 0 && (
                <div style={{ marginBottom: 12, padding: 10, borderRadius: 10, background: c.fond }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: c.texte, marginBottom: 6 }}>{t('cgVentes.importTickets.lieuxAChoisir')}</div>
                  {aChoisir.map((g) => {
                    const r = reglages.lieux[g.profilCle] || {}
                    const options = [r.defaut, ...(r.possibles || [])].filter(Boolean)
                    const ouvert = ticketsOuverts[g.cle]
                    return (
                      <div key={g.cle} style={{ padding: '6px 0', borderTop: `1px solid ${c.bordure}`, fontSize: 13, color: c.texte }}>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 500 }}>{g.profil || t('cgVentes.importTickets.sansProfil')}</span>
                          <span style={{ color: c.texteMuted }}>{servicesLibelle[g.service]} · {eur(g.total / 100)} · {t('cgVentes.importTickets.nbCouverts', { count: g.couverts })}</span>
                          <button onClick={() => setTicketsOuverts((p) => ({ ...p, [g.cle]: !p[g.cle] }))}
                            style={{ border: 'none', background: 'none', color: c.accent, cursor: 'pointer', fontSize: 13, padding: 0 }}>
                            {t('cgVentes.importTickets.voirTickets', { count: g.tickets.length })}
                          </button>
                          <span style={{ color: c.texteMuted }}>→</span>
                          <select value={destinations[g.cle] || ''} onChange={(e) => setChoix((p) => ({ ...p, [g.cle]: e.target.value }))}
                            style={{ ...champ, borderColor: destinations[g.cle] ? c.bordure : c.rouge }}>
                            {!destinations[g.cle] && <option value="">{t('cgVentes.importTickets.choisirLieu')}</option>}
                            {(options.length > 0 ? options : lieux.map((l) => l.id)).map((id) => <option key={id} value={id}>{nomLieu(id)}</option>)}
                          </select>
                        </div>
                        {ouvert && (
                          <div style={{ marginTop: 6, overflowX: 'auto' }}>
                            <table style={{ borderCollapse: 'collapse', fontSize: 12, color: c.texte, minWidth: 480 }}>
                              <tbody>
                                {g.tickets.map((tk, i) => (
                                  <tr key={tk.id || i} style={{ borderTop: `1px solid ${c.bordure}` }}>
                                    <td style={{ padding: '3px 8px' }}>{String(tk.dh.h).padStart(2, '0')}:{String(tk.dh.min).padStart(2, '0')}</td>
                                    <td style={{ padding: '3px 8px' }}>{tk.table}</td>
                                    <td style={{ padding: '3px 8px' }}>{tk.nom}</td>
                                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{tk.couverts}</td>
                                    <td style={{ padding: '3px 8px', textAlign: 'right' }}>{eur(tk.total / 100)}</td>
                                    <td style={{ padding: '3px 8px', color: c.texteMuted }}>{tk.paiement}{tk.type !== 'SALE' ? ` · ${tk.type}` : ''}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: c.texte, minWidth: 720 }}>
                  <thead>
                    <tr style={{ color: c.texteMuted, textAlign: 'right' }}>
                      <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 500 }}>{t('cgVentes.importTickets.lieu')}</th>
                      {CHAMPS.map((ch) => <th key={ch} style={{ padding: '6px 8px', fontWeight: 500 }}>{t(LIBELLES_CHAMPS[ch])}</th>)}
                      <th style={{ padding: '6px 8px', fontWeight: 500 }}>{t('cgVentes.importTickets.total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lignes.map((l) => {
                      const total = COLONNES_CA.reduce((s, ch) => s + valeur(l, ch), 0)
                      return (
                        <tr key={l.cle} style={{ borderTop: `1px solid ${c.bordure}`, background: l.calcul ? 'transparent' : c.orangeClair }}>
                          <td style={{ padding: '6px 8px' }}>
                            <div style={{ fontWeight: 500 }}>{nomLieu(l.lieu_service_id)}</div>
                            <div style={{ fontSize: 11, color: c.texteMuted }}>{servicesLibelle[l.service]}{!l.calcul ? ` · ${t('cgVentes.importTickets.remiseAZero')}` : ''}</div>
                          </td>
                          {CHAMPS.map((ch) => {
                            const v = valeur(l, ch)
                            const avant = l.actuel ? Number(l.actuel[ch] || 0) : null
                            const change = avant != null && Math.abs(avant - v) >= 0.01
                            return (
                              <td key={ch} style={{ padding: '4px 6px', textAlign: 'right', verticalAlign: 'top' }}>
                                <input
                                  type="number" step={ch === 'couverts' ? '1' : '0.01'} inputMode="decimal" disabled={exclu}
                                  value={corrections[l.cle]?.[ch] ?? (ch === 'couverts' ? String(v) : v.toFixed(2))}
                                  onChange={(e) => corriger(l, ch, e.target.value)}
                                  style={{ ...champ, width: ch === 'couverts' ? 60 : 92, textAlign: 'right', fontWeight: change ? 600 : 400 }}
                                />
                                {change && <div style={{ fontSize: 11, color: c.texteMuted, marginTop: 2 }}>{t('cgVentes.importTickets.avant', { valeur: ch === 'couverts' ? avant : eur(avant) })}</div>}
                              </td>
                            )
                          })}
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{eur(total)}</td>
                        </tr>
                      )
                    })}
                    <tr style={{ borderTop: `2px solid ${c.bordure}` }}>
                      <td colSpan={CHAMPS.length + 1} style={{ padding: '6px 8px', textAlign: 'right', color: c.texteMuted }}>{t('cgVentes.importTickets.totalJour')}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: Math.abs(totalApercu - totalTickets) >= 0.01 ? c.rouge : c.texte }}>{eur(totalApercu)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: c.texteMuted }}>
                {deps ? `${t('cgVentes.importTickets.estimation')} ` : ''}{t('cgVentes.importTickets.astuceAjustement')}
              </div>
            </div>
          )
        })}

        {jours.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 40 }}>
            <button onClick={valider} disabled={!peutEcrire || enCours || joursAImporter.length === 0} style={bouton(peutEcrire && !enCours && joursAImporter.length > 0)}>
              {enCours ? '…' : t('cgVentes.importTickets.valider', { count: joursAImporter.length })}
            </button>
            {groupesSansLieu.length > 0 && <span style={{ fontSize: 13, color: c.rouge }}>{t('cgVentes.importTickets.lieuManquant')}</span>}
            {!peutEcrire && !permLoading && <span style={{ fontSize: 13, color: c.texteMuted }}>{t('cgVentes.importTickets.lectureSeule')}</span>}
          </div>
        )}
      </div>
    </div>
  )
}
