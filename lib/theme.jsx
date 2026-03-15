'use client'

export const theme = {
  couleurs: {
    principal: '#2C1810',
    accent: '#C4956A',
    accentClair: '#F0E8E0',
    fond: '#FAF9F6',
    bordure: '#e8e4dc',
    texte: '#2C1810',
    texteMuted: '#8B7355',
    blanc: 'white',
    vert: '#4A7B6F',
    vertClair: '#E8F2EF',
    violet: '#7F77DD',
    violetClair: '#EEEDFE',
  },
  dark: {
    principal: '#1a1a2e',
    accent: '#C4956A',
    accentClair: '#2a2a3e',
    fond: '#0f0f1a',
    bordure: '#2a2a3e',
    texte: '#e8e4dc',
    texteMuted: '#8B7355',
    blanc: '#1e1e2e',
    vert: '#4A7B6F',
    vertClair: '#1a2e2a',
    violet: '#7F77DD',
    violetClair: '#1e1e3e',
  },
  hotel: {
    nom: 'La Fantaisie',
    adresse: '24 Rue Cadet, Paris 9ème',
  },
  categories: [
    'Crudo',
    'Entrées',
    'Plats',
    'Plats à partager',
    'Accompagnements',
    'Desserts',
    'Café',
    'Roof Top',
    'Room Service',
    'Events'
  ],
  saisons: [
    'Hiver 2025',
    'Printemps 2026',
    'Été 2026',
    'Automne 2026',
    'Hiver 2026'
  ]
}

export function Logo({ height = 40, couleur = 'white', onClick }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 30"
      height={height}
      style={{ display: 'block', cursor: onClick ? 'pointer' : 'default' }}
      onClick={onClick}
    >
      <text
        x="100"
        y="22"
        fontFamily="Georgia, serif"
        fontSize="20"
        fontWeight="400"
        letterSpacing="4"
        fill={couleur}
        textAnchor="middle"
      >
        LA FANTAISIE
      </text>
    </svg>
  )
}
