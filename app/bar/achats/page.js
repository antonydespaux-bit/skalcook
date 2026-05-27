'use client'

// Vue achats côté Bar : la même liste que /controle-gestion/achats,
// mais pré-filtrée sur la section bar. Le composant accepte `defaultSection`
// et place le filtre URL en conséquence — l'utilisateur peut toujours basculer
// vers "Tout" ou "Cuisine" depuis le bandeau de filtres.

import AchatsListPage from '../../controle-gestion/achats/page'

export default function BarAchatsPage() {
  return <AchatsListPage defaultSection="bar" />
}
