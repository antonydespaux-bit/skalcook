import { openapiSpec } from '../../../lib/openapi.js'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json(openapiSpec, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}
