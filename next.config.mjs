/** @type {import('next').NextConfig} */
const nextConfig = {
  // La CSP unique est définie dans proxy.ts (middleware). Ne PAS en ajouter
  // une seconde ici : deux en-têtes CSP s'appliquent en intersection et se
  // neutralisent (ex. frame-src supabase.co vs vercel.live → les deux bloqués).
  async rewrites() {
    return [
      // Versionnement API : /api/v1/* → /api/*
      {
        source: '/api/v1/:path*',
        destination: '/api/:path*',
      },
    ]
  },
  async redirects() {
    return [
      // L'ancienne page /controle-gestion/marges a été remplacée par
      // /controle-gestion/analyses (catalogue widgets unifié, KPIs marges
      // et tables disponibles via le bouton Personnaliser). Permanent (301)
      // pour que les bookmarks utilisateurs migrent côté navigateur.
      {
        source: '/controle-gestion/marges',
        destination: '/controle-gestion/analyses',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
