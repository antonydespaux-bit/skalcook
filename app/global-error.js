'use client'

// Global error boundary : dernier filet de sécurité. Ne se déclenche que si le
// root layout lui-même plante (ou une erreur non rattrapée par app/error.js).
// Il REMPLACE tout le document → il doit fournir ses propres <html>/<body> et
// ne peut s'appuyer sur aucun provider/contexte ni sur la CSS globale.
// Remonte l'erreur à Sentry (inerte tant que le DSN n'est pas configuré).
import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="fr">
      <body style={{ margin: 0 }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            background: '#F4F4F5',
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
          }}
        >
          <div
            style={{
              maxWidth: '440px',
              width: '100%',
              background: '#FFFFFF',
              border: '1px solid #E4E4E7',
              borderRadius: '16px',
              padding: '40px 32px',
              textAlign: 'center',
              boxShadow: '0 4px 24px rgba(24,24,27,0.06)',
            }}
          >
            <div
              style={{
                width: '56px',
                height: '56px',
                margin: '0 auto 20px',
                borderRadius: '14px',
                background: '#EEF2FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>

            <h1 style={{ fontSize: '20px', fontWeight: 600, color: '#18181B', margin: '0 0 10px' }}>
              Skalcook est momentanément indisponible
            </h1>
            <p style={{ fontSize: '15px', lineHeight: 1.5, color: '#71717A', margin: '0 0 28px' }}>
              Une erreur inattendue s'est produite. Réessayez dans un instant —
              l'incident nous a été signalé automatiquement.
            </p>

            <button
              onClick={() => reset()}
              style={{
                background: '#6366F1',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '10px',
                padding: '11px 22px',
                fontSize: '15px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Réessayer
            </button>

            {error?.digest ? (
              <p style={{ fontSize: '12px', color: '#71717A', marginTop: '24px', fontFamily: 'monospace' }}>
                Réf. incident : {error.digest}
              </p>
            ) : null}
          </div>
        </div>
      </body>
    </html>
  )
}
