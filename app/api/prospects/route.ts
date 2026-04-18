/**
 * Public endpoint : formulaire de contact de la landing page.
 *
 * Insert un prospect dans la table `prospects` via service_role
 * (la table est gardée par RLS, superadmin only, donc on ne peut pas
 * insérer via le client anonyme directement).
 *
 * Guard: 'none' (public). La protection anti-spam repose sur :
 *  - le rate limiting global du middleware (60 req/min/IP)
 *  - la validation Zod stricte
 *  - un honeypot optionnel (champ `website` caché côté UI, rejeté ici)
 */

import { apiHandler } from '../../../lib/apiHandler'
import { Resend } from 'resend'
import { z } from 'zod'

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'contact@skalcook.com'

// Empty string -> null pour les champs optionnels.
const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)

const prospectSchema = z.object({
  nom:                z.string().min(1, 'Nom requis').max(255),
  email:              z.string().email('Email invalide').max(255),
  telephone:          z.preprocess(blankToNull, z.string().max(50).nullable().optional()),
  nb_etablissements:  z.coerce.number().int().min(1).max(9999).default(1),
  nom_etablissement:  z.preprocess(blankToNull, z.string().max(255).nullable().optional()),
  message:            z.preprocess(blankToNull, z.string().max(5000).nullable().optional()),
  langue:             z.preprocess(blankToNull, z.string().max(8).nullable().optional()),
  // Honeypot : si rempli, c'est un bot.
  website:            z.string().optional(),
})

export const POST = apiHandler({
  schema: prospectSchema,
  guard: 'none',
  handler: async ({ data, db }) => {
    // Honeypot check : un humain n'aura jamais de valeur ici.
    if (data.website && data.website.length > 0) {
      // On fait semblant d'accepter pour ne rien apprendre au bot.
      return Response.json({ ok: true }, { status: 201 })
    }

    const { error } = await db.from('prospects').insert({
      nom: data.nom,
      email: data.email,
      telephone: data.telephone ?? null,
      nb_etablissements: data.nb_etablissements ?? 1,
      nom_etablissement: data.nom_etablissement ?? null,
      message: data.message ?? null,
      langue: data.langue ?? 'fr',
      statut: 'nouveau',
    })

    if (error) throw new Error(error.message)

    const FROM = `Skalcook <contact@skalcook.com>`
    const prenom = data.nom.split(' ')[0]

    // 1. Email notification to admin
    if (!resend) { console.warn('RESEND_API_KEY not set — skipping emails'); return Response.json({ ok: true }, { status: 201 }) }
    try {
      await resend.emails.send({
        from: FROM,
        to: CONTACT_EMAIL,
        subject: `🍳 Nouvelle demande de démo — ${data.nom}`,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#18181B">
            <div style="background:#18181B;padding:24px 28px;border-radius:12px 12px 0 0">
              <span style="color:#6366F1;font-size:20px;font-weight:700">🍳 Skalcook</span>
              <span style="color:rgba(255,255,255,0.5);font-size:14px;margin-left:8px">Nouvelle demande</span>
            </div>
            <div style="background:#FFFFFF;padding:28px;border:1px solid #E4E4E7;border-top:none;border-radius:0 0 12px 12px">
              <h2 style="font-size:18px;font-weight:600;margin:0 0 20px">Demande de démo</h2>
              <table style="width:100%;border-collapse:collapse;font-size:14px">
                <tr><td style="padding:8px 0;color:#71717A;width:140px">Nom</td><td style="padding:8px 0;font-weight:500">${data.nom}</td></tr>
                <tr><td style="padding:8px 0;color:#71717A">Email</td><td style="padding:8px 0"><a href="mailto:${data.email}" style="color:#6366F1">${data.email}</a></td></tr>
                ${data.telephone ? `<tr><td style="padding:8px 0;color:#71717A">Téléphone</td><td style="padding:8px 0">${data.telephone}</td></tr>` : ''}
                ${data.nom_etablissement ? `<tr><td style="padding:8px 0;color:#71717A">Établissement</td><td style="padding:8px 0">${data.nom_etablissement}</td></tr>` : ''}
                <tr><td style="padding:8px 0;color:#71717A">Nb établissements</td><td style="padding:8px 0">${data.nb_etablissements || 1}</td></tr>
                ${data.message ? `<tr><td style="padding:8px 0;color:#71717A;vertical-align:top">Message</td><td style="padding:8px 0">${data.message}</td></tr>` : ''}
              </table>
              <div style="margin-top:24px;padding-top:16px;border-top:1px solid #E4E4E7">
                <a href="${process.env.NEXT_PUBLIC_SITE_URL || 'https://app.skalcook.com'}/superadmin/prospects"
                   style="display:inline-block;background:#6366F1;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600">
                  Voir dans le CRM →
                </a>
              </div>
            </div>
          </div>
        `,
      })
    } catch (emailErr) {
      console.error('Admin email failed:', emailErr)
    }

    // 2. Confirmation email to prospect
    try {
      await resend.emails.send({
        from: FROM,
        to: data.email,
        replyTo: CONTACT_EMAIL,
        subject: `${prenom}, votre demande de démonstration Skalcook`,
        headers: {
          'List-Unsubscribe': `<mailto:contact@skalcook.com?subject=desinscription>`,
        },
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#18181B;line-height:1.6">
            <div style="background:#18181B;padding:28px 32px;border-radius:12px 12px 0 0;text-align:center">
              <span style="color:#6366F1;font-size:24px;font-weight:700">Skalcook</span>
            </div>
            <div style="background:#FFFFFF;padding:32px;border:1px solid #E4E4E7;border-top:none;border-radius:0 0 12px 12px">
              <h1 style="font-size:22px;font-weight:700;margin:0 0 8px;color:#18181B">Merci ${prenom} !</h1>
              <p style="font-size:15px;color:#71717A;margin:0 0 24px">Nous avons bien reçu votre demande de démonstration.</p>

              <div style="background:#F4F4F5;border-radius:10px;padding:20px 24px;margin-bottom:24px">
                <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#71717A;margin-bottom:12px">Prochaines étapes</div>
                <table style="width:100%;border-collapse:collapse;font-size:14px">
                  <tr>
                    <td style="padding:8px 12px 8px 0;vertical-align:top;width:28px">
                      <div style="width:24px;height:24px;border-radius:50%;background:#EEF2FF;color:#6366F1;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;text-align:center;line-height:24px">1</div>
                    </td>
                    <td style="padding:8px 0;color:#18181B">Notre équipe analyse votre besoin</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 12px 8px 0;vertical-align:top">
                      <div style="width:24px;height:24px;border-radius:50%;background:#EEF2FF;color:#6366F1;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;text-align:center;line-height:24px">2</div>
                    </td>
                    <td style="padding:8px 0;color:#18181B">Nous vous recontactons sous <strong>24h</strong> pour planifier la démo</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 12px 8px 0;vertical-align:top">
                      <div style="width:24px;height:24px;border-radius:50%;background:#EEF2FF;color:#6366F1;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;text-align:center;line-height:24px">3</div>
                    </td>
                    <td style="padding:8px 0;color:#18181B">Démo personnalisée de <strong>15 minutes</strong> adaptée à votre établissement</td>
                  </tr>
                </table>
              </div>

              <div style="background:#EEF2FF;border-radius:10px;padding:20px 24px;margin-bottom:24px">
                <div style="font-size:14px;font-weight:600;color:#18181B;margin-bottom:8px">Ce que vous allez découvrir :</div>
                <ul style="margin:0;padding-left:18px;font-size:14px;color:#4B5563">
                  <li style="margin-bottom:6px">Fiches techniques avec food cost automatique</li>
                  <li style="margin-bottom:6px">Gestion des 14 allergènes réglementaires</li>
                  <li style="margin-bottom:6px">Modules Cuisine et Bar séparés</li>
                  <li>Pilotage multi-établissements</li>
                </ul>
              </div>

              <p style="font-size:14px;color:#71717A;margin:0 0 24px">
                Une question en attendant ? Répondez directement à cet email, nous sommes là pour vous aider.
              </p>

              <div style="border-top:1px solid #E4E4E7;padding-top:20px;text-align:center">
                <a href="https://skalcook.com" style="display:inline-block;background:#6366F1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">
                  Découvrir Skalcook
                </a>
              </div>
            </div>
            <div style="text-align:center;padding:20px;font-size:12px;color:#A1A1AA">
              Skalcook SAS — Gestion des fiches techniques pour la restauration<br/>
              <a href="https://skalcook.com/politique-confidentialite" style="color:#A1A1AA">Politique de confidentialité</a>
              &nbsp;·&nbsp;
              <a href="https://skalcook.com/mentions-legales" style="color:#A1A1AA">Mentions légales</a>
            </div>
          </div>
        `,
      })
    } catch (emailErr) {
      console.error('Prospect confirmation email failed:', emailErr)
    }

    return Response.json({ ok: true }, { status: 201 })
  },
})
