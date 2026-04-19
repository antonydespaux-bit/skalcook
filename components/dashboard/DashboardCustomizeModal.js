'use client'
import { useEffect, useState } from 'react'
import { WIDGET_BY_ID, DEFAULT_LAYOUT, saveDashboardLayout, resetDashboardLayout } from '../../lib/dashboardPreferences'

// Le layout est un array plat, mais l'UI regroupe visuellement les
// widgets par type (KPIs vs sections) pour que l'user comprenne que
// les KPIs sont toujours rendus avant les sections.
function splitByGroup(layout) {
  const kpis = []
  const sections = []
  for (const entry of layout) {
    const widget = WIDGET_BY_ID[entry.id]
    if (!widget) continue
    if (widget.size === 'kpi') kpis.push(entry)
    else sections.push(entry)
  }
  return { kpis, sections }
}

function mergeGroups(kpis, sections) {
  return [...kpis, ...sections]
}

function moveItem(list, index, direction) {
  const target = index + direction
  if (target < 0 || target >= list.length) return list
  const copy = [...list]
  ;[copy[index], copy[target]] = [copy[target], copy[index]]
  return copy
}

export default function DashboardCustomizeModal({ c, initialLayout, onClose, onSaved }) {
  const [draft, setDraft] = useState(initialLayout)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const { kpis, sections } = splitByGroup(draft)

  const toggleVisible = (id) => {
    setDraft(draft.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)))
  }

  const move = (id, direction) => {
    const { kpis, sections } = splitByGroup(draft)
    const inKpis = kpis.findIndex((l) => l.id === id)
    if (inKpis >= 0) {
      setDraft(mergeGroups(moveItem(kpis, inKpis, direction), sections))
      return
    }
    const inSections = sections.findIndex((l) => l.id === id)
    if (inSections >= 0) {
      setDraft(mergeGroups(kpis, moveItem(sections, inSections, direction)))
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const clean = await saveDashboardLayout(draft)
      onSaved(clean)
    } catch (err) {
      setError(err?.message || 'Erreur lors de la sauvegarde')
      setSaving(false)
    }
  }

  const handleReset = async () => {
    setSaving(true)
    setError(null)
    try {
      await resetDashboardLayout()
      setDraft(DEFAULT_LAYOUT)
      onSaved(DEFAULT_LAYOUT)
    } catch (err) {
      setError(err?.message || 'Erreur lors de la remise à zéro')
      setSaving(false)
    }
  }

  return (
    <div
      className="sk-dashboard-modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(9,9,11,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto',
          background: c.blanc, borderRadius: '14px',
          border: `0.5px solid ${c.bordure}`, boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          padding: '20px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
          <div style={{ fontSize: '17px', fontWeight: '600', color: c.texte }}>Personnaliser mon tableau de bord</div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{ background: 'transparent', border: 'none', fontSize: '20px', color: c.texteMuted, cursor: 'pointer', lineHeight: 1 }}
          >
            ×
          </button>
        </div>
        <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '16px' }}>
          Activez/désactivez les widgets et choisissez leur ordre d'affichage.
        </div>

        <WidgetList c={c} title="KPIs" entries={kpis} onToggle={toggleVisible} onMove={move} />
        <WidgetList c={c} title="Sections" entries={sections} onToggle={toggleVisible} onMove={move} />

        {error && (
          <div style={{ marginTop: '12px', padding: '10px 12px', background: '#FCEBEB', color: '#A32D2D', borderRadius: '8px', fontSize: '12px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginTop: '18px', flexWrap: 'wrap' }}>
          <button
            onClick={handleReset}
            disabled={saving}
            style={{
              background: 'transparent', color: c.texteMuted, border: `0.5px solid ${c.bordure}`,
              borderRadius: '8px', padding: '8px 12px', fontSize: '12px',
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
            }}
          >
            ↺ Rétablir les valeurs par défaut
          </button>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={onClose}
              disabled={saving}
              style={{
                background: c.blanc, color: c.texteMuted, border: `0.5px solid ${c.bordure}`,
                borderRadius: '8px', padding: '10px 14px', fontSize: '13px',
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
              }}
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                background: c.accent, color: c.principal, border: 'none',
                borderRadius: '8px', padding: '10px 14px', fontSize: '13px', fontWeight: '600',
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function WidgetList({ c, title, entries, onToggle, onMove }) {
  if (entries.length === 0) return null
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ fontSize: '11px', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: '500', marginBottom: '8px' }}>
        {title}
      </div>
      <div style={{ border: `0.5px solid ${c.bordure}`, borderRadius: '10px', overflow: 'hidden' }}>
        {entries.map((entry, i) => {
          const widget = WIDGET_BY_ID[entry.id]
          if (!widget) return null
          return (
            <div
              key={entry.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px',
                borderBottom: i < entries.length - 1 ? `0.5px solid ${c.bordure}` : 'none',
                background: c.blanc,
                opacity: entry.visible ? 1 : 0.55,
              }}
            >
              <input
                type="checkbox"
                checked={entry.visible}
                onChange={() => onToggle(entry.id)}
                style={{ cursor: 'pointer' }}
              />
              <div style={{ flex: 1, fontSize: '13px', color: c.texte }}>{widget.label}</div>
              <button
                onClick={() => onMove(entry.id, -1)}
                disabled={i === 0}
                aria-label="Monter"
                style={{
                  background: 'transparent', border: `0.5px solid ${c.bordure}`,
                  borderRadius: '6px', padding: '4px 8px', color: c.texte,
                  cursor: i === 0 ? 'not-allowed' : 'pointer', opacity: i === 0 ? 0.4 : 1,
                  fontSize: '12px',
                }}
              >
                ↑
              </button>
              <button
                onClick={() => onMove(entry.id, 1)}
                disabled={i === entries.length - 1}
                aria-label="Descendre"
                style={{
                  background: 'transparent', border: `0.5px solid ${c.bordure}`,
                  borderRadius: '6px', padding: '4px 8px', color: c.texte,
                  cursor: i === entries.length - 1 ? 'not-allowed' : 'pointer',
                  opacity: i === entries.length - 1 ? 0.4 : 1,
                  fontSize: '12px',
                }}
              >
                ↓
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
