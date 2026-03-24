import './globals.css'
import Providers from '../components/Providers'

export const metadata = {
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 44'><rect x='8' y='34' width='28' height='7' rx='2' fill='%236366F1'/><ellipse cx='14' cy='30' rx='7' ry='8' fill='%236366F1'/><ellipse cx='22' cy='26' rx='9' ry='11' fill='%236366F1'/><ellipse cx='30' cy='30' rx='7' ry='8' fill='%236366F1'/></svg>",
  },
  title: { default: 'Skalcook', template: '%s — Skalcook' },
  description: 'Skalcook — gestion des fiches techniques culinaires',
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}
