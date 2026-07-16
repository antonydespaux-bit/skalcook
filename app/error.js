'use client'

// Error boundary de segment (App Router) : capture toute exception de rendu
// d'une page et affiche un fallback lisible + un bouton « Réessayer » (au lieu
// de l'écran blanc ou du spinner infini d'avant). Remonte aussi l'erreur à
// Sentry (inerte tant que le DSN n'est pas configuré).
import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

const C = {
  fond: '#F4F4F5',
  blanc: '#FFFFFF',
  bordure: '#E4E4E7',
  texte: '#18181B',
  muted: '#71717A',
  accent: '#6366F1',
}

export default function Error({ error, reset }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: C.fond,
        fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: '440px',
          width: '100%',
          background: C.blanc,
          border: `1px solid ${C.bordure}`,
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
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <h1 style={{ fontSize: '20px', fontWeight: 600, color: C.texte, margin: '0 0 10px' }}>
          Oups, une erreur est survenue
        </h1>
        <p style={{ fontSize: '15px', lineHeight: 1.5, color: C.muted, margin: '0 0 28px' }}>
          Un problème inattendu a interrompu le chargement. Vous pouvez réessayer —
          si cela persiste, l'incident nous a été signalé automatiquement.
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => reset()}
            style={{
              background: C.accent,
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
          <a
            href="/"
            style={{
              background: 'transparent',
              color: C.texte,
              border: `1px solid ${C.bordure}`,
              borderRadius: '10px',
              padding: '11px 22px',
              fontSize: '15px',
              fontWeight: 500,
              textDecoration: 'none',
              display: 'inline-block',
            }}
          >
            Retour à l'accueil
          </a>
        </div>

        {error?.digest ? (
          <p style={{ fontSize: '12px', color: C.muted, marginTop: '24px', fontFamily: 'monospace' }}>
            Réf. incident : {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  )
}
