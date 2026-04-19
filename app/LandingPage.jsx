'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Logo } from '../lib/theme.jsx'
import './landing.css'

/* ── Safety net : si Supabase renvoie l'utilisateur sur la landing ──
 *
 * Le lien d'invitation / recovery devrait arriver sur /nouveau-mot-de-passe.
 * Mais si la config Supabase (Site URL / Redirect URLs allow-list)
 * n'autorise pas cette cible, Supabase rewrite silencieusement vers le
 * Site URL — souvent la racine. On rattrape ici en détectant les params
 * d'auth dans le hash ou la query, et on renvoie sur la bonne page en
 * préservant les tokens. */
function usePasswordLinkRedirect() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash || ''
    const search = window.location.search || ''
    const hasHashToken = /(^|[#&])access_token=/.test(hash)
    const hasHashType = /(^|[#&])type=(recovery|invite|signup|magiclink)/.test(hash)
    const hasCode = /(^|[?&])code=/.test(search)
    // Supabase renvoie aussi les erreurs (otp_expired, access_denied…) dans
    // le hash. On redirige pareil pour afficher un message propre au lieu
    // de laisser l'utilisateur bloqué sur la landing.
    const hasHashError = /(^|[#&])error(_code|_description)?=/.test(hash)
    const hasQueryError = /(^|[?&])error(_code|_description)?=/.test(search)
    if (hasHashToken && hasHashType) {
      window.location.replace(`/nouveau-mot-de-passe${hash}`)
    } else if (hasCode) {
      window.location.replace(`/nouveau-mot-de-passe${search}`)
    } else if (hasHashError) {
      window.location.replace(`/nouveau-mot-de-passe${hash}`)
    } else if (hasQueryError) {
      window.location.replace(`/nouveau-mot-de-passe${search}`)
    }
  }, [])
}

/* ── Scroll reveal hook ── */
function useReveal() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('sk-reveal--visible'); obs.unobserve(el) } },
      { threshold: 0.15 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return ref
}

function Reveal({ children, className = '', delay = 0 }) {
  const ref = useReveal()
  const delayClass = delay > 0 ? ` sk-reveal--d${delay}` : ''
  return <div ref={ref} className={`sk-reveal${delayClass} ${className}`}>{children}</div>
}

/* ── Inline SVG icons ── */
const IconShield = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>
)
const IconCalculator = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="2"/>
    <line x1="8" y1="6" x2="16" y2="6"/>
    <line x1="8" y1="10" x2="10" y2="10"/>
    <line x1="14" y1="10" x2="16" y2="10"/>
    <line x1="8" y1="14" x2="10" y2="14"/>
    <line x1="14" y1="14" x2="16" y2="14"/>
    <line x1="8" y1="18" x2="10" y2="18"/>
    <line x1="14" y1="18" x2="16" y2="18"/>
  </svg>
)
const IconPrinter = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9"/>
    <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
    <rect x="6" y="14" width="12" height="8"/>
  </svg>
)
const IconDatabase = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3"/>
    <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
  </svg>
)
const IconPalette = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"/>
    <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"/>
    <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"/>
    <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor"/>
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z"/>
  </svg>
)
const IconLayers = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2"/>
    <polyline points="2 17 12 22 22 17"/>
    <polyline points="2 12 12 17 22 12"/>
  </svg>
)
const IconMenu = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
)
const IconX = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)
const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
)
const IconStar = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
)

/* ── Stats config ── */
const STATS = [
  { icon: <IconShield />, label: '14 allergènes UE' },
  { icon: <IconLayers />, label: 'Cuisine & Bar' },
  { icon: <IconDatabase />, label: 'Multi-sites' },
  { icon: <IconStar />, label: 'Temps réel' },
]

/* ── Features config ── */
const FEATURES_FICHES = [
  { icon: <IconCalculator />, title: 'Food cost temps réel', desc: 'Chaque prix ingrédient mis à jour se répercute instantanément sur toutes les fiches — zéro calcul manuel.' },
  { icon: <IconShield />, title: '14 allergènes UE', desc: 'Conformité réglementaire avec les 14 allergènes officiels. Tableau récapitulatif imprimable pour la salle.' },
  { icon: <IconPrinter />, title: 'Impression A4 pro', desc: 'Fiches techniques professionnelles prêtes pour la cuisine, avec photo, ingrédients et coûts détaillés.' },
]

const FEATURES_MULTI = [
  { icon: <IconDatabase />, title: 'Données isolées', desc: 'Chaque établissement dispose de son propre espace sécurisé avec isolation complète des données.' },
  { icon: <IconPalette />, title: 'Branding personnalisé', desc: 'Logo, couleurs et nom personnalisés par établissement. Chaque équipe se sent chez elle.' },
  { icon: <IconLayers />, title: 'Cuisine + Bar séparés', desc: 'Modules dédiés avec TVA automatique : 10% restauration, 20% alcool. Gestion simplifiée.' },
]

/* ── Demo form ── */
function DemoForm() {
  const [form, setForm] = useState({ nom: '', email: '', telephone: '', nom_etablissement: '', nb_etablissements: '1', message: '', website: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const update = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.nom.trim() || !form.email.trim()) { setError('Nom et email requis.'); return }
    setSending(true)
    try {
      const res = await fetch('/api/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, nb_etablissements: parseInt(form.nb_etablissements) || 1, langue: 'fr' }),
      })
      if (!res.ok) throw new Error('Erreur serveur')
      setSent(true)
    } catch {
      setError('Une erreur est survenue. Réessayez ou contactez-nous par email.')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="sk-form__success">
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>✓</div>
        <div style={{ fontSize: '20px', fontWeight: '600', color: '#FAFAFA', marginBottom: '8px' }}>Demande envoyée !</div>
        <div style={{ fontSize: '14px', color: '#A1A1AA' }}>Nous vous recontactons sous 24h.</div>
      </div>
    )
  }

  return (
    <form className="sk-form" onSubmit={submit}>
      {error && <div className="sk-form__error">{error}</div>}
      <div className="sk-form__row">
        <div className="sk-form__field">
          <label className="sk-form__label">Nom *</label>
          <input className="sk-form__input" type="text" placeholder="Jean Dupont" value={form.nom} onChange={update('nom')} required />
        </div>
        <div className="sk-form__field">
          <label className="sk-form__label">Email *</label>
          <input className="sk-form__input" type="email" placeholder="jean@restaurant.fr" value={form.email} onChange={update('email')} required />
        </div>
      </div>
      <div className="sk-form__row">
        <div className="sk-form__field">
          <label className="sk-form__label">Téléphone</label>
          <input className="sk-form__input" type="tel" placeholder="+33 6 00 00 00 00" value={form.telephone} onChange={update('telephone')} />
        </div>
        <div className="sk-form__field">
          <label className="sk-form__label">Nom de l'établissement</label>
          <input className="sk-form__input" type="text" placeholder="Mon Restaurant" value={form.nom_etablissement} onChange={update('nom_etablissement')} />
        </div>
      </div>
      <div className="sk-form__row">
        <div className="sk-form__field">
          <label className="sk-form__label">Nombre d'établissements</label>
          <select className="sk-form__input" value={form.nb_etablissements} onChange={update('nb_etablissements')}>
            <option value="1">1 établissement</option>
            <option value="2">2 établissements</option>
            <option value="3">3-5 établissements</option>
            <option value="10">6-10 établissements</option>
            <option value="20">10+ établissements</option>
          </select>
        </div>
      </div>
      <div className="sk-form__field">
        <label className="sk-form__label">Message (optionnel)</label>
        <textarea className="sk-form__input sk-form__textarea" placeholder="Décrivez votre besoin..." value={form.message} onChange={update('message')} rows={3} />
      </div>
      {/* Honeypot — hidden from humans */}
      <input type="text" name="website" value={form.website} onChange={update('website')} style={{ position: 'absolute', left: '-9999px', tabIndex: -1 }} autoComplete="off" />
      <button className="sk-form__submit" type="submit" disabled={sending}>
        {sending ? 'Envoi en cours…' : 'Demander une démo gratuite'}
      </button>
    </form>
  )
}

/* ════════════════════════════════════════════════════════════════
 * Landing Page Component
 * ════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  usePasswordLinkRedirect()
  const [menuOpen, setMenuOpen] = useState(false)

  const scrollTo = useCallback((id) => {
    setMenuOpen(false)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  return (
    <div className="sk-landing">

      {/* ── Navbar ── */}
      <nav className="sk-nav">
        <div className="sk-nav__inner">
          <Logo height={32} couleur="#6366F1" />
          <div className={`sk-nav__links${menuOpen ? ' sk-nav__links--open' : ''}`}>
            <a className="sk-nav__link" href="#features" onClick={e => { e.preventDefault(); scrollTo('features') }}>Fonctionnalités</a>
            <a className="sk-nav__link" href="#multi" onClick={e => { e.preventDefault(); scrollTo('multi') }}>Multi-sites</a>
            <a className="sk-nav__link" href="#contact" onClick={e => { e.preventDefault(); scrollTo('contact') }}>Contact</a>
            <a className="sk-nav__cta" href="/login">Se connecter</a>
          </div>
          <button className="sk-nav__burger" onClick={() => setMenuOpen(v => !v)} aria-label="Menu">
            {menuOpen ? <IconX /> : <IconMenu />}
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="sk-hero">
        <div className="sk-hero__inner">
          <div className="sk-hero__eyebrow">
            <span className="sk-hero__eyebrow-dot" />
            Gestion professionnelle
          </div>
          <h1 className="sk-hero__title">
            Les fiches techniques qui <em>font la différence</em>
          </h1>
          <p className="sk-hero__subtitle">
            Calculez votre food cost en temps réel, gérez vos allergènes, et pilotez vos marges Cuisine & Bar depuis une seule plateforme.
          </p>
          <div className="sk-hero__actions">
            <a className="sk-btn-primary" href="#contact" onClick={e => { e.preventDefault(); scrollTo('contact') }}>
              Demander une démo
            </a>
            <a className="sk-btn-ghost" href="#features" onClick={e => { e.preventDefault(); scrollTo('features') }}>
              Découvrir
            </a>
          </div>
          <div className="sk-hero__stats">
            {STATS.map(({ icon, label }) => (
              <div key={label} className="sk-hero__stat">
                <div className="sk-hero__stat-icon">{icon}</div>
                {label}
              </div>
            ))}
          </div>
        </div>
        <div className="sk-hero__screenshot">
          <img src="/screen-dashboard.png" alt="Dashboard Skalcook — KPIs, food cost, allergènes" />
        </div>
      </section>

      {/* ── Features — Fiches techniques ── */}
      <section id="features" className="sk-section">
        <div className="sk-section__inner">
          <Reveal>
            <div className="sk-section__eyebrow">Fonctionnalité phare</div>
            <h2 className="sk-section__title">Vos fiches techniques, enfin professionnelles</h2>
            <p className="sk-section__desc">
              Créez vos fiches avec ingrédients, coûts, allergènes et photo. Food cost calculé automatiquement à la portion, impression A4 professionnelle.
            </p>
          </Reveal>
          <div className="sk-features">
            {FEATURES_FICHES.map(({ icon, title, desc }, i) => (
              <Reveal key={title} delay={i + 1}>
                <div className="sk-feature">
                  <div className="sk-feature__icon">{icon}</div>
                  <div className="sk-feature__title">{title}</div>
                  <div className="sk-feature__desc">{desc}</div>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <div className="sk-section__screenshot">
              <img src="/screen-recap.png" alt="Récap food cost par lieu et catégorie — Skalcook" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Features — Multi-établissements ── */}
      <section id="multi" className="sk-section sk-section--alt">
        <div className="sk-section__inner">
          <Reveal>
            <div className="sk-section__eyebrow">Multi-sites</div>
            <h2 className="sk-section__title">Une plateforme, tous vos restaurants</h2>
            <p className="sk-section__desc">
              Chaque établissement dispose de son espace isolé, son branding, ses modules Cuisine et Bar, et ses équipes. Pilotez tout depuis un seul compte.
            </p>
          </Reveal>
          <div className="sk-features">
            {FEATURES_MULTI.map(({ icon, title, desc }, i) => (
              <Reveal key={title} delay={i + 1}>
                <div className="sk-feature">
                  <div className="sk-feature__icon">{icon}</div>
                  <div className="sk-feature__title">{title}</div>
                  <div className="sk-feature__desc">{desc}</div>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <div className="sk-section__screenshot">
              <img src="/screen-multi.png" alt="Gestion multi-établissements — Skalcook" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── CTA + Formulaire ── */}
      <section id="contact" className="sk-cta">
        <Reveal>
          <div className="sk-cta__inner">
            <h2 className="sk-cta__title">Prêt à maîtriser vos coûts ?</h2>
            <p className="sk-cta__desc">
              Démo personnalisée en 15 minutes. Remplissez le formulaire, on vous recontacte sous 24h.
            </p>
            <DemoForm />
          </div>
        </Reveal>
      </section>

      {/* ── Footer ── */}
      <footer className="sk-footer">
        <div className="sk-footer__inner">
          <div className="sk-footer__brand">
            <Logo height={28} couleur="#6366F1" />
            <p className="sk-footer__brand-desc">
              La plateforme de gestion des fiches techniques pour les professionnels de la restauration.
            </p>
          </div>
          <div>
            <div className="sk-footer__col-title">Produit</div>
            <a className="sk-footer__link" href="#features" onClick={e => { e.preventDefault(); scrollTo('features') }}>Fonctionnalités</a>
            <a className="sk-footer__link" href="#features" onClick={e => { e.preventDefault(); scrollTo('features') }}>Food cost</a>
            <a className="sk-footer__link" href="#multi" onClick={e => { e.preventDefault(); scrollTo('multi') }}>Multi-sites</a>
          </div>
          <div>
            <div className="sk-footer__col-title">Légal</div>
            <a className="sk-footer__link" href="/cgu">CGU</a>
            <a className="sk-footer__link" href="/mentions-legales">Mentions légales</a>
            <a className="sk-footer__link" href="/politique-confidentialite">Confidentialité</a>
          </div>
          <div>
            <div className="sk-footer__col-title">Contact</div>
            <a className="sk-footer__link" href="mailto:contact@skalcook.fr">contact@skalcook.fr</a>
            <a className="sk-footer__link" href="#contact" onClick={e => { e.preventDefault(); scrollTo('contact') }}>Demander une démo</a>
          </div>
        </div>
        <div className="sk-footer__bottom">
          © {new Date().getFullYear()} Skalcook — Tous droits réservés
        </div>
      </footer>
    </div>
  )
}
