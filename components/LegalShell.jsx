'use client'
import Link from 'next/link'
import { Logo } from '../lib/theme.jsx'

/**
 * LegalShell — habillage des pages annexes de la landing (mentions légales,
 * CGU, politique de confidentialité) pour qu'elles partagent l'identité
 * visuelle de la landing : même nav, même typo (Outfit), même footer.
 *
 * Le contenu (sections <h2>/<p>/<ul>) est passé en `children` et stylé via
 * les classes `.sk-legal*` définies dans app/landing.css.
 */
export default function LegalShell({ eyebrow, title, updated, children }) {
  const year = new Date().getFullYear()

  return (
    <div className="sk-landing">
      {/* ─── Nav (identique à la landing) ─── */}
      <nav className="sk-nav">
        <div className="sk-nav__inner">
          <Link href="/" aria-label="Accueil Skalcook" style={{ display: 'inline-flex', lineHeight: 0 }}>
            <Logo height={32} couleur="#6366F1" />
          </Link>
          <div className="sk-nav__links">
            <Link className="sk-nav__link" href="/#features">Fonctionnalités</Link>
            <Link className="sk-nav__link" href="/#multi">Multi-sites</Link>
            <Link className="sk-nav__link" href="/#contact">Contact</Link>
            <Link className="sk-nav__cta" href="/">← Retour au site</Link>
          </div>
        </div>
      </nav>

      {/* ─── Header façon hero ─── */}
      <header className="sk-legal-header">
        <div className="sk-legal-header__inner">
          {eyebrow && <div className="sk-section__eyebrow">{eyebrow}</div>}
          <h1 className="sk-legal-title">{title}</h1>
          {updated && <div className="sk-legal-meta">{updated}</div>}
        </div>
      </header>

      {/* ─── Contenu ─── */}
      <article className="sk-legal">{children}</article>

      {/* ─── Footer (identique à la landing) ─── */}
      <footer className="sk-footer">
        <div className="sk-footer__inner">
          <div className="sk-footer__brand">
            <Logo height={28} couleur="#6366F1" />
            <p className="sk-footer__brand-desc">
              La gestion des fiches techniques et du food cost, pensée pour les restaurateurs.
            </p>
          </div>
          <div>
            <div className="sk-footer__col-title">Produit</div>
            <Link className="sk-footer__link" href="/#features">Fonctionnalités</Link>
            <Link className="sk-footer__link" href="/#multi">Multi-sites</Link>
            <Link className="sk-footer__link" href="/login">Se connecter</Link>
          </div>
          <div>
            <div className="sk-footer__col-title">Légal</div>
            <Link className="sk-footer__link" href="/cgu">CGU</Link>
            <Link className="sk-footer__link" href="/mentions-legales">Mentions légales</Link>
            <Link className="sk-footer__link" href="/politique-confidentialite">Confidentialité</Link>
          </div>
          <div>
            <div className="sk-footer__col-title">Contact</div>
            <a className="sk-footer__link" href="mailto:contact@skalcook.fr">contact@skalcook.fr</a>
          </div>
        </div>
        <div className="sk-footer__bottom">
          © {year} Skalcook — Tous droits réservés.
        </div>
      </footer>
    </div>
  )
}
