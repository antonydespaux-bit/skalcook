import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { isSuperadminEmail } from '../../../../lib/superadmin'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const supabaseServiceRole = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const clientIdSchema = z.object({
  id: z.string().uuid()
})

const updateClientSchema = z.object({
  id: z.string().uuid(),
  siret: z.string().trim().optional().or(z.literal('')),
  num_tva: z.string().trim().optional().or(z.literal('')),
  adresse_siege: z.string().trim().optional().or(z.literal('')),
  code_naf: z.string().trim().optional().or(z.literal('')),
  url_kbis: z.string().trim().url().optional().or(z.literal('')),
  url_rib: z.string().trim().url().optional().or(z.literal(''))
})

async function requireSuperAdmin(request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { response: Response.json({ error: 'Non authentifié.' }, { status: 401 }) }
  }

  const jwt = authHeader.slice(7).trim()
  if (!jwt) {
    return { response: Response.json({ error: 'Non authentifié.' }, { status: 401 }) }
  }

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey)
  const { data: { user }, error: userErr } = await supabaseAuth.auth.getUser(jwt)
  if (userErr || !user) {
    return { response: Response.json({ error: 'Session invalide.' }, { status: 401 }) }
  }

  const email = (user.email || '').toLowerCase().trim()
  if (isSuperadminEmail(email)) return { user }

  const { data: profil, error: profilErr } = await supabaseServiceRole
    .from('profils')
    .select('is_superadmin')
    .eq('id', user.id)
    .single()

  if (profilErr || !profil?.is_superadmin) {
    return { response: Response.json({ error: 'Accès refusé : super admin requis.' }, { status: 403 }) }
  }

  return { user }
}

function normalizeOptional(value) {
  const v = String(value || '').trim()
  return v.length > 0 ? v : null
}

function validateBusinessFields({ siret, num_tva }) {
  const cleanSiret = String(siret || '').replace(/\s+/g, '')
  const cleanTva = String(num_tva || '').replace(/\s+/g, '').toUpperCase()

  if (cleanSiret && !/^\d{14}$/.test(cleanSiret)) {
    return 'Le SIRET doit contenir exactement 14 chiffres.'
  }
  if (cleanTva && !/^[A-Z]{2}[A-Z0-9]{2,20}$/.test(cleanTva)) {
    return 'Le numéro de TVA intracommunautaire est invalide.'
  }
  return null
}

export async function GET(request) {
  try {
    const gate = await requireSuperAdmin(request)
    if (gate.response) return gate.response

    const url = new URL(request.url)
    const parsed = clientIdSchema.safeParse({ id: url.searchParams.get('id') })
    if (!parsed.success) {
      return Response.json(
        { error: 'Paramètre id invalide.', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { data, error } = await supabaseServiceRole
      .from('clients')
      .select('id, nom, nom_etablissement, siret, num_tva, adresse_siege, code_naf, url_kbis, url_rib')
      .eq('id', parsed.data.id)
      .maybeSingle()

    if (error) {
      return Response.json({ error: error.message || 'Erreur chargement établissement.' }, { status: 400 })
    }
    if (!data) {
      return Response.json({ error: 'Établissement introuvable.' }, { status: 404 })
    }

    return Response.json({ client: data })
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    const gate = await requireSuperAdmin(request)
    if (gate.response) return gate.response

    const parsed = updateClientSchema.safeParse(await request.json())
    if (!parsed.success) {
      return Response.json(
        { error: 'Payload invalide.', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const payload = parsed.data
    const businessError = validateBusinessFields(payload)
    if (businessError) {
      return Response.json({ error: businessError }, { status: 400 })
    }

    const cleanSiret = normalizeOptional(payload.siret)?.replace(/\s+/g, '') || null
    const cleanTva = normalizeOptional(payload.num_tva)?.replace(/\s+/g, '').toUpperCase() || null

    const { data, error } = await supabaseServiceRole
      .from('clients')
      .update({
        siret: cleanSiret,
        num_tva: cleanTva,
        adresse_siege: normalizeOptional(payload.adresse_siege),
        code_naf: normalizeOptional(payload.code_naf),
        url_kbis: normalizeOptional(payload.url_kbis),
        url_rib: normalizeOptional(payload.url_rib)
      })
      .eq('id', payload.id)
      .select('id, siret, num_tva, adresse_siege, code_naf, url_kbis, url_rib')
      .maybeSingle()

    if (error) {
      return Response.json({ error: error.message || 'Erreur mise à jour.' }, { status: 400 })
    }

    return Response.json({ success: true, client: data })
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}
