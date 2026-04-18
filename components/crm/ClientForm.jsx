'use client'

import { useState } from 'react'
import { Button } from '../ui'
import { SOURCES } from '../../lib/crmConstants'

/**
 * Formulaire partagé pour création + édition d'un crm_client.
 *
 * Props:
 *   c            : couleurs de useTheme()
 *   initial      : valeurs initiales (création = {}, édition = row existante)
 *   submitLabel  : texte du bouton principal
 *   onSubmit(vals) : async (champ client_id + created_by ajoutés par le parent)
 *   onCancel     : optionnel, affiche un bouton Annuler
 */
export default function ClientForm({ c, initial = {}, submitLabel = 'Enregistrer', onSubmit, onCancel }) {
  const [form, setForm] = useState({
    type:           initial.type || 'particulier',
    nom:            initial.nom || '',
    prenom:         initial.prenom || '',
    raison_sociale: initial.raison_sociale || '',
    siret:          initial.siret || '',
    email:          initial.email || '',
    telephone:      initial.telephone || '',
    adresse:        initial.adresse || '',
    code_postal:    initial.code_postal || '',
    ville:          initial.ville || '',
    source:         initial.source || '',
    tags:           initial.tags || [],
    notes:          initial.notes || '',
  })
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const upd = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function addTag(raw) {
    const v = (raw || '').trim()
    if (!v) return
    setForm((f) => f.tags.includes(v) ? f : { ...f, tags: [...f.tags, v] })
    setTagInput('')
  }

  function removeTag(t) {
    setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    // Validation minimale
    if (form.type === 'particulier' && !form.nom.trim() && !form.prenom.trim()) {
      setError('Renseignez au moins un nom ou un prénom.'); return
    }
    if (form.type === 'entreprise' && !form.raison_sociale.trim()) {
      setError('La raison sociale est obligatoire pour une entreprise.'); return
    }

    const payload = {
      type:           form.type,
      nom:            form.nom.trim() || null,
      prenom:         form.prenom.trim() || null,
      raison_sociale: form.raison_sociale.trim() || null,
      siret:          form.siret.trim() || null,
      email:          form.email.trim() || null,
      telephone:      form.telephone.trim() || null,
      adresse:        form.adresse.trim() || null,
      code_postal:    form.code_postal.trim() || null,
      ville:          form.ville.trim() || null,
      source:         form.source || null,
      tags:           form.tags,
      notes:          form.notes.trim() || null,
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
  const isEntreprise = form.type === 'entreprise'

  return (
    <form onSubmit={handleSubmit} className="crm-form">
      {/* Type */}
      <div className="crm-field">
        <label className="crm-field__label" style={labelStyle}>Type</label>
        <div className="crm-typetoggle" style={{ background: c.fond, borderColor: c.bordure }}>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, type: 'particulier' }))}
            className="crm-typetoggle__btn"
            style={{
              background: form.type === 'particulier' ? c.accent : 'transparent',
              color: form.type === 'particulier' ? '#fff' : c.texteMuted,
              fontWeight: form.type === 'particulier' ? 500 : 400,
            }}
          >Particulier</button>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, type: 'entreprise' }))}
            className="crm-typetoggle__btn"
            style={{
              background: form.type === 'entreprise' ? c.accent : 'transparent',
              color: form.type === 'entreprise' ? '#fff' : c.texteMuted,
              fontWeight: form.type === 'entreprise' ? 500 : 400,
            }}
          >Entreprise</button>
        </div>
      </div>

      {/* Identité */}
      {isEntreprise && (
        <div className="crm-form__grid crm-form__grid--2">
          <div className="crm-field">
            <label className="crm-field__label crm-field__label--required" style={labelStyle}>Raison sociale</label>
            <input className="crm-field__input" style={inputStyle} value={form.raison_sociale} onChange={upd('raison_sociale')} placeholder="SAS Martin & Co" />
          </div>
          <div className="crm-field">
            <label className="crm-field__label" style={labelStyle}>SIRET</label>
            <input className="crm-field__input" style={inputStyle} value={form.siret} onChange={upd('siret')} placeholder="123 456 789 00012" />
          </div>
        </div>
      )}
      <div className="crm-form__grid crm-form__grid--2">
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Prénom{isEntreprise ? ' (contact)' : ''}</label>
          <input className="crm-field__input" style={inputStyle} value={form.prenom} onChange={upd('prenom')} placeholder="Marie" />
        </div>
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Nom{isEntreprise ? ' (contact)' : ''}</label>
          <input className="crm-field__input" style={inputStyle} value={form.nom} onChange={upd('nom')} placeholder="Dupont" />
        </div>
      </div>

      {/* Contact */}
      <div className="crm-form__grid crm-form__grid--2">
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>E-mail</label>
          <input type="email" className="crm-field__input" style={inputStyle} value={form.email} onChange={upd('email')} placeholder="marie@exemple.fr" />
        </div>
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Téléphone</label>
          <input className="crm-field__input" style={inputStyle} value={form.telephone} onChange={upd('telephone')} placeholder="06 12 34 56 78" />
        </div>
      </div>

      {/* Adresse */}
      <div className="crm-field">
        <label className="crm-field__label" style={labelStyle}>Adresse</label>
        <input className="crm-field__input" style={inputStyle} value={form.adresse} onChange={upd('adresse')} placeholder="12 rue de la Paix" />
      </div>
      <div className="crm-form__grid crm-form__grid--2">
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Code postal</label>
          <input className="crm-field__input" style={inputStyle} value={form.code_postal} onChange={upd('code_postal')} placeholder="75001" />
        </div>
        <div className="crm-field">
          <label className="crm-field__label" style={labelStyle}>Ville</label>
          <input className="crm-field__input" style={inputStyle} value={form.ville} onChange={upd('ville')} placeholder="Paris" />
        </div>
      </div>

      {/* Source + tags */}
      <div className="crm-field">
        <label className="crm-field__label" style={labelStyle}>Source</label>
        <select className="crm-field__select" style={inputStyle} value={form.source} onChange={upd('source')}>
          <option value="">Non renseignée</option>
          {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="crm-field">
        <label className="crm-field__label" style={labelStyle}>Tags</label>
        <div
          className="crm-tags"
          style={{
            background: c.blanc,
            border: `0.5px solid ${c.bordure}`,
            borderRadius: 8,
            padding: '6px 8px',
            minHeight: 40,
          }}
        >
          {form.tags.map((t) => (
            <span
              key={t}
              className="crm-tag"
              style={{ background: c.accentClair || 'rgba(99,102,241,0.12)', color: c.accent || '#6366F1' }}
            >
              {t}
              <button type="button" className="crm-tag__remove" onClick={() => removeTag(t)} aria-label={`Retirer ${t}`}>×</button>
            </span>
          ))}
          <input
            className="crm-tag-input"
            style={{ color: c.texte }}
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                addTag(tagInput)
              } else if (e.key === 'Backspace' && !tagInput && form.tags.length) {
                removeTag(form.tags[form.tags.length - 1])
              }
            }}
            onBlur={() => addTag(tagInput)}
            placeholder={form.tags.length ? '' : 'Entrée pour ajouter (VIP, Fidèle…)'}
          />
        </div>
        <span className="crm-field__hint" style={{ color: c.texteMuted }}>
          Appuyez sur Entrée ou virgule pour valider un tag.
        </span>
      </div>

      {/* Notes */}
      <div className="crm-field">
        <label className="crm-field__label" style={labelStyle}>Notes</label>
        <textarea className="crm-field__textarea" style={inputStyle} value={form.notes} onChange={upd('notes')} placeholder="Allergies, préférences, récurrence annuelle…" />
      </div>

      {error && (
        <div style={{ color: 'var(--sk-rouge-texte)', fontSize: 13 }}>{error}</div>
      )}

      <div className="crm-actions">
        {onCancel && <Button c={c} variant="ghost" type="button" onClick={onCancel}>Annuler</Button>}
        <Button c={c} type="submit" disabled={saving}>{saving ? 'Enregistrement…' : submitLabel}</Button>
      </div>
    </form>
  )
}
