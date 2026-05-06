'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getClientId } from '../../../../lib/supabase'
import { useIsMobile } from '../../../../lib/useIsMobile'
import { useTheme } from '../../../../lib/useTheme'
import Navbar from '../../../../components/Navbar'

const DEBUG_FALLBACK_CLIENT_ID = 'fa725e66-2cad-4ea4-892a-7eb3e90496a7'

const SUGGESTED_LIEUX = [
  'Salle à manger',
  'Table du chef',
  'La cave',
  'Le salon',
  'Privat',
  'Table de partage',
]

const SERVICES = [
  { code: 'lunch', label: 'Déjeuner' },
  { code: 'dinner', label: 'Dîner' },
]

const FIELDS = [
  { key: 'couverts', label: 'Couverts', step: '1', suffix: null },
  { key: 'ca_food', label: 'CA Food', step: '0.01', suffix: '€' },
  { key: 'ca_bev_20', label: 'CA Alcool 20%', step: '0.01', suffix: '€' },
  { key: 'ca_bev_10', label: 'CA Soft 10%', step: '0.01', suffix: '€' },
  { key: 'ca_autre', label: 'Autres CA', step: '0.01', suffix: '€' },
]

function toIsoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function emptyCell() {
  return { id: null, couverts: '', ca_food: '', ca_bev_20: '', ca_bev_10: '', ca_autre: '' }
}

function cellTotal(cell) {
  return (
    Number(cell.ca_food || 0) +
    Number(cell.ca_bev_20 || 0) +
    Number(cell.ca_bev_10 || 0) +
    Number(cell.ca_autre || 0)
  )
}

function cellTM(cell) {
  const cv = Number(cell.couverts || 0)
  if (cv === 0) return null
  return cellTotal(cell) / cv
}

function formatEur(n) {
  if (n == null || isNaN(n)) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
}

function hasAnyValue(cell) {
  return FIELDS.some(({ key }) => {
    const v = cell[key]
    return v !== '' && v !== null && v !== undefined
  })
}

export default function SaisieVentesPage() {
  const router = useRouter()
  const c = useTheme()
  const isMobile = useIsMobile()

  const [clientId, setClientId] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [jour, setJour] = useState(toIsoDate(new Date()))
  const [lieux, setLieux] = useState([])
  const [saisies, setSaisies] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancel = false
    ;(async () => {
      const { data: sessionData } = await supabase.auth.getSession()
      if (cancel) return
      if (!sessionData?.session) {
        router.replace('/')
        return
      }
      let cid = await getClientId()
      if (!cid) {
        console.warn('getClientId vide — fallback debug:', DEBUG_FALLBACK_CLIENT_ID)
        cid = DEBUG_FALLBACK_CLIENT_ID
      }
      if (cancel) return
      setClientId(cid)
      setAuthChecked(true)
    })()
    return () => {
      cancel = true
    }
  }, [router])

  const loadData = useCallback(async () => {
    if (!clientId || !jour) return
    setLoading(true)
    setError('')
    setOkMsg('')
    try {
      const [lieuxRes, saisiesRes] = await Promise.all([
        supabase
          .from('lieux_service')
          .select('id, nom, ordre, actif')
          .eq('client_id', clientId)
          .eq('actif', true)
          .order('ordre')
          .order('nom'),
        supabase
          .from('ca_journalier')
          .select('id, lieu_service_id, service, couverts, ca_food, ca_bev_20, ca_bev_10, ca_autre')
          .eq('client_id', clientId)
          .eq('jour', jour),
      ])
      if (lieuxRes.error) throw lieuxRes.error
      if (saisiesRes.error) throw saisiesRes.error

      setLieux(lieuxRes.data || [])
      const next = {}
      ;(saisiesRes.data || []).forEach((s) => {
        next[`${s.lieu_service_id}_${s.service}`] = {
          id: s.id,
          couverts: s.couverts ?? '',
          ca_food: s.ca_food ?? '',
          ca_bev_20: s.ca_bev_20 ?? '',
          ca_bev_10: s.ca_bev_10 ?? '',
          ca_autre: s.ca_autre ?? '',
        }
      })
      setSaisies(next)
    } catch (e) {
      setError(e.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [clientId, jour])

  useEffect(() => {
    if (authChecked) loadData()
  }, [authChecked, loadData])

  const addLieu = useCallback(
    async (nom) => {
      const trimmed = (nom || '').trim()
      if (!trimmed || !clientId) return
      setError('')
      try {
        const { error: insErr } = await supabase
          .from('lieux_service')
          .insert({ client_id: clientId, nom: trimmed, ordre: lieux.length })
        if (insErr) throw insErr
        await loadData()
      } catch (e) {
        setError(e.message || "Impossible d'ajouter le lieu")
      }
    },
    [clientId, lieux.length, loadData]
  )

  const updateCell = useCallback((lieuId, service, field, value) => {
    setSaisies((prev) => {
      const key = `${lieuId}_${service}`
      const current = prev[key] || emptyCell()
      return { ...prev, [key]: { ...current, [field]: value } }
    })
  }, [])

  const handleSave = useCallback(async () => {
    if (!clientId) return
    setSaving(true)
    setError('')
    setOkMsg('')
    try {
      const rows = []
      for (const lieu of lieux) {
        for (const svc of SERVICES) {
          const cell = saisies[`${lieu.id}_${svc.code}`]
          if (!cell || !hasAnyValue(cell)) continue
          rows.push({
            client_id: clientId,
            jour,
            lieu_service_id: lieu.id,
            service: svc.code,
            couverts: Number(cell.couverts || 0),
            ca_food: Number(cell.ca_food || 0),
            ca_bev_20: Number(cell.ca_bev_20 || 0),
            ca_bev_10: Number(cell.ca_bev_10 || 0),
            ca_autre: Number(cell.ca_autre || 0),
          })
        }
      }
      if (rows.length === 0) {
        setOkMsg('Rien à enregistrer.')
        return
      }
      const { error: upErr } = await supabase
        .from('ca_journalier')
        .upsert(rows, { onConflict: 'client_id,jour,lieu_service_id,service' })
      if (upErr) throw upErr
      setOkMsg(`Enregistré (${rows.length} ligne${rows.length > 1 ? 's' : ''}).`)
      await loadData()
    } catch (e) {
      setError(e.message || "Erreur d'enregistrement")
    } finally {
      setSaving(false)
    }
  }, [clientId, jour, lieux, saisies, loadData])

  const dayTotals = useMemo(() => {
    let lunchC = 0
    let dinnerC = 0
    let lunchCA = 0
    let dinnerCA = 0
    for (const lieu of lieux) {
      for (const svc of SERVICES) {
        const cell = saisies[`${lieu.id}_${svc.code}`]
        if (!cell) continue
        const cv = Number(cell.couverts || 0)
        const ca = cellTotal(cell)
        if (svc.code === 'lunch') {
          lunchC += cv
          lunchCA += ca
        } else {
          dinnerC += cv
          dinnerCA += ca
        }
      }
    }
    const couvertsTot = lunchC + dinnerC
    const caTot = lunchCA + dinnerCA
    return {
      lunchCouverts: lunchC,
      dinnerCouverts: dinnerC,
      lunchCA,
      dinnerCA,
      couvertsTot,
      caTot,
      tmJour: couvertsTot > 0 ? caTot / couvertsTot : null,
    }
  }, [lieux, saisies])

  if (!authChecked) return null

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ padding: isMobile ? 16 : 24, paddingBottom: 96, maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 600, color: c.texte }}>
            Saisie CA journalier
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: c.texteMuted }}>
            Saisie quotidienne du CA et des couverts par lieu de service.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          <label style={{ fontSize: 13, color: c.texte }}>Date :</label>
          <input
            type="date"
            value={jour}
            onChange={(e) => setJour(e.target.value)}
            style={{
              padding: '7px 10px',
              borderRadius: 8,
              border: `1px solid ${c.bordure}`,
              background: c.blanc,
              color: c.texte,
              fontSize: 13,
            }}
          />
        </div>

        {error && (
          <p style={{ color: '#B91C1C', fontSize: 14, marginBottom: 16 }}>{error}</p>
        )}
        {okMsg && (
          <p style={{ color: '#15803D', fontSize: 14, marginBottom: 16 }}>{okMsg}</p>
        )}

        {loading && <p style={{ color: c.texteMuted, fontSize: 14 }}>Chargement…</p>}

        {!loading && lieux.length === 0 && <EmptyLieux addLieu={addLieu} c={c} />}

        {!loading && lieux.length > 0 && (
          <>
            <LieuxBar lieux={lieux} addLieu={addLieu} c={c} isMobile={isMobile} />
            <SaisieGrid
              lieux={lieux}
              saisies={saisies}
              updateCell={updateCell}
              isMobile={isMobile}
              c={c}
            />
            <DayTotals totals={dayTotals} isMobile={isMobile} c={c} />
          </>
        )}
      </div>

      {!loading && lieux.length > 0 && (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            left: 0,
            right: 0,
            background: c.blanc,
            borderTop: `1px solid ${c.bordure}`,
            padding: isMobile ? '12px 16px' : '12px 24px',
            display: 'flex',
            justifyContent: 'center',
            zIndex: 10,
            boxShadow: '0 -4px 12px rgba(0,0,0,0.04)',
          }}
        >
          <button
            onClick={handleSave}
            disabled={saving || loading}
            style={{
              padding: '12px 24px',
              borderRadius: 8,
              fontSize: 15,
              border: 'none',
              background: c.accent,
              color: '#fff',
              cursor: saving || loading ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              opacity: saving || loading ? 0.5 : 1,
              width: isMobile ? '100%' : 'auto',
              minWidth: isMobile ? 'auto' : 280,
            }}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer la journée'}
          </button>
        </div>
      )}
    </div>
  )
}

function LieuxBar({ lieux, addLieu, c, isMobile }) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const handleSubmit = async () => {
    if (!newName.trim()) return
    await addLieu(newName)
    setNewName('')
    setAdding(false)
  }
  const remaining = SUGGESTED_LIEUX.filter((s) => !lieux.some((l) => l.nom === s))
  return (
    <div
      style={{
        background: c.blanc,
        borderRadius: 12,
        border: `0.5px solid ${c.bordure}`,
        padding: 12,
        marginBottom: 12,
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontSize: 13, color: c.texteMuted }}>
        {lieux.length} lieu{lieux.length > 1 ? 'x' : ''} configuré{lieux.length > 1 ? 's' : ''} :
      </span>
      {lieux.map((l) => (
        <span
          key={l.id}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            background: c.fond,
            color: c.texte,
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          {l.nom}
        </span>
      ))}
      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: `1px dashed ${c.bordure}`,
            background: 'transparent',
            color: c.texteMuted,
            fontSize: 12,
            cursor: 'pointer',
            marginLeft: 'auto',
          }}
        >
          + Ajouter un lieu
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginLeft: isMobile ? 0 : 'auto' }}>
          {remaining.length > 0 && (
            <select
              onChange={(e) => {
                if (e.target.value) {
                  addLieu(e.target.value)
                  setAdding(false)
                }
              }}
              defaultValue=""
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: `1px solid ${c.bordure}`,
                background: c.blanc,
                color: c.texte,
                fontSize: 12,
              }}
            >
              <option value="" disabled>
                Suggestions…
              </option>
              {remaining.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          <input
            type="text"
            placeholder="Autre nom…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit()
              if (e.key === 'Escape') {
                setAdding(false)
                setNewName('')
              }
            }}
            autoFocus
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: `1px solid ${c.bordure}`,
              background: c.blanc,
              color: c.texte,
              fontSize: 12,
              width: 140,
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!newName.trim()}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: 'none',
              background: c.accent,
              color: '#fff',
              fontSize: 12,
              cursor: newName.trim() ? 'pointer' : 'not-allowed',
              opacity: newName.trim() ? 1 : 0.5,
            }}
          >
            OK
          </button>
          <button
            onClick={() => {
              setAdding(false)
              setNewName('')
            }}
            style={{
              padding: '6px 10px',
              borderRadius: 6,
              border: `1px solid ${c.bordure}`,
              background: c.blanc,
              color: c.texteMuted,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

function EmptyLieux({ addLieu, c }) {
  const [custom, setCustom] = useState('')
  return (
    <div
      style={{
        background: c.blanc,
        borderRadius: 12,
        border: `0.5px solid ${c.bordure}`,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600, color: c.texte }}>
        Configurez vos lieux de service
      </h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: c.texteMuted }}>
        Pour démarrer, ajoutez les lieux où vous servez. Vous pourrez en rajouter d&apos;autres plus tard.
      </p>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 8,
          marginBottom: 16,
        }}
      >
        {SUGGESTED_LIEUX.map((nom) => (
          <button
            key={nom}
            onClick={() => addLieu(nom)}
            style={{
              padding: '7px 14px',
              borderRadius: 8,
              fontSize: 13,
              border: `1px solid ${c.bordure}`,
              background: c.blanc,
              color: c.texte,
              cursor: 'pointer',
            }}
          >
            + {nom}
          </button>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'center',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <input
          type="text"
          placeholder="Ou un autre nom…"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          style={{
            padding: '9px 14px',
            borderRadius: 8,
            fontSize: 13,
            border: `1px solid ${c.bordure}`,
            background: c.blanc,
            color: c.texte,
            outline: 'none',
            minWidth: 200,
          }}
        />
        <button
          onClick={() => {
            addLieu(custom)
            setCustom('')
          }}
          disabled={!custom.trim()}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            fontSize: 13,
            border: 'none',
            background: c.accent,
            color: '#fff',
            cursor: custom.trim() ? 'pointer' : 'not-allowed',
            fontWeight: 500,
            opacity: custom.trim() ? 1 : 0.5,
          }}
        >
          Ajouter
        </button>
      </div>
    </div>
  )
}

function SaisieGrid({ lieux, saisies, updateCell, isMobile, c }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {lieux.map((lieu) => (
        <LieuCard
          key={lieu.id}
          lieu={lieu}
          saisies={saisies}
          updateCell={updateCell}
          isMobile={isMobile}
          c={c}
        />
      ))}
    </div>
  )
}

function LieuCard({ lieu, saisies, updateCell, isMobile, c }) {
  return (
    <div
      style={{
        background: c.blanc,
        borderRadius: 12,
        border: `0.5px solid ${c.bordure}`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${c.bordure}`,
          background: c.fond,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: c.texte }}>
          {lieu.nom}
        </h3>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        }}
      >
        {SERVICES.map((svc, idx) => {
          const cell = saisies[`${lieu.id}_${svc.code}`] || emptyCell()
          const total = cellTotal(cell)
          const tm = cellTM(cell)
          return (
            <div
              key={svc.code}
              style={{
                padding: 16,
                borderLeft: !isMobile && idx > 0 ? `1px solid ${c.bordure}` : 'none',
                borderTop: isMobile && idx > 0 ? `1px solid ${c.bordure}` : 'none',
              }}
            >
              <div
                style={{
                  marginBottom: 12,
                  fontSize: 11,
                  fontWeight: 600,
                  color: c.texteMuted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                }}
              >
                {svc.label}
              </div>
              {FIELDS.map((f) => (
                <Field
                  key={f.key}
                  label={f.label}
                  value={cell[f.key]}
                  onChange={(v) => updateCell(lieu.id, svc.code, f.key, v)}
                  step={f.step}
                  suffix={f.suffix}
                  c={c}
                />
              ))}
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: `1px dashed ${c.bordure}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 13,
                }}
              >
                <span style={{ color: c.texteMuted }}>Total CA</span>
                <span style={{ fontWeight: 600, color: c.texte }}>{formatEur(total)}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 13,
                  marginTop: 4,
                }}
              >
                <span style={{ color: c.texteMuted }}>Ticket moyen</span>
                <span style={{ fontWeight: 600, color: c.texte }}>{formatEur(tm)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Field({ label, value, onChange, step, suffix, c }) {
  return (
    <div
      style={{
        marginBottom: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <label style={{ fontSize: 13, color: c.texte, flex: 1 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          style={{
            padding: '7px 10px',
            borderRadius: 8,
            border: `1px solid ${c.bordure}`,
            background: c.blanc,
            color: c.texte,
            fontSize: 13,
            width: 110,
            textAlign: 'right',
            outline: 'none',
          }}
        />
        <span style={{ fontSize: 13, color: c.texteMuted, width: 14 }}>{suffix || ''}</span>
      </div>
    </div>
  )
}

function DayTotals({ totals, isMobile, c }) {
  return (
    <div
      style={{
        background: c.blanc,
        borderRadius: 12,
        border: `0.5px solid ${c.bordure}`,
        padding: 16,
        marginTop: 16,
      }}
    >
      <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: c.texte }}>
        Total journée
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
          gap: 12,
        }}
      >
        <KPI label="Couverts midi" value={totals.lunchCouverts} c={c} />
        <KPI label="Couverts soir" value={totals.dinnerCouverts} c={c} />
        <KPI label="CA midi" value={formatEur(totals.lunchCA)} c={c} />
        <KPI label="CA soir" value={formatEur(totals.dinnerCA)} c={c} />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: 12,
          marginTop: 12,
          paddingTop: 12,
          borderTop: `1px solid ${c.bordure}`,
        }}
      >
        <KPI label="Couverts journée" value={totals.couvertsTot} c={c} highlight />
        <KPI label="CA total journée" value={formatEur(totals.caTot)} c={c} highlight />
        <KPI label="Ticket moyen journée" value={formatEur(totals.tmJour)} c={c} highlight />
      </div>
    </div>
  )
}

function KPI({ label, value, c, highlight }) {
  return (
    <div
      style={{
        padding: 12,
        background: highlight ? c.accentClair || c.fond : c.fond,
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: c.texteMuted,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: c.texte }}>{value}</div>
    </div>
  )
}
