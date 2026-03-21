'use client'
import { useState } from 'react'
import { supabase, getClientId } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../../lib/theme.jsx'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'

export default function NouvelAvisPage() {
  const [form, setForm] = useState({
    reviewer_name: '',
    platform: 'Google',
    stars: 5,
    review_text: '',
    section: 'cuisine',
    sentiment: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

const handleSubmit = async () => {
  if (!form.review_text) { setError('Le texte de l\'avis est obligatoire'); return }
  setLoading(true)
  setError('')

  const clientId = await getClientId()
  if (!clientId) { setError('Erreur : session expirée'); setLoading(false); return }

  const sentiment = form.sentiment || (form.stars >= 4 ? 'pos' : form.stars <= 2 ? 'neg' : 'mix')

  const { error: errInsert } = await supabase.from('avis').insert([{
    ...form, sentiment, client_id: clientId
  }])

  if (errInsert) { setError('Erreur : ' + errInsert.message); setLoading(false); return }

  router.push(form.section === 'bar' ? '/bar/avis' : '/avis')
}

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

      <div style={{
        background: c.principal, borderBottom: `0.5px solid ${c.accent}40`,
        padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
        position: 'sticky', top: 0, zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Logo height={28} couleur="white" onClick={() => router.push('/dashboard')} />
          <button onClick={() => router.back()} style={{
            background: 'transparent', border: '0.5px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '6px 10px', fontSize: '13px', cursor: 'pointer', color: 'rgba(255,255,255,0.7)'
          }}>← Retour</button>
          {!isMobile && <span style={{ fontSize: '14px', fontWeight: '500', color: 'white' }}>Nouvel avis client</span>}
        </div>
        <button onClick={handleSubmit} disabled={loading} style={{
          background: loading ? c.texteMuted : c.accent, color: c.principal, border: 'none',
          borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer'
        }}>
          {loading ? '...' : 'Enregistrer'}
        </button>
      </div>

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '700px', margin: '0 auto' }}>

        {error && <div style={{ background: '#FCEBEB', color: '#A32D2D', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}

        {/* Établissement */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>Établissement</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {[
              { key: 'cuisine', label: '🍽️ Cuisine', color: c.principal, accent: c.accent },
              { key: 'bar', label: '🍸 Bar', color: '#3C3489', accent: '#C4956A' },
            ].map(opt => (
              <div key={opt.key} onClick={() => set('section', opt.key)} style={{
                padding: '16px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center',
                border: `2px solid ${form.section === opt.key ? opt.color : c.bordure}`,
                background: form.section === opt.key ? `${opt.color}10` : c.blanc,
                fontWeight: form.section === opt.key ? '600' : '400',
                color: form.section === opt.key ? opt.color : c.texteMuted,
                fontSize: '14px'
              }}>{opt.label}</div>
            ))}
          </div>
        </div>

        {/* Informations */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>Informations</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Nom du client</label>
              <input type="text" value={form.reviewer_name} onChange={e => set('reviewer_name', e.target.value)}
                placeholder="Ex : Marie L."
                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', color: c.texte, background: c.blanc }}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Plateforme</label>
                <select value={form.platform} onChange={e => set('platform', e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}>
                  {['Google', 'TripAdvisor', 'Yelp', 'TheFork', 'Autre'].map(p => <option key={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: c.texteMuted, fontWeight: '500', display: 'block', marginBottom: '6px' }}>Note</label>
                <select value={form.stars} onChange={e => set('stars', parseInt(e.target.value))} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte }}>
                  {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{'★'.repeat(n)} {n}/5</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Texte de l'avis */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}`, marginBottom: '12px' }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>Texte de l'avis *</div>
          <textarea value={form.review_text} onChange={e => set('review_text', e.target.value)}
            placeholder="Collez ici l'avis du client (dans n'importe quelle langue — la réponse sera générée dans la même langue)..."
            rows={6}
            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', outline: 'none', resize: 'vertical', fontFamily: 'inherit', color: c.texte, background: c.blanc, lineHeight: '1.6' }}
          />
          <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '6px' }}>
            La réponse IA sera générée automatiquement dans la langue de l'avis
          </div>
        </div>

        {/* Sentiment manuel optionnel */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: isMobile ? '16px' : '24px', border: `0.5px solid ${c.bordure}` }}>
          <div style={{ fontSize: '13px', fontWeight: '500', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px' }}>Sentiment <span style={{ fontWeight: '400', textTransform: 'none', fontSize: '11px' }}>(optionnel — calculé automatiquement si vide)</span></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            {[
              { key: 'pos', label: '😊 Positif', bg: '#EAF3DE', color: '#3B6D11', border: '#4A7B6F' },
              { key: 'mix', label: '😐 Mitigé', bg: '#FAEEDA', color: '#854F0B', border: '#FAC775' },
              { key: 'neg', label: '😞 Négatif', bg: '#FCEBEB', color: '#A32D2D', border: '#F09595' },
            ].map(opt => (
              <div key={opt.key} onClick={() => set('sentiment', form.sentiment === opt.key ? '' : opt.key)} style={{
                padding: '12px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
                border: `0.5px solid ${form.sentiment === opt.key ? opt.border : c.bordure}`,
                background: form.sentiment === opt.key ? opt.bg : c.blanc,
                color: form.sentiment === opt.key ? opt.color : c.texteMuted,
                fontSize: '13px', fontWeight: form.sentiment === opt.key ? '500' : '400'
              }}>{opt.label}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
