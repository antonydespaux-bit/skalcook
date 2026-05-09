'use client'

import { useState, useMemo } from 'react'
import SalesTable from '../../marges/SalesTable'

// Wrapper du tableau Détail par plat de l'ancienne page Marges, adapté au
// catalog Analyses. Gère localement le tri et le filtre catégorie pour
// éviter de remonter ces états jusqu'à la page (purement UI).
export default function SectionCaParFiche({ c, lignes, margeColor }) {
  const [filtreCategorie, setFiltreCategorie] = useState('all')
  const [triColonne, setTriColonne] = useState('caNet')
  const [triSens, setTriSens] = useState('desc')

  const categories = useMemo(() => {
    const cats = [...new Set(lignes.map((L) => L.categorie).filter(Boolean))]
    return cats.sort()
  }, [lignes])

  const lignesFiltrees = useMemo(() => {
    let rows = filtreCategorie === 'all' ? lignes : lignes.filter((L) => L.categorie === filtreCategorie)
    return [...rows].sort((a, b) => {
      let va = a[triColonne], vb = b[triColonne]
      if (triColonne === 'designation') {
        va = va ?? ''
        vb = vb ?? ''
        const cmp = va.localeCompare(vb, 'fr')
        return triSens === 'asc' ? cmp : -cmp
      }
      va = va ?? -Infinity
      vb = vb ?? -Infinity
      return triSens === 'asc' ? va - vb : vb - va
    })
  }, [lignes, filtreCategorie, triColonne, triSens])

  function handleTri(col) {
    if (triColonne === col) {
      setTriSens(triSens === 'asc' ? 'desc' : 'asc')
    } else {
      setTriColonne(col)
      setTriSens(col === 'designation' ? 'asc' : 'desc')
    }
  }

  if (lignes.length === 0) {
    return (
      <div style={{
        background: c.blanc, borderRadius: 12, border: `0.5px solid ${c.bordure}`,
        padding: '20px', textAlign: 'center', color: c.texteMuted, fontSize: 13,
      }}>
        Aucune vente sur la période sélectionnée.
      </div>
    )
  }

  return (
    <SalesTable
      lignes={lignes}
      lignesFiltrees={lignesFiltrees}
      categories={categories}
      filtreCategorie={filtreCategorie}
      onFiltreCategorie={setFiltreCategorie}
      triColonne={triColonne}
      triSens={triSens}
      onTri={handleTri}
      margeColor={margeColor}
    />
  )
}
