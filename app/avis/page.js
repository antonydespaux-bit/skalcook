'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme, Logo } from '../../lib/theme.jsx'
import { useIsMobile } from '../../lib/useIsMobile'
import { useTheme } from '../../lib/useTheme'
import { useRole } from '../../lib/useRole'
import Navbar from '../../components/Navbar'
import ChefLoader from '../../components/ChefLoader'

export default function AvisPage() {
  const [avis, setAvis] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtreSentiment, setFiltreSentiment] = useState('tous')
  const [filtrePlateforme, setFiltrePlateforme] = useState('toutes')
  const [generatingId, setGeneratingId] = useState(null)
  const [copied, setCopied] = useState(null)
  const [activeTab, setActiveTab] = useState('dashboard')
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()
  const { role } = useRole()

  useEffect(() => {
    checkUser()
    loadAvis()
  }, [])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

  const loadAvis = async () => {
    const { data } = await supabase
      .from('avis')
      .select('*')
      .eq('section', 'cuisine')
      .eq('archive', false)
      .order('created_at', { ascending: false })
    setAvis(data || [])
    setLoading(false)
  }


  const genererReponse = async (unAvis) => {
    setGeneratingId(unAvis.id)
    try {
      const res = await fetch('/api/avis-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewText: unAvis.review_text,
          stars: unAvis.stars,
          section: 'cuisine'
        })
      })
      const data = await res.json()
      if (data.response) {
        await supabase.from('avis').update({ ai_response: data.response }).eq('id', unAvis.id)
        setAvis(prev => prev.map(a => a.id === unAvis.id ? { ...a, ai_response: data.response } : a))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setGeneratingId(null)
    }
  }

  const copier = (id, text) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  const avisFilters = avis.filter(a => {
    const matchSentiment = filtreSentiment === 'tous' || a.sentiment === filtreSentiment
    const matchPlateforme = filtrePlateforme === 'toutes' || a.platform === filtrePlateforme
    return matchSentiment && matchPlateforme
  })

  // Stats
  const stats = {
    total: avis.length,
    avg: avis.length ? (avis.reduce((s, a) => s + (a.stars || 0), 0) / avis.length).toFixed(1) : '—',
    positifs: avis.filter(a => a.sentiment === 'pos').length,
    negatifs: avis.filter(a => a.sentiment === 'neg').length,
    mitigés: avis.filter(a => a.sentiment === 'mix').length,
    sansReponse: avis.filter(a => !a.ai_response).length,
    avecReponse: avis.filter(a => a.ai_response).length,
  }

  // Stats par plateforme
  const plateformes = ['Google', 'TripAdvisor', 'Yelp', 'TheFork', 'Autre']
  const statsByPlatform = plateformes.map(p => ({
    name: p,
    count: avis.filter(a => a.platform === p).length,
    avg: avis.filter(a => a.platform === p).length
      ? (avis.filter(a => a.platform === p).reduce((s, a) => s + (a.stars || 0), 0) / avis.filter(a => a.platform === p).length).toFixed(1)
      : null
  })).filter(p => p.count > 0)

  // Mots clés négatifs
  const motsFrequents = () => {
    const avisNegatifs = avis.filter(a => a.sentiment === 'neg').map(a => a.review_text).join(' ')
    const stopwords = ['le', 'la', 'les', 'de', 'du', 'des', 'un', 'une', 'et', 'en', 'au', 'aux', 'je', 'il', 'elle', 'nous', 'vous', 'ils', 'que', 'qui', 'pas', 'ne', 'ce', 'se', 'sur', 'par', 'pour', 'the', 'a', 'an', 'is', 'was', 'we', 'i', 'to', 'of', 'and', 'in', 'it', 'but', 'not', 'this', 'that', 'with', 'very', 'my', 'our']
    const mots = avisNegatifs.toLowerCase().replace(/[^a-zàâäéèêëîïôùûüç\s]/g, '').split(/\s+/)
      .filter(m => m.length > 3 && !stopwords.includes(m))
    const freq = {}
    mots.forEach(m => { freq[m] = (freq[m] || 0) + 1 })
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12)
  }

  const dernierAvis = avis.slice(0, 5)
  const maxPlatform = Math.max(...statsByPlatform.map(p => p.count), 1)

  const sentimentStyle = (sentiment) => {
    if (sentiment === 'pos') return { bg: '#EAF3DE', color: '#3B6D11', label: 'Positif', emoji: '😊' }
    if (sentiment === 'neg') return { bg: '#FCEBEB', color: '#A32D2D', label: 'Négatif', emoji: '😞' }
    return { bg: '#FAEEDA', color: '#854F0B', label: 'Mitigé', emoji: '😐' }
  }

  const platformEmoji = { Google: '🔵', TripAdvisor: '🟠', Yelp: '🔴', TheFork: '🟢', Autre: '⚪' }
  const peutModifier = role === 'admin' || role === 'cuisine'


  const AvisCard = ({ unAvis, compact = false }) => {
    const s = sentimentStyle(unAvis.sentiment)
    return (
      <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, padding: compact ? '14px 16px' : '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
              <span style={{ fontSize: '14px', fontWeight: '500', color: c.texte }}>{unAvis.reviewer_name || 'Anonyme'}</span>
              <span style={{ fontSize: '11px', color: c.texteMuted }}>{platformEmoji[unAvis.platform]} {unAvis.platform}</span>
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ color: '#F5A623', fontSize: '13px' }}>{'★'.repeat(unAvis.stars || 0)}{'☆'.repeat(5 - (unAvis.stars || 0))}</span>
              {unAvis.sentiment && (
                <span style={{ background: s.bg, color: s.color, borderRadius: '20px', padding: '1px 8px', fontSize: '10px', fontWeight: '500' }}>{s.emoji} {s.label}</span>
              )}
            </div>
          </div>
          <span style={{ fontSize: '11px', color: c.texteMuted }}>{new Date(unAvis.created_at).toLocaleDateString('fr-FR')}</span>
        </div>

        <div style={{ background: c.fond, borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
          <p style={{ fontSize: '13px', color: c.texteMuted, fontStyle: 'italic', lineHeight: '1.6', margin: 0 }}>"{unAvis.review_text}"</p>
        </div>

        <div style={{ background: unAvis.ai_response ? c.accentClair : c.fond, borderRadius: '8px', padding: '12px', border: `0.5px solid ${unAvis.ai_response ? c.accent + '60' : c.bordure}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: unAvis.ai_response ? '8px' : '0' }}>
            <span style={{ fontSize: '10px', fontWeight: '600', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Réponse IA</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {unAvis.ai_response && (
                <button onClick={() => copier(unAvis.id, unAvis.ai_response)} style={{
                  padding: '3px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
                  background: copied === unAvis.id ? '#EAF3DE' : c.blanc,
                  color: copied === unAvis.id ? '#3B6D11' : c.texte,
                  border: `0.5px solid ${c.bordure}`
                }}>{copied === unAvis.id ? '✓ Copié' : 'Copier'}</button>
              )}
              <button onClick={() => genererReponse(unAvis)} disabled={generatingId === unAvis.id} style={{
                padding: '3px 10px', borderRadius: '6px', fontSize: '11px', cursor: generatingId === unAvis.id ? 'not-allowed' : 'pointer',
                background: generatingId === unAvis.id ? c.texteMuted : c.principal,
                color: c.accent, border: 'none', fontWeight: '500'
              }}>{generatingId === unAvis.id ? '⏳ Génération...' : unAvis.ai_response ? 'Régénérer' : '✨ Générer'}</button>
            </div>
          </div>
          {unAvis.ai_response
            ? <p style={{ fontSize: '13px', color: c.texte, lineHeight: '1.6', margin: 0 }}>{unAvis.ai_response}</p>
            : <p style={{ fontSize: '12px', color: c.texteMuted, fontStyle: 'italic', margin: 0 }}>Cliquez sur "Générer" pour obtenir une réponse personnalisée dans la langue de l'avis.</p>
          }
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>

      {/* Navbar */}
      <Navbar section="cuisine" />

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '1000px', margin: '0 auto' }}>

        {/* Titre + onglets */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ fontSize: '11px', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '500' }}>
            Avis clients — Cuisine
          </div>
          <div style={{ display: 'flex', gap: '4px', background: c.blanc, borderRadius: '10px', padding: '4px', border: `0.5px solid ${c.bordure}` }}>
            {[
              { key: 'dashboard', label: '📊 Dashboard' },
              { key: 'avis', label: '💬 Tous les avis' },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                padding: '6px 14px', borderRadius: '7px', fontSize: '12px', cursor: 'pointer', fontWeight: activeTab === tab.key ? '600' : '400',
                background: activeTab === tab.key ? c.principal : 'transparent',
                color: activeTab === tab.key ? 'white' : c.texteMuted,
                border: 'none'
              }}>{tab.label}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <ChefLoader />
        ) : activeTab === 'dashboard' ? (
          <>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: isMobile ? '10px' : '16px', marginBottom: '20px' }}>
              {[
                { label: 'Note moyenne', value: `${stats.avg} ★`, bg: c.blanc, sub: `Sur ${stats.total} avis` },
                { label: 'Avis positifs', value: `${stats.positifs}`, bg: '#EAF3DE', sub: stats.total ? `${Math.round(stats.positifs / stats.total * 100)}%` : '0%' },
                { label: 'Avis négatifs', value: `${stats.negatifs}`, bg: stats.negatifs > 0 ? '#FCEBEB' : c.blanc, sub: stats.total ? `${Math.round(stats.negatifs / stats.total * 100)}%` : '0%' },
                { label: 'Sans réponse', value: `${stats.sansReponse}`, bg: stats.sansReponse > 0 ? '#FAEEDA' : c.blanc, sub: `${stats.avecReponse} répondus` },
              ].map((stat, i) => (
                <div key={i} style={{ background: stat.bg, borderRadius: '12px', padding: isMobile ? '14px' : '20px', border: `0.5px solid ${c.bordure}` }}>
                  <div style={{ fontSize: '11px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', marginBottom: '8px' }}>{stat.label}</div>
                  <div style={{ fontSize: isMobile ? '28px' : '36px', fontWeight: '500', color: c.texte }}>{stat.value}</div>
                  <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '4px' }}>{stat.sub}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '20px' }}>

              {/* Répartition sentiments */}
              <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, padding: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: '500', color: c.texte, marginBottom: '16px' }}>😊 Répartition des sentiments</div>
                {stats.total === 0 ? (
                  <div style={{ textAlign: 'center', color: c.texteMuted, fontSize: '13px', padding: '20px 0' }}>Aucun avis</div>
                ) : (
                  <>
                    {[
                      { key: 'pos', label: 'Positifs', count: stats.positifs, bg: '#EAF3DE', color: '#3B6D11', bar: '#4A7B6F' },
                      { key: 'mix', label: 'Mitigés', count: stats.mitigés, bg: '#FAEEDA', color: '#854F0B', bar: '#FAC775' },
                      { key: 'neg', label: 'Négatifs', count: stats.negatifs, bg: '#FCEBEB', color: '#A32D2D', bar: '#E24B4A' },
                    ].map(s => (
                      <div key={s.key} style={{ marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '12px', color: c.texte, fontWeight: '500' }}>{s.label}</span>
                          <span style={{ fontSize: '12px', color: c.texteMuted }}>{s.count} ({stats.total ? Math.round(s.count / stats.total * 100) : 0}%)</span>
                        </div>
                        <div style={{ background: c.fond, borderRadius: '20px', height: '8px', overflow: 'hidden' }}>
                          <div style={{ background: s.bar, height: '100%', borderRadius: '20px', width: `${stats.total ? (s.count / stats.total * 100) : 0}%`, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>

              {/* Stats par plateforme */}
              <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, padding: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: '500', color: c.texte, marginBottom: '16px' }}>🌐 Avis par plateforme</div>
                {statsByPlatform.length === 0 ? (
                  <div style={{ textAlign: 'center', color: c.texteMuted, fontSize: '13px', padding: '20px 0' }}>Aucun avis</div>
                ) : statsByPlatform.map(p => (
                  <div key={p.name} style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', color: c.texte, fontWeight: '500' }}>{platformEmoji[p.name]} {p.name}</span>
                      <span style={{ fontSize: '12px', color: c.texteMuted }}>{p.count} avis · {p.avg}★</span>
                    </div>
                    <div style={{ background: c.fond, borderRadius: '20px', height: '8px', overflow: 'hidden' }}>
                      <div style={{ background: c.accent, height: '100%', borderRadius: '20px', width: `${(p.count / maxPlatform) * 100}%`, transition: 'width 0.5s ease' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mots clés négatifs */}
            {stats.negatifs > 0 && (
              <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, padding: '20px', marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: '500', color: c.texte, marginBottom: '14px' }}>🔍 Mots clés dans les avis négatifs</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {motsFrequents().map(([mot, freq]) => (
                    <span key={mot} style={{
                      background: '#FCEBEB', color: '#A32D2D', borderRadius: '20px',
                      padding: '4px 12px', fontSize: '12px', fontWeight: '500',
                      border: '0.5px solid #F09595'
                    }}>{mot} <span style={{ opacity: 0.6, fontSize: '10px' }}>×{freq}</span></span>
                  ))}
                  {motsFrequents().length === 0 && <span style={{ fontSize: '13px', color: c.texteMuted, fontStyle: 'italic' }}>Pas assez d'avis négatifs pour analyser</span>}
                </div>
              </div>
            )}

            {/* 5 derniers avis */}
            <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden', marginBottom: '8px' }}>
              <div style={{ padding: '16px 20px', borderBottom: `0.5px solid ${c.bordure}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '13px', fontWeight: '500', color: c.texte }}>🕐 5 derniers avis</div>
                <button onClick={() => setActiveTab('avis')} style={{ fontSize: '12px', color: c.accent, background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: '500' }}>
                  Voir tous →
                </button>
              </div>
              {dernierAvis.length === 0 ? (
                <div style={{ padding: '30px', textAlign: 'center', color: c.texteMuted, fontSize: '13px' }}>
                  Aucun avis pour le moment —{' '}
                  <span onClick={() => router.push('/avis/nouveau')} style={{ color: c.accent, cursor: 'pointer', fontWeight: '500' }}>Ajouter le premier</span>
                </div>
              ) : (
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {dernierAvis.map(unAvis => <AvisCard key={unAvis.id} unAvis={unAvis} compact />)}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Onglet tous les avis */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              {[
                { key: 'tous', label: 'Tous' },
                { key: 'pos', label: '😊 Positifs' },
                { key: 'neg', label: '😞 Négatifs' },
                { key: 'mix', label: '😐 Mitigés' },
              ].map(f => (
                <button key={f.key} onClick={() => setFiltreSentiment(f.key)} style={{
                  padding: '7px 14px', borderRadius: '20px', fontSize: '12px', cursor: 'pointer',
                  fontWeight: filtreSentiment === f.key ? '600' : '400',
                  background: filtreSentiment === f.key ? c.principal : c.blanc,
                  color: filtreSentiment === f.key ? 'white' : c.texte,
                  border: `0.5px solid ${filtreSentiment === f.key ? c.principal : c.bordure}`
                }}>{f.label}</button>
              ))}
              <select value={filtrePlateforme} onChange={e => setFiltrePlateforme(e.target.value)} style={{
                padding: '7px 12px', borderRadius: '20px', border: `0.5px solid ${c.bordure}`,
                fontSize: '12px', background: c.blanc, outline: 'none', color: c.texte, cursor: 'pointer'
              }}>
                <option value="toutes">Toutes les plateformes</option>
                {['Google', 'TripAdvisor', 'Yelp', 'TheFork', 'Autre'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <span style={{ fontSize: '12px', color: c.texteMuted, alignSelf: 'center' }}>{avisFilters.length} avis</span>
            </div>

            {avisFilters.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px', background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}` }}>
                <div style={{ fontSize: '14px', color: c.texteMuted, marginBottom: '16px' }}>
                  {avis.length === 0 ? 'Aucun avis pour le moment' : 'Aucun avis pour ces filtres'}
                </div>
                {avis.length === 0 && peutModifier && (
                  <button onClick={() => router.push('/avis/nouveau')} style={{
                    background: c.accent, color: c.principal, border: 'none',
                    borderRadius: '8px', padding: '10px 20px', fontSize: '13px', cursor: 'pointer', fontWeight: '600'
                  }}>Ajouter le premier avis</button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {avisFilters.map(unAvis => <AvisCard key={unAvis.id} unAvis={unAvis} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
