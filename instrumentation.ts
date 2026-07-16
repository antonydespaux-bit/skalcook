// Hook d'instrumentation Next.js : charge la bonne config Sentry selon le
// runtime, et remonte les erreurs serveur (React Server Components, route
// handlers, etc.) via onRequestError.
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
