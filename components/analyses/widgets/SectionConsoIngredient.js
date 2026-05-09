'use client'

import ConsoTable from '../../marges/ConsoTable'

// Wrapper du tableau Consommation théorique (recipe-driven) issu de la page
// Marges. ConsoTable gère son propre titre + helper text → on l'embarque
// tel quel avec un padding wrapper minimal pour rester dans le style des
// autres widgets Analyses.
export default function SectionConsoIngredient({ c, consoLignes, hasVentes }) {
  return (
    <div style={{
      background: c.blanc, borderRadius: 12, border: `0.5px solid ${c.bordure}`,
      padding: '20px',
    }}>
      <ConsoTable consoLignes={consoLignes} hasVentes={hasVentes} />
    </div>
  )
}
