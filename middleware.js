import { NextResponse } from 'next/server'

/**
 * Middleware unifié : détection du tenant + security headers + rate limiting.
 *
 * Fusionné depuis proxy.js (détection tenant) et l'ancien middleware.js
 * (security headers + rate limiting).
 */

// ── Rate limiter en mémoire — sliding window par IP ─────────────────────────
// Note : se réinitialise à chaque redémarrage du serveur.
// Pour la production, remplacer par @upstash/ratelimit + Redis.
const RATE_LIMIT_WINDOW_MS = 60_000  // 1 minute
const RATE_LIMIT_MAX = 60            // requêtes max par fenêtre

// Map<ip, { count, windowStart }>
const ipRequests = new Map()

function checkRateLimit(ip) {
  const now = Date.now()
  const entry = ipRequests.get(ip)

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipRequests.set(ip, { count: 1, windowStart: now })
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 }
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - entry.windowStart)) / 1000)
    return { allowed: false, remaining: 0, retryAfter }
  }

  entry.count++
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count }
}

// Nettoyage périodique pour éviter une fuite mémoire
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [ip, entry] of ipRequests.entries()) {
      if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
        ipRequests.delete(ip)
      }
    }
  }, RATE_LIMIT_WINDOW_MS)
}

// ── Détection du tenant depuis le sous-domaine ───────────────────────────────
function detectTenantSlug(req) {
  const { hostname, searchParams } = req.nextUrl
  const parts = hostname.split('.')

  let tenantSlug = null

  if (hostname.includes('localhost')) {
    // Dev : sous-domaine local ex: lafantaisie.localhost
    if (parts.length >= 2 && parts[0] !== 'localhost') {
      tenantSlug = parts[0]
    }
  } else if (hostname.includes('vercel.app')) {
    // Vercel preview : pas de sous-domaine client → cookie tenant_slug en fallback
    tenantSlug = req.cookies.get('tenant_slug')?.value || null
  } else {
    // Production : lafantaisie.skalcook.com
    if (parts.length >= 3) {
      tenantSlug = parts[0]
    }
  }

  // Fallback : paramètre URL ?tenant=lafantaisie
  if (!tenantSlug) {
    tenantSlug = searchParams.get('tenant') || null
  }

  return tenantSlug
}

export function middleware(req) {
  const { pathname } = req.nextUrl
  let rateLimitHeaders = {}

  // ── 1. Rate limiting (routes API uniquement) ─────────────────────────────
  if (pathname.startsWith('/api/')) {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1'

    const { allowed, remaining, retryAfter } = checkRateLimit(ip)
    rateLimitHeaders = { remaining }

    if (!allowed) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Veuillez patienter.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }
  }

  // ── 2. Détection du tenant ───────────────────────────────────────────────
  const tenantSlug = detectTenantSlug(req)
  const res = NextResponse.next()

  if (tenantSlug) {
    // Cookie persistant 7 jours (lecture côté client autorisée)
    res.cookies.set('tenant_slug', tenantSlug, {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    })
    // Header pour les Server Components
    res.headers.set('x-tenant-slug', tenantSlug)
  }

  // ── 3. Security headers ──────────────────────────────────────────────────
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  )
  res.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com https://static.axept.io https://axept.io https://www.googletagmanager.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net https://fonts.axept.io https://*.axept.io",
      "font-src 'self' https://fonts.gstatic.com https://fonts.axept.io",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://static.axept.io https://axept.io https://*.axept.io https://cdn.jsdelivr.net https://unpkg.com https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://www.googletagmanager.com",
      "frame-ancestors 'none'",
    ].join('; ')
  )

  if (pathname.startsWith('/api/') && rateLimitHeaders.remaining !== undefined) {
    res.headers.set('X-RateLimit-Limit', String(RATE_LIMIT_MAX))
    res.headers.set('X-RateLimit-Remaining', String(rateLimitHeaders.remaining))
  }

  return res
}

export const config = {
  matcher: [
    // Toutes les routes sauf fichiers statiques et assets Next.js
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf)).*)',
  ],
}
