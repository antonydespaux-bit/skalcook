import fs from 'node:fs'
import path from 'node:path'
import LandingClient from './LandingClient'

export default function HomePage() {
  const landingPath = path.resolve(process.cwd(), 'app/landing-source.html')

  let raw = ''
  try {
    raw = fs.readFileSync(landingPath, 'utf8')
  } catch (e) {
    // Fallback: page vide si le fichier externe n'est pas trouvé.
    return <LandingClient markup={'<div style="padding:40px;color:#444">Landing introuvable.</div>'} />
  }

  // Internal links for login
  raw = raw.replaceAll('https://app.skalcook.com', '/login')
  raw = raw.replaceAll('href="/inscription"', 'href="/login?mode=signup"')

  // Extract <body>...</body> content
  const bodyMatch = raw.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  let body = bodyMatch ? bodyMatch[1] : raw

  // Remove <style> and <script> tags (styles moved to app/landing.css and scripts moved to LandingClient)
  body = body.replace(/<style[\s\S]*?<\/style>/gi, '')
  body = body.replace(/<script[\s\S]*?<\/script>/gi, '')

  return <LandingClient markup={body} />
}
