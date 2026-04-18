'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getClientId } from '../../../lib/supabase'
import { useTheme } from '../../../lib/useTheme'
import { useRole } from '../../../lib/useRole'
import { useIsMobile } from '../../../lib/useIsMobile'
import Navbar from '../../../components/Navbar'
import { Card, Button, Badge, Alert } from '../../../components/ui'
import { clientDisplayName, hexToRgba, formatDateFr } from '../../../lib/crmConstants'

export default function CrmClientsPage() {
  const router = useRouter()
  const { c } = useTheme()
  const { role, loading: roleLoading } = useRole()
  const isMobile = useIsMobile()

  const [authReady, setAuthReady] = useState(false)
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [recherche, setRecherche] = useState('')
  const [filtreType, setFiltreType] = useState('tous')
  const [filtreTag, setFiltreTag] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) { router.replace('/'); return }
      setAuthReady(true)
    })()
    return () => { cancelled = true }
  }, [router])

  useEffect(() => {
    if (!roleLoading && role && !['admin', 'directeur'].includes(role)) {
      router.replace('/dashboard')
    }
  }, [role, roleLoading, router])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const cid = await getClientId()
    if (!cid) { setLoading(false); return }

    const { data, error: err } = await supabase
      .from('crm_clients')
      .select('id, type, nom, prenom, raison_sociale, email, telephone, ville, tags, created_at')
      .eq('client_id', cid)
      .order('created_at', { ascending: false })

    if (err) { setError(err.message); setLoading(false); return }
    setClients(data || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!authReady || !['admin', 'directeur'].includes(role || '')) return
    load()
  }, [authReady, role, load])

  const tagsDispo = useMemo(() => {
    const set = new Set()
    for (const c of clients) (c.tags || []).forEach((t) => set.add(t))
    return Array.from(set).sort()
  }, [clients])

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase()
    return clients.filter((cl) => {
      if (filtreType !== 'tous' && cl.type !== filtreType) return false
      if (filtreTag && !(cl.tags || []).includes(filtreTag)) return false
      if (!q) return true
      const hay = [clientDisplayName(cl), cl.email, cl.telephone, cl.ville, cl.raison_sociale].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [clients, recherche, filtreType, filtreTag])

  if (!authReady || roleLoading) {
    return (
      <div style={{ minHeight: '100vh', background: c.fond, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.texteMuted, fontSize: 14 }}>
        Chargement…
      </div>
    )
  }

  return (
    <div style={{ background: c.fond, minHeight: '100vh' }}>
      <Navbar section="cuisine" />
      <div className="crm-page">
        <div className="crm-header">
          <div className="crm-header__text">
            <h1 className="crm-header__title" style={{ color: c.texte }}>Clients</h1>
            <p className="crm-header__subtitle" style={{ color: c.texteMuted }}>
              {clients.length} {clients.length > 1 ? 'clients' : 'client'} enregistré{clients.length > 1 ? 's' : ''}
            </p>
          </div>
          <div className="crm-actions">
            <Button c={c} onClick={() => router.push('/crm/clients/nouveau')}>+ Nouveau client</Button>
          </div>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        <div className="crm-toolbar">
          <input
            type="text"
            placeholder="Rechercher un client…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            className="crm-toolbar__search"
            style={{ background: c.blanc, border: `0.5px solid ${c.bordure}`, color: c.texte }}
          />
          <select
            value={filtreType}
            onChange={(e) => setFiltreType(e.target.value)}
            className="sk-select"
            style={{ background: c.blanc, border: `0.5px solid ${c.bordure}`, color: c.texte }}
          >
            <option value="tous">Tous les types</option>
            <option value="particulier">Particuliers</option>
            <option value="entreprise">Entreprises</option>
          </select>
          {tagsDispo.length > 0 && (
            <select
              value={filtreTag}
              onChange={(e) => setFiltreTag(e.target.value)}
              className="sk-select"
              style={{ background: c.blanc, border: `0.5px solid ${c.bordure}`, color: c.texte }}
            >
              <option value="">Tous les tags</option>
              {tagsDispo.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>

        {loading ? (
          <div style={{ color: c.texteMuted, fontSize: 13, padding: 12 }}>Chargement…</div>
        ) : filtres.length === 0 ? (
          <div className="crm-empty" style={{ borderColor: c.bordure, background: c.blanc }}>
            <div className="crm-empty__title" style={{ color: c.texte }}>
              {clients.length === 0 ? 'Aucun client pour le moment' : 'Aucun résultat'}
            </div>
            <div className="crm-empty__text" style={{ color: c.texteMuted }}>
              {clients.length === 0
                ? 'Ajoutez votre premier client pour commencer à suivre vos prospects.'
                : 'Essayez d’ajuster vos filtres ou votre recherche.'}
            </div>
            {clients.length === 0 && (
              <Button c={c} onClick={() => router.push('/crm/clients/nouveau')}>+ Nouveau client</Button>
            )}
          </div>
        ) : (
          <div className="crm-list">
            {filtres.map((cl) => (
              <button
                key={cl.id}
                type="button"
                onClick={() => router.push(`/crm/clients/${cl.id}`)}
                className="crm-row"
                style={{ background: c.blanc, borderColor: c.bordure, color: c.texte }}
              >
                <div>
                  <div className="crm-row__primary" style={{ color: c.texte }}>
                    {clientDisplayName(cl)}
                  </div>
                  <div className="crm-row__secondary" style={{ color: c.texteMuted }}>
                    {cl.email || cl.telephone || '—'}{cl.ville ? ` · ${cl.ville}` : ''}
                  </div>
                </div>
                <div className="crm-row__meta">
                  <Badge
                    bg={cl.type === 'entreprise' ? hexToRgba('#6366F1', 0.12) : hexToRgba('#10B981', 0.12)}
                    color={cl.type === 'entreprise' ? '#6366F1' : '#10B981'}
                    size="sm"
                  >
                    {cl.type === 'entreprise' ? 'Entreprise' : 'Particulier'}
                  </Badge>
                  {(cl.tags || []).slice(0, 2).map((t) => (
                    <Badge key={t} bg={hexToRgba(c.accent || '#6366F1', 0.10)} color={c.accent || '#6366F1'} size="sm">{t}</Badge>
                  ))}
                  {(cl.tags || []).length > 2 && (
                    <span style={{ color: c.texteMuted, fontSize: 11 }}>+{cl.tags.length - 2}</span>
                  )}
                </div>
                <div className="crm-row__secondary" style={{ color: c.texteMuted, fontSize: 11 }}>
                  Créé {formatDateFr(cl.created_at)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
