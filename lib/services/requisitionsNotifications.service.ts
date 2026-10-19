import type { SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import fr from '../i18n/locales/fr.json'
import en from '../i18n/locales/en.json'
import es from '../i18n/locales/es.json'
import it from '../i18n/locales/it.json'

// Réquisitions — notifications : qui prévenir à chaque étape, notification
// in-app (table notifications) et email (Resend). N'échoue jamais : une
// notification perdue ne doit pas faire échouer l'action de l'utilisateur.

export type Evenement = 'a_preparer' | 'a_valider' | 'validee' | 'livree' | 'refusee'

type Membre = { service_id: string; user_id: string; responsable: boolean }
type Bon = {
  id: string
  numero: number
  demandeur_id: string | null
  service_demandeur_id: string
  service_preparateur_id: string
}

// ── Règles pures (testées dans lib/__tests__/requisitionsNotifications.test.ts) ──

/**
 * Destinataires d'un événement, sans l'auteur de l'action :
 *   a_preparer, validee → membres du service préparateur
 *   a_valider           → responsables du service demandeur (à défaut, les
 *                         administrateurs : une demande ne doit pas rester
 *                         bloquée faute de responsable)
 *   livree, refusee     → la personne qui a passé la demande
 */
export function destinataires(ev: Evenement, bon: Bon, membres: Membre[], adminIds: string[], acteurId: string | null): string[] {
  let ids: string[] = []
  if (ev === 'a_preparer' || ev === 'validee') {
    ids = membres.filter((m) => m.service_id === bon.service_preparateur_id).map((m) => m.user_id)
  } else if (ev === 'a_valider') {
    ids = membres.filter((m) => m.service_id === bon.service_demandeur_id && m.responsable).map((m) => m.user_id)
    if (ids.length === 0) ids = adminIds
  } else if (bon.demandeur_id) {
    ids = [bon.demandeur_id]
  }
  return [...new Set(ids)].filter((id) => id && id !== acteurId)
}

const DICOS = { fr, en, es, it } as const
export type Langue = keyof typeof DICOS

function remplir(modele: string, vars: Record<string, string | number>) {
  return modele.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''))
}

const echapper = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))

/** Sujet et corps de l'email d'un événement (textes des fichiers de langue). */
export function contenuEmail(
  langue: Langue,
  ev: Evenement,
  donnees: { numero: number; de: string; vers: string; etablissement: string; motif?: string | null },
  lien: string,
) {
  const e = (DICOS[langue] ?? DICOS.fr).requisitions.emails
  const vars = { numero: donnees.numero, de: donnees.de, vers: donnees.vers, etablissement: donnees.etablissement }
  const sujet = remplir(e.subjects[ev], vars)
  const texte = remplir(e.bodies[ev], vars)
  const html = `
    <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 14px; color: #1f2937; line-height: 1.6;">
      <p>${echapper(texte)}</p>
      ${donnees.motif ? `<p style="color:#6b7280">${echapper(remplir(e.reason, { motif: donnees.motif }))}</p>` : ''}
      <p><a href="${echapper(lien)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#18181B;color:#ffffff;text-decoration:none">${echapper(e.open)}</a></p>
      <p style="margin-top: 24px; color:#6b7280; font-size: 12px;">— ${echapper(donnees.etablissement)} · Skalcook</p>
    </div>`
  return { sujet, html }
}

// ── Envoi ──────────────────────────────────────────────────────────────────

const FROM_ADDRESS = process.env.CONTACT_EMAIL || 'contact@skalcook.com'

export async function notifierRequisition(
  db: SupabaseClient,
  p: { clientId: string; requisitionId: string; evenement: Evenement; acteurId: string | null; motif?: string | null },
): Promise<{ notifies: number; emails: number }> {
  try {
    const [{ data: bon }, { data: membres }, { data: client }] = await Promise.all([
      db.from('requisitions').select('id, numero, demandeur_id, service_demandeur_id, service_preparateur_id')
        .eq('client_id', p.clientId).eq('id', p.requisitionId).maybeSingle(),
      db.from('service_membres').select('service_id, user_id, responsable').eq('client_id', p.clientId),
      db.from('clients').select('nom, nom_etablissement').eq('id', p.clientId).maybeSingle(),
    ])
    if (!bon) return { notifies: 0, emails: 0 }

    let adminIds: string[] = []
    if (p.evenement === 'a_valider') {
      const { data: admins } = await db.from('acces_clients').select('user_id').eq('client_id', p.clientId).eq('role', 'admin')
      adminIds = (admins ?? []).map((a) => a.user_id as string)
    }
    const ids = destinataires(p.evenement, bon as Bon, (membres ?? []) as Membre[], adminIds, p.acteurId)
    if (ids.length === 0) return { notifies: 0, emails: 0 }

    const { data: services } = await db.from('services_internes').select('id, nom')
      .eq('client_id', p.clientId).in('id', [bon.service_demandeur_id, bon.service_preparateur_id])
    const nomService = (id: string) => (services ?? []).find((s) => s.id === id)?.nom ?? ''
    const donnees = {
      numero: bon.numero as number,
      de: nomService(bon.service_demandeur_id as string),
      vers: nomService(bon.service_preparateur_id as string),
      motif: p.motif ?? null,
    }

    const { error } = await db.from('notifications').insert(ids.map((user_id) => ({
      client_id: p.clientId,
      user_id,
      type: `requisition_${p.evenement}`,
      requisition_id: bon.id,
      donnees,
    })))
    if (error) console.error('[requisitions] notifications non enregistrées :', error.message)

    // Email : best effort, sans bloquer si Resend n'est pas configuré.
    let emails = 0
    if (process.env.RESEND_API_KEY) {
      const { data: profils } = await db.from('profils').select('id, email').in('id', ids)
      const adresses = (profils ?? []).map((x) => x.email as string | null).filter((x): x is string => !!x && x.includes('@'))
      if (adresses.length > 0) {
        const origine = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.skalcook.com'
        const etablissement = (client?.nom_etablissement || client?.nom || 'Skalcook') as string
        // Pas de langue enregistrée par utilisateur : français par défaut.
        const { sujet, html } = contenuEmail('fr', p.evenement, { ...donnees, etablissement }, `${origine}/requisitions/${bon.id}`)
        const resend = new Resend(process.env.RESEND_API_KEY)
        const envois = await Promise.allSettled(adresses.map((to) => resend.emails.send({
          from: `${etablissement.replace(/[",<>@;:\\[\]()]/g, ' ').trim()} via Skalcook <${FROM_ADDRESS}>`,
          to,
          subject: sujet,
          html,
        })))
        emails = envois.filter((e) => e.status === 'fulfilled' && !(e.value as { error?: unknown }).error).length
      }
    }
    return { notifies: ids.length, emails }
  } catch (err) {
    console.error('[requisitions] notification échouée :', err instanceof Error ? err.message : err)
    return { notifies: 0, emails: 0 }
  }
}

// ── Lecture (pop-up / pastille) ────────────────────────────────────────────

export async function listerNotifications(db: SupabaseClient, clientId: string, userId: string) {
  const { data, error } = await db.from('notifications')
    .select('id, type, requisition_id, donnees, lu_at, created_at')
    .eq('client_id', clientId).eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(30)
  if (error) throw new Error(error.message)
  const liste = data ?? []
  return { notifications: liste, non_lues: liste.filter((n) => !n.lu_at).length }
}

export async function marquerLues(db: SupabaseClient, clientId: string, userId: string, ids?: string[]) {
  let req = db.from('notifications').update({ lu_at: new Date().toISOString() })
    .eq('client_id', clientId).eq('user_id', userId).is('lu_at', null)
  if (ids && ids.length > 0) req = req.in('id', ids)
  const { error } = await req
  if (error) throw new Error(error.message)
}
