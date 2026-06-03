'use client'

import { useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart, AreaChart, Area, Line, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine,
  PieChart, Pie, Cell,
} from 'recharts'
import HeroCa from './HeroCa'
import CompareTooltip from '../widgets/CompareTooltip'
import { formatEur, formatNombre } from '../../../lib/caAnalyses'

// Vue Synthèse. Les widgets s'adaptent au mode de comparaison :
//   - 'n-1'    → tout compare N vs N-1 et met l'écart en avant.
//   - 'budget' → la carte « vs Objectif » prend son sens.
//   - 'aucune' → vue simple, une seule année.
export default function SyntheseView({
  c, isMobile, data, comparaison, currentLabel, compareLabel,
}) {
  const {
    totals, totalsCompare, periodBudget,
    evolutionBuckets, cumulBuckets, monthlyBuckets, monthlyCompare,
    mix, mixCompare, classement, classementCompare,
  } = data
  const n1 = comparaison === 'n-1' && totalsCompare && totalsCompare.caTtc > 0
  const compareTotals = comparaison === 'n-1' ? totalsCompare : null

  const [vue, setVue] = useState('cumule')
  const byLieu = data.byLieu || []
  const canSplit = byLieu.length >= 2
  const parLieu = canSplit && vue === 'parLieu'

  // Écart mensuel N − N-1 (aligné par index de mois).
  const ecartMensuel = monthlyCompare
    ? monthlyBuckets.map((b, i) => {
        const prev = monthlyCompare[i]?.caTot || 0
        return { label: b.label, ecart: b.caTot - prev, caTot: b.caTot, caTotN1: prev }
      })
    : null

  const cols = isMobile ? '1fr' : '1fr 1fr'
  const span2 = isMobile ? 'auto' : 'span 2'

  const hero = (
    <HeroCa
      c={c} isMobile={isMobile} totals={totals} compareTotals={compareTotals}
      periodBudget={periodBudget} sparkBuckets={evolutionBuckets}
      currentLabel={currentLabel} compareLabel={compareLabel} comparaison={comparaison}
    />
  )

  return (
    <div>
      {canSplit && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <Segmented c={c} value={vue} onChange={setVue}
            options={[['cumule', 'Cumulé'], ['parLieu', `Par lieu (${byLieu.length})`]]} />
        </div>
      )}

      {parLieu ? (
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 16 }}>
          <div style={{ gridColumn: span2 }}>{hero}</div>
          <div style={{ gridColumn: span2 }}>
            <div style={{
              display: 'grid', gap: 16,
              gridTemplateColumns: isMobile ? '1fr' : `repeat(${Math.min(byLieu.length, 3)}, 1fr)`,
            }}>
              {byLieu.map((l) => (
                <LieuCard key={l.id} c={c} isMobile={isMobile} lieu={l}
                  n1={n1} currentLabel={currentLabel} compareLabel={compareLabel} />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <CumuleGrid
          c={c} isMobile={isMobile} cols={cols} span2={span2} hero={hero}
          data={data} comparaison={comparaison} n1={n1} ecartMensuel={ecartMensuel}
          currentLabel={currentLabel} compareLabel={compareLabel}
        />
      )}
    </div>
  )
}

function CumuleGrid({ c, isMobile, cols, span2, hero, data, comparaison, n1, ecartMensuel, currentLabel, compareLabel }) {
  const {
    monthlyBuckets, cumulBuckets, evolutionBuckets,
    mix, mixCompare, classement, classementCompare,
  } = data
  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 16 }}>
      <div style={{ gridColumn: span2 }}>{hero}</div>

      {/* Évolution */}
      <ChartCard c={c} isMobile={isMobile} title="Évolution du CA"
        hint={n1 ? `${currentLabel} vs ${compareLabel}` : 'Sur la période'}>
        <EvolutionChart c={c} buckets={evolutionBuckets} compareActive={n1}
          currentLabel={currentLabel} compareLabel={compareLabel} />
      </ChartCard>

      {/* Slot 2 : écart (N-1) / objectif (budget) / cumulé (aucune) */}
      {n1 ? (
        <ChartCard c={c} isMobile={isMobile} title="Écart mensuel vs N-1"
          hint={`Gain (vert) / perte (rouge) vs ${compareLabel}`}>
          <EcartChart c={c} buckets={ecartMensuel} currentLabel={currentLabel} compareLabel={compareLabel} />
        </ChartCard>
      ) : comparaison === 'budget' ? (
        <ChartCard c={c} isMobile={isMobile} title="CA mensuel vs Objectif"
          hint="Vert = budget atteint · Rouge = en dessous">
          <ObjectifChart c={c} buckets={monthlyBuckets} />
        </ChartCard>
      ) : (
        <ChartCard c={c} isMobile={isMobile} title="CA cumulé" hint="Progression cumulée">
          <CumulChart c={c} buckets={cumulBuckets} />
        </ChartCard>
      )}

      {/* Mix CA */}
      <ChartCard c={c} isMobile={isMobile} title="Mix CA · Food / Boissons"
        hint={n1 ? `Structure ${currentLabel} vs ${compareLabel}` : 'Répartition du CA TTC'}>
        {n1
          ? <MixCompare c={c} mix={mix} mixCompare={mixCompare} currentLabel={currentLabel} compareLabel={compareLabel} />
          : <MixDonut c={c} mix={mix} />}
      </ChartCard>

      {/* Classement par lieu */}
      <ChartCard c={c} isMobile={isMobile} title="Classement par lieu"
        hint={n1 ? `Contribution & écart vs ${compareLabel}` : 'Contribution au CA TTC de la période'}>
        <Classement c={c} rows={classement} compareRows={n1 ? classementCompare : null}
          currentLabel={currentLabel} compareLabel={compareLabel} />
      </ChartCard>
    </div>
  )
}

// ── Cartes & charts ─────────────────────────────────────────────────────────

function ChartCard({ c, isMobile, title, hint, children }) {
  return (
    <div style={{
      background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 14,
      padding: isMobile ? 14 : 18,
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: c.texte }}>{title}</div>
      <div style={{ fontSize: 12, color: c.texteMuted, marginBottom: 14 }}>{hint}</div>
      {children}
    </div>
  )
}

function EvolutionChart({ c, buckets, compareActive, currentLabel, compareLabel }) {
  if (!buckets || buckets.length === 0) return <Empty c={c} />
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={buckets} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.bordure} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} tickFormatter={kEur} />
        {compareActive ? (
          <Tooltip content={<CompareTooltip c={c} currentLabel={currentLabel} compareLabel={compareLabel}
            field="caTot" compareField="caTotN1" unit="eur" />} />
        ) : (
          <Tooltip contentStyle={tooltipStyle(c)} formatter={(v, n) => [formatEur(v), n]} />
        )}
        {compareActive && <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />}
        {compareActive && (
          <Line type="monotone" dataKey="caTotN1" name={compareLabel} stroke={c.texteMuted}
            strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
        )}
        <Line type="monotone" dataKey="caTot" name={compareActive ? currentLabel : 'CA TTC'}
          stroke={c.accent} strokeWidth={2.5} dot={{ r: 2 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// Écart mensuel N − N-1 : barres signées vert/rouge. Fait ressortir d'un
// coup d'œil les mois gagnés / perdus vs l'an dernier.
function EcartChart({ c, buckets, currentLabel, compareLabel }) {
  if (!buckets || buckets.length === 0) return <Empty c={c} />
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={buckets} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.bordure} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} tickFormatter={kEur}
          domain={[(min) => Math.min(0, min), (max) => Math.max(0, max)]} />
        <Tooltip content={<EcartTip c={c} currentLabel={currentLabel} compareLabel={compareLabel} />} />
        <ReferenceLine y={0} stroke={c.texteMuted} strokeWidth={1.5} />
        <Bar dataKey="ecart" name="Écart" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {buckets.map((b, i) => <Cell key={i} fill={b.ecart >= 0 ? c.vert : c.rouge} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

function EcartTip({ active, payload, label, c, currentLabel, compareLabel }) {
  if (!active || !payload || !payload.length) return null
  const d = payload[0].payload
  const pct = d.caTotN1 ? (d.ecart / d.caTotN1) * 100 : null
  return (
    <div style={{ ...tooltipStyle(c), padding: '8px 10px', minWidth: 150 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <Line2 c={c} k={currentLabel} v={formatEur(d.caTot)} />
      <Line2 c={c} k={compareLabel} v={formatEur(d.caTotN1)} muted />
      <div style={{ marginTop: 4, paddingTop: 4, borderTop: `0.5px solid ${c.bordure}`, color: d.ecart >= 0 ? c.vert : c.rouge, fontWeight: 600, textAlign: 'right' }}>
        {d.ecart >= 0 ? '+' : ''}{formatEur(d.ecart)}{pct != null && ` (${pct >= 0 ? '+' : ''}${pct.toFixed(1)} %)`}
      </div>
    </div>
  )
}

function Line2({ c, k, v, muted }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: muted ? c.texteMuted : c.texte }}>
      <span>{k}</span><b style={{ fontWeight: muted ? 400 : 600 }}>{v}</b>
    </div>
  )
}

function CumulChart({ c, buckets }) {
  if (!buckets || buckets.length === 0) return <Empty c={c} />
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={buckets} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.bordure} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} tickFormatter={kEur} />
        <Tooltip contentStyle={tooltipStyle(c)} formatter={(v, n) => [formatEur(v), n]} />
        <Bar dataKey="caTot" name="CA cumulé" fill={c.accent} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function ObjectifChart({ c, buckets }) {
  if (!buckets || buckets.length === 0) return <Empty c={c} />
  const hasBudget = buckets.some((b) => b.budget > 0)
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={buckets} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.bordure} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} tickFormatter={kEur} />
        <Tooltip contentStyle={tooltipStyle(c)} formatter={(v, n) => [formatEur(v), n]} />
        <Bar dataKey="caTot" name="CA réel" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {buckets.map((b, i) => (
            <Cell key={i} fill={!b.budget ? c.accent : b.caTot >= b.budget ? c.vert : c.rouge} />
          ))}
        </Bar>
        {hasBudget && (
          <Line type="monotone" dataKey="budget" name="Budget" stroke={c.texte}
            strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function MixDonut({ c, mix }) {
  if (!mix || mix.length === 0) return <Empty c={c} />
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={mix} dataKey="value" nameKey="label" cx="42%" cy="50%"
          innerRadius={48} outerRadius={78} paddingAngle={2} stroke={c.blanc} strokeWidth={2}
          isAnimationActive={false}>
          {mix.map((s) => <Cell key={s.id} fill={s.color} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle(c)} formatter={(v, n) => [formatEur(v), n]} />
        <Legend layout="vertical" align="right" verticalAlign="middle" iconSize={9}
          wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

// Mix N vs N-1 : barres groupées par catégorie → on voit le glissement de
// structure (ex : part Food qui monte, Alcool qui baisse).
function MixCompare({ c, mix, mixCompare, currentLabel, compareLabel }) {
  if (!mix || mix.length === 0) return <Empty c={c} />
  const prevById = new Map((mixCompare || []).map((s) => [s.id, s.value]))
  const data = mix.map((s) => ({ label: s.label, color: s.color, N: s.value, N1: prevById.get(s.id) || 0 }))
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.bordure} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: c.texteMuted }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} tickFormatter={kEur} />
        <Tooltip contentStyle={tooltipStyle(c)} formatter={(v, n) => [formatEur(v), n === 'N' ? currentLabel : compareLabel]} />
        <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }}
          payload={[
            { value: currentLabel, type: 'rect', color: c.accent },
            { value: compareLabel, type: 'rect', color: c.bordure },
          ]} />
        <Bar dataKey="N1" name={compareLabel} fill={c.bordure} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="N" name={currentLabel} radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// Classement par lieu. En mode N-1 : barre = année N, repère = N-1, + écart %.
function Classement({ c, rows, compareRows, compareLabel }) {
  const visible = (rows || []).filter((r) => r.value > 0)
  if (visible.length === 0) return <Empty c={c} />
  const prevBySerie = new Map((compareRows || []).map((r) => [r.serie, r.value]))
  const allValues = [...visible.map((r) => r.value), ...(compareRows || []).map((r) => r.value)]
  const max = Math.max(...allValues, 1)
  const palette = [c.accent, c.violet, c.orange, c.vert, c.rouge, c.principal]

  return (
    <div style={{ marginTop: 4 }}>
      {visible.map((r, i) => {
        const prev = compareRows ? (prevBySerie.get(r.serie) || 0) : null
        const ecartPct = prev ? ((r.value - prev) / prev) * 100 : null
        const prevLeft = prev != null ? (prev / max) * 100 : null
        return (
          <div key={r.serie} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: compareRows ? 12 : 9, fontSize: 13 }}>
            <span style={{ width: 110, color: c.texteMuted, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.serie}>{r.serie}</span>
            <div style={{ flex: 1, height: 22, background: c.fond, borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
              <div style={{ width: `${(r.value / max) * 100}%`, height: '100%', background: palette[i % palette.length], borderRadius: 6 }} />
              {prevLeft != null && (
                <div title={`${compareLabel} : ${formatEur(prev)}`} style={{
                  position: 'absolute', top: -2, bottom: -2, left: `${prevLeft}%`,
                  width: 2, background: c.texte, opacity: 0.55,
                }} />
              )}
            </div>
            <span style={{ width: compareRows ? 168 : 120, textAlign: 'right', flexShrink: 0, color: c.texte }}>
              <b>{formatEur(r.value)}</b>
              {ecartPct != null ? (
                <span style={{ marginLeft: 6, fontWeight: 600, fontSize: 12, color: ecartPct >= 0 ? c.vert : c.rouge }}>
                  {ecartPct >= 0 ? '▲' : '▼'}{Math.abs(ecartPct).toFixed(0)}%
                </span>
              ) : (
                <span style={{ color: c.texteMuted, fontWeight: 400 }}> · {r.pct.toFixed(0)}%</span>
              )}
            </span>
          </div>
        )
      })}
      {compareRows && (
        <div style={{ fontSize: 11, color: c.texteMuted, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 2, height: 12, background: c.texte, opacity: 0.55, display: 'inline-block' }} /> repère = {compareLabel}
        </div>
      )}
    </div>
  )
}

// Carte compacte par lieu (small multiple) : CA + écart N-1 + sparkline + KPIs.
function LieuCard({ c, lieu, n1, compareLabel }) {
  const { label, totals, totalsCompare, spark, id } = lieu
  const caDelta = n1 ? deltaPct(totals.caTtc, totalsCompare?.caTtc) : null
  const cvDelta = n1 ? deltaPct(totals.couverts, totalsCompare?.couverts) : null
  const gid = `sp-${String(id).replace(/[^a-zA-Z0-9]/g, '')}`
  return (
    <div style={{ background: c.blanc, border: `1px solid ${c.bordure}`, borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: c.texte, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: c.texte }}>{formatEur(totals.caTtc)}</div>
      {caDelta != null && (
        <div style={{ fontSize: 12.5, fontWeight: 600, color: caDelta >= 0 ? c.vert : c.rouge, marginTop: 2 }}>
          {caDelta >= 0 ? '▲' : '▼'} {Math.abs(caDelta).toFixed(1)} % vs {compareLabel}
        </div>
      )}
      {spark && spark.length > 1 && (
        <div style={{ height: 44, marginTop: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
              {spark[0]?.caTotN1 != null && (
                <Line type="monotone" dataKey="caTotN1" stroke={c.texteMuted} strokeWidth={1.5}
                  strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />
              )}
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={c.accent} stopOpacity={0.16} />
                  <stop offset="100%" stopColor={c.accent} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="caTot" stroke={c.accent} strokeWidth={2}
                fill={`url(#${gid})`} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 12, color: c.texteMuted }}>
        <span>Couverts <b style={{ color: c.texte }}>{formatNombre(totals.couverts)}</b>
          {cvDelta != null && <span style={{ color: cvDelta >= 0 ? c.vert : c.rouge, fontWeight: 600 }}> {cvDelta >= 0 ? '▲' : '▼'}{Math.abs(cvDelta).toFixed(0)}%</span>}
        </span>
        <span>TM <b style={{ color: c.texte }}>{totals.tm != null ? formatEur(totals.tm) : '—'}</b></span>
      </div>
    </div>
  )
}

function Segmented({ c, value, onChange, options }) {
  return (
    <div style={{ display: 'inline-flex', background: c.fond, borderRadius: 10, padding: 3, gap: 2, border: `1px solid ${c.bordure}` }}>
      {options.map(([val, label]) => (
        <button key={val} onClick={() => onChange(val)} style={{
          padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: value === val ? 600 : 500,
          border: 'none', cursor: 'pointer',
          background: value === val ? c.blanc : 'transparent',
          color: value === val ? c.texte : c.texteMuted,
          boxShadow: value === val ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
        }}>{label}</button>
      ))}
    </div>
  )
}

function deltaPct(cur, prev) {
  if (prev == null || cur == null || prev === 0) return null
  return ((cur - prev) / prev) * 100
}

function Empty({ c }) {
  return (
    <div style={{ padding: '32px 16px', textAlign: 'center', color: c.texteMuted, fontSize: 13 }}>
      Aucune donnée sur la période sélectionnée.
    </div>
  )
}

function kEur(v) {
  if (v == null) return ''
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000)} k€`
  return `${Math.round(v)} €`
}
function tooltipStyle(c) {
  return { borderRadius: 8, border: `0.5px solid ${c.bordure}`, fontSize: 12, background: c.blanc, color: c.texte }
}
