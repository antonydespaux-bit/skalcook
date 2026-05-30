'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Logo } from '../lib/theme.jsx'
import LanguageSwitcher from '../components/LanguageSwitcher'
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

/* ── Stats config (labels via i18n: landing.stats.<key>) ── */
const STATS = [
  { icon: <IconShield />, key: 'allergens' },
  { icon: <IconLayers />, key: 'kitchenBar' },
  { icon: <IconDatabase />, key: 'multiSite' },
  { icon: <IconStar />, key: 'realtime' },
]

/* ── Features config (titre/desc via i18n: landing.fiches/multi.<key>Title|Desc) ── */
const FEATURES_FICHES = [
  { icon: <IconCalculator />, key: 'foodCost' },
  { icon: <IconShield />, key: 'allergens' },
  { icon: <IconPrinter />, key: 'print' },
]

const FEATURES_MULTI = [
  { icon: <IconDatabase />, key: 'isolated' },
  { icon: <IconPalette />, key: 'branding' },
  { icon: <IconLayers />, key: 'kitchenBar' },
]

/* ── Demo form ── */
function DemoForm() {
  const { t, i18n } = useTranslation()
  const [form, setForm] = useState({ nom: '', email: '', telephone: '', nom_etablissement: '', nb_etablissements: '1', message: '', website: '' })
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const update = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.nom.trim() || !form.email.trim()) { setError(t('landing.form.nameRequired')); return }
    setSending(true)
    try {
      const res = await fetch('/api/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, nb_etablissements: parseInt(form.nb_etablissements) || 1, langue: i18n.language || 'fr' }),
      })
      if (!res.ok) throw new Error('Erreur serveur')
      setSent(true)
    } catch {
      setError(t('landing.form.genericError'))
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="sk-form__success">
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>✓</div>
        <div style={{ fontSize: '20px', fontWeight: '600', color: '#FAFAFA', marginBottom: '8px' }}>{t('landing.form.successTitle')}</div>
        <div style={{ fontSize: '14px', color: '#A1A1AA' }}>{t('landing.form.successDesc')}</div>
      </div>
    )
  }

  return (
    <form className="sk-form" onSubmit={submit}>
      {error && <div className="sk-form__error">{error}</div>}
      <div className="sk-form__row">
        <div className="sk-form__field">
          <label className="sk-form__label">{t('landing.form.name')}</label>
          <input className="sk-form__input" type="text" placeholder={t('landing.form.namePlaceholder')} value={form.nom} onChange={update('nom')} required />
        </div>
        <div className="sk-form__field">
          <label className="sk-form__label">{t('landing.form.email')}</label>
          <input className="sk-form__input" type="email" placeholder={t('landing.form.emailPlaceholder')} value={form.email} onChange={update('email')} required />
        </div>
      </div>
      <div className="sk-form__row">
        <div className="sk-form__field">
          <label className="sk-form__label">{t('landing.form.phone')}</label>
          <input className="sk-form__input" type="tel" placeholder={t('landing.form.phonePlaceholder')} value={form.telephone} onChange={update('telephone')} />
        </div>
        <div className="sk-form__field">
          <label className="sk-form__label">{t('landing.form.establishment')}</label>
          <input className="sk-form__input" type="text" placeholder={t('landing.form.establishmentPlaceholder')} value={form.nom_etablissement} onChange={update('nom_etablissement')} />
        </div>
      </div>
      <div className="sk-form__row">
        <div className="sk-form__field">
          <label className="sk-form__label">{t('landing.form.nbEstablishments')}</label>
          <select className="sk-form__input" value={form.nb_etablissements} onChange={update('nb_etablissements')}>
            <option value="1">{t('landing.form.nb1')}</option>
            <option value="2">{t('landing.form.nb2')}</option>
            <option value="3">{t('landing.form.nb3')}</option>
            <option value="10">{t('landing.form.nb10')}</option>
            <option value="20">{t('landing.form.nb20')}</option>
          </select>
        </div>
      </div>
      <div className="sk-form__field">
        <label className="sk-form__label">{t('landing.form.message')}</label>
        <textarea className="sk-form__input sk-form__textarea" placeholder={t('landing.form.messagePlaceholder')} value={form.message} onChange={update('message')} rows={3} />
      </div>
      {/* Honeypot — hidden from humans */}
      <input type="text" name="website" value={form.website} onChange={update('website')} style={{ position: 'absolute', left: '-9999px', tabIndex: -1 }} autoComplete="off" />
      <button className="sk-form__submit" type="submit" disabled={sending}>
        {sending ? t('landing.form.submitting') : t('landing.form.submit')}
      </button>
    </form>
  )
}

/* ════════════════════════════════════════════════════════════════
 * Landing Page Component
 * ════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const { t } = useTranslation()
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
            <a className="sk-nav__link" href="#features" onClick={e => { e.preventDefault(); scrollTo('features') }}>{t('landing.nav.features')}</a>
            <a className="sk-nav__link" href="#multi" onClick={e => { e.preventDefault(); scrollTo('multi') }}>{t('landing.nav.multi')}</a>
            <a className="sk-nav__link" href="#contact" onClick={e => { e.preventDefault(); scrollTo('contact') }}>{t('landing.nav.contact')}</a>
            <a className="sk-nav__cta" href="/login">{t('landing.nav.login')}</a>
            <LanguageSwitcher variant="light" />
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
            {t('landing.hero.eyebrow')}
          </div>
          <h1 className="sk-hero__title">
            {t('landing.hero.titlePre')}<em>{t('landing.hero.titleEm')}</em>
          </h1>
          <p className="sk-hero__subtitle">
            {t('landing.hero.subtitle')}
          </p>
          <div className="sk-hero__actions">
            <a className="sk-btn-primary" href="#contact" onClick={e => { e.preventDefault(); scrollTo('contact') }}>
              {t('landing.hero.demo')}
            </a>
            <a className="sk-btn-ghost" href="#features" onClick={e => { e.preventDefault(); scrollTo('features') }}>
              {t('landing.hero.discover')}
            </a>
          </div>
          <div className="sk-hero__stats">
            {STATS.map(({ icon, key }) => (
              <div key={key} className="sk-hero__stat">
                <div className="sk-hero__stat-icon">{icon}</div>
                {t(`landing.stats.${key}`)}
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
            <div className="sk-section__eyebrow">{t('landing.fiches.eyebrow')}</div>
            <h2 className="sk-section__title">{t('landing.fiches.title')}</h2>
            <p className="sk-section__desc">
              {t('landing.fiches.desc')}
            </p>
          </Reveal>
          <div className="sk-features">
            {FEATURES_FICHES.map(({ icon, key }, i) => (
              <Reveal key={key} delay={i + 1}>
                <div className="sk-feature">
                  <div className="sk-feature__icon">{icon}</div>
                  <div className="sk-feature__title">{t(`landing.fiches.${key}Title`)}</div>
                  <div className="sk-feature__desc">{t(`landing.fiches.${key}Desc`)}</div>
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
            <div className="sk-section__eyebrow">{t('landing.multi.eyebrow')}</div>
            <h2 className="sk-section__title">{t('landing.multi.title')}</h2>
            <p className="sk-section__desc">
              {t('landing.multi.desc')}
            </p>
          </Reveal>
          <div className="sk-features">
            {FEATURES_MULTI.map(({ icon, key }, i) => (
              <Reveal key={key} delay={i + 1}>
                <div className="sk-feature">
                  <div className="sk-feature__icon">{icon}</div>
                  <div className="sk-feature__title">{t(`landing.multi.${key}Title`)}</div>
                  <div className="sk-feature__desc">{t(`landing.multi.${key}Desc`)}</div>
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
            <h2 className="sk-cta__title">{t('landing.cta.title')}</h2>
            <p className="sk-cta__desc">
              {t('landing.cta.desc')}
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
              {t('landing.footer.brandDesc')}
            </p>
          </div>
          <div>
            <div className="sk-footer__col-title">{t('landing.footer.product')}</div>
            <a className="sk-footer__link" href="#features" onClick={e => { e.preventDefault(); scrollTo('features') }}>{t('landing.footer.features')}</a>
            <a className="sk-footer__link" href="#features" onClick={e => { e.preventDefault(); scrollTo('features') }}>{t('landing.footer.foodCost')}</a>
            <a className="sk-footer__link" href="#multi" onClick={e => { e.preventDefault(); scrollTo('multi') }}>{t('landing.footer.multiSite')}</a>
          </div>
          <div>
            <div className="sk-footer__col-title">{t('landing.footer.legal')}</div>
            <a className="sk-footer__link" href="/cgu">{t('landing.footer.cgu')}</a>
            <a className="sk-footer__link" href="/mentions-legales">{t('landing.footer.legalNotice')}</a>
            <a className="sk-footer__link" href="/politique-confidentialite">{t('landing.footer.privacy')}</a>
          </div>
          <div>
            <div className="sk-footer__col-title">{t('landing.footer.contact')}</div>
            <a className="sk-footer__link" href="mailto:contact@skalcook.fr">contact@skalcook.fr</a>
            <a className="sk-footer__link" href="#contact" onClick={e => { e.preventDefault(); scrollTo('contact') }}>{t('landing.footer.demo')}</a>
          </div>
        </div>
        <div className="sk-footer__bottom">
          © {new Date().getFullYear()} Skalcook — {t('landing.footer.rights')}
        </div>
      </footer>
    </div>
  )
}
