'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getClientId } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import { useRole } from '../../../lib/useRole'
import Navbar from '../../../components/Navbar'

const CHAMPS = [
  { key: 'nom',       label: 'Nom',         required: true,  placeholder: 'Metro, Transgourmet…' },
  { key: 'adresse',   label: 'Adresse',     required: false, placeholder: '12 rue de la Paix, 75001 Paris' },
  { key: 'telephone', label: 'Téléphone',   required: false, placeholder: '01 23 45 67 89' },
  { key: 'email',     label: 'E-mail',      required: false, placeholder: 'contact@fournisseur.fr' },
  { key: 'siret',     label: 'SIRET',       required: false, placeholder: '123 456 789 00012' },
  { key: 'notes',     label: 'Notes',       required: false, placeholder: 'Livraison lundi/jeudi…' },
]

const VIDE = { nom: '', adresse: '', telephone: '', email: '', siret: '', notes: '' }

export default function FournisseursPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()

  const { role, loading: roleLoading } = useRole()

  const [authReady, setAuthReady] = useState(false)
  const [clientId, setClientId] = useState(null)
  const [fournisseurs, setFournisseurs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [recherche, setRecherche] = useState('')

  // Formulaire (création ou édition)
  const [mode, setMode] = useState(null) // null | 'create' | 'edit'
  const [form, setForm] = useState(VIDE)
  const [editId, setEditId] = useState(null)
  const [formError, setFormError] = useState('')

  // Confirmation suppression
  const [confirmDelete, setConfirmDelete] = useState(null) // id ou null

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return
        if (!session) { router.replace('/'); return }
        setAuthReady(true)
      } catch {
        if (!cancelled) router.replace('/')
      }
    })()
    return () => { cancelled = true }
  }, [router])

  // Section consultable par tous les membres. Modifications gardees par `role === 'admin'`.

  const loadFournisseurs = useCallback(async () => {
    setLoading(true)
    setError('')
    const cid = await getClientId()
    if (!cid) { setLoading(false); return }
    setClientId(cid)

    const { data, error: err } = await supabase
      .from('fournisseurs')
      .select('id, nom, adresse, telephone, email, siret, notes, created_at')
      .eq('client_id', cid)
      .order('nom')

    if (err) { setError(err.message); setLoading(false); return }
    setFournisseurs(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!authReady) return
    loadFournisseurs()
  }, [authReady, loadFournisseurs])

  function openCreate() {
    setForm(VIDE)
    setEditId(null)
    setFormError('')
    setMode('create')
  }

  function openEdit(f) {
    setForm({ nom: f.nom || '', adresse: f.adresse || '', telephone: f.telephone || '', email: f.email || '', siret: f.siret || '', notes: f.notes || '' })
    setEditId(f.id)
    setFormError('')
    setMode('edit')
  }

  function closeForm() {
    setMode(null)
    setFormError('')
  }

  async function handleSave() {
    if (!form.nom.trim()) { setFormError('Le nom est obligatoire.'); return }
    setSaving(true)
    setFormError('')

    const payload = {
      client_id: clientId,
      nom:       form.nom.trim(),
      adresse:   form.adresse.trim() || null,
      telephone: form.telephone.trim() || null,
      email:     form.email.trim() || null,
      siret:     form.siret.trim() || null,
      notes:     form.notes.trim() || null,
    }

    let err
    if (mode === 'create') {
      const res = await supabase.from('fournisseurs').insert(payload)
      err = res.error
    } else {
      const res = await supabase.from('fournisseurs').update(payload).eq('id', editId).eq('client_id', clientId)
      err = res.error
    }

    if (err) { setFormError(err.message); setSaving(false); return }
    setSaving(false)
    closeForm()
    loadFournisseurs()
  }

  async function handleDelete(id) {
    const { error: err } = await supabase.from('fournisseurs').delete().eq('id', id).eq('client_id', clientId)
    if (err) { setError(err.message); return }
    setConfirmDelete(null)
    loadFournisseurs()
  }

  if (!authReady) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
        Chargement…
      </div>
    )
  }

  const filtres = fournisseurs.filter((f) => {
    if (!recherche.trim()) return true
    const q = recherche.toLowerCase()
    return (
      (f.nom || '').toLowerCase().includes(q) ||
      (f.adresse || '').toLowerCase().includes(q) ||
      (f.siret || '').toLowerCase().includes(q)
    )
  })

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '9px 12px', borderRadius: 8, fontSize: 13,
    border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, outline: 'none',
  }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1100px', margin: '0 auto' }}>

        {/* En-tête */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 600, color: c.texte }}>
              Fournisseurs
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: c.texteMuted }}>
              {fournisseurs.length} fournisseur{fournisseurs.length !== 1 ? 's' : ''} enregistré{fournisseurs.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => router.push('/controle-gestion/achats')}
              style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer' }}
            >
              ← Achats
            </button>
            {role === 'admin' && (
              <button
                onClick={openCreate}
                style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, border: 'none', background: c.accent, color: '#fff', cursor: 'pointer', fontWeight: 500 }}
              >
                + Nouveau fournisseur
              </button>
            )}
          </div>
        </div>

        {/* Formulaire création (top-of-page uniquement pour le mode create) */}
        {mode === 'create' && role === 'admin' && (
          <div style={{
            background: c.blanc, borderRadius: 12, border: `0.5px solid ${c.accent}`,
            padding: isMobile ? 16 : 24, marginBottom: 20,
          }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: c.texte }}>
              Nouveau fournisseur
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px 20px', marginBottom: 16 }}>
              {CHAMPS.map(({ key, label, required, placeholder }) => (
                <div key={key} style={key === 'notes' ? { gridColumn: '1 / -1' } : {}}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: c.texteMuted, marginBottom: 5 }}>
                    {label}{required && <span style={{ color: '#A32D2D' }}> *</span>}
                  </label>
                  {key === 'notes' ? (
                    <textarea
                      value={form[key]}
                      onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder={placeholder}
                      rows={3}
                      style={{ ...inputStyle, resize: 'vertical' }}
                    />
                  ) : (
                    <input
                      type={key === 'email' ? 'email' : 'text'}
                      value={form[key]}
                      onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                      placeholder={placeholder}
                      style={inputStyle}
                    />
                  )}
                </div>
              ))}
            </div>

            {formError && <p style={{ color: '#A32D2D', fontSize: 13, marginBottom: 12 }}>{formError}</p>}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                  border: 'none', background: c.accent, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button
                onClick={closeForm}
                style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer' }}
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Recherche */}
        <input
          type="search"
          placeholder="Rechercher un fournisseur…"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          style={{ ...inputStyle, marginBottom: 16 }}
        />

        {error && <p style={{ color: '#B91C1C', fontSize: 14, marginBottom: 12 }}>{error}</p>}
        {loading && <p style={{ color: c.texteMuted, fontSize: 14 }}>Chargement…</p>}

        {!loading && !error && (
          filtres.length === 0 ? (
            <p style={{ color: c.texteMuted, fontSize: 14 }}>
              {fournisseurs.length === 0
                ? 'Aucun fournisseur enregistré. Créez-en un avec le bouton ci-dessus.'
                : 'Aucun résultat pour cette recherche.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filtres.map((f) => (
                <div
                  key={f.id}
                  style={{ background: c.blanc, borderRadius: 12, border: `0.5px solid ${c.bordure}`, padding: isMobile ? '14px 16px' : '16px 20px' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: c.texte, marginBottom: 4 }}>{f.nom}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', fontSize: 13, color: c.texteMuted }}>
                        {f.adresse   && <span>📍 {f.adresse}</span>}
                        {f.telephone && <span>📞 {f.telephone}</span>}
                        {f.email     && <span>✉ {f.email}</span>}
                        {f.siret     && <span style={{ fontFamily: 'monospace', fontSize: 12 }}>SIRET {f.siret}</span>}
                      </div>
                      {f.notes && (
                        <div style={{ marginTop: 6, fontSize: 12, color: c.texteMuted, fontStyle: 'italic' }}>{f.notes}</div>
                      )}
                    </div>
                    {role === 'admin' && (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button
                          onClick={() => mode === 'edit' && editId === f.id ? closeForm() : openEdit(f)}
                          style={{
                            padding: '6px 12px', borderRadius: 7, fontSize: 12,
                            border: `1px solid ${mode === 'edit' && editId === f.id ? c.accent : c.bordure}`,
                            background: mode === 'edit' && editId === f.id ? c.accent : c.blanc,
                            color: mode === 'edit' && editId === f.id ? '#fff' : c.texte,
                            cursor: 'pointer',
                          }}
                        >
                          {mode === 'edit' && editId === f.id ? '▲ Fermer' : 'Modifier'}
                        </button>
                        {confirmDelete === f.id ? (
                          <>
                            <button
                              onClick={() => handleDelete(f.id)}
                              style={{ padding: '6px 12px', borderRadius: 7, fontSize: 12, border: 'none', background: '#A32D2D', color: '#fff', cursor: 'pointer', fontWeight: 500 }}
                            >
                              Confirmer
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              style={{ padding: '6px 12px', borderRadius: 7, fontSize: 12, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer' }}
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(f.id)}
                            style={{ padding: '6px 12px', borderRadius: 7, fontSize: 12, border: `1px solid ${c.bordure}`, background: c.blanc, color: '#A32D2D', cursor: 'pointer' }}
                          >
                            Supprimer
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Accordéon édition inline */}
                  {mode === 'edit' && editId === f.id && role === 'admin' && (
                    <div style={{
                      marginTop: 14, paddingTop: 14, borderTop: `1px solid ${c.bordure}`,
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px 20px', marginBottom: 14 }}>
                        {CHAMPS.map(({ key, label, required, placeholder }) => (
                          <div key={key} style={key === 'notes' ? { gridColumn: '1 / -1' } : {}}>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: c.texteMuted, marginBottom: 5 }}>
                              {label}{required && <span style={{ color: '#A32D2D' }}> *</span>}
                            </label>
                            {key === 'notes' ? (
                              <textarea
                                value={form[key]}
                                onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                                placeholder={placeholder}
                                rows={3}
                                style={{ ...inputStyle, resize: 'vertical' }}
                              />
                            ) : (
                              <input
                                type={key === 'email' ? 'email' : 'text'}
                                value={form[key]}
                                onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                                placeholder={placeholder}
                                style={inputStyle}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                      {formError && <p style={{ color: '#A32D2D', fontSize: 13, marginBottom: 10 }}>{formError}</p>}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={handleSave}
                          disabled={saving}
                          style={{
                            padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                            border: 'none', background: c.accent, color: '#fff',
                            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
                          }}
                        >
                          {saving ? 'Enregistrement…' : 'Enregistrer'}
                        </button>
                        <button
                          onClick={closeForm}
                          style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte, cursor: 'pointer' }}
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}
