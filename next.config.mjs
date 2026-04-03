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
}

export default nextConfig
