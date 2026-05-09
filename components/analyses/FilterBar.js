'use client'

const PERIODES = [
  { code: 'aujourdhui',     label: "Aujourd'hui" },
  { code: '7j',             label: '7 j' },
  { code: '30j',            label: '30 j' },
  { code: 'mois-en-cours',  label: 'Mois en cours' },
  { code: 'mois-precedent', label: 'Mois préc.' },
  { code: 'trimestre',      label: 'Trimestre' },
  { code: 'annee',          label: 'Année' },
  { code: 'custom',         label: 'Personnalisé' },
]

const COMPARAISONS = [
  { code: 'aucune',  label: 'Aucune comparaison' },
  { code: 'n-1',     label: 'vs même période N-1' },
  { code: 'budget',  label: 'vs Budget' },
]

const SERVICES = [
  { code: 'tout',   label: 'Tous services' },
  { code: 'lunch',  label: 'Déjeuner' },
  { code: 'dinner', label: 'Dîner' },
]

export default function FilterBar({
  c, isMobile,
  periode, onPeriode,
  dateDebut, dateFin, onDateDebut, onDateFin,
  comparaison, onComparaison,
  lieux, lieuId, onLieu,
  service, onService,
}) {
  const btn = (active) => ({
    padding: '7px 12px', borderRadius: 8, fontSize: 13,
    border: `1px solid ${active ? c.accent : c.bordure}`,
    background: active ? c.accent : c.blanc,
    color: active ? c.texte : c.texteMuted,
    cursor: 'pointer', fontWeight: active ? 600 : 500,
    whiteSpace: 'nowrap',
  })

  const select = {
    padding: '7px 10px', borderRadius: 8, fontSize: 13,
    border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte,
  }

  const dateInput = {
    padding: '7px 10px', borderRadius: 8, fontSize: 13,
    border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte,
  }

  return (
    <div style={{
      background: c.blanc, border: `0.5px solid ${c.bordure}`, borderRadius: 12,
      padding: isMobile ? 12 : 16, marginBottom: 20,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {PERIODES.map((p) => (
          <button key={p.code} onClick={() => onPeriode(p.code)} style={btn(p.code === periode)}>
            {p.label}
          </button>
        ))}
      </div>

      {periode === 'custom' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: c.texteMuted }}>Du</span>
          <input type="date" value={dateDebut} onChange={(e) => onDateDebut(e.target.value)} style={dateInput} />
          <span style={{ fontSize: 12, color: c.texteMuted }}>au</span>
          <input type="date" value={dateFin} onChange={(e) => onDateFin(e.target.value)} style={dateInput} />
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.texteMuted }}>
          Comparaison
          <select value={comparaison} onChange={(e) => onComparaison(e.target.value)} style={select}>
            {COMPARAISONS.map((c2) => <option key={c2.code} value={c2.code}>{c2.label}</option>)}
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.texteMuted }}>
          Lieu
          <select value={lieuId} onChange={(e) => onLieu(e.target.value)} style={select}>
            <option value="all">Tous lieux</option>
            {lieux.map((l) => <option key={l.id} value={l.id}>{l.nom}</option>)}
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.texteMuted }}>
          Service
          <select value={service} onChange={(e) => onService(e.target.value)} style={select}>
            {SERVICES.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>
        </label>
      </div>
    </div>
  )
}

export const COMPARAISON_LABELS = {
  'n-1':    'vs même période N-1',
  'budget': 'vs Budget',
}
