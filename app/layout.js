import './globals.css'
import { TenantProvider } from '../lib/useTenant'

export const metadata = {
  title: 'FT Manager',
  description: 'Gestion des fiches techniques culinaires',
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <TenantProvider>
          {children}
        </TenantProvider>
      </body>
    </html>
  )
}
