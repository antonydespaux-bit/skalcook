import { describe, it, expect } from 'vitest'
import {
  aggregateByFiche,
  computeMargesTotals,
  computeCoveragePct,
  buildMargesChartData,
  computeConsoTheorique,
  computeMenuEngineering,
} from '../margesData'

describe('aggregateByFiche', () => {
  const ficheById = {
    'F1': { id: 'F1', nom: 'Burger', cout_portion: 4, categorie: 'Plats' },
    'F2': { id: 'F2', nom: 'Tarte',  cout_portion: 2, categorie: 'Desserts' },
    'F3': { id: 'F3', nom: 'Steak',  cout_portion: null, categorie: 'Plats' }, // pas de cout
  }

  it('agrège qte vendue + CA net par fiche', () => {
    const ventes = [
      { fiche_id: 'F1', quantite_vendue: 10, prix_vente_net: 12 },
      { fiche_id: 'F1', quantite_vendue: 5,  prix_vente_net: 12 },
      { fiche_id: 'F2', quantite_vendue: 8,  prix_vente_net: 6 },
    ]
    const lignes = aggregateByFiche(ventes, ficheById)
    const burger = lignes.find((L) => L.fiche_id === 'F1')
    const tarte = lignes.find((L) => L.fiche_id === 'F2')
    expect(burger.quantiteVendue).toBe(15)
    expect(burger.caNet).toBe(180)
    expect(burger.coutMatiere).toBe(60) // 15 × 4
    expect(burger.margeBrute).toBe(120)
    expect(burger.margePct).toBeCloseTo((120 / 180) * 100, 5)
    expect(tarte.coutMatiere).toBe(16)
  })

  it('coutMatiere et margeBrute null si fiche sans coût', () => {
    const ventes = [{ fiche_id: 'F3', quantite_vendue: 3, prix_vente_net: 20 }]
    const lignes = aggregateByFiche(ventes, ficheById)
    expect(lignes[0].coutMatiere).toBeNull()
    expect(lignes[0].margeBrute).toBeNull()
    expect(lignes[0].margePct).toBeNull()
  })

  it('libellé "Fiche non trouvée" pour les ids absents du ficheById', () => {
    const ventes = [{ fiche_id: 'X9', quantite_vendue: 1, prix_vente_net: 10 }]
    const lignes = aggregateByFiche(ventes, ficheById)
    expect(lignes[0].designation).toContain('Fiche non trouvée')
  })

  it('tri alphabétique sur designation', () => {
    const ventes = [
      { fiche_id: 'F2', quantite_vendue: 1, prix_vente_net: 10 },
      { fiche_id: 'F1', quantite_vendue: 1, prix_vente_net: 10 },
    ]
    const noms = aggregateByFiche(ventes, ficheById).map((L) => L.designation)
    expect(noms).toEqual(['Burger', 'Tarte'])
  })
})

describe('computeMargesTotals', () => {
  it('agrège totaux + foodCostPct sur le sous-ensemble couvert par les coûts', () => {
    const lignes = [
      { quantiteVendue: 10, caNet: 100, coutMatiere: 30 },
      { quantiteVendue: 5,  caNet: 50,  coutMatiere: 20 },
      { quantiteVendue: 3,  caNet: 30,  coutMatiere: null },
    ]
    const t = computeMargesTotals(lignes)
    expect(t.quantiteVendue).toBe(18)
    expect(t.caNet).toBe(180)
    expect(t.caAvecCout).toBe(150)
    expect(t.coutMatiere).toBe(50)
    expect(t.margeBrute).toBe(100) // 150 - 50
    expect(t.margePct).toBeCloseTo((100 / 150) * 100, 5)
    expect(t.foodCostPct).toBeCloseTo((50 / 150) * 100, 5)
  })

  it('renvoie null pour les marges si aucune ligne avec coût', () => {
    const t = computeMargesTotals([{ quantiteVendue: 1, caNet: 10, coutMatiere: null }])
    expect(t.margeBrute).toBeNull()
    expect(t.foodCostPct).toBeNull()
  })
})

describe('computeCoveragePct', () => {
  it('% du CA couvert par les fiches avec coût', () => {
    expect(computeCoveragePct({ caNet: 200, caAvecCout: 150 })).toBe(75)
    expect(computeCoveragePct({ caNet: 0, caAvecCout: 0 })).toBeNull()
  })
})

describe('buildMargesChartData', () => {
  it('agrège CA et coût par jour, format "MM/DD"', () => {
    const ventes = [
      { jour: '2026-05-01', fiche_id: 'F1', quantite_vendue: 10, prix_vente_net: 12 },
      { jour: '2026-05-02', fiche_id: 'F1', quantite_vendue: 5,  prix_vente_net: 12 },
    ]
    const ficheById = { 'F1': { cout_portion: 4 } }
    const data = buildMargesChartData(ventes, ficheById)
    expect(data).toHaveLength(2)
    expect(data[0].date).toBe('05/01')
    expect(data[0].ca).toBe(120)
    expect(data[0].cout).toBe(40)
  })
})

describe('computeConsoTheorique', () => {
  it('quantité d\'ingrédient = qté vendue × qté recette / nb portions', () => {
    const lignes = [{ fiche_id: 'F1', quantiteVendue: 6 }]
    const ficheIngsMap = {
      'F1': [
        { ingredient_id: 'I1', quantite: 0.2, unite: 'kg', ingredients: { id: 'I1', nom: 'Bœuf' } },
      ],
    }
    const ficheNbPortions = { 'F1': 2 }
    const conso = computeConsoTheorique(lignes, ficheIngsMap, ficheNbPortions)
    // 6 ventes × (0.2 / 2 portions) = 0.6 kg
    expect(conso[0].qteTotale).toBeCloseTo(0.6, 5)
    expect(conso[0].nom).toBe('Bœuf')
    expect(conso[0].unite).toBe('kg')
  })

  it('ignore les fiches sans nbPortions', () => {
    const lignes = [{ fiche_id: 'F1', quantiteVendue: 5 }]
    const conso = computeConsoTheorique(lignes, { 'F1': [{ ingredient_id: 'I1', quantite: 1, ingredients: { nom: 'X' } }] }, {})
    expect(conso).toEqual([])
  })
})

describe('computeMenuEngineering', () => {
  it('classe en 4 quadrants selon avgQte et avgMarge', () => {
    const lignes = [
      { quantiteVendue: 100, margePct: 80, caNet: 1000, designation: 'Star' },
      { quantiteVendue: 100, margePct: 30, caNet: 1000, designation: 'Vache à lait' },
      { quantiteVendue: 5,   margePct: 80, caNet: 50,   designation: 'Dilemme' },
      { quantiteVendue: 5,   margePct: 30, caNet: 50,   designation: 'Poids mort' },
    ]
    const me = computeMenuEngineering(lignes)
    expect(me.points).toHaveLength(4)
    const byNom = Object.fromEntries(me.points.map((p) => [p.nom, p.quadrant]))
    expect(byNom['Star']).toBe('Star')
    expect(byNom['Vache à lait']).toBe('Vache à lait')
    expect(byNom['Dilemme']).toBe('Dilemme')
    expect(byNom['Poids mort']).toBe('Poids mort')
  })

  it('retourne un objet vide si aucune ligne avec marge', () => {
    expect(computeMenuEngineering([])).toEqual({ points: [], avgQte: 0, avgMarge: 0 })
  })
})
