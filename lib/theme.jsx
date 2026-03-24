'use client'

export const theme = {
  couleurs: {
    // Palette A — Zinc/Indigo neutre (SaaS moderne)
    principal: '#18181B',       // Zinc-900 navbar
    accent: '#6366F1',          // Indigo-500 CTA principal
    accentClair: '#EEF2FF',     // Indigo-50 fond accent léger
    fond: '#F4F4F5',            // Zinc-100 fond page
    bordure: '#E4E4E7',         // Zinc-200 bordures
    texte: '#18181B',           // Zinc-900 texte principal
    texteMuted: '#71717A',      // Zinc-500 texte secondaire
    blanc: '#FFFFFF',
    // Sémantiques — inchangées dans tous les établissements
    vert: '#16A34A',            // Green-600
    vertClair: '#DCFCE7',       // Green-100
    rouge: '#DC2626',           // Red-600
    rougeClair: '#FEE2E2',      // Red-100
    orange: '#D97706',          // Amber-600
    orangeClair: '#FEF3C7',     // Amber-100
    // Bar (violet conservé pour distinction visuelle)
    violet: '#7C3AED',          // Violet-600
    violetClair: '#EDE9FE',     // Violet-100
  },
  dark: {
    principal: '#09090B',
    accent: '#818CF8',
    accentClair: '#1E1B4B',
    fond: '#18181B',
    bordure: '#3F3F46',
    texte: '#FAFAFA',
    texteMuted: '#A1A1AA',
    blanc: '#27272A',
    vert: '#4ADE80',
    vertClair: '#14532D',
    rouge: '#F87171',
    rougeClair: '#450A0A',
    orange: '#FCD34D',
    orangeClair: '#451A03',
    violet: '#A78BFA',
    violetClair: '#2E1065',
  },
  hotel: {
    nom: 'FT Manager',
    adresse: '',
  },
  categories: [
    'Crudo', 'Entrées', 'Plats', 'Plats à partager', 'Accompagnements',
    'Desserts', 'Café', 'Brunch', 'Roof Top', 'Room Service', 'Events'
  ],
  saisons: [
    'Hiver 2025', 'Printemps 2026', 'Été 2026', 'Automne 2026', 'Hiver 2026'
  ]
}

function logoBandStyle(c) {
  return {
    background: c.principal,
    borderRadius: '16px',
    boxSizing: 'border-box',
    width: '100%',
    minHeight: '72px',
    padding: '22px 28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 0,
  }
}

/** Wrapper : léger translate pour compenser la baseline du texte dans le SVG (sans toucher au Logo des navbars) */
export function LogoBand({ c, style, children }) {
  return (
    <div style={{ ...logoBandStyle(c), ...style }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 0,
        transform: 'translateY(-2px)',
      }}>
        {children}
      </div>
    </div>
  )
}

export function Logo({ height = 40, couleur = 'white', onClick, nom }) {
  // 'couleur' reste prioritaire si fournie, sinon on prend la couleur d'accent du thème
  const toqueColor = couleur || theme.couleurs.accent
  const textColor = couleur === 'white' ? 'white' : '#18181B'

  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 165 44" // Largeur réduite de 210 à 165 pour coller au texte
      height={height}
      style={{ 
        display: 'block', 
        width: 'auto',
        margin: '0 auto',
        cursor: onClick ? 'pointer' : 'default' 
      }}
      onClick={onClick}>
      
      {/* Icône Toque (Accent thème ou couleur prop) */}
      <rect x="2" y="32" width="28" height="8" rx="2" fill={toqueColor}/>
      <ellipse cx="7"  cy="28" rx="7"  ry="8"  fill={toqueColor}/>
      <ellipse cx="16" cy="25" rx="8"  ry="10" fill={toqueColor}/>
      <ellipse cx="25" cy="28" rx="7"  ry="8"  fill={toqueColor}/>
      <ellipse cx="15" cy="19" rx="4"  ry="2.5" fill="white" opacity="0.2"/>
      
      {/* Texte Skalcook */}
      <text x="38" y="36"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="26" fontWeight="700" letterSpacing="-0.5"
        fill={textColor}>Skalcook</text>
    </svg>
  )
}

// Icône cuisine
export function IconCuisine({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l19-9-9 19-2-8-8-2z"/>
    </svg>
  )
}

// Icône bar
export function IconBar({ size = 16, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 22H16M12 11V22M3 2H21L17 11H7L3 2Z"/>
    </svg>
  )
}
export const c = theme.couleurs

