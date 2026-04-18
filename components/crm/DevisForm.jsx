'use client'

import { useMemo, useState } from 'react'
import { Button, Badge } from '../ui'
import {
  STATUTS_DEVIS, TAUX_TVA, CONDITIONS_PAIEMENT,
  calcLigneTotaux, calcDevisTotaux, formatMontant, clientDisplayName, hexToRgba,
} from '../../lib/crmConstants'

/**
 * Formulaire de composition d'un devis.
 *
 * Props:
 *   c                 : couleurs de useTheme()
 *   initial           : header initial ({} en création)
 *   initialLignes     : lignes initiales ([] en création)
 *   clientsDispo      : crm_clients de l'établissement
 *   evenementsDispo   : crm_evenements de l'établissement
 *   fichesDispo       : fiches techniques {id, nom, cout_portion, prix_ttc, allergenes, ...}
 *   lockClient        : désactive le select client
 *   lockEvenement     : désactive le select événement
 *   submitLabel       : texte bouton principal
 *   onSubmit({ header, lignes }) : async handler
 *   onCancel          : optionnel
 *
 * Le parent gère l'allocation de numéro (RPC) + persistence DB. Ici on ne fait
 * que composer et valider localement.
 */
export default function DevisForm({
  c,
  initial = {},
  initialLignes = [],
  clientsDispo = [],
  evenementsDispo = [],
  fichesDispo = [],
  lockClient = false,
  lockEvenement = false,
  submitLabel = 'Enregistrer le devis',
  onSubmit,
  onCancel,
}) {
  const [form, setForm] = useState({
    crm_client_id:       initial.crm_client_id || '',
    crm_evenement_id:    initial.crm_evenement_id || '',
    date_emission:       initial.date_emission || isoToday(),
    date_validite:       initial.date_validite || '',
    statut:              initial.statut || 'brouillon',
    conditions_paiement: initial.conditions_paiement || '',
    acompte_pourcentage: initial.acompte_pourcentage ?? '',
    notes:               initial.notes || '',
  })
  const [lignes, setLignes] = useState(() => (initialLignes.length ? initialLignes : []))
  const [coef, setCoef] = useState(3)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const updForm = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // Événements filtrés selon le client sélectionné
  const evenementsPourClient = useMemo(() => {
    if (!form.crm_client_id) return []
    return evenementsDispo.filter((ev) => ev.crm_client_id === form.crm_client_id)
  }, [evenementsDispo, form.crm_client_id])

  const totaux = useMemo(() => calcDevisTotaux(lignes), [lignes])
  const allergenesAgreges = useMemo(() => {
    const set = new Set()
    for (const l of lignes) for (const a of l.allergenes || []) set.add(a)
    return Array.from(set)
  }, [lignes])

  const fichesFiltrees = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase()
    if (!q) return fichesDispo
    return fichesDispo.filter((f) => (f.nom || '').toLowerCase().includes(q))
  }, [fichesDispo, pickerSearch])

  function updLigne(idx, patch) {
    setLignes((arr) => arr.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }
  function removeLigne(idx) {
    setLignes((arr) => arr.filter((_, i) => i !== idx))
  }
  function ajouterFiche(f) {
    // Par défaut PU HT = prix_ttc converti HT à TVA 10 (resto sur place)
    const tva = 10
    const pu = f.prix_ttc ? Math.round((Number(f.prix_ttc) / (1 + tva / 100)) * 100) / 100 : 0
    setLignes((arr) => [...arr, {
      type: 'fiche',
      fiche_id: f.id,
      designation: f.nom || 'Sans titre',
      description: '',
      quantite: 1,
      prix_unitaire_ht: pu,
      tva_taux: tva,
      remise_pct: 0,
      allergenes: Array.isArray(f.allergenes) ? [...f.allergenes] : [],
      _cout_portion: Number(f.cout_portion) || 0, // utilisé par "Appliquer coefficient"
    }])
    setPickerOpen(false)
    setPickerSearch('')
  }
  function ajouterLibre() {
    setLignes((arr) => [...arr, {
      type: 'libre',
      fiche_id: null,
      designation: '',
      description: '',
      quantite: 1,
      prix_unitaire_ht: 0,
      tva_taux: 10,
      remise_pct: 0,
      allergenes: [],
    }])
  }
  function appliquerCoef() {
    const k = Number(coef)
    if (!k || k <= 0) return
    setLignes((arr) => arr.map((l) => {
      if (l.type !== 'fiche' || !l._cout_portion) return l
      const pu = Math.round(l._cout_portion * k * 100) / 100
      return { ...l, prix_unitaire_ht: pu }
    }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.crm_client_id) { setError('Sélectionnez un client.'); return }
    if (lignes.length === 0) { setError('Ajoutez au moins une ligne.'); return }
    for (const [i, l] of lignes.entries()) {
      if (!l.designation || !l.designation.trim()) {
        setError(`Ligne ${i + 1} : désignation obligatoire.`); return
      }
    }

    const header = {
      crm_client_id:       form.crm_client_id,
      crm_evenement_id:    form.crm_evenement_id || null,
      date_emission:       form.date_emission || null,
      date_validite:       form.date_validite || null,
      statut:              form.statut || 'brouillon',
      conditions_paiement: form.conditions_paiement.trim() || null,
      acompte_pourcentage: form.acompte_pourcentage === '' ? null : Number(form.acompte_pourcentage),
      notes:               form.notes.trim() || null,
      total_ht:            totaux.total_ht,
      total_tva:           totaux.total_tva,
      total_ttc:           totaux.total_ttc,
    }

    const lignesPayload = lignes.map((l, ordre) => {
      const t = calcLigneTotaux(l)
      return {
        ordre,
        type: l.type,
        fiche_id: l.type === 'fiche' ? l.fiche_id || null : null,
        designation: (l.designation || '').trim(),
        description: (l.description || '').trim() || null,
        allergenes: Array.isArray(l.allergenes) ? l.allergenes : [],
        quantite: Number(l.quantite) || 0,
        prix_unitaire_ht: Number(l.prix_unitaire_ht) || 0,
        tva_taux: Number(l.tva_taux) || 0,
        remise_pct: Number(l.remise_pct) || 0,
        total_ht: t.total_ht,
        total_tva: t.total_tva,
        total_ttc: t.total_ttc,
      }
    })

    setSaving(true)
    try {
      await onSubmit({ header, lignes: lignesPayload })
    } catch (err) {
      setError(err?.message || 'Erreur lors de l’enregistrement.')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = { background: c.blanc, borderColor: c.bordure, color: c.texte }
  const labelStyle = { color: c.texte }
  const noFiches = fichesDispo.length === 0

  return (
    <form onSubmit={handleSubmit} className="crm-form">
      {/* ─── Header : client, événement, dates, statut ──────────────── */}
      <div className="crm-field">
        <label className="crm-field__label crm-field__label--required" style={labelStyle}>Client</label>
        <select
          className="crm-field__select"
          style={inputStyle}
          value={form.crm_client_id}
          onChange={(e) => {
            // reset événement si on change de client
            setForm((f) => ({ ...f, crm_client_id: e.target.value, crm_evenement_id: '' }))
          }}
          disabled={lockClient}
        >
          <option value="">Sélectionner un client…</option>
          {clientsDispo.map((cl) => (
            <option key={cl.id} value={cl.id}>{clientDisplayName(cl)}</option>
          ))}
        </select>
      </div>

      <div className="crm-form__grid crm-form__grid--2">
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Événement lié</label>
          <select
            className="crm-field__select"
            style={inputStyle}
            value={form.crm_evenement_id}
            onChange={updForm('crm_evenement_id')}
            disabled={lockEvenement || !form.crm_client_id}
          >
            <option value="">Aucun (devis standalone)</option>
            {evenementsPourClient.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.titre}{ev.date_evenement ? ` — ${ev.date_evenement}` : ''}
              </option>
            ))}
          </select>
          {!form.crm_client_id && (
            <span className="crm-field__hint" style={{ color: c.texteMuted }}>
              Choisissez d’abord un client.
            </span>
          )}
        </div>
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Statut</label>
          <select className="crm-field__select" style={inputStyle} value={form.statut} onChange={updForm('statut')}>
            {STATUTS_DEVIS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      </div>

      <div className="crm-form__grid crm-form__grid--2">
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Date d’émission</label>
          <input type="date" className="crm-field__input" style={inputStyle} value={form.date_emission} onChange={updForm('date_emission')} />
        </div>
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Date de validité</label>
          <input type="date" className="crm-field__input" style={inputStyle} value={form.date_validite} onChange={updForm('date_validite')} />
        </div>
      </div>

      {/* ─── Composer : coef + lignes ─────────────────────────────── */}
      <div className="crm-devis-composer">
        <div className="crm-devis-coef" style={{ borderColor: c.bordure, background: c.blanc }}>
          <div className="crm-devis-coef__field">
            <span className="crm-devis-coef__label" style={{ color: c.texteMuted }}>Coefficient matière</span>
            <input
              type="number"
              min="0"
              step="0.1"
              className="crm-field__input"
              style={inputStyle}
              value={coef}
              onChange={(e) => setCoef(e.target.value)}
            />
          </div>
          <Button c={c} variant="ghost" type="button" onClick={appliquerCoef} disabled={lignes.every((l) => l.type !== 'fiche')}>
            Appliquer aux fiches
          </Button>
          <span className="crm-devis-coef__hint" style={{ color: c.texteMuted }}>
            Recalcule le prix unitaire de chaque ligne-fiche à partir de son coût portion × coef.
          </span>
        </div>

        <div className="crm-devis-lines">
          {lignes.length === 0 ? (
            <div className="crm-empty" style={{ borderColor: c.bordure, background: c.blanc }}>
              <div className="crm-empty__title" style={{ color: c.texte }}>Aucune ligne</div>
              <div className="crm-empty__text" style={{ color: c.texteMuted }}>
                Ajoutez des fiches techniques ou des lignes libres (matériel, service, déplacement…).
              </div>
            </div>
          ) : lignes.map((l, idx) => (
            <LigneDevis
              key={idx}
              c={c}
              ligne={l}
              index={idx}
              onChange={(patch) => updLigne(idx, patch)}
              onRemove={() => removeLigne(idx)}
            />
          ))}
        </div>

        <div className="crm-devis-add-bar">
          <Button c={c} variant="ghost" type="button" onClick={() => setPickerOpen((v) => !v)} disabled={noFiches}>
            {pickerOpen ? 'Fermer le sélecteur' : '+ Ajouter une fiche'}
          </Button>
          <Button c={c} variant="ghost" type="button" onClick={ajouterLibre}>
            + Ligne libre
          </Button>
          {noFiches && (
            <span style={{ color: c.texteMuted, fontSize: 13, alignSelf: 'center' }}>
              Aucune fiche disponible pour cet établissement.
            </span>
          )}
        </div>

        {pickerOpen && (
          <div className="crm-devis-picker" style={{ background: c.blanc, borderColor: c.bordure }}>
            <div className="crm-devis-picker__search" style={{ borderColor: c.bordure }}>
              <input
                type="text"
                placeholder="Rechercher une fiche…"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                style={{ background: c.fond, borderColor: c.bordure, color: c.texte }}
                autoFocus
              />
            </div>
            <div className="crm-devis-picker__list">
              {fichesFiltrees.length === 0 ? (
                <div className="crm-devis-picker__empty" style={{ color: c.texteMuted }}>
                  Aucune fiche ne correspond.
                </div>
              ) : fichesFiltrees.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="crm-devis-picker__item"
                  style={{ color: c.texte, borderColor: c.bordure }}
                  onClick={() => ajouterFiche(f)}
                >
                  <div className="crm-devis-picker__item-main">
                    <div className="crm-devis-picker__item-nom" style={{ color: c.texte }}>{f.nom}</div>
                    <div className="crm-devis-picker__item-meta" style={{ color: c.texteMuted }}>
                      {f.cout_portion ? `Coût ${formatMontant(f.cout_portion)}` : 'Coût non calculé'}
                      {Array.isArray(f.allergenes) && f.allergenes.length > 0 && ` · ${f.allergenes.length} allergène${f.allergenes.length > 1 ? 's' : ''}`}
                    </div>
                  </div>
                  {f.prix_ttc && (
                    <span className="crm-devis-picker__item-price" style={{ color: c.texteMuted }}>
                      {formatMontant(f.prix_ttc)} TTC
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ─── Totaux ─── */}
        <div className="crm-devis-totals" style={{ background: c.blanc, borderColor: c.bordure }}>
          <div className="crm-devis-totals__row" style={{ color: c.texteMuted }}>
            <span>Total HT</span><span>{formatMontant(totaux.total_ht)}</span>
          </div>
          <div className="crm-devis-totals__row" style={{ color: c.texteMuted }}>
            <span>TVA</span><span>{formatMontant(totaux.total_tva)}</span>
          </div>
          <div className="crm-devis-totals__row crm-devis-totals__row--ttc" style={{ color: c.texte, borderColor: c.bordure }}>
            <span>Total TTC</span><span>{formatMontant(totaux.total_ttc)}</span>
          </div>
          {allergenesAgreges.length > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `0.5px solid ${c.bordure}`, display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="sk-label-muted" style={{ color: c.texteMuted, marginRight: 4 }}>Allergènes :</span>
              {allergenesAgreges.map((a) => (
                <Badge key={a} bg={hexToRgba('#DC2626', 0.12)} color="#DC2626" size="sm">{a}</Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Conditions commerciales ─── */}
      <div className="crm-form__grid crm-form__grid--2">
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Conditions de paiement</label>
          <select className="crm-field__select" style={inputStyle} value={form.conditions_paiement} onChange={updForm('conditions_paiement')}>
            <option value="">Aucune</option>
            {CONDITIONS_PAIEMENT.map((cp) => <option key={cp} value={cp}>{cp}</option>)}
          </select>
        </div>
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Acompte (%)</label>
          <input
            type="number" min="0" max="100" step="5"
            className="crm-field__input"
            style={inputStyle}
            value={form.acompte_pourcentage}
            onChange={updForm('acompte_pourcentage')}
            placeholder="30"
          />
        </div>
      </div>

      <div className="crm-field">
        <label className="crm-field__label" style={labelStyle}>Notes internes</label>
        <textarea className="crm-field__textarea" style={inputStyle} value={form.notes} onChange={updForm('notes')} placeholder="Remarques, contraintes particulières…" />
      </div>

      {error && <div style={{ color: 'var(--sk-rouge-texte)', fontSize: 13 }}>{error}</div>}

      <div className="crm-actions">
        {onCancel && <Button c={c} variant="ghost" type="button" onClick={onCancel}>Annuler</Button>}
        <Button c={c} type="submit" disabled={saving}>
          {saving ? 'Enregistrement…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}

// ─── Sous-composant : une ligne du devis ────────────────────────────
function LigneDevis({ c, ligne, index, onChange, onRemove }) {
  const totaux = calcLigneTotaux(ligne)
  const isFiche = ligne.type === 'fiche'
  const inputStyle = { background: c.blanc, borderColor: c.bordure, color: c.texte }
  const typeColor = isFiche ? c.accent : c.texteMuted

  return (
    <div className="crm-devis-line" style={{ background: c.blanc, borderColor: c.bordure }}>
      <div className="crm-devis-line__header">
        <div className="crm-devis-line__header-main">
          <span
            className="crm-devis-line__type-badge"
            style={{ background: hexToRgba(typeColor, 0.12), color: typeColor }}
          >
            {isFiche ? `Fiche · ligne ${index + 1}` : `Libre · ligne ${index + 1}`}
          </span>
          <input
            type="text"
            className="crm-devis-line__designation-input"
            style={{ color: c.texte }}
            value={ligne.designation}
            onChange={(e) => onChange({ designation: e.target.value })}
            placeholder={isFiche ? 'Nom de la fiche' : 'Désignation (matériel, service…)'}
          />
        </div>
        <button
          type="button"
          className="crm-devis-line__delete"
          onClick={onRemove}
          aria-label="Supprimer la ligne"
          style={{ color: c.texteMuted }}
        >
          ×
        </button>
      </div>

      <textarea
        className="crm-devis-line__description"
        style={inputStyle}
        value={ligne.description || ''}
        onChange={(e) => onChange({ description: e.target.value })}
        placeholder="Description (optionnel — affichée sur le devis)"
      />

      <div className="crm-devis-line__grid">
        <div className="crm-devis-line__cell">
          <span className="crm-devis-line__cell-label" style={{ color: c.texteMuted }}>Quantité</span>
          <input
            type="number" min="0" step="0.01"
            className="crm-devis-line__input" style={inputStyle}
            value={ligne.quantite}
            onChange={(e) => onChange({ quantite: e.target.value })}
          />
        </div>
        <div className="crm-devis-line__cell">
          <span className="crm-devis-line__cell-label" style={{ color: c.texteMuted }}>PU HT (€)</span>
          <input
            type="number" min="0" step="0.01"
            className="crm-devis-line__input" style={inputStyle}
            value={ligne.prix_unitaire_ht}
            onChange={(e) => onChange({ prix_unitaire_ht: e.target.value })}
          />
        </div>
        <div className="crm-devis-line__cell">
          <span className="crm-devis-line__cell-label" style={{ color: c.texteMuted }}>TVA</span>
          <select
            className="crm-devis-line__input crm-field__select"
            style={inputStyle}
            value={ligne.tva_taux}
            onChange={(e) => onChange({ tva_taux: Number(e.target.value) })}
          >
            {TAUX_TVA.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div className="crm-devis-line__cell">
          <span className="crm-devis-line__cell-label" style={{ color: c.texteMuted }}>Remise %</span>
          <input
            type="number" min="0" max="100" step="1"
            className="crm-devis-line__input" style={inputStyle}
            value={ligne.remise_pct}
            onChange={(e) => onChange({ remise_pct: e.target.value })}
          />
        </div>
        <div className="crm-devis-line__cell crm-devis-line__cell--total">
          <span className="crm-devis-line__cell-label" style={{ color: c.texteMuted }}>Total ligne</span>
          <span className="crm-devis-line__total-value" style={{ color: c.texte }}>{formatMontant(totaux.total_ttc)}</span>
          <span style={{ color: c.texteMuted, fontSize: 11 }}>
            {formatMontant(totaux.total_ht)} HT
          </span>
        </div>
      </div>

      {ligne.allergenes && ligne.allergenes.length > 0 && (
        <div className="crm-devis-line__allergenes">
          <span className="sk-label-muted" style={{ color: c.texteMuted, marginRight: 4 }}>Allergènes :</span>
          {ligne.allergenes.map((a) => (
            <Badge key={a} bg={hexToRgba('#DC2626', 0.12)} color="#DC2626" size="sm">{a}</Badge>
          ))}
        </div>
      )}
    </div>
  )
}

function isoToday() {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}
