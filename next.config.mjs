/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-src 'self' blob: https://*.supabase.co;",
          },
        ],
      },
    ]
  },
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
