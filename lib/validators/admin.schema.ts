import { z } from 'zod'
import { uuidSchema, clientIdSchema } from './achats.schema'

// ── Roles ──────────────────────────────────────────────────────────────────
const roleSchema = z.enum(['admin', 'cuisine', 'bar', 'directeur', 'consultant'])

// Helper: transform empty strings to null (frontend sends "" for optional fields)
const emptyToNull = z.string().transform(v => v.trim() === '' ? null : v.trim())

// ── Create user ────────────────────────────────────────────────────────────
export const createUserSchema = z.object({
  email:    z.string().email('Email invalide'),
  password: z.string().min(8, 'Mot de passe : 8 caractères minimum'),
  nom:      z.string().min(1, 'Nom requis').max(255),
  role:     roleSchema.default('cuisine'),
  clientId: clientIdSchema,
})

export type CreateUserInput = z.infer<typeof createUserSchema>

// ── Invite admin ───────────────────────────────────────────────────────────
export const inviteAdminSchema = z.object({
  email:        z.string().email('Email invalide'),
  nom_complet:  z.string().min(1, 'Nom requis').max(255),
  client_id:    clientIdSchema,
})

// ── List users query ───────────────────────────────────────────────────────
export const listUsersQuerySchema = z.object({
  client_id: clientIdSchema,
})

// ── Update user (superadmin) ───────────────────────────────────────────────
export const updateUserSchema = z.object({
  user_id:          uuidSchema,
  email:            z.string().email().optional(),
  nom:              z.string().min(1).max(255).optional(),
  role:             roleSchema.optional(),
  telephone:        emptyToNull.optional().nullable(),
  site_web:         emptyToNull.optional().nullable(),
  siret_personnel:  emptyToNull.pipe(z.string().regex(/^\d{14}$/, 'SIRET invalide (14 chiffres)').nullable()).optional().nullable(),
  adresse_pro:      emptyToNull.optional().nullable(),
})

export type UpdateUserInput = z.infer<typeof updateUserSchema>

// ── Delete user ────────────────────────────────────────────────────────────
export const deleteUserSchema = z.object({
  user_id: uuidSchema,
})

// ── Create global user (superadmin) ────────────────────────────────────────
export const createGlobalUserSchema = z.object({
  email:            z.string().email('Email invalide'),
  password:         z.string().min(8, 'Mot de passe : 8 caractères minimum').optional(),
  nom:              z.string().min(1, 'Nom requis').max(255),
  role:             roleSchema.default('admin'),
  client_ids:       z.array(uuidSchema).optional().default([]),
  telephone:        emptyToNull.optional().nullable(),
  site_web:         emptyToNull.optional().nullable(),
  siret_personnel:  emptyToNull.pipe(z.string().regex(/^\d{14}$/, 'SIRET invalide').nullable()).optional().nullable(),
  adresse_pro:      emptyToNull.optional().nullable(),
})

export type CreateGlobalUserInput = z.infer<typeof createGlobalUserSchema>

// ── Update client (legal info) ─────────────────────────────────────────────
export const updateClientSchema = z.object({
  clientId:          clientIdSchema,
  siret:             z.string().regex(/^\d{14}$/, 'SIRET invalide (14 chiffres)').optional().nullable(),
  numero_tva:        z.string().regex(/^[A-Z]{2}\d+$/, 'Format TVA invalide').optional().nullable(),
  adresse:           z.string().max(500).optional().nullable(),
  code_naf:          z.string().max(10).optional().nullable(),
  kbis_url:          z.string().max(500).optional().nullable(),
  rib_url:           z.string().max(500).optional().nullable(),
  email_contact:     z.string().email().optional().nullable(),
  telephone_contact: z.string().max(20).optional().nullable(),
})

export type UpdateClientInput = z.infer<typeof updateClientSchema>

// ── Activity logs query ────────────────────────────────────────────────────
export const activityLogsQuerySchema = z.object({
  clientId: clientIdSchema.optional(),
  userId:   uuidSchema.optional(),
  device:   z.string().optional(),
  timespan: z.enum(['24h', '7d', '30d', 'all']).default('7d'),
})
