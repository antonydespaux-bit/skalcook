// POST /api/crm/devis/[id]/envoyer
//
// Génère le PDF → l'upload dans le bucket `devis` → envoie un email Resend
// avec le PDF en pièce jointe → met à jour le devis (pdf_url, sent_at,
// sent_to_email, statut: brouillon → envoye).

import React from 'react'
import { z } from 'zod'
import { renderToBuffer } from '@react-pdf/renderer'
import { Resend } from 'resend'
import { apiHandler } from '../../../../../../lib/apiHandler'
import { DevisPdf } from '../../../../../../lib/devisPdf'

export const runtime = 'nodejs'

const bodySchema = z.object({
  client_id: z.string().uuid(),
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  message: z.string().max(5000).optional(),
})

const FROM = `Skalcook <${process.env.CONTACT_EMAIL || 'contact@skalcook.com'}>`

export const POST = apiHandler({
  schema: bodySchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db, params, user }) => {
    const devisId = params?.id
    const clientId = data.client_id
    if (!devisId) {
      return Response.json({ error: 'devis id manquant' }, { status: 400 })
    }

    if (!process.env.RESEND_API_KEY) {
      return Response.json({ error: 'RESEND_API_KEY absent — email désactivé.' }, { status: 500 })
    }

    // ─── 1. Charger devis + context ────────────────────────────────────
    const [{ data: devis }, { data: tenant }] = await Promise.all([
      db.from('crm_devis').select('*').eq('id', devisId).eq('client_id', clientId).maybeSingle(),
      db.from('clients')
        .select('nom, nom_etablissement, adresse_siege, siret, num_tva, email_contact, telephone_contact')
        .eq('id', clientId).maybeSingle(),
    ])
    if (!devis) {
      return Response.json({ error: 'Devis introuvable' }, { status: 404 })
    }

    const [{ data: lignes }, crmClientRes] = await Promise.all([
      db.from('crm_devis_lignes').select('*').eq('devis_id', devisId).order('ordre', { ascending: true }),
      devis.crm_client_id
        ? db.from('crm_clients').select('*').eq('id', devis.crm_client_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    // ─── 2. Générer le PDF ─────────────────────────────────────────────
    const element = React.createElement(DevisPdf, {
      tenant: tenant || {},
      client: crmClientRes.data || null,
      devis,
      lignes: lignes || [],
    })
    const pdfBuffer = await renderToBuffer(element)

    // ─── 3. Upload dans le bucket (upsert) ─────────────────────────────
    const path = `${clientId}/${devis.id}.pdf`
    const { error: upErr } = await db.storage
      .from('devis')
      .upload(path, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })
    if (upErr) {
      return Response.json({ error: `Upload PDF échoué : ${upErr.message}` }, { status: 500 })
    }

    // ─── 4. Envoyer l'email Resend ─────────────────────────────────────
    const resend = new Resend(process.env.RESEND_API_KEY)
    const replyTo = tenant?.email_contact || undefined
    const filename = `${devis.numero}.pdf`
    const messageText = (data.message || '').trim()
    const tenantNom = tenant?.nom_etablissement || tenant?.nom || 'Votre traiteur'
    const htmlBody = `
      <div style="font-family: -apple-system, Helvetica, Arial, sans-serif; font-size: 14px; color: #1f2937; line-height: 1.6;">
        ${messageText ? `<p>${escapeHtml(messageText).replace(/\n/g, '<br/>')}</p>` : ''}
        <p>Vous trouverez ci-joint le devis <strong>${escapeHtml(devis.numero)}</strong> pour un montant total de <strong>${formatEur(devis.total_ttc)} TTC</strong>.</p>
        ${devis.date_validite ? `<p style="color:#6b7280">Ce devis est valable jusqu'au ${formatDateFr(devis.date_validite)}.</p>` : ''}
        <p style="margin-top: 24px; color:#6b7280; font-size: 12px;">— ${escapeHtml(tenantNom)}</p>
      </div>
    `

    const { error: emailErr } = await resend.emails.send({
      from: FROM,
      to: data.to,
      replyTo,
      subject: data.subject,
      html: htmlBody,
      attachments: [{
        filename,
        content: Buffer.from(pdfBuffer).toString('base64'),
      }],
    })
    if (emailErr) {
      return Response.json({ error: `Envoi email échoué : ${emailErr.message}` }, { status: 500 })
    }

    // ─── 5. Update devis (statut + tracking) ───────────────────────────
    const nextStatut = devis.statut === 'brouillon' ? 'envoye' : devis.statut
    const now = new Date().toISOString()
    const { error: updErr } = await db
      .from('crm_devis')
      .update({
        pdf_url: path,
        pdf_generated_at: now,
        sent_at: now,
        sent_to_email: data.to,
        statut: nextStatut,
      })
      .eq('id', devisId)
      .eq('client_id', clientId)
    if (updErr) {
      return Response.json({ error: `Mise à jour du devis échouée : ${updErr.message}` }, { status: 500 })
    }

    return Response.json({
      ok: true,
      pdf_url: path,
      sent_at: now,
      sent_to_email: data.to,
      statut: nextStatut,
    })
  },
})

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatEur(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(v)
}

function formatDateFr(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  } catch {
    return '—'
  }
}
