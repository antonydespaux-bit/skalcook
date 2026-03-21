import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Pages publiques qui ne nécessitent pas de tenant
const PUBLIC_PATHS = ['/', '/reset-password', '/nouveau-mot-de-passe', '/inscription']

export async function middleware(request) {
  const { pathname, hostname } = request.nextUrl

  // Ignorer les assets statiques
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // Détecter le tenant depuis le sous-domaine
  // Ex: lafantaisie.ftmanager.fr → slug = 'lafantaisie'
  // Ex: lafantaisie.localhost:3000 → slug = 'lafantaisie'
  // Ex: localhost:3000 → pas de tenant
  const parts = hostname.split('.')
  let tenantSlug = null

  if (hostname.includes('localhost')) {
    // Dev : sous-domaine local ex: lafantaisie.localhost
    if (parts.length >= 2 && parts[0] !== 'localhost') {
      tenantSlug = parts[0]
    }
  } else if (hostname.includes('vercel.app')) {
    // Vercel preview : lafantaisie-ft-manager.vercel.app
    // On utilise le cookie comme fallback
    tenantSlug = request.cookies.get('tenant_slug')?.value
  } else {
    // Production : lafantaisie.ftmanager.fr
    if (parts.length >= 3) {
      tenantSlug = parts[0]
    }
  }

  // Fallback : paramètre URL ?tenant=lafantaisie
  if (!tenantSlug) {
    tenantSlug = request.nextUrl.searchParams.get('tenant')
  }

  const response = NextResponse.next()

  if (tenantSlug) {
    // Stocker le slug dans un cookie pour persister la session
    response.cookies.set('tenant_slug', tenantSlug, {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 7 jours
    })

    // Passer le tenant au header pour les Server Components
    response.headers.set('x-tenant-slug', tenantSlug)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)']
}
