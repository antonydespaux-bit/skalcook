// GET /api/crm/devis/[id]/revision/[revisionId]/pdf?client_id=<tenant>&download=0|1
//
// Sert le PDF stocké dans le bucket correspondant à une révision historique.
// Ne régénère pas — renvoie le fichier figé au moment de l'envoi.

import { z } from 'zod'
import { apiHandler } from '../../../../../../../../lib/apiHandler'

export const runtime = 'nodejs'

const querySchema = z.object({
  client_id: z.string().uuid(),
  download: z.string().optional(),
})

export const GET = apiHandler({
  schema: querySchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db, params }) => {
    const devisId = params?.id
    const revisionId = params?.revisionId
    const clientId = data.client_id
    if (!devisId || !revisionId) {
      return Response.json({ error: 'id ou revisionId manquant' }, { status: 400 })
    }

    const { data: rev, error: revErr } = await db
      .from('crm_devis_revisions')
      .select('id, devis_id, client_id, version, pdf_url, sent_at')
      .eq('id', revisionId)
      .eq('devis_id', devisId)
      .eq('client_id', clientId)
      .maybeSingle()
    if (revErr || !rev) {
      return Response.json({ error: 'Révision introuvable' }, { status: 404 })
    }

    const { data: fileData, error: dlErr } = await db.storage
      .from('devis')
      .download(rev.pdf_url)
    if (dlErr || !fileData) {
      return Response.json({ error: `PDF introuvable : ${dlErr?.message || 'download failed'}` }, { status: 404 })
    }
    const arrayBuffer = await fileData.arrayBuffer()

    const filename = `devis-v${rev.version}.pdf`
    const disposition = data.download === '1' ? 'attachment' : 'inline'
    return new Response(Buffer.from(arrayBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
      },
    })
  },
})
