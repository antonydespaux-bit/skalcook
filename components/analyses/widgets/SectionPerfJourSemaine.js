'use client'

import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'

// Bar chart : moyenne CA TTC et moyenne couverts par jour de la semaine
// (lundi → dimanche), uniquement sur les jours où il y a eu de la data.
//
// `perf` = sortie de perfByWeekday(daysWithBudget) :
//   [{ isoJds, label, ca, cv, tm, count, … }]
export default function SectionPerfJourSemaine({ c, isMobile, perf }) {
  const empty = !perf || perf.every((p) => p.count === 0)
  return (
    <div style={{
      background: c.blanc, borderRadius: 12,
      border: `0.5px solid ${c.bordure}`,
      padding: isMobile ? '14px 10px' : '20px',
    }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: c.texte }}>Performance par jour de la semaine</div>
        <div style={{ fontSize: 12, color: c.texteMuted, marginTop: 2 }}>
          Moyenne CA TTC et couverts (jours fermés ignorés)
        </div>
      </div>
      {empty ? (
        <EmptyState c={c} />
      ) : (
        <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
          <BarChart data={perf} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.bordure} />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false}
              tickFormatter={(v) => v.slice(0, 3)} />
            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false}
              tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)} k€` : `${Math.round(v)} €`} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: c.texteMuted }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: `0.5px solid ${c.bordure}`, fontSize: 12 }}
              formatter={(v, name) => {
                if (name === 'CA TTC moyen') return [formatTooltipEur(v), name]
                if (name === 'Couverts moyens') return [`${Math.round(Number(v))}`, name]
                return [v, name]
              }}
            />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="ca" name="CA TTC moyen" fill={c.accent} radius={[4, 4, 0, 0]} />
            <Bar yAxisId="right" dataKey="cv" name="Couverts moyens" fill={c.violet} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}

function formatTooltipEur(v) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(Number(v) || 0)
}

function EmptyState({ c }) {
  return (
    <div style={{
      padding: '32px 16px', textAlign: 'center',
      color: c.texteMuted, fontSize: 13,
    }}>
      Aucune donnée sur la période sélectionnée.
    </div>
  )
}
