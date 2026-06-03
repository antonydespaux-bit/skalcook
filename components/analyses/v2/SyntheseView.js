'use client'

import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart, Line, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell, Cell as PieCell,
} from 'recharts'
import HeroCa from './HeroCa'
import { formatEur } from '../../../lib/caAnalyses'

// Vue Synthèse : héros CA + grille de graphes comparés (style validé sur le
// prototype). Toutes les couleurs viennent du thème (`c`) → respecte le
// branding client + dark mode.
export default function SyntheseView({
  c, isMobile, data, comparaison, currentLabel, compareLabel,
}) {
  const {
    totals, totalsCompare, periodBudget,
    evolutionBuckets, cumulBuckets, monthlyBuckets, mix, classement,
  } = data
  const compareActive = comparaison === 'n-1' && totalsCompare && totalsCompare.caTtc > 0
  const compareTotals = comparaison === 'n-1' ? totalsCompare : null

  const cols = isMobile ? '1fr' : '1fr 1fr'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 16 }}>
      <div style={{ gridColumn: isMobile ? 'auto' : 'span 2' }}>
        <HeroCa
          c={c} isMobile={isMobile} totals={totals} compareTotals={compareTotals}
          periodBudget={periodBudget} sparkBuckets={evolutionBuckets}
          currentLabel={currentLabel} compareLabel={compareLabel} comparaison={comparaison}
        />
      </div>

      <ChartCard c={c} isMobile={isMobile} title="Évolution du CA"
        hint={compareActive ? `${currentLabel} vs ${compareLabel}` : 'Sur la période'}>
        <EvolutionChart c={c} buckets={evolutionBuckets} compareActive={compareActive}
          currentLabel={currentLabel} compareLabel={compareLabel} />
      </ChartCard>

      <ChartCard c={c} isMobile={isMobile} title="CA cumulé"
        hint={compareActive ? `Progression ${currentLabel} vs ${compareLabel}` : 'Progression cumulée'}>
        <CumulChart c={c} buckets={cumulBuckets} compareActive={compareActive}
          currentLabel={currentLabel} compareLabel={compareLabel} />
      </ChartCard>

      <ChartCard c={c} isMobile={isMobile} title="CA mensuel vs Objectif"
        hint="Vert = budget atteint · Rouge = en dessous">
        <ObjectifChart c={c} buckets={monthlyBuckets} />
      </ChartCard>

      <ChartCard c={c} isMobile={isMobile} title="Mix CA · Food / Boissons"
        hint="Répartition du CA TTC">
        <MixDonut c={c} mix={mix} />
      </ChartCard>

      <div style={{ gridColumn: isMobile ? 'auto' : 'span 2' }}>
        <ChartCard c={c} isMobile={isMobile} title="Classement par lieu"
          hint="Contribution au CA TTC de la période">
          <Classement c={c} rows={classement} />
        </ChartCard>
      </div>
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
        <Tooltip contentStyle={tooltipStyle(c)} formatter={(v, n) => [formatEur(v), n]} />
        {compareActive && <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />}
        {compareActive && (
          <Line type="monotone" dataKey="caTotN1" name={compareLabel} stroke={c.texteMuted}
            strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2 }} connectNulls />
        )}
        <Line type="monotone" dataKey="caTot" name={compareActive ? currentLabel : 'CA TTC'}
          stroke={c.accent} strokeWidth={2.5} dot={{ r: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function CumulChart({ c, buckets, compareActive, currentLabel, compareLabel }) {
  if (!buckets || buckets.length === 0) return <Empty c={c} />
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={buckets} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={c.bordure} />
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} tickFormatter={kEur} />
        <Tooltip contentStyle={tooltipStyle(c)} formatter={(v, n) => [formatEur(v), n]} />
        {compareActive && <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />}
        {compareActive && (
          <Bar dataKey="caTotN1" name={compareLabel} fill={c.bordure} radius={[4, 4, 0, 0]} />
        )}
        <Bar dataKey="caTot" name={compareActive ? currentLabel : 'CA cumulé'} fill={c.accent} radius={[4, 4, 0, 0]} />
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
        <Bar dataKey="caTot" name="CA réel" radius={[4, 4, 0, 0]}>
          {buckets.map((b, i) => (
            <Cell key={i} fill={!b.budget ? c.accent : b.caTot >= b.budget ? c.vert : c.rouge} />
          ))}
        </Bar>
        {hasBudget && (
          <Line type="monotone" dataKey="budget" name="Budget" stroke={c.texte}
            strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
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
          {mix.map((s) => <PieCell key={s.id} fill={s.color} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle(c)} formatter={(v, n) => [formatEur(v), n]} />
        <Legend layout="vertical" align="right" verticalAlign="middle" iconSize={9}
          wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  )
}

function Classement({ c, rows }) {
  const visible = (rows || []).filter((r) => r.value > 0)
  if (visible.length === 0) return <Empty c={c} />
  const max = Math.max(...visible.map((r) => r.value))
  const palette = [c.accent, c.violet, c.orange, c.vert, c.rouge, c.principal]
  return (
    <div style={{ marginTop: 4 }}>
      {visible.map((r, i) => (
        <div key={r.serie} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9, fontSize: 13 }}>
          <span style={{ width: 110, color: c.texteMuted, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.serie}</span>
          <div style={{ flex: 1, height: 22, background: c.fond, borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${(r.value / max) * 100}%`, height: '100%', background: palette[i % palette.length], borderRadius: 6 }} />
          </div>
          <span style={{ width: 120, textAlign: 'right', fontWeight: 600, color: c.texte, flexShrink: 0 }}>
            {formatEur(r.value)} <span style={{ color: c.texteMuted, fontWeight: 400 }}>· {r.pct.toFixed(0)}%</span>
          </span>
        </div>
      ))}
    </div>
  )
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
