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

// Logo neutre — affiche le nom de l'app ou de l'établissement
export function Logo({ height = 40, couleur = 'white', onClick, nom }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 30" height={height}
      style={{ display: 'block', cursor: onClick ? 'pointer' : 'default' }} onClick={onClick}>
      <text x="4" y="22" fontFamily="ui-sans-serif, system-ui, sans-serif" fontSize="16"
        fontWeight="600" letterSpacing="1" fill={couleur}>
        {nom || 'FT Manager'}
      </text>
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
