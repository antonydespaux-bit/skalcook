'use client'

import { ALL_SERVICES, ALL_JOURS } from '../FilterBar'

// Rail de filtres latéral (refonte v2). Reprend l'état de la page actuelle
// (periode, comparaison, lieux/services/jours multi-select) mais dans une
// colonne compacte à gauche plutôt qu'une barre dense en haut.

const PERIODES = [
  { code: 'aujourdhui', label: "Aujourd'hui" },
  { code: '7j', label: '7 derniers jours' },
  { code: '30j', label: '30 derniers jours' },
  { code: 'mois-en-cours', label: 'Mois en cours' },
  { code: 'mois-precedent', label: 'Mois précédent' },
  { code: 'trimestre', label: 'Trimestre' },
  { code: 'annee', label: 'Année en cours' },
  { code: 'custom', label: 'Personnalisé…' },
]
const COMPARAISONS = [
  { code: 'n-1', label: 'Année N-1' },
  { code: 'budget', label: 'Budget' },
  { code: 'aucune', label: 'Aucune' },
]
const SERVICE_LABELS = { lunch: 'Déjeuner', dinner: 'Dîner' }
const JOUR_LABELS = { 1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi', 7: 'Dimanche' }

export default function AnalysesRail({
  c, isMobile,
  periode, onPeriode,
  dateDebut, dateFin, onDateDebut, onDateFin,
  comparaison, onComparaison,
  lieux, lieuxSelected, onLieuxSelected,
  servicesSelected, onServicesSelected,
  joursSelected, onJoursSelected,
}) {
  const lieuxAllActive = lieuxSelected.length === 0 || lieuxSelected.length === lieux.length
  const servicesAllActive = servicesSelected.length === 0 || servicesSelected.length === ALL_SERVICES.length
  const joursAllActive = joursSelected.length === 0 || joursSelected.length === ALL_JOURS.length

  const toggle = (current, value, onChange, allLen) => {
    const allActive = current.length === 0 || current.length === allLen
    if (allActive) { onChange([value]); return }
    const set = new Set(current)
    set.has(value) ? set.delete(value) : set.add(value)
    onChange(set.size === 0 ? [] : Array.from(set))
  }

  return (
    <aside style={{
      width: isMobile ? '100%' : 236, flexShrink: 0,
      background: c.blanc, borderRight: isMobile ? 'none' : `1px solid ${c.bordure}`,
      borderBottom: isMobile ? `1px solid ${c.bordure}` : 'none',
      padding: isMobile ? 16 : '22px 16px',
    }}>
      <Group c={c} title="Période">
        <select value={periode} onChange={(e) => onPeriode(e.target.value)} style={selectStyle(c)}>
          {PERIODES.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
        </select>
        {periode === 'custom' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            <input type="date" value={dateDebut} onChange={(e) => onDateDebut(e.target.value)} style={selectStyle(c)} />
            <input type="date" value={dateFin} onChange={(e) => onDateFin(e.target.value)} style={selectStyle(c)} />
          </div>
        )}
      </Group>

      <Group c={c} title="Comparer à">
        {COMPARAISONS.map((cmp) => (
          <Opt key={cmp.code} c={c} radio active={comparaison === cmp.code}
            onClick={() => onComparaison(cmp.code)} label={cmp.label} />
        ))}
      </Group>

      <Sep c={c} />

      <Group c={c} title="Lieux">
        <Opt c={c} active={lieuxAllActive} onClick={() => onLieuxSelected([])} label="Tous les lieux" />
        {lieux.map((l) => (
          <Opt key={l.id} c={c} active={!lieuxAllActive && lieuxSelected.includes(l.id)}
            onClick={() => toggle(lieuxSelected, l.id, onLieuxSelected, lieux.length)} label={l.nom} />
        ))}
      </Group>

      <Group c={c} title="Services">
        <Opt c={c} active={servicesAllActive} onClick={() => onServicesSelected([])} label="Tous" />
        {ALL_SERVICES.map((s) => (
          <Opt key={s} c={c} active={!servicesAllActive && servicesSelected.includes(s)}
            onClick={() => toggle(servicesSelected, s, onServicesSelected, ALL_SERVICES.length)}
            label={SERVICE_LABELS[s]} />
        ))}
      </Group>

      <Group c={c} title="Jours">
        <Opt c={c} active={joursAllActive} onClick={() => onJoursSelected([])} label="Tous les jours" />
        {!joursAllActive && ALL_JOURS.map((j) => (
          <Opt key={j} c={c} active={joursSelected.includes(j)}
            onClick={() => toggle(joursSelected, j, onJoursSelected, ALL_JOURS.length)} label={JOUR_LABELS[j]} />
        ))}
        {joursAllActive && (
          <div style={{ fontSize: 11.5, color: c.texteMuted, padding: '2px 8px' }}>
            (clique pour filtrer un jour)
          </div>
        )}
      </Group>
    </aside>
  )
}

function Group({ c, title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.7,
        color: c.texteMuted, fontWeight: 600, marginBottom: 8,
      }}>{title}</div>
      {children}
    </div>
  )
}

function Opt({ c, active, onClick, label, radio }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px',
      borderRadius: 8, fontSize: 13.5, cursor: 'pointer', userSelect: 'none',
      color: c.texte, fontWeight: active ? 500 : 400,
    }}
      onMouseEnter={(e) => { e.currentTarget.style.background = c.fond }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
      <span style={{
        width: 16, height: 16, borderRadius: radio ? '50%' : 5, flexShrink: 0,
        border: `1.5px solid ${active ? c.accent : c.bordure}`,
        background: active ? c.accent : 'transparent',
        display: 'grid', placeItems: 'center',
      }}>
        {active && <span style={{ width: 6, height: 6, borderRadius: radio ? '50%' : 2, background: c.blanc }} />}
      </span>
      {label}
    </div>
  )
}

function Sep({ c }) {
  return <div style={{ height: 1, background: c.bordure, margin: '18px 0' }} />
}

function selectStyle(c) {
  return {
    width: '100%', padding: '9px 11px', borderRadius: 9,
    border: `1px solid ${c.bordure}`, background: c.blanc, color: c.texte,
    fontFamily: 'inherit', fontSize: 13.5, cursor: 'pointer',
  }
}
