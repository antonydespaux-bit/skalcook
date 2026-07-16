// Configuration Sentry — runtime serveur (Node.js).
// Chargé par instrumentation.ts au démarrage.
//
// DSN-gated : tant que SENTRY_DSN (ou NEXT_PUBLIC_SENTRY_DSN) n'est pas défini,
// Sentry est totalement inerte (aucun event envoyé, aucun overhead). Pour
// activer : créer un projet Sentry, puis poser le DSN dans les env vars Vercel
// + .env.local. Rien d'autre à changer dans le code.
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  // Échantillonnage des traces de perf : 10 % suffit pour des pilotes et
  // préserve le quota. Les erreurs, elles, sont toujours capturées à 100 %.
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
})
