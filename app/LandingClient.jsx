'use client'

import { useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useRouter } from 'next/navigation'

const SUPABASE_URL = 'https://uvmslpdcywephdneciwd.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bXNscGRjeXdlcGhkbmVjaXdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0MjM1MDAsImV4cCI6MjA4ODk5OTUwMH0._ufIYbefc70TQOe8vSh22ljk2mEbAcWXzirbib8S7EE'

function safeSetText(el, text) {
  if (!el) return
  el.textContent = text
}

export default function LandingClient({ markup }) {
  const html = useMemo(() => markup || '', [markup])
  const router = useRouter()

  useEffect(() => {
    // "lang toggle" (inline onclick="setLang('fr')")
    const setLang = (lang) => {
      const upper = String(lang || '').toUpperCase()
      document.querySelectorAll('.lang-btn').forEach((b) => {
        const label = (b.textContent || '').trim()
        b.classList.toggle('active', label === upper)
      })
      document.documentElement.lang = lang
    }

    // "contact form" (inline onclick="submitForm()")
    const submitForm = async () => {
      const nomInput = document.getElementById('fNom')
      const emailInput = document.getElementById('fEmail')
      const errEl = document.getElementById('formError')
      const btn = document.getElementById('formSubmit')
      const txt = document.getElementById('submitText')

      const nom = (nomInput?.value || '').trim()
      const email = (emailInput?.value || '').trim()

      if (errEl) errEl.style.display = 'none'
      if (!nom || !email) {
        safeSetText(errEl, 'Veuillez remplir les champs obligatoires.')
        if (errEl) errEl.style.display = 'block'
        return
      }

      if (btn) btn.disabled = true
      if (txt) txt.textContent = '...'

      try {
        const res = await fetch(SUPABASE_URL + '/rest/v1/prospects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            nom,
            email,
            telephone: document.getElementById('fTel')?.value.trim() || null,
            nb_etablissements: parseInt(document.getElementById('fNbEtab')?.value, 10) || 1,
            nom_etablissement: document.getElementById('fEtab')?.value.trim() || null,
            message: document.getElementById('fMessage')?.value.trim() || null,
            langue: document.documentElement.lang || 'fr',
            statut: 'nouveau',
          }),
        })

        if (!res.ok) throw new Error('Bad response')

        // UI success
        const formContent = document.getElementById('formContent')
        const formSuccess = document.getElementById('formSuccess')
        if (formContent) formContent.style.display = 'none'
        if (formSuccess) formSuccess.style.display = 'block'
      } catch (e) {
        safeSetText(errEl, 'Erreur lors de l’envoi. Réessayez.')
        if (errEl) errEl.style.display = 'block'
      } finally {
        if (btn) btn.disabled = false
        if (txt) txt.textContent = 'Envoyer ma demande'
      }
    }

    // Register globals used by inline handlers
    window.setLang = setLang
    window.submitForm = submitForm

    // Animation reveal (IntersectionObserver)
    const obs = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('visible')
        }),
      { threshold: 0.1 },
    )
    document.querySelectorAll('.fade-up').forEach((el) => obs.observe(el))

    // Emulate <Link>: route client-side for internal absolute URLs.
    const onDocClick = (e) => {
      const target = e.target
      const a = target instanceof Element ? target.closest('a') : null
      if (!a) return
      const href = a.getAttribute('href') || ''
      if (!href.startsWith('/') || href.startsWith('#')) return
      // Let browser handle things like mailto:, external links, etc.
      if (href === '/favicon.ico') return
      e.preventDefault()
      router.push(href)
    }
    document.addEventListener('click', onDocClick)

    // If user is already logged-in, swap landing CTA to dashboard.
    const swapLandingCta = async () => {
      const SUPERADMIN_EMAILS = ['antony.despaux@hotmail.fr', 'antony@skalcook.com']
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const user = sessionData?.session?.user
        if (!user) return

        const email = (user.email || '').toLowerCase().trim()
        let target = '/choix'

        if (SUPERADMIN_EMAILS.includes(email)) {
          target = '/superadmin'
        } else {
          try {
            const { data: profil } = await supabase
              .from('profils')
              .select('role')
              .eq('id', user.id)
              .maybeSingle()

            if (profil?.role === 'cuisine') target = '/dashboard'
            else if (profil?.role === 'bar') target = '/bar/dashboard'
          } catch {
            // Keep fallback /choix if RLS blocks profiles query
          }
        }

        const setLink = (selector, value) => {
          const el = document.querySelector(selector)
          if (!el) return
          if (el.tagName === 'A') el.setAttribute('href', target)
          else if (el.parentElement && el.parentElement.tagName === 'A') el.parentElement.setAttribute('href', target)
          if (value) el.textContent = value
        }

        // nav: <a class="nav-cta" data-i18n="nav_cta">Se connecter</a>
        setLink('a[data-i18n="nav_cta"]', 'Aller au Dashboard')
        // cta: <span data-i18n="cta_login">Déjà client ? Se connecter</span> (wrapped in an <a>)
        setLink('span[data-i18n="cta_login"]', 'Aller au Dashboard')
        // footer: <a class="footer-link" data-i18n="footer_login">Se connecter</a>
        setLink('a[data-i18n="footer_login"]', 'Aller au Dashboard')
      } catch {
        // no-op
      }
    }
    swapLandingCta()

    return () => {
      window.setLang = undefined
      window.submitForm = undefined
      obs.disconnect()
      document.removeEventListener('click', onDocClick)
    }
  }, [])

  return <div dangerouslySetInnerHTML={{ __html: html }} />
}

