import { requireAdminOrSuperadmin, getServiceClient } from '../../../../lib/apiGuards'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')

    if (!clientId) {
      return Response.json({ error: 'clientId requis.' }, { status: 400 })
    }

    const { response: authError } = await requireAdminOrSuperadmin(request, clientId)
    if (authError) return authError

    const db = getServiceClient()

    const [{ data: mappings, error: mErr }, { data: ingredients, error: iErr }] = await Promise.all([
      db
        .from('fournisseur_mapping')
        .select('designation_norm, ingredient_id, fournisseur')
        .eq('client_id', clientId),
      db
        .from('ingredients')
        .select('id, nom, prix_kg, unite')
        .eq('client_id', clientId)
        .eq('est_sous_fiche', false),
    ])

    if (mErr) console.warn('reconciliation-data fournisseur_mapping error:', mErr.message)
    if (iErr) console.warn('reconciliation-data ingredients error:', iErr.message)

    return Response.json({
      mappings:    mappings    || [],
      ingredients: ingredients || [],
    })
  } catch (err) {
    console.error('reconciliation-data error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
