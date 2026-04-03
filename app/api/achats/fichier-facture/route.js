import { requireAdminOrSuperadmin, getServiceClient } from '../../../../lib/apiGuards'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId   = searchParams.get('clientId')
    const factureId  = searchParams.get('factureId')

    if (!clientId || !factureId) {
      return Response.json({ error: 'clientId et factureId requis.' }, { status: 400 })
    }

    const { response: authError } = await requireAdminOrSuperadmin(request, clientId)
    if (authError) return authError

    const db = getServiceClient()

    // Récupère le chemin du fichier
    const { data: facture, error: fErr } = await db
      .from('achats_factures')
      .select('fichier_url')
      .eq('id', factureId)
      .eq('client_id', clientId)
      .single()

    if (fErr || !facture) return Response.json({ error: 'Facture introuvable.' }, { status: 404 })
    if (!facture.fichier_url) return Response.json({ url: null })

    // Génère une URL signée valable 1 heure
    const { data: signed, error: sErr } = await db.storage
      .from('factures')
      .createSignedUrl(facture.fichier_url, 3600)

    if (sErr) return Response.json({ error: sErr.message }, { status: 500 })

    return Response.json({ url: signed.signedUrl, path: facture.fichier_url })
  } catch (err) {
    console.error('fichier-facture error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
