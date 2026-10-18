import { requirePermission, getServiceClient } from '../../../../lib/apiGuards'

/**
 * GET /api/achats/fichier-facture?clientId=...&factureId=...&token=...
 *
 * Serves invoice files from Supabase Storage.
 * Supports token-based auth for iframe embedding.
 * Not using apiHandler because it returns binary data, not JSON.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')
    const factureId = searchParams.get('factureId')

    if (!clientId || !factureId) {
      return new Response('clientId et factureId requis.', { status: 400 })
    }

    // Support token auth for iframes
    const tokenParam = searchParams.get('token')
    let authRequest = request
    if (tokenParam && !request.headers.get('authorization')) {
      const headers = new Headers(request.headers)
      headers.set('authorization', `Bearer ${tokenParam}`)
      authRequest = new Request(request.url, { headers, method: request.method })
    }

    const authResult = await requirePermission(authRequest, clientId, 'achats', 'lecture') as { user?: unknown; response?: Response }
    if (authResult.response) return authResult.response

    const db = getServiceClient()

    const { data: facture, error: fErr } = await db
      .from('achats_factures')
      .select('fichier_url')
      .eq('id', factureId)
      .eq('client_id', clientId)
      .single()

    if (fErr || !facture) return new Response('Facture introuvable.', { status: 404 })
    if (!facture.fichier_url) return new Response('Aucun fichier.', { status: 404 })

    const { data: fileData, error: dErr } = await db.storage
      .from('factures')
      .download(facture.fichier_url)

    if (dErr || !fileData) return new Response('Fichier introuvable dans le storage.', { status: 404 })

    const ext = facture.fichier_url.split('.').pop()?.toLowerCase()
    const mimeMap: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png',
      webp: 'image/webp',
    }
    const mime = mimeMap[ext ?? ''] ?? 'image/jpeg'

    const buffer = Buffer.from(await fileData.arrayBuffer())

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=3600',
        'X-Frame-Options': 'SAMEORIGIN',
        'Content-Security-Policy': "frame-ancestors 'self'",
      },
    })
  } catch (err) {
    console.error('fichier-facture error:', err)
    return new Response('Erreur serveur', { status: 500 })
  }
}
