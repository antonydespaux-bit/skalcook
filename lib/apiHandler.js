/**
 * Wrapper global pour les route handlers Next.js App Router.
 * Centralise la gestion des erreurs (équivalent @ControllerAdvice Spring).
 *
 * Usage :
 *   export const GET = withErrorHandler(async (req) => {
 *     // ... votre logique
 *     return Response.json({ data })
 *   })
 */

import { ApiError, ValidationError } from './errors.js'

export function withErrorHandler(handler) {
  return async (req, context) => {
    try {
      return await handler(req, context)
    } catch (err) {
      // Erreur métier connue
      if (err instanceof ValidationError) {
        return Response.json(
          { error: err.message, details: err.details ?? undefined },
          { status: err.status }
        )
      }

      if (err instanceof ApiError) {
        return Response.json(
          { error: err.message },
          { status: err.status }
        )
      }

      // Erreur inattendue — on logue sans exposer les détails internes
      console.error('[API Error]', err)
      return Response.json(
        { error: 'Erreur serveur interne' },
        { status: 500 }
      )
    }
  }
}
