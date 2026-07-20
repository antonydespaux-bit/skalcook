import { openapiSpec } from '../../../lib/openapi.js'

export const dynamic = 'force-dynamic'

// Ne pas exposer la cartographie complète de l'API (tous les endpoints +
// schémas) aux anonymes en prod. Doc dispo en dev ; réactivable en prod via
// ENABLE_API_DOCS=true si un jour placée derrière une autre protection.
function docsDisabled() {
  return process.env.NODE_ENV === 'production' && process.env.ENABLE_API_DOCS !== 'true'
}

export async function GET() {
  if (docsDisabled()) {
    return new Response('Not found', { status: 404 })
  }
  return Response.json(openapiSpec, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}
