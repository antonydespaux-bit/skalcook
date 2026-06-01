import { describe, it, expect } from 'vitest'
import {
  saveFactureSchema,
  updateFactureSchema,
  deleteFactureSchema,
  checkDuplicateSchema,
  createIngredientSchema,
  parseFactureSchema,
  uuidSchema,
} from '../validators/achats.schema'
import {
  createInventaireSchema,
  saveLigneSchema,
  validerInventaireSchema,
  addLigneSchema,
  stockTheoriqueQuerySchema,
} from '../validators/inventaire.schema'
import {
  createUserSchema,
  createGlobalUserSchema,
  updateUserSchema,
  updateClientSchema,
} from '../validators/admin.schema'

// ── UUID validation ────────────────────────────────────────────────────────

describe('uuidSchema', () => {
  it('accepts valid UUID', () => {
    expect(uuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true)
  })

  it('rejects invalid UUID', () => {
    expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false)
    expect(uuidSchema.safeParse('').success).toBe(false)
    expect(uuidSchema.safeParse(123).success).toBe(false)
  })
})

// ── Achats schemas ─────────────────────────────────────────────────────────

describe('saveFactureSchema', () => {
  const validInput = {
    clientId: '550e8400-e29b-41d4-a716-446655440000',
    fournisseur: 'Metro',
    dateFacture: '2024-03-15',
    lignes: [
      { designation: 'Tomates', quantite: 5, prix_unitaire_ht: 2.5 },
    ],
  }

  it('accepts valid input', () => {
    const result = saveFactureSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('defaults statut to facture', () => {
    const result = saveFactureSchema.safeParse(validInput)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.statut).toBe('facture')
    }
  })

  it('rejects missing fournisseur', () => {
    const result = saveFactureSchema.safeParse({ ...validInput, fournisseur: '' })
    expect(result.success).toBe(false)
  })

  it('rejects empty lignes', () => {
    const result = saveFactureSchema.safeParse({ ...validInput, lignes: [] })
    expect(result.success).toBe(false)
  })

  it('rejects invalid clientId', () => {
    const result = saveFactureSchema.safeParse({ ...validInput, clientId: 'bad' })
    expect(result.success).toBe(false)
  })

  it('coerces string quantite to number', () => {
    const input = {
      ...validInput,
      lignes: [{ designation: 'Tomates', quantite: '5', prix_unitaire_ht: '2.5' }],
    }
    const result = saveFactureSchema.safeParse(input)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.lignes[0].quantite).toBe(5)
      expect(result.data.lignes[0].prix_unitaire_ht).toBe(2.5)
    }
  })

  it('validates fileMime enum', () => {
    const result = saveFactureSchema.safeParse({
      ...validInput,
      fileMime: 'application/zip',
    })
    expect(result.success).toBe(false)
  })
})

describe('updateFactureSchema', () => {
  it('accepts valid input', () => {
    const result = updateFactureSchema.safeParse({
      factureId: '550e8400-e29b-41d4-a716-446655440000',
      clientId: '550e8400-e29b-41d4-a716-446655440001',
      fournisseur: 'Metro',
    })
    expect(result.success).toBe(true)
  })
})

describe('createIngredientSchema', () => {
  it('accepts valid input and defaults prix_kg', () => {
    const result = createIngredientSchema.safeParse({
      clientId: '550e8400-e29b-41d4-a716-446655440000',
      nom: 'Tomates',
      unite: 'kg',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.prix_kg).toBe(0)
    }
  })

  it('accepts a missing/null unité (le service applique un défaut)', () => {
    const nullUnite = createIngredientSchema.safeParse({
      clientId: '550e8400-e29b-41d4-a716-446655440000',
      nom: 'JAMBON 50% IBERIQUE AVEC OS',
      unite: null,
      prix_kg: null,
    })
    expect(nullUnite.success).toBe(true)

    const noUnite = createIngredientSchema.safeParse({
      clientId: '550e8400-e29b-41d4-a716-446655440000',
      nom: 'JAMBON 50% IBERIQUE AVEC OS',
    })
    expect(noUnite.success).toBe(true)
  })
})

// ── Inventaire schemas ─────────────────────────────────────────────────────

describe('createInventaireSchema', () => {
  it('accepts valid input', () => {
    const result = createInventaireSchema.safeParse({
      client_id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'tournant',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.section).toBe('cuisine')
    }
  })

  it('rejects invalid type', () => {
    const result = createInventaireSchema.safeParse({
      client_id: '550e8400-e29b-41d4-a716-446655440000',
      type: 'invalid',
    })
    expect(result.success).toBe(false)
  })
})

describe('saveLigneSchema', () => {
  it('accepts null quantite_reelle', () => {
    const result = saveLigneSchema.safeParse({
      ligneId: '550e8400-e29b-41d4-a716-446655440000',
      clientId: '550e8400-e29b-41d4-a716-446655440001',
      quantite_reelle: null,
    })
    expect(result.success).toBe(true)
  })
})

// ── Admin schemas ──────────────────────────────────────────────────────────

describe('createUserSchema', () => {
  it('rejects short password', () => {
    const result = createUserSchema.safeParse({
      email: 'test@example.com',
      password: 'short',
      nom: 'John',
      client_id: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid email', () => {
    const result = createUserSchema.safeParse({
      email: 'not-an-email',
      password: 'validpassword123',
      nom: 'John',
      client_id: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid input', () => {
    const result = createUserSchema.safeParse({
      email: 'test@example.com',
      password: 'validpassword123',
      nom: 'John Doe',
      client_id: '550e8400-e29b-41d4-a716-446655440000',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.role).toBe('cuisine')
    }
  })
})

describe('updateClientSchema', () => {
  it('validates SIRET format (14 digits)', () => {
    const result = updateClientSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      siret: '12345',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid SIRET', () => {
    const result = updateClientSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      siret: '12345678901234',
    })
    expect(result.success).toBe(true)
  })

  it('validates TVA format', () => {
    const result = updateClientSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      num_tva: 'invalid',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid TVA', () => {
    const result = updateClientSchema.safeParse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      num_tva: 'FR12345678901',
    })
    expect(result.success).toBe(true)
  })
})

describe('createGlobalUserSchema', () => {
  it('validates SIRET if provided', () => {
    const result = createGlobalUserSchema.safeParse({
      email: 'test@example.com',
      password: 'validpassword123',
      nom: 'John',
      siret_personnel: '123', // invalid
    })
    expect(result.success).toBe(false)
  })

  it('defaults client_ids to empty array', () => {
    const result = createGlobalUserSchema.safeParse({
      email: 'test@example.com',
      password: 'validpassword123',
      nom: 'John',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.client_ids).toEqual([])
    }
  })
})
