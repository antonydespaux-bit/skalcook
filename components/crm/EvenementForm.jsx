'use client'

import { useState } from 'react'
import { Button } from '../ui'
import { TYPES_PRESTATION, LIEUX_TYPES, STATUTS, clientDisplayName } from '../../lib/crmConstants'

/**
 * Formulaire partagé pour création + édition d'un crm_evenement.
 *
 * Props:
 *   c                 : couleurs de useTheme()
 *   initial           : valeurs initiales ({} en création)
 *   clientsDispo      : liste des clients CRM (pour le select)
 *   lockClient        : si true, le select client est désactivé (pré-rempli)
 *   submitLabel       : texte du bouton principal
 *   onSubmit(vals)    : async handler
 *   onCancel          : optionnel
 */
export default function EvenementForm({ c, initial = {}, clientsDispo = [], lockClient = false, submitLabel = 'Enregistrer', onSubmit, onCancel }) {
  const [form, setForm] = useState({
    crm_client_id:   initial.crm_client_id || '',
    titre:           initial.titre || '',
    type_prestation: initial.type_prestation || '',
    date_evenement:  initial.date_evenement || '',
    heure_debut:     initial.heure_debut || '',
    nb_convives:     initial.nb_convives ?? '',
    lieu_type:       initial.lieu_type || 'sur_place',
    lieu_adresse:    initial.lieu_adresse || '',
    statut:          initial.statut || 'demande',
    budget_estime:   initial.budget_estime ?? '',
    montant_devis:   initial.montant_devis ?? '',
    montant_final:   initial.montant_final ?? '',
    notes:           initial.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const upd = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!form.crm_client_id) { setError('Sélectionnez un client.'); return }
    if (!form.titre.trim()) { setError('Donnez un titre à l’événement.'); return }

    const payload = {
      crm_client_id:   form.crm_client_id,
      titre:           form.titre.trim(),
      type_prestation: form.type_prestation || null,
      date_evenement:  form.date_evenement || null,
      heure_debut:     form.heure_debut || null,
      nb_convives:     form.nb_convives === '' ? null : Number(form.nb_convives),
      lieu_type:       form.lieu_type || 'sur_place',
      lieu_adresse:    form.lieu_adresse.trim() || null,
      statut:          form.statut || 'demande',
      budget_estime:   form.budget_estime === '' ? null : Number(form.budget_estime),
      montant_devis:   form.montant_devis === '' ? null : Number(form.montant_devis),
      montant_final:   form.montant_final === '' ? null : Number(form.montant_final),
      notes:           form.notes.trim() || null,
    }

    setSaving(true)
    try {
      await onSubmit(payload)
    } catch (err) {
      setError(err?.message || 'Erreur lors de l’enregistrement.')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle = { background: c.blanc, borderColor: c.bordure, color: c.texte }
  const labelStyle = { color: c.texte }
  const besoinAdresse = form.lieu_type === 'livraison' || form.lieu_type === 'externe'

  return (
    <form onSubmit={handleSubmit} className="crm-form">
      {/* Client */}
      <div className="crm-field">
        <label className="crm-field__label crm-field__label--required" style={labelStyle}>Client</label>
        <select
          className="crm-field__select"
          style={inputStyle}
          value={form.crm_client_id}
          onChange={upd('crm_client_id')}
          disabled={lockClient}
        >
          <option value="">Sélectionner un client…</option>
          {clientsDispo.map((cl) => (
            <option key={cl.id} value={cl.id}>{clientDisplayName(cl)}</option>
          ))}
        </select>
        {clientsDispo.length === 0 && (
          <span className="crm-field__hint" style={{ color: c.texteMuted }}>
            Créez d’abord un client avant d’ajouter un événement.
          </span>
        )}
      </div>

      {/* Titre */}
      <div className="crm-field">
        <label className="crm-field__label crm-field__label--required" style={labelStyle}>Titre</label>
        <input className="crm-field__input" style={inputStyle} value={form.titre} onChange={upd('titre')} placeholder="Mariage Dupont / Cocktail Acme / Séminaire…" />
      </div>

      {/* Type + statut */}
      <div className="crm-form__grid crm-form__grid--2">
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Type de prestation</label>
          <select className="crm-field__select" style={inputStyle} value={form.type_prestation} onChange={upd('type_prestation')}>
            <option value="">Non précisé</option>
            {TYPES_PRESTATION.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Statut</label>
          <select className="crm-field__select" style={inputStyle} value={form.statut} onChange={upd('statut')}>
            {STATUTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {/* Date / heure / convives */}
      <div className="crm-form__grid crm-form__grid--3">
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Date</label>
          <input type="date" className="crm-field__input" style={inputStyle} value={form.date_evenement} onChange={upd('date_evenement')} />
        </div>
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Heure</label>
          <input type="time" className="crm-field__input" style={inputStyle} value={form.heure_debut} onChange={upd('heure_debut')} />
        </div>
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Nb convives</label>
          <input type="number" min="0" className="crm-field__input" style={inputStyle} value={form.nb_convives} onChange={upd('nb_convives')} placeholder="80" />
        </div>
      </div>

      {/* Lieu */}
      <div className="crm-form__grid crm-form__grid--2">
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Lieu</label>
          <select className="crm-field__select" style={inputStyle} value={form.lieu_type} onChange={upd('lieu_type')}>
            {LIEUX_TYPES.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
          </select>
        </div>
        {besoinAdresse && (
          <div className="crm-field">
            <label className="crm-field__label" style={labelStyle}>Adresse du lieu</label>
            <input className="crm-field__input" style={inputStyle} value={form.lieu_adresse} onChange={upd('lieu_adresse')} placeholder="Domaine de la Roche, 77…" />
          </div>
        )}
      </div>

      {/* Budget / devis / final */}
      <div className="crm-form__grid crm-form__grid--3">
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Budget estimé (€)</label>
          <input type="number" min="0" step="50" className="crm-field__input" style={inputStyle} value={form.budget_estime} onChange={upd('budget_estime')} placeholder="3000" />
        </div>
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Montant devis (€)</label>
          <input type="number" min="0" step="50" className="crm-field__input" style={inputStyle} value={form.montant_devis} onChange={upd('montant_devis')} placeholder="3200" />
        </div>
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Montant final (€)</label>
          <input type="number" min="0" step="50" className="crm-field__input" style={inputStyle} value={form.montant_final} onChange={upd('montant_final')} placeholder="3450" />
        </div>
      </div>

      {/* Notes */}
      <div className="crm-field">
        <label className="crm-field__label" style={labelStyle}>Notes</label>
        <textarea className="crm-field__textarea" style={inputStyle} value={form.notes} onChange={upd('notes')} placeholder="Allergies, contraintes, prestations spéciales…" />
      </div>

      {error && <div style={{ color: 'var(--sk-rouge-texte)', fontSize: 13 }}>{error}</div>}

      <div className="crm-actions">
        {onCancel && <Button c={c} variant="ghost" type="button" onClick={onCancel}>Annuler</Button>}
        <Button c={c} type="submit" disabled={saving || clientsDispo.length === 0}>
          {saving ? 'Enregistrement…' : submitLabel}
        </Button>
      </div>
    </form>
  )
}
