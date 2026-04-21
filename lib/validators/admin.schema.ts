import { z } from 'zod'
import { uuidSchema, clientIdSchema } from './achats.schema'

// ── Roles ──────────────────────────────────────────────────────────────────
const roleSchema = z.enum(['admin', 'cuisine', 'bar', 'directeur', 'consultant'])

// Helper: transform empty strings to null (frontend sends "" for optional fields)
const emptyToNull = z.string().transform(v => v.trim() === '' ? null : v.trim())

// ── Create user ────────────────────────────────────────────────────────────
export const createUserSchema = z.object({
  email:     z.string().email('Email invalide'),
  password:  z.string().min(8, 'Mot de passe : 8 caractères minimum'),
  nom:       z.string().min(1, 'Nom requis').max(255),
  role:      roleSchema.default('cuisine'),
  client_id: clientIdSchema,
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

// ── Client settings (create + full update) ────────────────────────────────
// Used by /api/superadmin/create-client + /api/superadmin/update-client-settings
// (writes to `clients` table are blocked by RLS côté client, donc on route tout
// par le service_role).
const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur invalide')
const slugFormat = z
  .string()
  .min(1)
  .max(100)
  .transform((s) => s.toLowerCase().trim().replace(/\s+/g, '-'))
  .pipe(z.string().regex(/^[a-z0-9-]+$/, 'Slug invalide (a-z, 0-9, -)'))

const clientSettingsFields = {
  nom:                 z.string().min(1).max(255),
  nom_etablissement:   z.string().min(1).max(255),
  slug:                slugFormat,
  adresse:             emptyToNull.optional().nullable(),
  actif:               z.boolean(),
  couleur_principale:  hexColor,
  couleur_accent:      hexColor,
  couleur_fond:        hexColor,
  modules_actifs:      z.array(z.string()),
  seuil_vert_cuisine:    z.number(),
  seuil_orange_cuisine:  z.number(),
  seuil_vert_boissons:   z.number(),
  seuil_orange_boissons: z.number(),
  logo_url:            emptyToNull.optional().nullable(),
}

export const createClientSchema = z.object({
  nom:                 clientSettingsFields.nom,
  nom_etablissement:   clientSettingsFields.nom_etablissement,
  slug:                clientSettingsFields.slug,
  adresse:             clientSettingsFields.adresse,
  actif:               clientSettingsFields.actif.default(true),
  couleur_principale:  clientSettingsFields.couleur_principale.default('#18181B'),
  couleur_accent:      clientSettingsFields.couleur_accent.default('#6366F1'),
  couleur_fond:        clientSettingsFields.couleur_fond.default('#F4F4F5'),
  modules_actifs:      clientSettingsFields.modules_actifs.default([]),
  seuil_vert_cuisine:    clientSettingsFields.seuil_vert_cuisine.default(28),
  seuil_orange_cuisine:  clientSettingsFields.seuil_orange_cuisine.default(35),
  seuil_vert_boissons:   clientSettingsFields.seuil_vert_boissons.default(22),
  seuil_orange_boissons: clientSettingsFields.seuil_orange_boissons.default(28),
})

export type CreateClientInput = z.infer<typeof createClientSchema>

export const updateClientSettingsSchema = z.object({
  id:                  clientIdSchema,
  nom:                 clientSettingsFields.nom.optional(),
  nom_etablissement:   clientSettingsFields.nom_etablissement.optional(),
  slug:                clientSettingsFields.slug.optional(),
  adresse:             clientSettingsFields.adresse,
  actif:               clientSettingsFields.actif.optional(),
  couleur_principale:  clientSettingsFields.couleur_principale.optional(),
  couleur_accent:      clientSettingsFields.couleur_accent.optional(),
  couleur_fond:        clientSettingsFields.couleur_fond.optional(),
  modules_actifs:      clientSettingsFields.modules_actifs.optional(),
  seuil_vert_cuisine:    clientSettingsFields.seuil_vert_cuisine.optional(),
  seuil_orange_cuisine:  clientSettingsFields.seuil_orange_cuisine.optional(),
  seuil_vert_boissons:   clientSettingsFields.seuil_vert_boissons.optional(),
  seuil_orange_boissons: clientSettingsFields.seuil_orange_boissons.optional(),
  logo_url:            clientSettingsFields.logo_url,
})

export type UpdateClientSettingsInput = z.infer<typeof updateClientSettingsSchema>

// ── Update client (legal info) ─────────────────────────────────────────────
// Treat empty strings as "unset" so the page can send blank optional fields
// without tripping the format validators (regex on siret/num_tva, email_contact).
const blankToUndef = (v: unknown) => (v === '' ? undefined : v)

export const updateClientSchema = z.object({
  id:                clientIdSchema,
  siret:             z.preprocess(blankToUndef, z.string().regex(/^\d{14}$/, 'SIRET invalide (14 chiffres)').optional().nullable()),
  num_tva:           z.preprocess(blankToUndef, z.string().regex(/^[A-Z]{2}\d+$/, 'Format TVA invalide').optional().nullable()),
  adresse_siege:     z.preprocess(blankToUndef, z.string().max(500).optional().nullable()),
  code_naf:          z.preprocess(blankToUndef, z.string().max(10).optional().nullable()),
  url_kbis:          z.preprocess(blankToUndef, z.string().max(500).optional().nullable()),
  url_rib:           z.preprocess(blankToUndef, z.string().max(500).optional().nullable()),
  email_contact:     z.preprocess(blankToUndef, z.string().email().optional().nullable()),
  telephone_contact: z.preprocess(blankToUndef, z.string().max(20).optional().nullable()),
})

export type UpdateClientInput = z.infer<typeof updateClientSchema>

// ── Activity logs query ────────────────────────────────────────────────────
export const activityLogsQuerySchema = z.object({
  clientId: clientIdSchema.optional(),
  userId:   uuidSchema.optional(),
  device:   z.string().optional(),
  timespan: z.enum(['24h', '7d', '30d', 'all']).default('7d'),
})
