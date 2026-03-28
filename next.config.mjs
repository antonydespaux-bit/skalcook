/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      // Versionnement API : /api/v1/* → /api/*
      // Permet d'utiliser /api/v1/ sans renommer les route handlers existants.
      {
        source: '/api/v1/:path*',
        destination: '/api/:path*',
      },
    ]
  },
}

export default nextConfig
