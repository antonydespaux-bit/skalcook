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

export const ALL_SERVICES = ['lunch', 'dinner']

const SERVICE_LABELS = { lunch: 'Déjeuner', dinner: 'Dîner' }

// `lieuxSelected` / `servicesSelected` :
//   - tableau des codes/ids cochés
//   - tableau vide = "Tous" (équivalent à tous cochés ; on conserve un tableau
//     distinct pour préserver l'intent "all" même si un nouveau lieu apparaît)
//
// Quand 2+ entrées sont cochées, la page passe en mode multi-séries (split).
// Le toggle "Tous" coche/décoche tout en un clic.
export default function FilterBar({
  c, isMobile,
  periode, onPeriode,
  dateDebut, dateFin, onDateDebut, onDateFin,
  comparaison, onComparaison,
  lieux, lieuxSelected, onLieuxSelected,
  servicesSelected, onServicesSelected,
}) {
  const btn = (active) => ({
    padding: '7px 12px', borderRadius: 8, fontSize: 13,
    border: `1px solid ${active ? c.accent : c.bordure}`,
    background: active ? c.accent : c.blanc,
    color: active ? c.texte : c.texteMuted,
    cursor: 'pointer', fontWeight: active ? 600 : 500,
    whiteSpace: 'nowrap',
  })

  const chip = (active) => ({
    padding: '5px 10px', borderRadius: 16, fontSize: 12,
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

  // ── Multi-select handlers ──────────────────────────────────────────────────

  // "Tous lieux" actif si l'utilisateur a explicitement vidé la liste OU
  // a coché tous les lieux disponibles → dans les deux cas on traite comme
  // "all" et on stocke [] pour garder l'intent stable face à l'arrivée
  // d'un nouveau lieu.
  const lieuxAllActive = lieuxSelected.length === 0 || lieuxSelected.length === lieux.length
  const servicesAllActive = servicesSelected.length === 0 || servicesSelected.length === ALL_SERVICES.length

  const toggleLieu = (id) => {
    if (lieuxAllActive) {
      // Was "all" → switch to "only this one"
      onLieuxSelected([id])
      return
    }
    const set = new Set(lieuxSelected)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    onLieuxSelected(set.size === 0 ? [] : Array.from(set))
  }

  const toggleService = (code) => {
    if (servicesAllActive) {
      onServicesSelected([code])
      return
    }
    const set = new Set(servicesSelected)
    if (set.has(code)) set.delete(code)
    else set.add(code)
    onServicesSelected(set.size === 0 ? [] : Array.from(set))
  }

  return (
    <div style={{
      background: c.blanc, border: `0.5px solid ${c.bordure}`, borderRadius: 12,
      padding: isMobile ? 12 : 16, marginBottom: 20,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Période */}
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

      {/* Comparaison */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: c.texteMuted }}>
          Comparaison
          <select value={comparaison} onChange={(e) => onComparaison(e.target.value)} style={select}>
            {COMPARAISONS.map((c2) => <option key={c2.code} value={c2.code}>{c2.label}</option>)}
          </select>
        </label>
      </div>

      {/* Multi-select Lieux */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: c.texteMuted, marginRight: 4 }}>Lieux :</span>
        <button onClick={() => onLieuxSelected([])} style={chip(lieuxAllActive)}>Tous</button>
        {lieux.map((l) => (
          <button key={l.id} onClick={() => toggleLieu(l.id)}
            style={chip(!lieuxAllActive && lieuxSelected.includes(l.id))}>
            {l.nom}
          </button>
        ))}
      </div>

      {/* Multi-select Services */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: c.texteMuted, marginRight: 4 }}>Services :</span>
        <button onClick={() => onServicesSelected([])} style={chip(servicesAllActive)}>Tous</button>
        {ALL_SERVICES.map((s) => (
          <button key={s} onClick={() => toggleService(s)}
            style={chip(!servicesAllActive && servicesSelected.includes(s))}>
            {SERVICE_LABELS[s]}
          </button>
        ))}
      </div>
    </div>
  )
}

export const COMPARAISON_LABELS = {
  'n-1':    'vs même période N-1',
  'budget': 'vs Budget',
}

export const SERVICE_FR_LABELS = SERVICE_LABELS
