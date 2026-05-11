'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'

const MOIS_LABEL = [
  '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

const JOURS_FR_LONG = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

// Fériés FR fixes + flottants pour pré-remplissage. Pré-rempli SEULEMENT
// quand l'utilisateur clique sur le bouton dédié, jamais automatiquement.
// (L'utilisateur a explicitement demandé de garder la main.)
function feriesFR(annee) {
  // Calcul Pâques (algorithme de Meeus/Jones/Butcher)
  const a = annee % 19
  const b = Math.floor(annee / 100)
  const c = annee % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const moisPaques = Math.floor((h + l - 7 * m + 114) / 31)
  const jourPaques = ((h + l - 7 * m + 114) % 31) + 1
  const paques = new Date(annee, moisPaques - 1, jourPaques)
  const lundiPaques = new Date(paques); lundiPaques.setDate(paques.getDate() + 1)
  const ascension = new Date(paques); ascension.setDate(paques.getDate() + 39)
  const pentecote = new Date(paques); pentecote.setDate(paques.getDate() + 49)
  const lundiPentecote = new Date(paques); lundiPentecote.setDate(paques.getDate() + 50)
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return [
    { date: `${annee}-01-01`, motif: 'Jour de l\'an' },
    { date: fmt(lundiPaques), motif: 'Lundi de Pâques' },
    { date: `${annee}-05-01`, motif: '1er mai' },
    { date: `${annee}-05-08`, motif: 'Victoire 1945' },
    { date: fmt(ascension), motif: 'Ascension' },
    { date: fmt(lundiPentecote), motif: 'Lundi de Pentecôte' },
    { date: `${annee}-07-14`, motif: 'Fête nationale' },
    { date: `${annee}-08-15`, motif: 'Assomption' },
    { date: `${annee}-11-01`, motif: 'Toussaint' },
    { date: `${annee}-11-11`, motif: 'Armistice 1918' },
    { date: `${annee}-12-25`, motif: 'Noël' },
  ]
}

function humanDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const jourLabel = JOURS_FR_LONG[date.getDay()].slice(0, 3).toLowerCase()
  return `${jourLabel}. ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
}

// Modal de gestion des jours fermés / fériés. Liste éditable, dates uniques.
// Persiste dans ca_jours_fermes. Pré-remplissage optionnel des fériés FR
// d'une année donnée.
export default function JoursFermesModal({ c, clientId, annee, onClose }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newDate, setNewDate] = useState('')
  const [newMotif, setNewMotif] = useState('Férié')
  const [adding, setAdding] = useState(false)
  const [filtreAnnee, setFiltreAnnee] = useState(annee)

  const load = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    try {
      const { data, error: e } = await supabase
        .from('ca_jours_fermes')
        .select('id, date, motif')
        .eq('client_id', clientId)
        .gte('date', `${filtreAnnee}-01-01`)
        .lte('date', `${filtreAnnee}-12-31`)
        .order('date')
      if (e) throw e
      setRows(data || [])
    } catch (e) {
      setError(e.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [clientId, filtreAnnee])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleAdd = async () => {
    if (!clientId || !newDate || !newMotif.trim()) return
    setAdding(true)
    setError('')
    try {
      const { error: e } = await supabase
        .from('ca_jours_fermes')
        .upsert(
          { client_id: clientId, date: newDate, motif: newMotif.trim() },
          { onConflict: 'client_id,date' }
        )
      if (e) throw e
      setNewDate('')
      setNewMotif('Férié')
      await load()
    } catch (e) {
      setError(e.message || "Erreur lors de l'ajout")
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id) => {
    setError('')
    try {
      const { error: e } = await supabase
        .from('ca_jours_fermes')
        .delete()
        .eq('id', id)
      if (e) throw e
      setRows((prev) => prev.filter((r) => r.id !== id))
    } catch (e) {
      setError(e.message || 'Erreur de suppression')
    }
  }

  const handlePreFillFR = async () => {
    if (!clientId) return
    setAdding(true)
    setError('')
    try {
      const existing = new Set(rows.map((r) => r.date))
      const toAdd = feriesFR(filtreAnnee).filter((f) => !existing.has(f.date))
      if (toAdd.length === 0) {
        setError('Tous les fériés FR de l\'année sont déjà ajoutés.')
        return
      }
      const { error: e } = await supabase
        .from('ca_jours_fermes')
        .upsert(
          toAdd.map((f) => ({ client_id: clientId, date: f.date, motif: f.motif })),
          { onConflict: 'client_id,date' }
        )
      if (e) throw e
      await load()
    } catch (e) {
      setError(e.message || 'Erreur lors du pré-remplissage')
    } finally {
      setAdding(false)
    }
  }

  const groupedByMois = useMemo(() => {
    const groups = new Map()
    for (const r of rows) {
      const mois = Number(r.date.slice(5, 7))
      if (!groups.has(mois)) groups.set(mois, [])
      groups.get(mois).push(r)
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a - b)
  }, [rows])

  const annees = useMemo(() => {
    const now = new Date().getFullYear()
    const years = new Set([annee])
    for (let y = now - 1; y <= now + 2; y++) years.add(y)
    return Array.from(years).sort((a, b) => a - b)
  }, [annee])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(9,9,11,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto',
          background: c.blanc, borderRadius: 14,
          border: `0.5px solid ${c.bordure}`, boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 600, color: c.texte }}>Jours fermés / fériés</div>
            <div style={{ fontSize: 12, color: c.texteMuted, marginTop: 4 }}>
              Ces dates seront pré-remplies dans la colonne « Exception » du fichier Excel
              équipes (cumuls Budget et Réel les excluent automatiquement).
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer"
            style={{ background: 'transparent', border: 'none', fontSize: 20, color: c.texteMuted, cursor: 'pointer', lineHeight: 1 }}>
            ×
          </button>
        </div>

        {/* Sélecteur année + Pré-remplir FR */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: c.texteMuted }}>Année :</label>
          <select value={filtreAnnee} onChange={(e) => setFiltreAnnee(Number(e.target.value))}
            style={{
              padding: '6px 10px', borderRadius: 8, fontSize: 13,
              border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte,
            }}>
            {annees.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <div style={{ flex: 1 }} />
          <button
            onClick={handlePreFillFR}
            disabled={adding}
            title="Ajoute les 11 fériés FR standards pour l'année sélectionnée (sans toucher aux dates déjà présentes)"
            style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 12,
              border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte,
              cursor: adding ? 'not-allowed' : 'pointer', opacity: adding ? 0.6 : 1,
            }}
          >
            + Pré-remplir fériés FR
          </button>
        </div>

        {/* Ajout d'une date */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <input
            type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
            min={`${filtreAnnee}-01-01`} max={`${filtreAnnee}-12-31`}
            style={{
              padding: '7px 10px', borderRadius: 8, fontSize: 13,
              border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte,
            }}
          />
          <input
            type="text" placeholder="Motif (ex: Férié, Privatisation…)"
            value={newMotif} onChange={(e) => setNewMotif(e.target.value)}
            style={{
              flex: 1, minWidth: 180,
              padding: '7px 10px', borderRadius: 8, fontSize: 13,
              border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte,
            }}
          />
          <button
            onClick={handleAdd}
            disabled={adding || !newDate || !newMotif.trim()}
            style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 13,
              border: 'none', background: c.accent, color: c.texte,
              cursor: (adding || !newDate) ? 'not-allowed' : 'pointer',
              fontWeight: 600, opacity: (adding || !newDate) ? 0.6 : 1,
            }}
          >
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
        ) : rows.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: c.texteMuted, fontSize: 13 }}>
            Aucune date ajoutée pour {filtreAnnee}.
          </div>
        ) : (
          <div style={{ border: `0.5px solid ${c.bordure}`, borderRadius: 10, overflow: 'hidden' }}>
            {groupedByMois.map(([mois, items], idx) => (
              <div key={mois}>
                <div style={{
                  padding: '6px 12px', background: c.fond,
                  fontSize: 11, fontWeight: 600, color: c.texteMuted,
                  textTransform: 'uppercase', letterSpacing: 0.4,
                  borderTop: idx > 0 ? `0.5px solid ${c.bordure}` : 'none',
                }}>
                  {MOIS_LABEL[mois]} {filtreAnnee}
                </div>
                {items.map((r) => (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    borderTop: `0.5px solid ${c.bordure}`,
                  }}>
                    <div style={{ fontSize: 13, color: c.texte, minWidth: 140 }}>
                      {humanDate(r.date)}
                    </div>
                    <div style={{ flex: 1, fontSize: 13, color: c.texte }}>{r.motif}</div>
                    <button
                      onClick={() => handleDelete(r.id)}
                      style={{
                        background: 'transparent', border: `0.5px solid ${c.bordure}`,
                        borderRadius: 6, padding: '3px 8px', fontSize: 11,
                        color: c.texteMuted, cursor: 'pointer',
                      }}
                      title="Supprimer"
                    >
                      Supprimer
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose}
            style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 13,
              border: `0.5px solid ${c.bordure}`, background: c.blanc, color: c.texteMuted,
              cursor: 'pointer',
            }}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
