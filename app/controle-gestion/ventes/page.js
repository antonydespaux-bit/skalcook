'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase, getClientId } from '../../../lib/supabase'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import Navbar from '../../../components/Navbar'

const DEBUG_FALLBACK_CLIENT_ID = 'fa725e66-2cad-4ea4-892a-7eb3e90496a7'

const JOURS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']

function currentMonthIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthRange(monthIso) {
  const [y, m] = monthIso.split('-').map(Number)
  const debut = new Date(y, m - 1, 1)
  const fin = new Date(y, m, 0)
  const toIso = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { debut: toIso(debut), fin: toIso(fin) }
}

function* eachDay(monthIso) {
  const [y, m] = monthIso.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  for (let d = 1; d <= last; d++) {
    const date = new Date(y, m - 1, d)
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    yield { iso, day: d, weekday: date.getDay(), date }
  }
}

function formatEur(n) {
  if (n == null || isNaN(n) || n === 0) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
}

function formatEur2(n) {
  if (n == null || isNaN(n) || n === 0) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n)
}

export default function VentesMensuelPage() {
  const router = useRouter()
  const { c } = useTheme()
  const isMobile = useIsMobile()

  const [clientId, setClientId] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [mois, setMois] = useState(currentMonthIso())
  const [rawRows, setRawRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
    if (!clientId || !mois) return
    setLoading(true)
    setError('')
    try {
      const { debut, fin } = monthRange(mois)
      const { data, error: qErr } = await supabase
        .from('ca_journalier')
        .select('jour, service, couverts, ca_food, ca_bev_20, ca_bev_10, ca_autre')
        .eq('client_id', clientId)
        .gte('jour', debut)
        .lte('jour', fin)
      if (qErr) throw qErr
      setRawRows(data || [])
    } catch (e) {
      setError(e.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [clientId, mois])

  useEffect(() => {
    if (authChecked) loadData()
  }, [authChecked, loadData])

  const days = useMemo(() => {
    const byDay = new Map()
    for (const r of rawRows) {
      const key = r.jour
      if (!byDay.has(key)) {
        byDay.set(key, {
          lunchCouverts: 0,
          dinnerCouverts: 0,
          food: 0,
          bev_20: 0,
          bev_10: 0,
          autre: 0,
        })
      }
      const acc = byDay.get(key)
      const cv = Number(r.couverts || 0)
      if (r.service === 'lunch') acc.lunchCouverts += cv
      else acc.dinnerCouverts += cv
      acc.food += Number(r.ca_food || 0)
      acc.bev_20 += Number(r.ca_bev_20 || 0)
      acc.bev_10 += Number(r.ca_bev_10 || 0)
      acc.autre += Number(r.ca_autre || 0)
    }
    const result = []
    for (const d of eachDay(mois)) {
      const agg = byDay.get(d.iso) || {
        lunchCouverts: 0,
        dinnerCouverts: 0,
        food: 0,
        bev_20: 0,
        bev_10: 0,
        autre: 0,
      }
      const couvertsTot = agg.lunchCouverts + agg.dinnerCouverts
      const caTot = agg.food + agg.bev_20 + agg.bev_10 + agg.autre
      result.push({
        ...d,
        ...agg,
        couvertsTot,
        caTot,
        tm: couvertsTot > 0 ? caTot / couvertsTot : null,
        hasData: caTot > 0 || couvertsTot > 0,
      })
    }
    return result
  }, [rawRows, mois])

  const monthTotals = useMemo(() => {
    const t = {
      lunchCouverts: 0,
      dinnerCouverts: 0,
      food: 0,
      bev_20: 0,
      bev_10: 0,
      autre: 0,
    }
    for (const d of days) {
      t.lunchCouverts += d.lunchCouverts
      t.dinnerCouverts += d.dinnerCouverts
      t.food += d.food
      t.bev_20 += d.bev_20
      t.bev_10 += d.bev_10
      t.autre += d.autre
    }
    const couvertsTot = t.lunchCouverts + t.dinnerCouverts
    const caTot = t.food + t.bev_20 + t.bev_10 + t.autre
    return {
      ...t,
      couvertsTot,
      caTot,
      tm: couvertsTot > 0 ? caTot / couvertsTot : null,
    }
  }, [days])

  if (!authChecked) return null

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ padding: isMobile ? 16 : 24, maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: '0 0 4px', fontSize: isMobile ? 22 : 26, fontWeight: 600, color: c.texte }}>
            CA mensuel
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: c.texteMuted }}>
            Vue d&apos;ensemble par jour pour le mois sélectionné.
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
          <label style={{ fontSize: 13, color: c.texte }}>Mois :</label>
          <input
            type="month"
            value={mois}
            onChange={(e) => setMois(e.target.value)}
            style={{
              padding: '7px 10px',
              borderRadius: 8,
              border: `1px solid ${c.bordure}`,
              background: c.blanc,
              color: c.texte,
              fontSize: 13,
            }}
          />
          <div style={{ flex: 1 }} />
          <Link
            href="/controle-gestion/ventes/budgets"
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 13,
              border: `1px solid ${c.bordure}`,
              background: c.blanc,
              color: c.texte,
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Budgets
          </Link>
          <Link
            href="/controle-gestion/ventes/saisie"
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 13,
              border: `1px solid ${c.bordure}`,
              background: c.blanc,
              color: c.texte,
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            + Saisir une journée
          </Link>
        </div>

        {error && <p style={{ color: '#B91C1C', fontSize: 14, marginBottom: 16 }}>{error}</p>}

        {loading && <p style={{ color: c.texteMuted, fontSize: 14 }}>Chargement…</p>}

        {!loading && (
          <MonthTable
            days={days}
            totals={monthTotals}
            mois={mois}
            isMobile={isMobile}
            c={c}
          />
        )}
      </div>
    </div>
  )
}

function MonthTable({ days, totals, mois, isMobile, c }) {
  const cellPad = isMobile ? '8px 6px' : '10px 12px'
  const headPad = isMobile ? '10px 6px' : '12px 12px'
  const baseFont = isMobile ? 12 : 13
  const head = {
    padding: headPad,
    fontSize: baseFont - 1,
    fontWeight: 600,
    color: c.texteMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'right',
    background: c.fond,
    borderBottom: `1px solid ${c.bordure}`,
    whiteSpace: 'nowrap',
  }
  const cell = {
    padding: cellPad,
    fontSize: baseFont,
    color: c.texte,
    textAlign: 'right',
    borderBottom: `1px solid ${c.bordure}`,
    whiteSpace: 'nowrap',
  }
  return (
    <div
      style={{
        background: c.blanc,
        borderRadius: 12,
        border: `0.5px solid ${c.bordure}`,
        overflow: 'hidden',
      }}
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ ...head, textAlign: 'left' }}>Date</th>
              <th style={{ ...head, textAlign: 'left' }}>Jour</th>
              <th style={head}>Couv. midi</th>
              <th style={head}>Couv. soir</th>
              <th style={head}>CA Food</th>
              <th style={head}>CA Alcool</th>
              <th style={head}>CA Soft</th>
              <th style={head}>Autres</th>
              <th style={head}>CA Total</th>
              <th style={head}>TM</th>
              <th style={head}></th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr
                key={d.iso}
                style={{
                  background: d.weekday === 0 || d.weekday === 6 ? c.fond : 'transparent',
                  opacity: d.hasData ? 1 : 0.55,
                }}
              >
                <td style={{ ...cell, textAlign: 'left', fontWeight: 500 }}>
                  {String(d.day).padStart(2, '0')}
                </td>
                <td style={{ ...cell, textAlign: 'left', color: c.texteMuted }}>
                  {JOURS_FR[d.weekday].slice(0, 3)}
                </td>
                <td style={cell}>{d.lunchCouverts || '—'}</td>
                <td style={cell}>{d.dinnerCouverts || '—'}</td>
                <td style={cell}>{formatEur(d.food)}</td>
                <td style={cell}>{formatEur(d.bev_20)}</td>
                <td style={cell}>{formatEur(d.bev_10)}</td>
                <td style={cell}>{formatEur(d.autre)}</td>
                <td style={{ ...cell, fontWeight: 600 }}>{formatEur(d.caTot)}</td>
                <td style={cell}>{formatEur2(d.tm)}</td>
                <td style={{ ...cell, padding: '4px 8px' }}>
                  <Link
                    href={`/controle-gestion/ventes/saisie?date=${d.iso}`}
                    style={{
                      fontSize: baseFont - 1,
                      color: c.texteMuted,
                      textDecoration: 'none',
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: `1px solid ${c.bordure}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {d.hasData ? 'Modifier' : 'Saisir'}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: c.fond, fontWeight: 600 }}>
              <td style={{ ...cell, textAlign: 'left' }} colSpan={2}>
                Total {mois}
              </td>
              <td style={cell}>{totals.lunchCouverts || '—'}</td>
              <td style={cell}>{totals.dinnerCouverts || '—'}</td>
              <td style={cell}>{formatEur(totals.food)}</td>
              <td style={cell}>{formatEur(totals.bev_20)}</td>
              <td style={cell}>{formatEur(totals.bev_10)}</td>
              <td style={cell}>{formatEur(totals.autre)}</td>
              <td style={{ ...cell, fontWeight: 700 }}>{formatEur(totals.caTot)}</td>
              <td style={cell}>{formatEur2(totals.tm)}</td>
              <td style={cell}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
