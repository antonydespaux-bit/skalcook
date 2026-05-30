'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase, getClientId } from '../../../../lib/supabase'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { useTheme } from '../../../../lib/useTheme'
import { useRole } from '../../../../lib/useRole'
import Navbar from '../../../../components/Navbar'
import BackButton from '../../../../components/BackButton'
import IngredientAutocomplete from '../../../../components/IngredientAutocomplete'
import FournisseurAutocomplete from '../../../../components/FournisseurAutocomplete'
import { useFournisseursConnus } from '../../../../lib/useFournisseursConnus'
import { normDesig, todayIso, yesterdayIso, fmtPrix, fmtDelta, fileToBase64, makeLigneId, enrichLigne } from '../../../../lib/achatsHelpers'

// ─── Composant principal ─────────────────────────────────────────────────────

export default function AchatsImportPage() {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const isManuelMode = searchParams.get('mode') === 'manuel'
  // Section "cuisine" (défaut) ou "bar". En mode bar, on rapproche les
  // désignations contre la table ingredients_bar et on tag la facture.
  const section = searchParams.get('section') === 'bar' ? 'bar' : 'cuisine'
  const isBarMode = section === 'bar'
  const { c } = useTheme()
  const isMobile = useIsMobile()
  const { role, loading: roleLoading } = useRole()

  // ── Layout ───────────────────────────────────────────────────────────────
  // Mode OCR desktop : PDF à gauche, metadonnées + lignes en cartes à droite (Option A).
  // Mode manuel desktop : pleine largeur, lignes en tableau.
  // Mobile : flex column, lignes en cartes.
  const ocrSideBySide = !isMobile && !isManuelMode
  const useCardLayout = isMobile || ocrSideBySide

  // ── Auth ──────────────────────────────────────────────────────────────────
  const [authReady, setAuthReady] = useState(false)
  const [clientId, setClientId] = useState(null)

  // ── Machine d'état ────────────────────────────────────────────────────────
  // 'upload' | 'extracting' | 'review' | 'saving' | 'done'
  const [step, setStep] = useState(isManuelMode ? 'review' : 'upload')

  // ── Création auto des ingrédients manquants au save ──────────────────────
  const [autoCreateMissing, setAutoCreateMissing] = useState(true)

  // ── Fichier ───────────────────────────────────────────────────────────────
  const [previewUrl, setPreviewUrl] = useState(null)
  const [isPdf, setIsPdf] = useState(false)
  const [fileBase64, setFileBase64] = useState(null)
  const [fileMime, setFileMime] = useState(null)

  // ── Métadonnées facture ───────────────────────────────────────────────────
  const [fournisseur, setFournisseur] = useState('')
  const [dateFacture, setDateFacture] = useState(yesterdayIso())
  const [numeroFacture, setNumeroFacture] = useState('')
  const [statut, setStatut] = useState('facture')
  const [tauxTva, setTauxTva] = useState(5.5) // % par défaut (alimentaire) — fallback pour les lignes sans taux
  // Totaux saisis/extraits de la facture (override). null = calcul automatique
  // depuis les lignes.
  const [totalHtSaisi, setTotalHtSaisi] = useState(null)
  const [montantTvaSaisi, setMontantTvaSaisi] = useState(null)
  const [totalTtcSaisi, setTotalTtcSaisi] = useState(null)

  // ── Lignes enrichies ──────────────────────────────────────────────────────
  // Chaque ligne : { _id, designation, quantite, unite, prix_unitaire_ht, remise,
  //                 ingredient_id|null, ingredient_nom|null,
  //                 prix_actuel|null, deltaPrix|null, reconnu, updatePrice }
  const [lignes, setLignes] = useState([])

  // ── Caches de réconciliation ──────────────────────────────────────────────
  const [fournisseurMapping, setFournisseurMapping] = useState({}) // norm → { ingredient_id }
  // Liste des fournisseurs déjà connus pour ce client — autocomplete sur
  // le champ "Fournisseur" pour éviter les doublons ("Metro" vs "METRO").
  const fournisseursConnus = useFournisseursConnus(clientId)
  const [ingredientsById, setIngredientsById] = useState({})       // id   → { nom, prix_kg, unite }
  const [tvaByIngredient, setTvaByIngredient] = useState({})       // id   → dernier taux_tva utilisé

  // Index nom normalisé → ingrédient (recalculé quand ingredientsById change)
  const ingredientsByNorm = useMemo(
    () => Object.fromEntries(
      Object.values(ingredientsById).map(i => [normDesig(i.nom), i])
    ),
    [ingredientsById]
  )

  // ── Totaux facture (HT / TVA / TTC) ──────────────────────────────────────
  // totalHtCalcule = somme des lignes (qty × P.U. × (1-remise))
  // totalHtFacture = soit le total HT pied de facture saisi/OCR, soit le calcul.
  const totalHtCalcule = useMemo(
    () => lignes.reduce((s, l) => {
      const r = Number(l.remise) || 0
      return s + (Number(l.quantite) || 0) * (Number(l.prix_unitaire_ht) || 0) * (1 - r / 100)
    }, 0),
    [lignes]
  )
  const totalHtFacture = totalHtSaisi != null && totalHtSaisi !== '' ? Number(totalHtSaisi) : totalHtCalcule
  // Si une ligne a son propre taux_tva, il prime ; sinon fallback sur tauxTva global.
  const montantTvaCalcule = useMemo(
    () => lignes.reduce((s, l) => {
      const r = Number(l.remise) || 0
      const ht = (Number(l.quantite) || 0) * (Number(l.prix_unitaire_ht) || 0) * (1 - r / 100)
      const taux = l.taux_tva != null && l.taux_tva !== '' ? Number(l.taux_tva) : Number(tauxTva) || 0
      return s + ht * taux / 100
    }, 0),
    [lignes, tauxTva]
  )
  const montantTva = montantTvaSaisi != null && montantTvaSaisi !== '' ? Number(montantTvaSaisi) : montantTvaCalcule
  const totalTtcCalcule = totalHtFacture + montantTva
  const totalTtcFacture = totalTtcSaisi != null && totalTtcSaisi !== '' ? Number(totalTtcSaisi) : totalTtcCalcule

  // ── UX ────────────────────────────────────────────────────────────────────
  const [error, setError] = useState('')
  const [extractError, setExtractError] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [prixMajCount, setPrixMajCount] = useState(0)
  // { id, date_facture, fournisseur, total_ht, created_at } | null
  const [duplicateWarning, setDuplicateWarning] = useState(null)
  // Création d'ingrédient inline : _id de la ligne en cours | null
  const [creatingIngFor, setCreatingIngFor] = useState(null)
  const [newIngNom, setNewIngNom] = useState('')
  // Liaison à un ingrédient existant : _id de la ligne en cours | null
  const [linkingIngFor, setLinkingIngFor] = useState(null)
  const [linkSearch, setLinkSearch] = useState('')

  // ── Multi-factures (un PDF peut contenir plusieurs factures à la suite) ──
  // extractedFactures = null si pas encore extrait ou si extraction vide.
  // Sinon array brut tel que renvoyé par /api/achats/parse-facture, qu'on
  // navigue via currentFactureIdx. Les modifs utilisateur sur la facture
  // courante sont re-snapshotées dans ce tableau quand on change d'index.
  const [extractedFactures, setExtractedFactures] = useState(null)
  const [currentFactureIdx, setCurrentFactureIdx] = useState(0)
  const [savedFactureIdxs, setSavedFactureIdxs] = useState(() => new Set())
  // Flash de succès affiché après chaque save en multi-factures (s'estompe).
  const [lastSavedFlash, setLastSavedFlash] = useState(null)

  // ── Refs ──────────────────────────────────────────────────────────────────
  const fileInputRef = useRef(null)

  // ─── Effets ───────────────────────────────────────────────────────────────

  // Auth : vérification de session, redirect si non connecté
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return
        if (!session) { router.replace('/'); return }
        const cid = await getClientId()
        if (!cancelled) { setClientId(cid); setAuthReady(true) }
      } catch {
        if (!cancelled) router.replace('/')
      }
    })()
    return () => { cancelled = true }
  }, [router])

  // Import facture = action de modification → admin uniquement.
  useEffect(() => {
    if (roleLoading || !role) return
    if (role !== 'admin') router.replace('/controle-gestion/achats')
  }, [role, roleLoading, router])

  // Chargement mapping fournisseur + ingrédients une fois authentifié
  const loadReconciliation = useCallback(async () => {
    if (!clientId) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/achats/reconciliation-data?client_id=${clientId}&section=${section}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })
      if (!res.ok) return
      const { mappings, ingredients, tvaByIngredient: tvaMap } = await res.json()
      setFournisseurMapping(
        Object.fromEntries((mappings || []).map(m => [m.designation_norm, m]))
      )
      setIngredientsById(
        Object.fromEntries((ingredients || []).map(i => [i.id, i]))
      )
      setTvaByIngredient(tvaMap || {})
    } catch (err) {
      console.warn('loadReconciliation error:', err)
    }
  }, [clientId, section])

  useEffect(() => {
    if (authReady && clientId) loadReconciliation()
  }, [authReady, clientId, loadReconciliation])

  // ─── Réconciliation d'une ligne ───────────────────────────────────────────

  const enrichLigneLocal = useCallback((ligne) => {
    return enrichLigne(ligne, fournisseurMapping, ingredientsById, ingredientsByNorm, tvaByIngredient)
  }, [fournisseurMapping, ingredientsById, ingredientsByNorm, tvaByIngredient])

  // En mode manuel : amorçage avec une ligne vide dès que l'auth est prête.
  const manuelInitDone = useRef(false)
  useEffect(() => {
    if (!isManuelMode || !authReady || manuelInitDone.current) return
    manuelInitDone.current = true
    setLignes([enrichLigneLocal({
      _id: makeLigneId(),
      designation: '',
      quantite: 1,
      unite: '',
      prix_unitaire_ht: '',
      remise: 0,
    })])
  }, [isManuelMode, authReady, enrichLigneLocal])

  // ─── Multi-factures : helpers de chargement / snapshot / navigation ───────

  // Pousse une facture brute (telle que renvoyée par l'OCR ou snapshotée) dans
  // le state d'édition courant. Reset aussi les warnings/erreurs liés au save.
  const loadFactureIntoState = useCallback((facture) => {
    setFournisseur(facture.fournisseur || '')
    setDateFacture(facture.date_facture || yesterdayIso())
    setNumeroFacture(facture.numero_facture || '')
    setStatut(facture.statut || 'facture')
    setTotalHtSaisi(facture.total_ht_facture != null ? Number(facture.total_ht_facture) : null)
    setMontantTvaSaisi(facture.montant_tva_total != null ? Number(facture.montant_tva_total) : null)
    setTotalTtcSaisi(facture.total_ttc_facture != null ? Number(facture.total_ttc_facture) : null)
    const enriched = (facture.lignes || []).map(l =>
      enrichLigneLocal({
        _id:              makeLigneId(),
        designation:      l.designation || '',
        quantite:         Number(l.quantite) || 1,
        unite:            l.unite || '',
        prix_unitaire_ht: Number(l.prix_unitaire_ht) || 0,
        taux_tva:         l.taux_tva != null ? Number(l.taux_tva) : null,
      })
    )
    setLignes(enriched)
    setError('')
    setDuplicateWarning(null)
  }, [enrichLigneLocal])

  // Vérification doublon par numéro de facture (réutilisé après extraction
  // et après chaque navigation entre factures d'un même PDF).
  const checkDuplicate = useCallback(async (numeroFact) => {
    setDuplicateWarning(null)
    if (!numeroFact?.trim() || !clientId) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const dupRes = await fetch(
        `/api/achats/check-duplicate?clientId=${clientId}&numeroFacture=${encodeURIComponent(numeroFact.trim())}`,
        { headers: { 'Authorization': `Bearer ${session.access_token}` } }
      )
      if (dupRes.ok || dupRes.status === 409) {
        const payload = await dupRes.json().catch(() => null)
        if (payload?.existing) setDuplicateWarning(payload.existing)
      }
    } catch {
      // Pas bloquant : le check sera refait côté serveur au save.
    }
  }, [clientId])

  // Capture le state d'édition courant pour le re-stocker dans extractedFactures
  // (utilisé avant de basculer sur une autre facture, pour ne pas perdre les
  // modifs si l'utilisateur revient dessus).
  const snapshotCurrent = useCallback(() => ({
    fournisseur,
    date_facture: dateFacture,
    numero_facture: numeroFacture,
    statut,
    total_ht_facture: totalHtSaisi != null && totalHtSaisi !== '' ? Number(totalHtSaisi) : null,
    montant_tva_total: montantTvaSaisi != null && montantTvaSaisi !== '' ? Number(montantTvaSaisi) : null,
    total_ttc_facture: totalTtcSaisi != null && totalTtcSaisi !== '' ? Number(totalTtcSaisi) : null,
    lignes: lignes.map(l => ({
      designation:      l.designation,
      quantite:         l.quantite,
      unite:            l.unite,
      prix_unitaire_ht: l.prix_unitaire_ht,
      taux_tva:         l.taux_tva,
    })),
  }), [fournisseur, dateFacture, numeroFacture, statut, totalHtSaisi, montantTvaSaisi, totalTtcSaisi, lignes])

  const goToFacture = useCallback((idx) => {
    if (!extractedFactures) return
    if (idx < 0 || idx >= extractedFactures.length || idx === currentFactureIdx) return
    // Persiste les éditions sur la facture courante avant de basculer.
    const snapshot = snapshotCurrent()
    setExtractedFactures(prev => {
      if (!prev) return prev
      const next = [...prev]
      next[currentFactureIdx] = snapshot
      return next
    })
    setCurrentFactureIdx(idx)
    loadFactureIntoState(extractedFactures[idx])
    checkDuplicate(extractedFactures[idx].numero_facture)
    setLastSavedFlash(null)
  }, [extractedFactures, currentFactureIdx, snapshotCurrent, loadFactureIntoState, checkDuplicate])

  // Le flash de succès s'estompe au bout de 4 secondes pour ne pas rester
  // collé en permanence sur la facture en cours.
  useEffect(() => {
    if (!lastSavedFlash) return
    const t = setTimeout(() => setLastSavedFlash(null), 4000)
    return () => clearTimeout(t)
  }, [lastSavedFlash])

  // ─── Extraction IA ────────────────────────────────────────────────────────

  // Coeur de l'appel OCR, factorisé pour pouvoir réessayer sans re-upload.
  const runExtraction = useCallback(async (base64, mime) => {
    setExtractError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/achats/parse-facture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ fileBase64: base64, mimeType: mime, clientId }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || t('cgAchats.import.errExtraction'))

      const factures = Array.isArray(result.factures) ? result.factures : []
      setSavedFactureIdxs(new Set())

      if (factures.length === 0) {
        setExtractedFactures(null)
        setCurrentFactureIdx(0)
        setLignes([])
        setStep('review')
        return
      }

      setExtractedFactures(factures)
      setCurrentFactureIdx(0)
      loadFactureIntoState(factures[0])
      await checkDuplicate(factures[0].numero_facture)
      setStep('review')
    } catch (err) {
      console.error('Extraction IA échouée :', err)
      setExtractError(err.message || t('cgAchats.import.errExtractFailed'))
      setExtractedFactures(null)
      setLignes([])
      setStep('review')
    }
  }, [clientId, loadFactureIntoState, checkDuplicate])

  const extractFromImage = useCallback(async (file) => {
    const base64 = await fileToBase64(file)
    setFileBase64(base64)
    setFileMime(file.type)
    await runExtraction(base64, file.type)
  }, [runExtraction])

  // Permet de réessayer l'OCR sans re-sélectionner le fichier — utile quand
  // l'IA Anthropic est saturée (rate limit, overload transitoire).
  const retryExtraction = useCallback(async () => {
    if (!fileBase64 || !fileMime) return
    setStep('extracting')
    await runExtraction(fileBase64, fileMime)
  }, [fileBase64, fileMime, runExtraction])

  // ─── Sélection de fichier (mobile input + desktop drop partagé) ───────────

  const handleFileSelected = useCallback(async (selectedFile, { runOcr = true } = {}) => {
    if (!selectedFile) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(selectedFile.type)) {
      setError(t('cgAchats.import.errUnsupportedFormat'))
      return
    }
    // Libérer l'ancienne URL objet si elle existe
    setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(selectedFile) })
    setIsPdf(selectedFile.type === 'application/pdf')
    setError('')

    if (runOcr) {
      // Mode OCR : on reset les lignes et on lance l'extraction IA.
      setExtractError('')
      setLignes([])
      setStep('extracting')
      await extractFromImage(selectedFile)
    } else {
      // Mode manuel : on attache juste le fichier (sera uploadé au save) sans
      // toucher aux lignes que l'utilisateur a peut-être déjà saisies.
      const base64 = await fileToBase64(selectedFile)
      setFileBase64(base64)
      setFileMime(selectedFile.type)
    }
  }, [extractFromImage])

  // Détache le fichier joint en mode manuel sans toucher au formulaire.
  // (À ne pas confondre avec resetForm qui vide tout l'écran.)
  const handleDetachFile = useCallback(() => {
    setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    setIsPdf(false)
    setFileBase64(null)
    setFileMime(null)
  }, [])

  // ─── Drag & drop (desktop) ───────────────────────────────────────────────

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => setIsDragOver(false), [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFileSelected(f)
  }, [handleFileSelected])

  // ─── Édition des lignes ───────────────────────────────────────────────────

  const updateLigne = useCallback((id, field, value) => {
    setLignes(prev => prev.map(l => {
      if (l._id !== id) return l
      // Si l'utilisateur modifie le prix ou la TVA lui-même, on désactive le
      // pré-remplissage auto pour ne plus l'écraser ensuite.
      const next = { ...l, [field]: value }
      if (field === 'prix_unitaire_ht') next.prix_auto = false
      if (field === 'taux_tva') next.tva_auto = false
      return enrichLigneLocal(next)
    }))
  }, [enrichLigneLocal])

  const addLigne = useCallback(() => {
    setLignes(prev => [...prev, enrichLigneLocal({
      _id: makeLigneId(),
      designation: '',
      quantite: 1,
      unite: '',
      prix_unitaire_ht: '',
      remise: 0,
    })])
  }, [enrichLigneLocal])

  const removeLigne = useCallback((id) => {
    setLignes(prev => prev.filter(l => l._id !== id))
  }, [])

  // ─── Réinitialisation ─────────────────────────────────────────────────────

  const resetForm = useCallback(() => {
    setStep('upload')
    setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    setIsPdf(false)
    setFileBase64(null)
    setFileMime(null)
    setFournisseur('')
    setDateFacture(yesterdayIso())
    setNumeroFacture('')
    setStatut('facture')
    setLignes([])
    setError('')
    setExtractError('')
    setPrixMajCount(0)
    setExtractedFactures(null)
    setCurrentFactureIdx(0)
    setSavedFactureIdxs(new Set())
    setLastSavedFlash(null)
    setDuplicateWarning(null)
    setTotalHtSaisi(null)
    setMontantTvaSaisi(null)
    setTotalTtcSaisi(null)
  }, [])

  // ─── Sauvegarde ───────────────────────────────────────────────────────────

  const handleCreateIngredient = useCallback(async (ligne) => {
    if (!newIngNom.trim()) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/achats/create-ingredient', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          clientId,
          nom:     newIngNom.trim(),
          unite:   ligne.unite || null,
          prix_kg: ligne.prix_unitaire_ht || null,
          section,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || t('cgAchats.import.errCreateIngredient'))

      const ing = result.ingredient
      // Met à jour le cache local
      setIngredientsById(prev => ({ ...prev, [ing.id]: ing }))
      // Enrichit la ligne avec le nouvel ingrédient
      setLignes(prev => prev.map(l =>
        l._id !== ligne._id ? l : {
          ...l,
          ingredient_id:   ing.id,
          ingredient_nom:  ing.nom,
          prix_actuel:     ing.prix_kg ? Number(ing.prix_kg) : null,
          deltaPrix:       null,
          reconnu:         true,
          updatePrice:     false,
        }
      ))
      setCreatingIngFor(null)
      setNewIngNom('')
    } catch (err) {
      setError(err.message)
    }
  }, [clientId, newIngNom, section])

  const handleLinkIngredient = useCallback((ligne, ing) => {
    // L'utilisateur avait-il déjà saisi son propre prix / TVA avant le link ?
    const userHadOwnPrice = ligne.prix_auto === false && Number(ligne.prix_unitaire_ht) > 0
    const userHadOwnTva = ligne.tva_auto === false && ligne.taux_tva != null && ligne.taux_tva !== ''
    const prixActuel = ing.prix_kg ? Number(ing.prix_kg) : null
    const prixLigneFinal = userHadOwnPrice
      ? Number(ligne.prix_unitaire_ht)
      : (prixActuel && Number.isFinite(prixActuel) ? prixActuel : '')
    const remiseFactor = 1 - (Number(ligne.remise) || 0) / 100
    const prixEff = prixLigneFinal * remiseFactor
    const deltaPrix = prixActuel && prixEff && userHadOwnPrice
      ? ((prixEff - prixActuel) / prixActuel) * 100
      : null
    // Pré-remplit la TVA depuis l'historique de l'ingrédient si l'utilisateur n'a pas saisi.
    const tvaHist = tvaByIngredient[ing.id] != null ? Number(tvaByIngredient[ing.id]) : null
    const tauxTvaFinal = userHadOwnTva
      ? Number(ligne.taux_tva)
      : (tvaHist != null && Number.isFinite(tvaHist) ? tvaHist : (ligne.taux_tva ?? null))
    setLignes(prev => prev.map(l =>
      l._id !== ligne._id ? l : {
        ...l,
        // Préserve l'override de désignation envoyé par le caller (ex: autocomplete
        // qui force le nom canonique de l'ingrédient sélectionné).
        designation:      ligne.designation ?? l.designation,
        // Reprend l'unité de l'ingrédient si l'utilisateur n'en a pas saisi une.
        unite:            (l.unite && String(l.unite).trim()) ? l.unite : (ing.unite || ''),
        prix_unitaire_ht: prixLigneFinal,
        prix_auto:        !userHadOwnPrice,
        taux_tva:         tauxTvaFinal,
        tva_auto:         !userHadOwnTva,
        ingredient_id:    ing.id,
        ingredient_nom:   ing.nom,
        prix_actuel:      prixActuel,
        deltaPrix,
        reconnu:          true,
        updatePrice:      userHadOwnPrice,
      }
    ))
    setLinkingIngFor(null)
    setLinkSearch('')
  }, [tvaByIngredient])

  // Sélection depuis l'autocomplete de désignation : remplit la désignation
  // avec le nom canonique de l'ingrédient + lie l'ingrédient (pré-remplit
  // prix et TVA via handleLinkIngredient).
  const handleSelectFromAutocomplete = useCallback((ligne, ing) => {
    handleLinkIngredient({ ...ligne, designation: ing.nom }, ing)
  }, [handleLinkIngredient])

  const handleSave = useCallback(async (forceInsert = false) => {
    if (!fournisseur.trim()) { setError(t('cgAchats.import.errSupplierRequired')); return }
    if (!dateFacture)        { setError(t('cgAchats.import.errDateRequired')); return }
    // Ne garde que les lignes avec une désignation non vide (les autres sont des
    // lignes-brouillon que l'utilisateur n'a pas remplies).
    const lignesValides = lignes.filter((l) => l.designation && l.designation.trim())
    if (lignesValides.length === 0) {
      setError(t('cgAchats.import.errNeedLine'))
      return
    }
    // Doublon déjà signalé : empêche l'aller-retour inutile au serveur. L'utilisateur
    // doit explicitement cliquer "Importer quand même" (qui appelle handleSave(true)).
    if (duplicateWarning && !forceInsert) {
      setError(t('cgAchats.import.errDuplicate', { numero: numeroFacture }))
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setError('')
    if (forceInsert) setDuplicateWarning(null)

    // Multi-factures : si c'est la dernière restante à enregistrer, demande
    // une confirmation explicite avant le save final.
    if (extractedFactures && extractedFactures.length > 1) {
      const seraToutSave =
        savedFactureIdxs.size + (savedFactureIdxs.has(currentFactureIdx) ? 0 : 1) >= extractedFactures.length
      if (seraToutSave) {
        const total = extractedFactures.length
        const ok = window.confirm(t('cgAchats.import.confirmLastInvoice', { count: total }))
        if (!ok) return
      }
    }

    setStep('saving')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/achats/save-facture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          clientId, fournisseur, numeroFacture, dateFacture, statut, section,
          lignes: lignesValides, forceInsert, fileBase64, fileMime,
          tauxTva: Number(tauxTva) || 0,
          montantTva: montantTvaSaisi != null && montantTvaSaisi !== '' ? Number(montantTvaSaisi) : null,
          autoCreateMissing,
        }),
      })
      const result = await res.json()

      if (res.status === 409 && result.error === 'DUPLICATE_FACTURE') {
        setDuplicateWarning(result.existing)
        setStep('review')
        return
      }

      if (!res.ok) {
        // Remonter le détail Zod si dispo pour aider au diagnostic
        if (result.details?.fieldErrors) {
          const flat = Object.entries(result.details.fieldErrors)
            .map(([k, v]) => `${k} : ${(v ).join(', ')}`)
            .join(' · ')
          throw new Error(`${result.error || t('cgAchats.import.errInvalidData')} — ${flat}`)
        }
        throw new Error(result.error || t('cgAchats.import.errSaveGeneric'))
      }

      setPrixMajCount(result.prix_maj ?? 0)
      // Avertir si l'upload du fichier source a échoué (stockage non bloquant)
      if (result.file_uploaded === false) {
        window.alert(t('cgAchats.import.fileNotStored'))
      }

      // Mode multi-factures : on marque la courante comme enregistrée et on
      // cherche la prochaine non-enregistrée pour la charger automatiquement.
      // S'il n'y en a plus → redirect vers la liste des achats comme avant.
      if (extractedFactures && extractedFactures.length > 1) {
        const newSaved = new Set(savedFactureIdxs)
        newSaved.add(currentFactureIdx)
        setSavedFactureIdxs(newSaved)

        // Mémorise le numéro de la facture qu'on vient d'enregistrer pour le
        // flash de succès qui s'affichera sur la facture suivante.
        const savedNumero = extractedFactures[currentFactureIdx]?.numero_facture || t('cgAchats.import.savedFlashFallback', { idx: currentFactureIdx + 1 })

        // Cherche la prochaine facture non-save (cyclique : on commence à idx+1)
        let nextIdx = null
        for (let i = 1; i <= extractedFactures.length; i++) {
          const candidate = (currentFactureIdx + i) % extractedFactures.length
          if (!newSaved.has(candidate)) { nextIdx = candidate; break }
        }

        if (nextIdx != null) {
          setCurrentFactureIdx(nextIdx)
          loadFactureIntoState(extractedFactures[nextIdx])
          await checkDuplicate(extractedFactures[nextIdx].numero_facture)
          setLastSavedFlash(t('cgAchats.import.savedFlash', { numero: savedNumero, saved: newSaved.size, total: extractedFactures.length }))
          setStep('review')
          return
        }
      }

      router.push('/controle-gestion/achats')
    } catch (err) {
      console.error('handleSave error:', err)
      setError(err.message || t('cgAchats.import.errSaveGeneric'))
      setStep('review')
    }
  }, [clientId, fournisseur, numeroFacture, dateFacture, statut, section, lignes, fileBase64, fileMime, autoCreateMissing, router, tauxTva, montantTvaSaisi, extractedFactures, currentFactureIdx, savedFactureIdxs, loadFactureIntoState, checkDuplicate, duplicateWarning])

  // ─── Styles partagés ─────────────────────────────────────────────────────

  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
        {t('cgAchats.common.loading')}
      </div>
    )
  }

  const pad = isMobile ? 16 : 24
  const inputS = {
    padding: '7px 10px', borderRadius: 8,
    border: `1px solid ${c.bordure}`, background: c.blanc,
    color: c.texte, fontSize: 14, width: '100%', boxSizing: 'border-box',
  }
  const th = {
    padding: isMobile ? '8px 6px' : '10px 12px', textAlign: 'left',
    fontWeight: 600, fontSize: 11, color: c.texteMuted,
    borderBottom: `1px solid ${c.bordure}`, whiteSpace: 'nowrap',
  }
  const td = {
    padding: isMobile ? '8px 6px' : '10px 12px',
    fontSize: 13, color: c.texte, borderBottom: `1px solid ${c.bordure}`,
    verticalAlign: 'middle',
  }
  const badgeVert = {
    display: 'inline-block', background: c.vertClair, color: c.vert,
    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap',
  }
  const badgeGris = {
    display: 'inline-block', background: c.fond, color: c.texteMuted,
    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap',
  }
  const btnPrimary = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: isMobile ? '13px 20px' : '10px 20px',
    background: c.accent, color: '#fff', border: 'none', borderRadius: 8,
    fontSize: 14, fontWeight: 600, cursor: 'pointer', width: isMobile ? '100%' : 'auto',
  }
  const btnSecondary = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: isMobile ? '13px 20px' : '10px 16px',
    background: c.blanc, color: c.texte,
    border: `1px solid ${c.bordure}`, borderRadius: 8,
    fontSize: 14, cursor: 'pointer', width: isMobile ? '100%' : 'auto',
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section={section} />
      <div style={{ padding: pad, maxWidth: 1200, margin: '0 auto' }}>

        {/* Bouton retour */}
        <div style={{ marginBottom: 12 }}>
          <BackButton
            fallback={isBarMode ? '/bar/achats' : '/controle-gestion/achats'}
            label={t('cgAchats.common.backToAchats')}
            style={{ background: 'transparent', border: 'none', color: c.texteMuted, fontSize: 13, padding: 0, cursor: 'pointer' }}
          />
        </div>

        {/* En-tête */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 700, color: c.texte, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {isManuelMode ? t('cgAchats.import.manualTitle') : t('cgAchats.import.importTitle')}
              {isBarMode && (
                <span style={{ display: 'inline-block', background: '#F5F3FF', color: '#5B21B6', fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20, letterSpacing: 0.3 }}>
                  {t('cgAchats.import.barBadge')}
                </span>
              )}
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: c.texteMuted }}>
              {isManuelMode
                ? t('cgAchats.import.manualSubtitle')
                : t('cgAchats.import.importSubtitle')}
              {isBarMode && t('cgAchats.import.barSubtitle')}
            </p>
          </div>
          {!isManuelMode ? (
            <button
              onClick={() => {
                const qs = new URLSearchParams({ mode: 'manuel' })
                if (isBarMode) qs.set('section', 'bar')
                router.push(`/controle-gestion/achats/import?${qs.toString()}`)
              }}
              style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer' }}
            >
              {t('cgAchats.import.switchToManual')}
            </button>
          ) : (
            <button
              onClick={() => {
                const qs = new URLSearchParams()
                if (isBarMode) qs.set('section', 'bar')
                const q = qs.toString()
                router.push(`/controle-gestion/achats/import${q ? `?${q}` : ''}`)
              }}
              style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer' }}
            >
              {t('cgAchats.import.switchToOcr')}
            </button>
          )}
        </div>

        {/* Erreur globale */}
        {error && (
          <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14, color: '#B91C1C' }}>
            {error}
          </div>
        )}

        {/* Avertissement doublon */}
        {duplicateWarning && (
          <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 14, color: '#92400E' }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              {t('cgAchats.import.duplicateTitle')}
            </div>
            <div style={{ marginBottom: 10 }}>
              <strong>{t('cgAchats.detail.numberPrefix', { numero: numeroFacture })}</strong> — {duplicateWarning.fournisseur} —{' '}
              {new Date(duplicateWarning.date_facture).toLocaleDateString(i18n.language || 'fr')} —{' '}
              {Number(duplicateWarning.total_ht).toLocaleString(i18n.language || 'fr', { minimumFractionDigits: 2 })} {t('cgAchats.import.duplicateHtSuffix')}
              <br />
              <span style={{ fontSize: 12, opacity: 0.8 }}>
                {t('cgAchats.import.duplicateImportedOn', { date: new Date(duplicateWarning.created_at).toLocaleDateString(i18n.language || 'fr') })}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={() => setDuplicateWarning(null)}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #D97706', background: 'transparent', color: '#92400E', cursor: 'pointer', fontSize: 13 }}
              >
                {t('cgAchats.common.cancel')}
              </button>
              {/* En multi-factures : permet de sauter cette facture pour passer à la suivante non-save */}
              {extractedFactures && extractedFactures.length > 1 && (
                <button
                  onClick={() => {
                    // Cherche la prochaine facture non-save (peu importe l'ordre)
                    let nextIdx = null
                    for (let i = 1; i <= extractedFactures.length; i++) {
                      const candidate = (currentFactureIdx + i) % extractedFactures.length
                      if (!savedFactureIdxs.has(candidate) && candidate !== currentFactureIdx) {
                        nextIdx = candidate
                        break
                      }
                    }
                    if (nextIdx != null) goToFacture(nextIdx)
                    else setDuplicateWarning(null)
                  }}
                  style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #D97706', background: c.blanc, color: '#92400E', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                >
                  {t('cgAchats.import.skipInvoice')}
                </button>
              )}
              <button
                onClick={() => handleSave(true)}
                style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#D97706', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
                title={t('cgAchats.import.importAnywayTitle')}
              >
                {t('cgAchats.import.importAnyway')}
              </button>
            </div>
          </div>
        )}

        {/* ══ STEP : UPLOAD ══════════════════════════════════════════════════ */}
        {step === 'upload' && (
          <div style={{ maxWidth: 560 }}>
            {isMobile ? (
              /* Mobile : bouton déclenchant l'appareil photo */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={e => handleFileSelected(e.target.files?.[0])}
                />
                <button style={btnPrimary} onClick={() => fileInputRef.current?.click()}>
                  {t('cgAchats.import.takePhoto')}
                </button>
                {/* Fallback sans capture pour la galerie */}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  style={{ display: 'none' }}
                  id="file-gallery"
                  onChange={e => handleFileSelected(e.target.files?.[0])}
                />
                <button style={btnSecondary} onClick={() => document.getElementById('file-gallery').click()}>
                  {t('cgAchats.import.chooseGallery')}
                </button>
              </div>
            ) : (
              /* Desktop : zone drag & drop */
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${isDragOver ? c.accent : c.bordure}`,
                  borderRadius: 12, padding: '48px 32px',
                  textAlign: 'center', cursor: 'pointer',
                  background: isDragOver ? c.accentClair : c.blanc,
                  transition: 'background 0.15s, border-color 0.15s',
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  style={{ display: 'none' }}
                  onChange={e => handleFileSelected(e.target.files?.[0])}
                />
                <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
                <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: 15, color: c.texte }}>
                  {t('cgAchats.import.dropHere')}
                </p>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: c.texteMuted }}>
                  {t('cgAchats.import.orClickBrowse')}
                </p>
                <p style={{ margin: 0, fontSize: 12, color: c.texteMuted }}>
                  {t('cgAchats.import.acceptedFormats')}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ══ STEP : EXTRACTING ══════════════════════════════════════════════ */}
        {step === 'extracting' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '48px 0' }}>
            {previewUrl && !isPdf && (
              <img src={previewUrl} alt={t('cgAchats.import.previewAlt')} style={{ maxHeight: 180, maxWidth: '100%', borderRadius: 8, objectFit: 'contain', border: `1px solid ${c.bordure}` }} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: c.texteMuted, fontSize: 15 }}>
              <span style={{ display: 'inline-block', width: 20, height: 20, border: `3px solid ${c.accent}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              {t('cgAchats.import.analyzing')}
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ══ STEP : REVIEW ══════════════════════════════════════════════════ */}
        {(step === 'review' || step === 'saving') && (
          <>
          <div style={
            isMobile
              ? { display: 'flex', flexDirection: 'column', gap: 20 }
              : isManuelMode
                ? { display: 'block' }
                : { display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 24, alignItems: 'start' }
          }>

            {/* ── Colonne PDF : sticky, à GAUCHE en mode OCR side-by-side ── */}
            {ocrSideBySide && (
              <div style={{ position: 'sticky', top: 76, height: 'calc(100vh - 90px)', display: 'flex', flexDirection: 'column' }}>
                {previewUrl && (
                  isPdf ? (
                    <iframe
                      src={previewUrl}
                      title={t('cgAchats.import.previewPdfTitle')}
                      style={{ width: '100%', flex: 1, borderRadius: 10, border: `1px solid ${c.bordure}`, background: c.blanc }}
                    />
                  ) : (
                    <img
                      src={previewUrl}
                      alt={t('cgAchats.import.previewImgAlt')}
                      style={{ width: '100%', flex: 1, objectFit: 'contain', borderRadius: 10, border: `1px solid ${c.bordure}`, background: c.blanc }}
                    />
                  )
                )}
                {!previewUrl && (
                  <div style={{ flex: 1, background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
                    {t('cgAchats.import.noFile')}
                  </div>
                )}
                <button style={{ ...btnSecondary, marginTop: 10, width: '100%' }} onClick={resetForm}>
                  {t('cgAchats.import.changeFile')}
                </button>
              </div>
            )}

            {/* ── Colonne droite (Option A) ou pleine largeur (manuel) : métadonnées ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Aperçu fichier — mobile uniquement */}
              {isMobile && previewUrl && (
                <div>
                  {isPdf ? (
                    <iframe src={previewUrl} title={t('cgAchats.import.previewPdfTitle')} style={{ width: '100%', height: 220, borderRadius: 10, border: `1px solid ${c.bordure}` }} />
                  ) : (
                    <img src={previewUrl} alt={t('cgAchats.import.previewImgAlt')} style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 10, border: `1px solid ${c.bordure}`, background: c.blanc }} />
                  )}
                  <button style={{ ...btnSecondary, marginTop: 10, width: '100%' }} onClick={resetForm}>{t('cgAchats.import.changeFile')}</button>
                </div>
              )}

              {/* Bandeau extraction échouée */}
              {extractError && (
                <div style={{ background: c.orangeClair, border: `1px solid ${c.orange}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400E', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>⚠️ {extractError}</span>
                  {fileBase64 && (
                    <button
                      onClick={retryExtraction}
                      style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: '1px solid #F59E0B', background: '#FBBF24', color: '#78350F', cursor: 'pointer' }}
                    >
                      {t('cgAchats.import.retry')}
                    </button>
                  )}
                </div>
              )}

              {/* Multi-factures : sélecteur de facture courante */}
              {extractedFactures && extractedFactures.length > 1 && (
                <div style={{ background: c.accentClair || c.fond, border: `1px solid ${c.accent}`, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: c.texte }}>
                      {t('cgAchats.import.multiDetected', { count: extractedFactures.length })}
                    </div>
                    <div style={{ fontSize: 12, color: c.texteMuted }}>
                      {t('cgAchats.import.multiSaved', { count: savedFactureIdxs.size, saved: savedFactureIdxs.size, total: extractedFactures.length })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => goToFacture(currentFactureIdx - 1)}
                      disabled={currentFactureIdx === 0 || step === 'saving'}
                      style={{ ...btnSecondary, padding: '6px 12px', width: 'auto', opacity: currentFactureIdx === 0 ? 0.4 : 1 }}
                    >
                      {t('cgAchats.import.previous')}
                    </button>
                    <select
                      value={currentFactureIdx}
                      onChange={e => goToFacture(Number(e.target.value))}
                      disabled={step === 'saving'}
                      style={{ ...inputS, flex: 1, minWidth: 180 }}
                    >
                      {extractedFactures.map((f, idx) => (
                        <option key={idx} value={idx}>
                          {savedFactureIdxs.has(idx) ? t('cgAchats.import.optionSaved') : ''}
                          {t('cgAchats.import.optionLabel', { idx: idx + 1, total: extractedFactures.length })}
                          {f.numero_facture ? t('cgAchats.import.optionNumberSuffix', { numero: f.numero_facture }) : t('cgAchats.import.optionNoNumber')}
                          {f.statut === 'avoir' ? t('cgAchats.import.optionAvoirSuffix') : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => goToFacture(currentFactureIdx + 1)}
                      disabled={currentFactureIdx === extractedFactures.length - 1 || step === 'saving'}
                      style={{ ...btnSecondary, padding: '6px 12px', width: 'auto', opacity: currentFactureIdx === extractedFactures.length - 1 ? 0.4 : 1 }}
                    >
                      {t('cgAchats.import.next')}
                    </button>
                  </div>
                  {savedFactureIdxs.has(currentFactureIdx) && (
                    <div style={{ fontSize: 12, color: c.vert, fontWeight: 600 }}>
                      {t('cgAchats.import.savedAgainHint')}
                    </div>
                  )}
                  {!savedFactureIdxs.has(currentFactureIdx)
                    && savedFactureIdxs.size === extractedFactures.length - 1 && (
                    <div style={{ fontSize: 12, color: c.accent, fontWeight: 600 }}>
                      {t('cgAchats.import.lastInvoiceHint')}
                    </div>
                  )}
                </div>
              )}

              {/* Flash de succès après chaque enregistrement en multi-factures */}
              {lastSavedFlash && (
                <div style={{ background: c.vertClair, border: `1px solid ${c.vert}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: c.vert, fontWeight: 600 }}>
                  {lastSavedFlash}
                </div>
              )}

              {/* Pièce jointe (mode manuel uniquement — en OCR, le fichier
                  est déjà attaché via le step upload). Permet de joindre une
                  facture PDF/photo SANS déclencher l'OCR. */}
              {isManuelMode && (
                <div style={{ background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 12, padding: 16 }}>
                  <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: 14, color: c.texte }}>
                    {t('cgAchats.import.attachmentTitle')} <span style={{ fontWeight: 400, color: c.texteMuted, fontSize: 12 }}>{t('cgAchats.import.attachmentOptional')}</span>
                  </p>
                  {!fileBase64 ? (
                    <>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        id="file-attach-manuel"
                        style={{ display: 'none' }}
                        onChange={e => handleFileSelected(e.target.files?.[0], { runOcr: false })}
                      />
                      <button
                        type="button"
                        style={btnSecondary}
                        onClick={() => document.getElementById('file-attach-manuel').click()}
                      >
                        {t('cgAchats.import.attachFile')}
                      </button>
                      <p style={{ margin: '8px 0 0', fontSize: 12, color: c.texteMuted }}>
                        {t('cgAchats.import.attachHint')}
                      </p>
                    </>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 12, alignItems: isMobile ? 'stretch' : 'flex-start' }}>
                      {previewUrl && (
                        isPdf ? (
                          <iframe
                            src={previewUrl}
                            title={t('cgAchats.import.attachmentPreviewPdfTitle')}
                            style={{ width: isMobile ? '100%' : 200, height: 160, borderRadius: 8, border: `1px solid ${c.bordure}` }}
                          />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={previewUrl}
                            alt={t('cgAchats.import.attachmentPreviewImgAlt')}
                            style={{ width: isMobile ? '100%' : 200, height: 160, objectFit: 'contain', borderRadius: 8, border: `1px solid ${c.bordure}`, background: c.blanc }}
                          />
                        )
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 13, color: c.texte }}>
                          {isPdf ? t('cgAchats.import.pdfAttached') : t('cgAchats.import.photoAttached')}
                        </p>
                        <button
                          type="button"
                          style={{ ...btnSecondary, alignSelf: 'flex-start' }}
                          onClick={handleDetachFile}
                        >
                          {t('cgAchats.import.removeAttachment')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Métadonnées de la facture */}
              <div style={{ background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 12, padding: 16 }}>
                <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: 14, color: c.texte }}>{t('cgAchats.import.invoiceInfo')}</p>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.texteMuted }}>
                    {t('cgAchats.import.supplierRequired')}
                    <FournisseurAutocomplete
                      value={fournisseur}
                      onChange={setFournisseur}
                      options={fournisseursConnus}
                      style={inputS}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.texteMuted }}>
                    {t('cgAchats.import.dateRequired')}
                    <input style={inputS} type="date" value={dateFacture} onChange={e => setDateFacture(e.target.value)} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.texteMuted }}>
                    {t('cgAchats.import.invoiceNumber')}
                    <input style={inputS} value={numeroFacture} onChange={e => { setNumeroFacture(e.target.value); setDuplicateWarning(null) }} placeholder={t('cgAchats.import.invoiceNumberPlaceholder')} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.texteMuted }}>
                    {t('cgAchats.import.documentType')}
                    <select style={inputS} value={statut} onChange={e => setStatut(e.target.value)}>
                      <option value="facture">{t('cgAchats.import.typeFacture')}</option>
                      <option value="bl">{t('cgAchats.import.typeBl')}</option>
                      <option value="avoir">{t('cgAchats.import.typeAvoir')}</option>
                    </select>
                  </label>
                </div>

                {/* Totaux HT / TVA / TTC — éditables (override sur le calcul depuis les lignes) */}
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${c.bordure}`, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 10 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.texteMuted }}>
                    {t('cgAchats.import.totalHt')}
                    <input
                      style={inputS}
                      type="number"
                      min="0" step="0.01"
                      value={totalHtSaisi ?? ''}
                      placeholder={fmtPrix(totalHtCalcule)}
                      title={t('cgAchats.import.totalHtTitle')}
                      onChange={e => setTotalHtSaisi(e.target.value === '' ? null : e.target.value)}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.texteMuted }}>
                    {t('cgAchats.import.totalVat')}
                    <input
                      style={inputS}
                      type="number"
                      min="0" step="0.01"
                      value={montantTvaSaisi ?? ''}
                      placeholder={fmtPrix(montantTvaCalcule)}
                      title={t('cgAchats.import.totalVatTitle')}
                      onChange={e => setMontantTvaSaisi(e.target.value === '' ? null : e.target.value)}
                    />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.texteMuted }}>
                    {t('cgAchats.import.totalTtc')}
                    <input
                      style={{ ...inputS, fontWeight: 600 }}
                      type="number"
                      min="0" step="0.01"
                      value={totalTtcSaisi ?? ''}
                      placeholder={fmtPrix(totalTtcCalcule)}
                      title={t('cgAchats.import.totalTtcTitle')}
                      onChange={e => setTotalTtcSaisi(e.target.value === '' ? null : e.target.value)}
                    />
                  </label>
                </div>
                {/* Hint d'incohérence : si la somme des lignes diffère de plus de 1 € ou 2 % du Total HT saisi */}
                {totalHtSaisi != null && totalHtSaisi !== '' && Math.abs(Number(totalHtSaisi) - totalHtCalcule) > Math.max(1, Number(totalHtSaisi) * 0.02) && (
                  <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 6, background: '#FEF3C7', border: '1px solid #F59E0B', fontSize: 12, color: '#92400E' }}>
                    {t('cgAchats.import.inconsistencyWarning', { calcule: fmtPrix(totalHtCalcule), saisi: fmtPrix(Number(totalHtSaisi)) })}
                  </div>
                )}
              </div>

          {/* ── Lignes (incluses dans la colonne droite en mode side-by-side) ── */}
          <div style={{ marginTop: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${c.bordure}` }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: c.texte }}>
                  {lignes.length > 0 ? t('cgAchats.import.linesTitleCount', { count: lignes.length }) : t('cgAchats.import.linesTitle')}
                </p>
              </div>

                {lignes.length === 0 && (
                  <p style={{ padding: 20, margin: 0, fontSize: 13, color: c.texteMuted, textAlign: 'center' }}>
                    {t('cgAchats.import.noLines')}
                  </p>
                )}

                {lignes.length > 0 && !useCardLayout && (
                  /* ── Tableau desktop (mode manuel uniquement) ── */
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 950 }}>
                      <thead>
                        <tr style={{ background: c.fond }}>
                          <th style={{ ...th, width: '30%' }}>{t('cgAchats.import.colDesignation')}</th>
                          <th style={{ ...th, width: '7%', textAlign: 'right' }}>{t('cgAchats.import.colQty')}</th>
                          <th style={{ ...th, width: '5%' }}>{t('cgAchats.import.colUnit')}</th>
                          <th style={{ ...th, width: '9%', textAlign: 'right' }}>{t('cgAchats.import.colUnitPrice')}</th>
                          <th style={{ ...th, width: '6%', textAlign: 'right' }}>{t('cgAchats.import.colDiscount')}</th>
                          <th style={{ ...th, width: '7%', textAlign: 'right' }}>{t('cgAchats.import.colVat')}</th>
                          <th style={{ ...th, width: '9%', textAlign: 'right' }}>{t('cgAchats.import.colTotalHt')}</th>
                          <th style={{ ...th, width: '12%', textAlign: 'center' }}>{t('cgAchats.import.colRecognized')}</th>
                          <th style={{ ...th, width: '7%', textAlign: 'center' }}>{t('cgAchats.import.colDelta')}</th>
                          <th style={{ ...th, width: '7%', textAlign: 'center' }}>{t('cgAchats.import.colUpdatePrice')}</th>
                          <th style={{ ...th, width: '5%' }} />
                        </tr>
                      </thead>
                      <tbody>
                        {lignes.map(l => {
                          const delta = fmtDelta(l.deltaPrix)
                          const deltaColor = l.deltaPrix == null ? c.texteMuted : l.deltaPrix > 0 ? c.orange : c.vert
                          const remise = Number(l.remise) || 0
                          const prixEffectif = Number(l.prix_unitaire_ht) * (1 - remise / 100)
                          const totalLigne = (Number(l.quantite) || 0) * prixEffectif
                          return (
                            <tr key={l._id}>
                              <td style={td}>
                                <IngredientAutocomplete
                                  ingredients={Object.values(ingredientsById)}
                                  value={l.designation}
                                  onChange={(text) => updateLigne(l._id, 'designation', text)}
                                  onSelect={(ing) => handleSelectFromAutocomplete(l, ing)}
                                  inputStyle={{ ...inputS, fontSize: 13 }}
                                />
                                {l.ingredient_nom && (
                                  <div style={{ fontSize: 11, color: c.texteMuted, marginTop: 2 }}>→ {l.ingredient_nom}</div>
                                )}
                              </td>
                              <td style={{ ...td, textAlign: 'right' }}>
                                <input
                                  style={{ ...inputS, textAlign: 'right', width: 70 }}
                                  type="number" min="0" step="0.001"
                                  value={l.quantite}
                                  onChange={e => updateLigne(l._id, 'quantite', e.target.value)}
                                />
                              </td>
                              <td style={td}>
                                <input
                                  style={{ ...inputS, width: 60, fontSize: 13 }}
                                  value={l.unite}
                                  placeholder={t('cgAchats.common.kgPlaceholder')}
                                  onChange={e => updateLigne(l._id, 'unite', e.target.value)}
                                />
                              </td>
                              <td style={{ ...td, textAlign: 'right' }}>
                                <input
                                  style={{ ...inputS, textAlign: 'right', width: 80 }}
                                  type="text" inputMode="decimal"
                                  value={l.prix_unitaire_ht ?? ''}
                                  onChange={e => updateLigne(l._id, 'prix_unitaire_ht', e.target.value.replace(',', '.'))}
                                />
                              </td>
                              <td style={{ ...td, textAlign: 'right' }}>
                                <input
                                  style={{ ...inputS, textAlign: 'right', width: 60 }}
                                  type="number" min="0" max="100" step="0.1"
                                  value={l.remise ?? 0}
                                  onChange={e => updateLigne(l._id, 'remise', e.target.value)}
                                />
                              </td>
                              <td style={{ ...td, textAlign: 'right' }}>
                                <input
                                  style={{ ...inputS, textAlign: 'right', width: 60 }}
                                  type="number" min="0" max="100" step="0.1"
                                  value={l.taux_tva ?? ''}
                                  placeholder={String(tauxTva)}
                                  onChange={e => updateLigne(l._id, 'taux_tva', e.target.value === '' ? null : e.target.value)}
                                />
                              </td>
                              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                {fmtPrix(totalLigne)}
                              </td>
                              <td style={{ ...td, textAlign: 'center' }}>
                                {creatingIngFor === l._id ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
                                    <input
                                      autoFocus
                                      style={{ ...inputS, fontSize: 12, padding: '3px 6px' }}
                                      value={newIngNom}
                                      placeholder={t('cgAchats.import.ingredientNamePlaceholder')}
                                      onChange={e => setNewIngNom(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') handleCreateIngredient(l); if (e.key === 'Escape') { setCreatingIngFor(null); setNewIngNom('') } }}
                                    />
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      <button onClick={() => handleCreateIngredient(l)} style={{ flex: 1, padding: '2px 6px', fontSize: 11, background: c.vert, color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>{t('cgAchats.import.create')}</button>
                                      <button onClick={() => { setCreatingIngFor(null); setNewIngNom('') }} style={{ padding: '2px 6px', fontSize: 11, background: 'transparent', border: `1px solid ${c.bordure}`, borderRadius: 4, cursor: 'pointer' }}>✕</button>
                                    </div>
                                  </div>
                                ) : linkingIngFor === l._id ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}>
                                    <input
                                      autoFocus
                                      style={{ ...inputS, fontSize: 12, padding: '3px 6px' }}
                                      value={linkSearch}
                                      placeholder={t('cgAchats.import.searchIngredient')}
                                      onChange={e => setLinkSearch(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Escape') { setLinkingIngFor(null); setLinkSearch('') } }}
                                    />
                                    <div style={{ maxHeight: 140, overflowY: 'auto', border: `1px solid ${c.bordure}`, borderRadius: 6, background: c.blanc }}>
                                      {Object.values(ingredientsById)
                                        .filter(ing => !linkSearch.trim() || normDesig(ing.nom).includes(normDesig(linkSearch)))
                                        .sort((a, b) => a.nom.localeCompare(b.nom))
                                        .slice(0, 20)
                                        .map(ing => (
                                          <button key={ing.id} onClick={() => handleLinkIngredient(l, ing)}
                                            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', fontSize: 11, background: 'transparent', border: 'none', borderBottom: `1px solid ${c.bordure}`, cursor: 'pointer', color: c.texte }}
                                          >{ing.nom}</button>
                                        ))
                                      }
                                      {Object.values(ingredientsById).filter(ing => !linkSearch.trim() || normDesig(ing.nom).includes(normDesig(linkSearch))).length === 0 && (
                                        <p style={{ margin: 0, padding: '6px 8px', fontSize: 11, color: c.texteMuted }}>{t('cgAchats.import.noResult')}</p>
                                      )}
                                    </div>
                                    <button onClick={() => { setLinkingIngFor(null); setLinkSearch('') }} style={{ padding: '2px 6px', fontSize: 11, background: 'transparent', border: `1px solid ${c.bordure}`, borderRadius: 4, cursor: 'pointer' }}>{t('cgAchats.import.cancelLink')}</button>
                                  </div>
                                ) : l.reconnu ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                    <span style={badgeVert}>{t('cgAchats.import.recognized')}</span>
                                    {l.ingredient_nom && <span style={{ fontSize: 10, color: c.texteMuted }}>{l.ingredient_nom}</span>}
                                    <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                                      <button onClick={() => { setLinkingIngFor(l._id); setLinkSearch(''); setCreatingIngFor(null) }} style={{ fontSize: 10, padding: '1px 5px', background: 'transparent', border: `1px solid ${c.bordure}`, color: c.texteMuted, borderRadius: 4, cursor: 'pointer' }}>{t('cgAchats.import.change')}</button>
                                      <button onClick={() => { setCreatingIngFor(l._id); setNewIngNom(l.designation); setLinkingIngFor(null) }} style={{ fontSize: 10, padding: '1px 5px', background: 'transparent', border: `1px solid ${c.accent}`, color: c.accent, borderRadius: 4, cursor: 'pointer' }} title={t('cgAchats.import.newIngredientTitle')}>{t('cgAchats.import.newIngredient')}</button>
                                    </div>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                    <span style={badgeGris}>{t('cgAchats.import.unknown')}</span>
                                    <button
                                      onClick={() => { setLinkingIngFor(l._id); setLinkSearch(''); setCreatingIngFor(null) }}
                                      style={{ fontSize: 10, padding: '2px 6px', background: '#EFF6FF', border: `1px solid #BFDBFE`, color: '#1D4ED8', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                    >{t('cgAchats.import.linkIngredient')}</button>
                                    <button
                                      onClick={() => { setCreatingIngFor(l._id); setNewIngNom(l.designation); setLinkingIngFor(null) }}
                                      style={{ fontSize: 10, padding: '2px 6px', background: 'transparent', border: `1px solid ${c.accent}`, color: c.accent, borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                    >{t('cgAchats.import.createIngredient')}</button>
                                  </div>
                                )}
                              </td>
                              <td style={{ ...td, textAlign: 'center' }}>
                                {delta ? (
                                  <span style={{ fontSize: 12, fontWeight: 700, color: deltaColor }}>{delta}</span>
                                ) : (
                                  <span style={{ color: c.texteMuted, fontSize: 12 }}>—</span>
                                )}
                              </td>
                              <td style={{ ...td, textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={!!l.updatePrice}
                                  disabled={!l.ingredient_id}
                                  onChange={e => updateLigne(l._id, 'updatePrice', e.target.checked)}
                                  style={{ width: 16, height: 16, cursor: l.ingredient_id ? 'pointer' : 'not-allowed' }}
                                />
                              </td>
                              <td style={{ ...td, textAlign: 'center' }}>
                                <button
                                  onClick={() => removeLigne(l._id)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.texteMuted, fontSize: 16, padding: 4, lineHeight: 1 }}
                                  title={t('cgAchats.import.deleteLineTitle')}
                                >×</button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {lignes.length > 0 && useCardLayout && (
                  /* ── Cartes (mobile + OCR desktop side-by-side) ── */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {lignes.map((l, idx) => {
                      const delta = fmtDelta(l.deltaPrix)
                      const deltaColor = l.deltaPrix == null ? c.texteMuted : l.deltaPrix > 0 ? c.orange : c.vert
                      const totalLigne = (Number(l.quantite) || 0) * (Number(l.prix_unitaire_ht) || 0)
                      return (
                        <div key={l._id} style={{ padding: '14px 16px', borderBottom: idx < lignes.length - 1 ? `1px solid ${c.bordure}` : 'none' }}>
                          {/* Ligne 1 : désignation + badge */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                            <div style={{ flex: 1 }}>
                              <IngredientAutocomplete
                                ingredients={Object.values(ingredientsById)}
                                value={l.designation}
                                onChange={(text) => updateLigne(l._id, 'designation', text)}
                                onSelect={(ing) => handleSelectFromAutocomplete(l, ing)}
                                inputStyle={{ ...inputS, fontSize: 15, fontWeight: 500 }}
                              />
                            </div>
                            {l.reconnu ? <span style={badgeVert}>✓</span> : <span style={badgeGris}>?</span>}
                          </div>
                          {l.ingredient_nom && (
                            <p style={{ margin: '0 0 8px', fontSize: 12, color: c.texteMuted }}>→ {l.ingredient_nom}</p>
                          )}
                          {creatingIngFor === l._id ? (
                            <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                              <input
                                autoFocus
                                style={{ ...inputS, flex: 1, fontSize: 13 }}
                                value={newIngNom}
                                placeholder={t('cgAchats.import.ingredientNamePlaceholder')}
                                onChange={e => setNewIngNom(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleCreateIngredient(l); if (e.key === 'Escape') { setCreatingIngFor(null); setNewIngNom('') } }}
                              />
                              <button onClick={() => handleCreateIngredient(l)} style={{ padding: '6px 10px', background: c.vert, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>{t('cgAchats.import.create')}</button>
                              <button onClick={() => { setCreatingIngFor(null); setNewIngNom('') }} style={{ padding: '6px 8px', background: 'transparent', border: `1px solid ${c.bordure}`, borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>✕</button>
                            </div>
                          ) : linkingIngFor === l._id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                              <input
                                autoFocus
                                style={{ ...inputS, fontSize: 13 }}
                                value={linkSearch}
                                placeholder={t('cgAchats.import.searchIngredient')}
                                onChange={e => setLinkSearch(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Escape') { setLinkingIngFor(null); setLinkSearch('') } }}
                              />
                              <div style={{ maxHeight: 160, overflowY: 'auto', border: `1px solid ${c.bordure}`, borderRadius: 8, background: c.blanc }}>
                                {Object.values(ingredientsById)
                                  .filter(ing => !linkSearch.trim() || normDesig(ing.nom).includes(normDesig(linkSearch)))
                                  .sort((a, b) => a.nom.localeCompare(b.nom))
                                  .slice(0, 20)
                                  .map(ing => (
                                    <button key={ing.id} onClick={() => handleLinkIngredient(l, ing)}
                                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 13, background: 'transparent', border: 'none', borderBottom: `1px solid ${c.bordure}`, cursor: 'pointer', color: c.texte }}
                                    >{ing.nom}</button>
                                  ))
                                }
                                {Object.values(ingredientsById).filter(ing => !linkSearch.trim() || normDesig(ing.nom).includes(normDesig(linkSearch))).length === 0 && (
                                  <p style={{ margin: 0, padding: '8px 12px', fontSize: 13, color: c.texteMuted }}>{t('cgAchats.import.noResult')}</p>
                                )}
                              </div>
                              <button onClick={() => { setLinkingIngFor(null); setLinkSearch('') }} style={{ alignSelf: 'flex-start', padding: '5px 10px', fontSize: 12, background: 'transparent', border: `1px solid ${c.bordure}`, borderRadius: 6, cursor: 'pointer' }}>{t('cgAchats.import.cancelLink')}</button>
                            </div>
                          ) : !l.reconnu ? (
                            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                              <button
                                onClick={() => { setLinkingIngFor(l._id); setLinkSearch(''); setCreatingIngFor(null) }}
                                style={{ fontSize: 12, padding: '5px 10px', background: '#EFF6FF', border: `1px solid #BFDBFE`, color: '#1D4ED8', borderRadius: 6, cursor: 'pointer' }}
                              >{t('cgAchats.import.linkShort')}</button>
                              <button
                                onClick={() => { setCreatingIngFor(l._id); setNewIngNom(l.designation); setLinkingIngFor(null) }}
                                style={{ fontSize: 12, padding: '5px 10px', background: 'transparent', border: `1px solid ${c.accent}`, color: c.accent, borderRadius: 6, cursor: 'pointer' }}
                              >{t('cgAchats.import.createShort')}</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                              <button
                                onClick={() => { setLinkingIngFor(l._id); setLinkSearch(''); setCreatingIngFor(null) }}
                                style={{ fontSize: 11, padding: '3px 8px', background: 'transparent', border: `1px solid ${c.bordure}`, color: c.texteMuted, borderRadius: 6, cursor: 'pointer' }}
                              >{t('cgAchats.import.changeLinkedIngredient')}</button>
                              <button
                                onClick={() => { setCreatingIngFor(l._id); setNewIngNom(l.designation); setLinkingIngFor(null) }}
                                style={{ fontSize: 11, padding: '3px 8px', background: 'transparent', border: `1px solid ${c.accent}`, color: c.accent, borderRadius: 6, cursor: 'pointer' }}
                                title={t('cgAchats.import.newIngredientTitle')}
                              >{t('cgAchats.import.createNew')}</button>
                            </div>
                          )}
                          {/* Ligne 2 : Qté / Unité / Prix / TVA */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: c.texteMuted }}>
                              {t('cgAchats.import.quantity')}
                              <input style={inputS} type="number" min="0" step="0.001" value={l.quantite}
                                onChange={e => updateLigne(l._id, 'quantite', e.target.value)} />
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: c.texteMuted }}>
                              {t('cgAchats.import.unit')}
                              <input style={inputS} value={l.unite} placeholder={t('cgAchats.common.kgPlaceholder')}
                                onChange={e => updateLigne(l._id, 'unite', e.target.value)} />
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: c.texteMuted }}>
                              {t('cgAchats.import.unitPrice')}
                              <input style={inputS} type="text" inputMode="decimal" value={l.prix_unitaire_ht ?? ''}
                                onChange={e => updateLigne(l._id, 'prix_unitaire_ht', e.target.value.replace(',', '.'))} />
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: c.texteMuted }}>
                              {t('cgAchats.import.vat')}
                              <input style={inputS} type="number" min="0" max="100" step="0.1" value={l.taux_tva ?? ''}
                                placeholder={String(tauxTva)}
                                onChange={e => updateLigne(l._id, 'taux_tva', e.target.value === '' ? null : e.target.value)} />
                            </label>
                          </div>
                          {/* Ligne 3 : total + delta + actions */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: c.texte }}>{fmtPrix(totalLigne)}</span>
                              {delta && <span style={{ fontSize: 12, fontWeight: 700, color: deltaColor }}>{delta}</span>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                              {/* Checkbox MAJ prix — grand touch target */}
                              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: l.ingredient_id ? c.texte : c.texteMuted, cursor: l.ingredient_id ? 'pointer' : 'not-allowed', minHeight: 44 }}>
                                <input
                                  type="checkbox"
                                  checked={!!l.updatePrice}
                                  disabled={!l.ingredient_id}
                                  onChange={e => updateLigne(l._id, 'updatePrice', e.target.checked)}
                                  style={{ width: 18, height: 18 }}
                                />
                                {t('cgAchats.import.updatePrice')}
                              </label>
                              <button
                                onClick={() => removeLigne(l._id)}
                                style={{ minHeight: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: `1px solid ${c.bordure}`, borderRadius: 8, cursor: 'pointer', color: c.texteMuted, fontSize: 18 }}
                              >×</button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div style={{ padding: '12px 16px', borderTop: lignes.length > 0 ? `1px solid ${c.bordure}` : 'none' }}>
                  <button style={{ ...btnSecondary, padding: '6px 12px', fontSize: 13, width: 'auto' }} onClick={addLigne}>
                    {t('cgAchats.import.addLine')}
                  </button>
                </div>
            </div>

            {/* Récapitulatif total */}
            {lignes.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, fontSize: 14, color: c.texteMuted }}>
                <span>{t('cgAchats.import.totalHtSummary')}</span>
                <span style={{ fontWeight: 700, fontSize: 16, color: c.texte }}>
                  {fmtPrix(lignes.reduce((s, l) => {
                    const r = Number(l.remise) || 0
                    return s + (Number(l.quantite) || 0) * Number(l.prix_unitaire_ht) * (1 - r / 100)
                  }, 0))}
                </span>
              </div>
            )}

            {/* Bouton enregistrer */}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 10, alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'flex-end' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: c.texteMuted, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={autoCreateMissing}
                  onChange={e => setAutoCreateMissing(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                {t('cgAchats.import.autoCreateMissing')}
              </label>
              <button
                style={{ ...btnPrimary, opacity: step === 'saving' ? 0.6 : 1 }}
                disabled={step === 'saving'}
                onClick={() => handleSave()}
              >
                {step === 'saving'
                  ? t('cgAchats.import.saving')
                  : extractedFactures && extractedFactures.length > 1
                    ? savedFactureIdxs.size + (savedFactureIdxs.has(currentFactureIdx) ? 0 : 1) < extractedFactures.length
                      ? t('cgAchats.import.saveAndNext', { idx: currentFactureIdx + 1, total: extractedFactures.length })
                      : t('cgAchats.import.saveLast')
                    : t('cgAchats.import.saveAndUpdatePrices')}
              </button>
            </div>
          </div>
            </div>{/* fin colonne droite metadonnées+lignes */}
          </div>{/* fin wrapper grid */}
          </>
        )}

        {/* ══ STEP : DONE ════════════════════════════════════════════════════ */}
        {step === 'done' && (
          <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center', paddingTop: 40 }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: c.texte }}>
              {t('cgAchats.import.doneTitle')}
            </h2>
            <p style={{ margin: '0 0 6px', fontSize: 15, color: c.texteMuted }}>
              {t('cgAchats.import.doneLines', { count: lignes.length })}
            </p>
            {prixMajCount > 0 && (
              <p style={{ margin: '0 0 28px', fontSize: 14, color: c.vert, fontWeight: 600 }}>
                {t('cgAchats.import.donePrices', { count: prixMajCount })}
              </p>
            )}
            {prixMajCount === 0 && <div style={{ marginBottom: 28 }} />}
            <button style={{ ...btnPrimary, margin: '0 auto' }} onClick={resetForm}>
              {t('cgAchats.import.importAnother')}
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
