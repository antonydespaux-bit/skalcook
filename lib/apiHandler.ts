/**
 * Enhanced API route handler for Next.js App Router.
 *
 * Provides a consistent pattern for:
 * - Request body/query parsing with Zod validation
 * - Authentication & authorization (guard functions)
 * - Structured error responses
 * - Request logging
 *
 * Usage:
 *   export const POST = apiHandler({
 *     schema: saveFactureSchema,       // Zod schema for body validation
 *     guard: 'adminOrSuperadmin',       // Auth guard type
 *     clientIdFrom: 'body.clientId',    // Where to find clientId for guard
 *     handler: async ({ data, user, db }) => {
 *       // data = validated body, user = auth user, db = service client
 *       return Response.json({ ok: true })
 *     },
 *   })
 */

import { type ZodType } from 'zod'
import { requireAuthenticated, requireSuperAdmin, requireAdminOrSuperadmin, requireMemberOfClient, getServiceClient } from './apiGuards'
import { ApiError, ValidationError, AuthError, ForbiddenError } from './errors'

type GuardType = 'authenticated' | 'superadmin' | 'adminOrSuperadmin' | 'memberOfClient' | 'none'

interface HandlerContext<T = unknown> {
  data: T
  user: { id: string; email?: string } | null
  db: ReturnType<typeof getServiceClient>
  request: Request
  params?: Record<string, string>
}

interface ApiHandlerOptions<T = unknown> {
  schema?: ZodType<T>
  querySchema?: ZodType<T>
  guard?: GuardType
  clientIdFrom?: string
  handler: (ctx: HandlerContext<T>) => Promise<Response>
}

function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === 'string' ? current : undefined
}

export function apiHandler<T>(options: ApiHandlerOptions<T>) {
  return async (request: Request, routeContext?: { params?: Promise<Record<string, string>> }) => {
    try {
      const db = getServiceClient()
      let data: T = undefined as T
      let user: { id: string; email?: string } | null = null
      const params = routeContext?.params ? await routeContext.params : undefined

      // ── 1. Parse & validate body or query ─────────────────────────────
      if (options.schema) {
        const method = request.method.toUpperCase()
        // GET: query params only
        // DELETE: body si présent, sinon query params (compat clients qui passent les ids en query)
        // Autres méthodes: body JSON
        if (method === 'GET') {
          const url = new URL(request.url)
          const rawQuery = Object.fromEntries(url.searchParams.entries())
          const result = options.schema.safeParse(rawQuery)
          if (!result.success) {
            return Response.json(
              { error: 'Données invalides', details: result.error.flatten() },
              { status: 400 }
            )
          }
          data = result.data
        } else if (method === 'DELETE') {
          let payload: unknown = undefined
          const contentType = request.headers.get('content-type') || ''
          const contentLength = request.headers.get('content-length')
          const hasBody = contentType.includes('application/json') && contentLength !== '0'
          if (hasBody) {
            try {
              payload = await request.json()
            } catch {
              payload = undefined
            }
          }
          if (payload == null) {
            const url = new URL(request.url)
            payload = Object.fromEntries(url.searchParams.entries())
          }
          const result = options.schema.safeParse(payload)
          if (!result.success) {
            return Response.json(
              { error: 'Données invalides', details: result.error.flatten() },
              { status: 400 }
            )
          }
          data = result.data
        } else {
          let body: unknown
          try {
            body = await request.json()
          } catch {
            return Response.json({ error: 'Corps de requête invalide (JSON attendu).' }, { status: 400 })
          }
          const result = options.schema.safeParse(body)
          if (!result.success) {
            return Response.json(
              { error: 'Données invalides', details: result.error.flatten() },
              { status: 400 }
            )
          }
          data = result.data
        }
      }

      // ── 2. Authentication & authorization ─────────────────────────────
      if (options.guard && options.guard !== 'none') {
        if (options.guard === 'authenticated') {
          const result = await requireAuthenticated(request) as { user?: { id: string; email?: string }; response?: Response }
          if (result.response) return result.response
          user = result.user ?? null
        } else if (options.guard === 'superadmin') {
          const result = await requireSuperAdmin(request) as { user?: { id: string; email?: string }; response?: Response }
          if (result.response) return result.response
          user = result.user ?? null
        } else if (options.guard === 'adminOrSuperadmin') {
          const clientId = options.clientIdFrom
            ? getNestedValue(data as Record<string, unknown>, options.clientIdFrom.replace('body.', ''))
            : undefined
          if (!clientId) {
            return Response.json({ error: 'clientId requis pour l\'autorisation.' }, { status: 400 })
          }
          const result = await requireAdminOrSuperadmin(request, clientId) as { user?: { id: string; email?: string }; response?: Response }
          if (result.response) return result.response
          user = result.user ?? null
        } else if (options.guard === 'memberOfClient') {
          const clientId = options.clientIdFrom
            ? getNestedValue(data as Record<string, unknown>, options.clientIdFrom.replace('body.', ''))
            : undefined
          if (!clientId) {
            return Response.json({ error: 'clientId requis pour l\'autorisation.' }, { status: 400 })
          }
          const result = await requireMemberOfClient(request, clientId) as { user?: { id: string; email?: string }; response?: Response }
          if (result.response) return result.response
          user = result.user ?? null
        }
      }

      // ── 3. Execute handler ────────────────────────────────────────────
      return await options.handler({ data, user, db, request, params })
    } catch (err) {
      if (err instanceof ValidationError) {
        return Response.json(
          { error: err.message, details: (err as ValidationError).details ?? undefined },
          { status: err.status }
        )
      }
      if (err instanceof ApiError) {
        return Response.json({ error: err.message }, { status: err.status })
      }
      console.error('[API Error]', err)
      return Response.json({ error: 'Erreur serveur interne' }, { status: 500 })
    }
  }
}
