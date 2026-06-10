import { describe, it, expect } from 'vitest'
import { buildCommandeWorkbook } from '../fichesExport'

const fiches = [
  {
    nom: 'Boeuf bourguignon',
    ingredients: [
      { quantite: 1.2, unite: 'kg', ingredients: { nom: 'Boeuf', unite: 'kg' } },
      { quantite: 0.2, unite: 'kg', ingredients: { nom: 'Carottes', unite: 'kg' } },
      // doublon (autre section) : doit être dédoublonné
      { quantite: 0.3, unite: 'kg', ingredients: { nom: 'Carottes', unite: 'kg' } },
      { quantite: 0.5, unite: 'L', ingredients: { nom: 'Vin rouge', unite: 'L' } },
    ],
  },
  {
    nom: 'Salade César',
    ingredients: [
      { quantite: 1, unite: 'u', ingredients: { nom: 'Salade', unite: 'u' } },
    ],
  },
  {
    nom: 'Fiche vide',
    ingredients: [],
  },
]

describe('buildCommandeWorkbook', () => {
  it('crée une unique feuille « Commande »', async () => {
    const wb = await buildCommandeWorkbook(fiches)
    expect(wb.worksheets).toHaveLength(1)
    expect(wb.worksheets[0].name).toBe('Commande')
  })

  it('écrit le nom de chaque fiche en ligne titre', async () => {
    const wb = await buildCommandeWorkbook(fiches)
    const ws = wb.getWorksheet('Commande')
    const titres: string[] = []
    ws.eachRow((row) => {
      const v = row.getCell(1).value
      if (typeof v === 'string') titres.push(v)
    })
    expect(titres).toContain('Boeuf bourguignon')
    expect(titres).toContain('Salade César')
    expect(titres).toContain('Fiche vide')
  })

  it('liste les ingrédients triés et dédoublonnés, avec quantité vide et unité', async () => {
    const wb = await buildCommandeWorkbook(fiches)
    const ws = wb.getWorksheet('Commande')
    // Ligne 1 = titre, ligne 2 = en-tête colonnes, lignes 3+ = ingrédients
    expect(ws.getCell(1, 1).value).toBe('Boeuf bourguignon')
    expect(ws.getCell(2, 1).value).toBe('Ingrédient')
    expect(ws.getCell(2, 2).value).toBe('Quantité à commander')
    expect(ws.getCell(2, 3).value).toBe('Unité')
    // Tri alpha : Boeuf, Carottes (dédoublonné), Vin rouge
    expect(ws.getCell(3, 1).value).toBe('Boeuf')
    expect(ws.getCell(4, 1).value).toBe('Carottes')
    expect(ws.getCell(5, 1).value).toBe('Vin rouge')
    // La case quantité est laissée vide pour saisie manuelle
    expect(ws.getCell(3, 2).value).toBeFalsy()
    // L'unité de commande est renseignée
    expect(ws.getCell(3, 3).value).toBe('kg')
    expect(ws.getCell(5, 3).value).toBe('L')
  })

  it('affiche « Aucun ingrédient » pour une fiche sans ingrédient', async () => {
    const wb = await buildCommandeWorkbook(fiches)
    const ws = wb.getWorksheet('Commande')
    const cellules: string[] = []
    ws.eachRow((row) => {
      const v = row.getCell(1).value
      if (typeof v === 'string') cellules.push(v)
    })
    expect(cellules).toContain('Aucun ingrédient')
  })

  it('ne plante pas sur une entrée vide', async () => {
    const wb = await buildCommandeWorkbook([])
    expect(wb.getWorksheet('Commande')).toBeTruthy()
  })
})
