import { requireAdminOrSuperadmin, getServiceClient } from '../../../../lib/apiGuards'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId      = searchParams.get('clientId')
    const numeroFacture = searchParams.get('numeroFacture')

    if (!clientId || !numeroFacture?.trim()) {
      return Response.json({ existing: null })
    }

    const { response: authError } = await requireAdminOrSuperadmin(request, clientId)
    if (authError) return authError

    const { data: rows } = await getServiceClient()
      .from('achats_factures')
      .select('id, date_facture, fournisseur, total_ht, created_at')
      .eq('client_id', clientId)
      .ilike('numero_facture', numeroFacture.trim())
      .limit(1)

    return Response.json({ existing: rows?.[0] ?? null })
  } catch (err) {
    console.error('check-duplicate error:', err)
    return Response.json({ existing: null })
  }
}
