'use client'

import Charts from '../../marges/Charts'

// Bloc graphes marges : AreaChart CA vs Coût + ScatterChart Menu Engineering.
// Réutilise le composant existant tel quel — le wrapper sert juste à intégrer
// le widget dans la grille à widgets de la page Analyses.
export default function SectionChartsMarges({ chartData, menuEngineeringData }) {
  return <Charts chartData={chartData} menuEngineeringData={menuEngineeringData} />
}
