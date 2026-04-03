import { requireAdminOrSuperadmin, getServiceClient } from '../../../../lib/apiGuards'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId  = searchParams.get('clientId')
    const factureId = searchParams.get('factureId')

    if (!clientId || !factureId) {
      return new Response('clientId et factureId requis.', { status: 400 })
    }

    // Le token peut venir du header Authorization OU du query param (pour les iframes)
    const tokenParam = searchParams.get('token')
    let authRequest = request
    if (tokenParam && !request.headers.get('authorization')) {
      const headers = new Headers(request.headers)
      headers.set('authorization', `Bearer ${tokenParam}`)
      authRequest = new Request(request.url, { headers, method: request.method })
    }

    const { response: authError } = await requireAdminOrSuperadmin(authRequest, clientId)
    if (authError) return authError

    const db = getServiceClient()

    const { data: facture, error: fErr } = await db
      .from('achats_factures')
      .select('fichier_url')
      .eq('id', factureId)
      .eq('client_id', clientId)
      .single()

    if (fErr || !facture) return new Response('Facture introuvable.', { status: 404 })
    if (!facture.fichier_url) return new Response('Aucun fichier.', { status: 404 })

    // Télécharge le fichier depuis Storage et le renvoie directement
    // → même origine, pas de problème CSP
    const { data: fileData, error: dErr } = await db.storage
      .from('factures')
      .download(facture.fichier_url)

    if (dErr || !fileData) return new Response('Fichier introuvable dans le storage.', { status: 404 })

    const ext = facture.fichier_url.split('.').pop().toLowerCase()
    const mime = ext === 'pdf' ? 'application/pdf'
      : ext === 'png'  ? 'image/png'
      : ext === 'webp' ? 'image/webp'
      : 'image/jpeg'

    const buffer = Buffer.from(await fileData.arrayBuffer())

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (err) {
    console.error('fichier-facture error:', err)
    return new Response(err.message, { status: 500 })
  }
}
