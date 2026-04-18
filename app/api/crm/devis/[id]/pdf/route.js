// GET /api/crm/devis/[id]/pdf?client_id=<tenant>&download=0|1
//
// Rend le PDF du devis à la volée via @react-pdf/renderer.
// Pas de persistence ici — c'est /envoyer qui uploade dans le bucket.

import React from 'react'
import { z } from 'zod'
import { renderToBuffer } from '@react-pdf/renderer'
import { apiHandler } from '../../../../../../lib/apiHandler'
import { DevisPdf } from '../../../../../../lib/devisPdf'

export const runtime = 'nodejs'

const querySchema = z.object({
  client_id: z.string().uuid(),
  download: z.string().optional(),
})

export const GET = apiHandler({
  schema: querySchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.client_id', // apiHandler strip le préfixe 'body.' → lit data.client_id
  handler: async ({ data, db, params }) => {
    const devisId = params?.id
    const clientId = data.client_id
    if (!devisId) {
      return Response.json({ error: 'devis id manquant' }, { status: 400 })
    }

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

    const element = React.createElement(DevisPdf, {
      tenant: tenant || {},
      client: crmClientRes.data || null,
      devis,
      lignes: lignes || [],
    })
    const pdfBuffer = await renderToBuffer(element)

    const filename = `${devis.numero}.pdf`
    const disposition = data.download === '1' ? 'attachment' : 'inline'
    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  },
})
