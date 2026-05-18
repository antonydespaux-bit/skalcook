'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useEscapeClose } from '../../lib/useEscapeClose'

const TYPE_LABEL = { menu: 'Menu', supplement: 'Supplément' }
const SERVICE_LABEL = { lunch: 'Déjeuner', dinner: 'Dîner', all: 'Les deux' }

// Modal de gestion du référentiel articles (menus + suppléments).
// CRUD simple : liste éditable, ajout/suppression, ordre par drag (out-of-scope
// PR B, on garde tri par nom).
export default function ArticlesModal({ c, clientId, onClose, onChange }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newNom, setNewNom] = useState('')
  const [newType, setNewType] = useState('menu')
  const [newService, setNewService] = useState('all')

  const load = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    try {
      const { data, error: e } = await supabase
        .from('ca_articles')
        .select('id, nom, type, service, ordre, actif')
        .eq('client_id', clientId)
        .eq('actif', true)
        .order('type').order('service').order('ordre').order('nom')
      if (e) throw e
      setRows(data || [])
    } catch (e) {
      setError(e.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { load() }, [load])

  useEscapeClose(onClose)

  const handleAdd = async () => {
    if (!clientId || !newNom.trim()) return
    setError('')
    try {
      const { error: e } = await supabase
        .from('ca_articles')
        .insert({ client_id: clientId, nom: newNom.trim(), type: newType, service: newService })
      if (e) throw e
      setNewNom('')
      await load()
      onChange?.()
    } catch (e) {
      setError(e.message || "Erreur lors de l'ajout")
    }
  }

  const handleDelete = async (id) => {
    // Soft delete : on désactive l'article au lieu de le supprimer pour
    // garder l'historique des rapports qui le référencent encore.
    if (!confirm('Désactiver cet article ? Il ne sera plus proposé pour la saisie mais reste référencé dans les anciens rapports.')) return
    try {
      const { error: e } = await supabase
        .from('ca_articles')
        .update({ actif: false })
        .eq('id', id)
      if (e) throw e
      setRows((prev) => prev.filter((r) => r.id !== id))
      onChange?.()
    } catch (e) {
      setError(e.message || 'Erreur de suppression')
    }
  }

  const handleEdit = async (id, patch) => {
    try {
      const { error: e } = await supabase.from('ca_articles').update(patch).eq('id', id)
      if (e) throw e
      setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r))
      onChange?.()
    } catch (e) {
      setError(e.message || 'Erreur de mise à jour')
    }
  }

  const grouped = rows.reduce((acc, r) => {
    const key = `${r.type}_${r.service}`
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})

  const groups = [
    { key: 'menu_lunch',      label: 'Menus déjeuner' },
    { key: 'menu_dinner',     label: 'Menus dîner' },
    { key: 'menu_all',        label: 'Menus (les deux services)' },
    { key: 'supplement_lunch',label: 'Suppléments déjeuner' },
    { key: 'supplement_dinner', label: 'Suppléments dîner' },
    { key: 'supplement_all',  label: 'Suppléments (les deux services)' },
  ].filter((g) => grouped[g.key])

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(9,9,11,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto',
          background: c.blanc, borderRadius: 14,
          border: `0.5px solid ${c.bordure}`, boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          padding: 20,
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: c.texte }}>Articles suivis</div>
            <div style={{ fontSize: 12, color: c.texteMuted, marginTop: 4 }}>
              Référentiel partagé des menus et suppléments dont tu remplis les ventes
              dans chaque rapport hebdo (depuis Lightspeed).
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer"
            style={{ background: 'transparent', border: 'none', fontSize: 20, color: c.texteMuted, cursor: 'pointer', lineHeight: 1 }}>
            ×
          </button>
        </div>

        {/* Ajout */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <input type="text" value={newNom} onChange={(e) => setNewNom(e.target.value)}
            placeholder="Nom (ex: Menu 5 services 205)"
            style={{ flex: 1, minWidth: 200, padding: '7px 10px', borderRadius: 8, fontSize: 13, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte }} />
          <select value={newType} onChange={(e) => setNewType(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 8, fontSize: 13, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte }}>
            <option value="menu">Menu</option>
            <option value="supplement">Supplément</option>
          </select>
          <select value={newService} onChange={(e) => setNewService(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 8, fontSize: 13, border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte }}>
            <option value="all">Les deux services</option>
            <option value="lunch">Déjeuner</option>
            <option value="dinner">Dîner</option>
          </select>
          <button onClick={handleAdd} disabled={!newNom.trim()}
            style={{ padding: '7px 14px', borderRadius: 8, fontSize: 13, border: 'none', background: c.accent, color: c.texte, fontWeight: 600, cursor: !newNom.trim() ? 'not-allowed' : 'pointer', opacity: !newNom.trim() ? 0.6 : 1 }}>
            Ajouter
          </button>
        </div>

        {error && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: '#FCEBEB', color: '#A32D2D', borderRadius: 8, fontSize: 12 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: c.texteMuted, fontSize: 13 }}>Chargement…</div>
        ) : groups.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: c.texteMuted, fontSize: 13 }}>
            Aucun article. Ajoute tes menus et suppléments ci-dessus.
          </div>
        ) : (
          <div style={{ border: `0.5px solid ${c.bordure}`, borderRadius: 10, overflow: 'hidden' }}>
            {groups.map((g, idx) => (
              <div key={g.key}>
                <div style={{
                  padding: '6px 12px', background: c.fond,
                  fontSize: 11, fontWeight: 600, color: c.texteMuted,
                  textTransform: 'uppercase', letterSpacing: 0.4,
                  borderTop: idx > 0 ? `0.5px solid ${c.bordure}` : 'none',
                }}>
                  {g.label}
                </div>
                {(grouped[g.key] || []).map((r) => (
                  <ArticleRow key={r.id} c={c} article={r}
                    onEdit={(patch) => handleEdit(r.id, patch)}
                    onDelete={() => handleDelete(r.id)} />
                ))}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose}
            style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, border: `0.5px solid ${c.bordure}`, background: c.blanc, color: c.texteMuted, cursor: 'pointer' }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

function ArticleRow({ c, article, onEdit, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [nom, setNom] = useState(article.nom)
  const save = () => { if (nom.trim() && nom !== article.nom) onEdit({ nom: nom.trim() }); setEditing(false) }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderTop: `0.5px solid ${c.bordure}` }}>
      {editing ? (
        <input type="text" value={nom} onChange={(e) => setNom(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setNom(article.nom); setEditing(false) } }}
          autoFocus
          style={{ flex: 1, padding: '4px 8px', borderRadius: 6, fontSize: 13, border: `1px solid ${c.accent}`, background: c.blanc, color: c.texte }} />
      ) : (
        <div onClick={() => setEditing(true)}
          style={{ flex: 1, fontSize: 13, color: c.texte, cursor: 'pointer' }}>
          {article.nom}
        </div>
      )}
      <span style={{ fontSize: 10, color: c.texteMuted }}>{TYPE_LABEL[article.type]} · {SERVICE_LABEL[article.service]}</span>
      <button onClick={onDelete}
        style={{ background: 'transparent', border: `0.5px solid ${c.bordure}`, borderRadius: 6, padding: '3px 8px', fontSize: 11, color: c.texteMuted, cursor: 'pointer' }}
        title="Désactiver">
        Supprimer
      </button>
    </div>
  )
}
