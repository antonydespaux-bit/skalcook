'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getClientId } from '../../../../lib/supabase'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { useTheme } from '../../../../lib/useTheme'
import Navbar from '../../../../components/Navbar'
import { normDesig, todayIso, yesterdayIso, fmtPrix, fmtDelta, fileToBase64, makeLigneId, enrichLigne } from '../../../../lib/achatsHelpers'

// ─── Composant principal ─────────────────────────────────────────────────────

export default function AchatsImportPage() {
  const router = useRouter()
  const { c } = useTheme()
  const isMobile = useIsMobile()

  // ── Auth ──────────────────────────────────────────────────────────────────
  const [authReady, setAuthReady] = useState(false)
  const [clientId, setClientId] = useState(null)

  // ── Machine d'état ────────────────────────────────────────────────────────
  // 'upload' | 'extracting' | 'review' | 'saving' | 'done'
  const [step, setStep] = useState('upload')

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

  // ── Lignes enrichies ──────────────────────────────────────────────────────
  // Chaque ligne : { _id, designation, quantite, unite, prix_unitaire_ht, remise,
  //                 ingredient_id|null, ingredient_nom|null,
  //                 prix_actuel|null, deltaPrix|null, reconnu, updatePrice }
  const [lignes, setLignes] = useState([])

  // ── Caches de réconciliation ──────────────────────────────────────────────
  const [fournisseurMapping, setFournisseurMapping] = useState({}) // norm → { ingredient_id }
  const [ingredientsById, setIngredientsById] = useState({})       // id   → { nom, prix_kg, unite }

  // Index nom normalisé → ingrédient (recalculé quand ingredientsById change)
  const ingredientsByNorm = useMemo(
    () => Object.fromEntries(
      Object.values(ingredientsById).map(i => [normDesig(i.nom), i])
    ),
    [ingredientsById]
  )

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

  // Chargement mapping fournisseur + ingrédients une fois authentifié
  const loadReconciliation = useCallback(async () => {
    if (!clientId) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/achats/reconciliation-data?clientId=${clientId}`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      })
      if (!res.ok) return
      const { mappings, ingredients } = await res.json()
      setFournisseurMapping(
        Object.fromEntries((mappings || []).map(m => [m.designation_norm, m]))
      )
      setIngredientsById(
        Object.fromEntries((ingredients || []).map(i => [i.id, i]))
      )
    } catch (err) {
      console.warn('loadReconciliation error:', err)
    }
  }, [clientId])

  useEffect(() => {
    if (authReady && clientId) loadReconciliation()
  }, [authReady, clientId, loadReconciliation])

  // ─── Réconciliation d'une ligne ───────────────────────────────────────────

  const enrichLigneLocal = useCallback((ligne) => {
    return enrichLigne(ligne, fournisseurMapping, ingredientsById, ingredientsByNorm)
  }, [fournisseurMapping, ingredientsById, ingredientsByNorm])

  // ─── Extraction IA ────────────────────────────────────────────────────────

  const extractFromImage = useCallback(async (file) => {
    try {
      const base64 = await fileToBase64(file)
      setFileBase64(base64)
      setFileMime(file.type)
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/achats/parse-facture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ fileBase64: base64, mimeType: file.type, clientId }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Erreur extraction')

      setFournisseur(result.fournisseur || '')
      setDateFacture(result.date_facture || yesterdayIso())
      setNumeroFacture(result.numero_facture || '')
      const enriched = (result.lignes || []).map(l =>
        enrichLigneLocal({
          _id:              makeLigneId(),
          designation:      l.designation || '',
          quantite:         Number(l.quantite) || 1,
          unite:            l.unite || '',
          prix_unitaire_ht: Number(l.prix_unitaire_ht) || 0,
        })
      )
      setLignes(enriched)

      // Vérification doublon dès l'extraction, avant que l'utilisateur clique sur Enregistrer
      if (result.numero_facture?.trim()) {
        const dupRes = await fetch(
          `/api/achats/check-duplicate?clientId=${clientId}&numeroFacture=${encodeURIComponent(result.numero_facture.trim())}`,
          { headers: { 'Authorization': `Bearer ${session.access_token}` } }
        )
        if (dupRes.ok) {
          const { existing } = await dupRes.json()
          if (existing) setDuplicateWarning(existing)
        }
      }

      setStep('review')
    } catch (err) {
      console.error('Extraction IA échouée :', err)
      setExtractError(err.message || 'Extraction échouée')
      setLignes([])
      setStep('review')
    }
  }, [clientId, enrichLigneLocal])

  // ─── Sélection de fichier (mobile input + desktop drop partagé) ───────────

  const handleFileSelected = useCallback(async (selectedFile) => {
    if (!selectedFile) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(selectedFile.type)) {
      setError('Format non supporté. Utilisez JPG, PNG, WebP ou PDF.')
      return
    }
    // Libérer l'ancienne URL objet si elle existe
    setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(selectedFile) })
    setIsPdf(selectedFile.type === 'application/pdf')
    setError('')
    setExtractError('')
    setLignes([])

    // PDF et images : extraction IA (l'API Anthropic supporte les PDFs via type 'document')
    setStep('extracting')
    await extractFromImage(selectedFile)
  }, [extractFromImage])

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
    setLignes(prev => prev.map(l =>
      l._id !== id ? l : enrichLigneLocal({ ...l, [field]: value })
    ))
  }, [enrichLigneLocal])

  const addLigne = useCallback(() => {
    setLignes(prev => [...prev, enrichLigneLocal({
      _id: makeLigneId(),
      designation: '',
      quantite: 1,
      unite: 'kg',
      prix_unitaire_ht: 0,
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
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Erreur création ingrédient')

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
  }, [clientId, newIngNom])

  const handleLinkIngredient = useCallback((ligne, ing) => {
    const prixEff = Number(ligne.prix_unitaire_ht) * (1 - (Number(ligne.remise) || 0) / 100)
    const prixActuel = ing.prix_kg ? Number(ing.prix_kg) : null
    const deltaPrix = prixActuel && prixEff ? ((prixEff - prixActuel) / prixActuel) * 100 : null
    setLignes(prev => prev.map(l =>
      l._id !== ligne._id ? l : {
        ...l,
        ingredient_id:  ing.id,
        ingredient_nom: ing.nom,
        prix_actuel:    prixActuel,
        deltaPrix,
        reconnu:        true,
        updatePrice:    false,
      }
    ))
    setLinkingIngFor(null)
    setLinkSearch('')
  }, [])

  const handleSave = useCallback(async (forceInsert = false) => {
    if (!fournisseur.trim()) { setError('Le nom du fournisseur est requis.'); return }
    if (!dateFacture)        { setError('La date de la facture est requise.'); return }
    if (lignes.length === 0) { setError('Ajoutez au moins une ligne avant d\'enregistrer.'); return }
    setError('')
    setDuplicateWarning(null)
    setStep('saving')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/achats/save-facture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ clientId, fournisseur, numeroFacture, dateFacture, statut, lignes, forceInsert, fileBase64, fileMime }),
      })
      const result = await res.json()

      if (res.status === 409 && result.error === 'DUPLICATE_FACTURE') {
        setDuplicateWarning(result.existing)
        setStep('review')
        return
      }

      if (!res.ok) throw new Error(result.error || 'Erreur lors de l\'enregistrement.')

      setPrixMajCount(result.prix_maj ?? 0)
      router.push('/controle-gestion/achats')
    } catch (err) {
      console.error('handleSave error:', err)
      setError(err.message || 'Erreur lors de l\'enregistrement.')
      setStep('review')
    }
  }, [clientId, fournisseur, numeroFacture, dateFacture, statut, lignes, fileBase64, fileMime])

  // ─── Styles partagés ─────────────────────────────────────────────────────

  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
        Chargement…
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
      <Navbar section="cuisine" />
      <div style={{ padding: pad, maxWidth: 1200, margin: '0 auto' }}>

        {/* En-tête */}
        <h1 style={{ margin: '0 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 700, color: c.texte }}>
          Importation de factures
        </h1>
        <p style={{ margin: '0 0 28px', fontSize: 14, color: c.texteMuted }}>
          Photographiez ou déposez une facture fournisseur — les lignes sont extraites automatiquement.
        </p>

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
              ⚠️ Cette facture a déjà été importée
            </div>
            <div style={{ marginBottom: 10 }}>
              N° <strong>{numeroFacture}</strong> — {duplicateWarning.fournisseur} —{' '}
              {new Date(duplicateWarning.date_facture).toLocaleDateString('fr-FR')} —{' '}
              {Number(duplicateWarning.total_ht).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € HT
              <br />
              <span style={{ fontSize: 12, opacity: 0.8 }}>
                Importée le {new Date(duplicateWarning.created_at).toLocaleDateString('fr-FR')}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setDuplicateWarning(null)}
                style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #D97706', background: 'transparent', color: '#92400E', cursor: 'pointer', fontSize: 13 }}
              >
                Annuler
              </button>
              <button
                onClick={() => handleSave(true)}
                style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#D97706', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              >
                Importer quand même
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
                  📷 Prendre une photo de la facture
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
                  Choisir depuis la galerie / PDF
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
                  Glissez une facture ici
                </p>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: c.texteMuted }}>
                  ou cliquez pour parcourir
                </p>
                <p style={{ margin: 0, fontSize: 12, color: c.texteMuted }}>
                  Formats acceptés : JPG · PNG · WebP · PDF
                </p>
              </div>
            )}
          </div>
        )}

        {/* ══ STEP : EXTRACTING ══════════════════════════════════════════════ */}
        {step === 'extracting' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '48px 0' }}>
            {previewUrl && !isPdf && (
              <img src={previewUrl} alt="Aperçu" style={{ maxHeight: 180, maxWidth: '100%', borderRadius: 8, objectFit: 'contain', border: `1px solid ${c.bordure}` }} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: c.texteMuted, fontSize: 15 }}>
              <span style={{ display: 'inline-block', width: 20, height: 20, border: `3px solid ${c.accent}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Analyse de la facture par IA…
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* ══ STEP : REVIEW ══════════════════════════════════════════════════ */}
        {(step === 'review' || step === 'saving') && (
          <>
          <div style={isMobile ? { display: 'flex', flexDirection: 'column', gap: 20 } : { display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 0, alignItems: 'start' }}>

            {/* ── Colonne gauche : métadonnées + lignes ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: isMobile ? 0 : '0 24px 0 0' }}>

              {/* Aperçu fichier — mobile uniquement */}
              {isMobile && previewUrl && (
                <div>
                  {isPdf ? (
                    <iframe src={previewUrl} title="Aperçu facture PDF" style={{ width: '100%', height: 220, borderRadius: 10, border: `1px solid ${c.bordure}` }} />
                  ) : (
                    <img src={previewUrl} alt="Aperçu facture" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 10, border: `1px solid ${c.bordure}`, background: c.blanc }} />
                  )}
                  <button style={{ ...btnSecondary, marginTop: 10, width: '100%' }} onClick={resetForm}>↩ Changer de fichier</button>
                </div>
              )}

              {/* Bandeau extraction échouée */}
              {extractError && (
                <div style={{ background: c.orangeClair, border: `1px solid ${c.orange}`, borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400E' }}>
                  ⚠️ Extraction IA échouée ({extractError}). Saisissez les lignes manuellement.
                </div>
              )}

              {/* Métadonnées de la facture */}
              <div style={{ background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 12, padding: 16 }}>
                <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: 14, color: c.texte }}>Informations de la facture</p>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.texteMuted }}>
                    Fournisseur *
                    <input style={inputS} value={fournisseur} onChange={e => setFournisseur(e.target.value)} placeholder="Nom du fournisseur" />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.texteMuted }}>
                    Date de la facture *
                    <input style={inputS} type="date" value={dateFacture} onChange={e => setDateFacture(e.target.value)} />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.texteMuted }}>
                    N° de facture
                    <input style={inputS} value={numeroFacture} onChange={e => { setNumeroFacture(e.target.value); setDuplicateWarning(null) }} placeholder="Référence optionnelle" />
                  </label>
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: c.texteMuted }}>
                    Type de document
                    <select style={inputS} value={statut} onChange={e => setStatut(e.target.value)}>
                      <option value="facture">Facture</option>
                      <option value="bl">Bon de livraison (BL)</option>
                    </select>
                  </label>
                </div>
              </div>

            </div>

            {/* ── Colonne droite : aperçu PDF ── */}
            {!isMobile && (
              <div style={{ position: 'sticky', top: 76, height: 'calc(100vh - 90px)', display: 'flex', flexDirection: 'column', borderLeft: `1px solid ${c.bordure}`, paddingLeft: 24 }}>
                {previewUrl && (
                  isPdf ? (
                    <iframe
                      src={previewUrl}
                      title="Aperçu facture PDF"
                      style={{ width: '100%', flex: 1, borderRadius: 10, border: `1px solid ${c.bordure}` }}
                    />
                  ) : (
                    <img
                      src={previewUrl}
                      alt="Aperçu facture"
                      style={{ width: '100%', flex: 1, objectFit: 'contain', borderRadius: 10, border: `1px solid ${c.bordure}`, background: c.blanc }}
                    />
                  )
                )}
                {!previewUrl && (
                  <div style={{ flex: 1, background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
                    Aucun fichier
                  </div>
                )}
                <button style={{ ...btnSecondary, marginTop: 10, width: '100%' }} onClick={resetForm}>
                  ↩ Changer de fichier
                </button>
              </div>
            )}
          </div>

          {/* ── Lignes pleine largeur ── */}
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${c.bordure}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: c.texte }}>
                  Lignes de la facture{lignes.length > 0 && ` (${lignes.length})`}
                </p>
                <button style={{ ...btnSecondary, padding: '6px 12px', fontSize: 13, width: 'auto' }} onClick={addLigne}>
                  + Ajouter une ligne
                </button>
              </div>

                {lignes.length === 0 && (
                  <p style={{ padding: 20, margin: 0, fontSize: 13, color: c.texteMuted, textAlign: 'center' }}>
                    Aucune ligne. Cliquez sur "+ Ajouter une ligne" pour commencer.
                  </p>
                )}

                {lignes.length > 0 && !isMobile && (
                  /* ── Tableau desktop ── */
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 950 }}>
                      <thead>
                        <tr style={{ background: c.fond }}>
                          <th style={{ ...th, width: '30%' }}>Désignation</th>
                          <th style={{ ...th, width: '7%', textAlign: 'right' }}>Qté</th>
                          <th style={{ ...th, width: '5%' }}>Unité</th>
                          <th style={{ ...th, width: '9%', textAlign: 'right' }}>Prix HT/u</th>
                          <th style={{ ...th, width: '6%', textAlign: 'right' }}>Remise %</th>
                          <th style={{ ...th, width: '9%', textAlign: 'right' }}>Total HT</th>
                          <th style={{ ...th, width: '12%', textAlign: 'center' }}>Reconnu</th>
                          <th style={{ ...th, width: '7%', textAlign: 'center' }}>Δ Prix</th>
                          <th style={{ ...th, width: '7%', textAlign: 'center' }}>MAJ prix</th>
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
                                <input
                                  style={{ ...inputS, fontSize: 13 }}
                                  value={l.designation}
                                  placeholder="Nom du produit"
                                  onChange={e => updateLigne(l._id, 'designation', e.target.value)}
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
                                  placeholder="kg"
                                  onChange={e => updateLigne(l._id, 'unite', e.target.value)}
                                />
                              </td>
                              <td style={{ ...td, textAlign: 'right' }}>
                                <input
                                  style={{ ...inputS, textAlign: 'right', width: 80 }}
                                  type="number" min="0" step="0.01"
                                  value={l.prix_unitaire_ht}
                                  onChange={e => updateLigne(l._id, 'prix_unitaire_ht', e.target.value)}
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
                              <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                {fmtPrix(totalLigne)}
                              </td>
                              <td style={{ ...td, textAlign: 'center' }}>
                                {l.reconnu ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                    <span style={badgeVert}>✓ Reconnu</span>
                                    {l.ingredient_nom && <span style={{ fontSize: 10, color: c.texteMuted }}>{l.ingredient_nom}</span>}
                                    <button onClick={() => { setLinkingIngFor(l._id); setLinkSearch(''); setCreatingIngFor(null) }} style={{ fontSize: 10, padding: '1px 5px', background: 'transparent', border: `1px solid ${c.bordure}`, color: c.texteMuted, borderRadius: 4, cursor: 'pointer', marginTop: 2 }}>Changer</button>
                                  </div>
                                ) : creatingIngFor === l._id ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
                                    <input
                                      autoFocus
                                      style={{ ...inputS, fontSize: 12, padding: '3px 6px' }}
                                      value={newIngNom}
                                      placeholder="Nom de l'ingrédient"
                                      onChange={e => setNewIngNom(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') handleCreateIngredient(l); if (e.key === 'Escape') { setCreatingIngFor(null); setNewIngNom('') } }}
                                    />
                                    <div style={{ display: 'flex', gap: 4 }}>
                                      <button onClick={() => handleCreateIngredient(l)} style={{ flex: 1, padding: '2px 6px', fontSize: 11, background: c.vert, color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Créer</button>
                                      <button onClick={() => { setCreatingIngFor(null); setNewIngNom('') }} style={{ padding: '2px 6px', fontSize: 11, background: 'transparent', border: `1px solid ${c.bordure}`, borderRadius: 4, cursor: 'pointer' }}>✕</button>
                                    </div>
                                  </div>
                                ) : linkingIngFor === l._id ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 200 }}>
                                    <input
                                      autoFocus
                                      style={{ ...inputS, fontSize: 12, padding: '3px 6px' }}
                                      value={linkSearch}
                                      placeholder="Rechercher un ingrédient…"
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
                                        <p style={{ margin: 0, padding: '6px 8px', fontSize: 11, color: c.texteMuted }}>Aucun résultat</p>
                                      )}
                                    </div>
                                    <button onClick={() => { setLinkingIngFor(null); setLinkSearch('') }} style={{ padding: '2px 6px', fontSize: 11, background: 'transparent', border: `1px solid ${c.bordure}`, borderRadius: 4, cursor: 'pointer' }}>✕ Annuler</button>
                                  </div>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                    <span style={badgeGris}>Inconnu</span>
                                    <button
                                      onClick={() => { setLinkingIngFor(l._id); setLinkSearch(''); setCreatingIngFor(null) }}
                                      style={{ fontSize: 10, padding: '2px 6px', background: '#EFF6FF', border: `1px solid #BFDBFE`, color: '#1D4ED8', borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                    >🔗 Lier un ingrédient</button>
                                    <button
                                      onClick={() => { setCreatingIngFor(l._id); setNewIngNom(l.designation); setLinkingIngFor(null) }}
                                      style={{ fontSize: 10, padding: '2px 6px', background: 'transparent', border: `1px solid ${c.accent}`, color: c.accent, borderRadius: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                    >＋ Créer l'ingrédient</button>
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
                                  title="Supprimer"
                                >×</button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {lignes.length > 0 && isMobile && (
                  /* ── Cards mobile ── */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {lignes.map((l, idx) => {
                      const delta = fmtDelta(l.deltaPrix)
                      const deltaColor = l.deltaPrix == null ? c.texteMuted : l.deltaPrix > 0 ? c.orange : c.vert
                      const totalLigne = (Number(l.quantite) || 0) * (Number(l.prix_unitaire_ht) || 0)
                      return (
                        <div key={l._id} style={{ padding: '14px 16px', borderBottom: idx < lignes.length - 1 ? `1px solid ${c.bordure}` : 'none' }}>
                          {/* Ligne 1 : désignation + badge */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                            <input
                              style={{ ...inputS, fontSize: 15, fontWeight: 500, flex: 1 }}
                              value={l.designation}
                              placeholder="Nom du produit"
                              onChange={e => updateLigne(l._id, 'designation', e.target.value)}
                            />
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
                                placeholder="Nom de l'ingrédient"
                                onChange={e => setNewIngNom(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleCreateIngredient(l); if (e.key === 'Escape') { setCreatingIngFor(null); setNewIngNom('') } }}
                              />
                              <button onClick={() => handleCreateIngredient(l)} style={{ padding: '6px 10px', background: c.vert, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Créer</button>
                              <button onClick={() => { setCreatingIngFor(null); setNewIngNom('') }} style={{ padding: '6px 8px', background: 'transparent', border: `1px solid ${c.bordure}`, borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>✕</button>
                            </div>
                          ) : linkingIngFor === l._id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                              <input
                                autoFocus
                                style={{ ...inputS, fontSize: 13 }}
                                value={linkSearch}
                                placeholder="Rechercher un ingrédient…"
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
                                  <p style={{ margin: 0, padding: '8px 12px', fontSize: 13, color: c.texteMuted }}>Aucun résultat</p>
                                )}
                              </div>
                              <button onClick={() => { setLinkingIngFor(null); setLinkSearch('') }} style={{ alignSelf: 'flex-start', padding: '5px 10px', fontSize: 12, background: 'transparent', border: `1px solid ${c.bordure}`, borderRadius: 6, cursor: 'pointer' }}>✕ Annuler</button>
                            </div>
                          ) : !l.reconnu ? (
                            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                              <button
                                onClick={() => { setLinkingIngFor(l._id); setLinkSearch(''); setCreatingIngFor(null) }}
                                style={{ fontSize: 12, padding: '5px 10px', background: '#EFF6FF', border: `1px solid #BFDBFE`, color: '#1D4ED8', borderRadius: 6, cursor: 'pointer' }}
                              >🔗 Lier</button>
                              <button
                                onClick={() => { setCreatingIngFor(l._id); setNewIngNom(l.designation); setLinkingIngFor(null) }}
                                style={{ fontSize: 12, padding: '5px 10px', background: 'transparent', border: `1px solid ${c.accent}`, color: c.accent, borderRadius: 6, cursor: 'pointer' }}
                              >＋ Créer</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setLinkingIngFor(l._id); setLinkSearch(''); setCreatingIngFor(null) }}
                              style={{ fontSize: 11, padding: '3px 8px', background: 'transparent', border: `1px solid ${c.bordure}`, color: c.texteMuted, borderRadius: 6, cursor: 'pointer', marginBottom: 6 }}
                            >Changer l'ingrédient lié</button>
                          )}
                          {/* Ligne 2 : Qté / Unité / Prix */}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: c.texteMuted }}>
                              Quantité
                              <input style={inputS} type="number" min="0" step="0.001" value={l.quantite}
                                onChange={e => updateLigne(l._id, 'quantite', e.target.value)} />
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: c.texteMuted }}>
                              Unité
                              <input style={inputS} value={l.unite} placeholder="kg"
                                onChange={e => updateLigne(l._id, 'unite', e.target.value)} />
                            </label>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: c.texteMuted }}>
                              Prix HT/u
                              <input style={inputS} type="number" min="0" step="0.01" value={l.prix_unitaire_ht}
                                onChange={e => updateLigne(l._id, 'prix_unitaire_ht', e.target.value)} />
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
                                MAJ prix
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
            </div>

            {/* Récapitulatif total */}
            {lignes.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, fontSize: 14, color: c.texteMuted }}>
                <span>Total HT :</span>
                <span style={{ fontWeight: 700, fontSize: 16, color: c.texte }}>
                  {fmtPrix(lignes.reduce((s, l) => {
                    const r = Number(l.remise) || 0
                    return s + (Number(l.quantite) || 0) * Number(l.prix_unitaire_ht) * (1 - r / 100)
                  }, 0))}
                </span>
              </div>
            )}

            {/* Bouton enregistrer */}
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 10, justifyContent: 'flex-end' }}>
              <button
                style={{ ...btnPrimary, opacity: step === 'saving' ? 0.6 : 1 }}
                disabled={step === 'saving'}
                onClick={() => handleSave()}
              >
                {step === 'saving' ? 'Enregistrement…' : '💾 Enregistrer les achats et mettre à jour les prix'}
              </button>
            </div>
          </div>
          </>
        )}

        {/* ══ STEP : DONE ════════════════════════════════════════════════════ */}
        {step === 'done' && (
          <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center', paddingTop: 40 }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 700, color: c.texte }}>
              Facture enregistrée
            </h2>
            <p style={{ margin: '0 0 6px', fontSize: 15, color: c.texteMuted }}>
              {lignes.length} ligne{lignes.length > 1 ? 's' : ''} importée{lignes.length > 1 ? 's' : ''}.
            </p>
            {prixMajCount > 0 && (
              <p style={{ margin: '0 0 28px', fontSize: 14, color: c.vert, fontWeight: 600 }}>
                {prixMajCount} prix d&apos;ingrédient{prixMajCount > 1 ? 's' : ''} mis à jour.
              </p>
            )}
            {prixMajCount === 0 && <div style={{ marginBottom: 28 }} />}
            <button style={{ ...btnPrimary, margin: '0 auto' }} onClick={resetForm}>
              Importer une autre facture
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
