// Configuration Sentry — navigateur (client).
// Next.js charge automatiquement ce fichier côté client.
//
// DSN-gated : inerte tant que NEXT_PUBLIC_SENTRY_DSN n'est pas défini.
// Les events transitent par tunnelRoute '/monitoring' (cf. next.config.mjs)
// → même origine, donc compatibles avec la CSP `connect-src 'self'` de proxy.ts
// et non bloqués par les ad-blockers.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
})

// Instrumente les transitions de navigation App Router.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
