// Configuration Sentry — runtime edge (middleware / proxy.ts, routes edge).
// Chargé par instrumentation.ts. Voir sentry.server.config.ts pour les notes.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
})
