import './globals.css'
import './landing.css'
import './crm.css'
import Script from 'next/script'
import Providers from '../components/Providers'
import AnalyticsWrapper from '../components/AnalyticsWrapper'
import AxeptioPrintHide from '../components/AxeptioPrintHide'

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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Script id="axeptio-settings" strategy="afterInteractive">
          {`
window.axeptioSettings = {
  clientId: "69c93192a77e258463cb2f3b",
  cookiesVersion: "45afdbc3-f61f-46f5-aba6-c3d4070f538a",
  googleConsentMode: {
    default: {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      wait_for_update: 500
    }
  }
};
          `}
        </Script>
        <Script
          id="axeptio-sdk"
          src="https://static.axept.io/sdk.js"
          strategy="afterInteractive"
        />
        <AnalyticsWrapper />
        <AxeptioPrintHide />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
