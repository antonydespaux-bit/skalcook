'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'
import { isSuperadminEmail } from '../../../../lib/superadmin'
import { useIsMobile } from '../../../../lib/useIsMobile'
import ChefLoader from '../../../../components/ChefLoader'
import { FONCTIONNALITES, ROLES, matriceComplete, niveauParDefaut } from '../../../../lib/permissions'

// Superadmin › Établissement › Droits : matrice Rôle × Fonctionnalité à
// 3 niveaux. Seul le superadmin la modifie (levier commercial).

const ROLE_LABELS = { admin: 'Admin', directeur: 'Directeur', cuisine: 'Cuisine', bar: 'Bar', consultant: 'Consultant' }
const NIVEAUX_UI = [
  { id: 'aucun', label: 'Non', bg: '#FEE2E2', color: '#B91C1C' },
  { id: 'lecture', label: 'Voir', bg: '#FEF3C7', color: '#92400E' },
  { id: 'modification', label: 'Modifier', bg: '#DCFCE7', color: '#166534' },
]

async function appel(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}`, ...(options.headers || {}) },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `Erreur ${res.status}`)
  return json
}

export default function DroitsEtablissementPage() {
  const router = useRouter()
  const params = useParams()
  const isMobile = useIsMobile()
  const clientId = String(params?.id || '')

  const [autorise, setAutorise] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [client, setClient] = useState(null)
  const [autres, setAutres] = useState([])
  const [matrice, setMatrice] = useState(() => matriceComplete([]))
  const [initiale, setInitiale] = useState(() => matriceComplete([]))
  const [copierGroupe, setCopierGroupe] = useState(false)

  const charger = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await appel(`/api/superadmin/permissions?clientId=${clientId}`)
      const m = matriceComplete(res.lignes)
      setMatrice(m); setInitiale(m)
      setClient(res.client); setAutres(res.autresDuGroupe || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => {
    let annule = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      let ok = isSuperadminEmail((session.user?.email || '').toLowerCase().trim())
      if (!ok) {
        const { data: me } = await supabase.from('profils').select('is_superadmin').eq('id', session.user.id).maybeSingle()
        ok = !!me?.is_superadmin
      }
      if (annule) return
      if (!ok) { router.push('/dashboard'); return }
      setAutorise(true)
      charger()
    })()
    return () => { annule = true }
  }, [router, charger])

  const modifie = useMemo(() => JSON.stringify(matrice) !== JSON.stringify(initiale), [matrice, initiale])
  const nbEcarts = useMemo(
    () => ROLES.reduce((n, r) => n + FONCTIONNALITES.filter((f) => matrice[r][f.id] !== niveauParDefaut(f.id, r)).length, 0),
    [matrice],
  )
  const groupes = useMemo(() => {
    const out = []
    for (const f of FONCTIONNALITES) {
      const g = out.find((x) => x.nom === f.groupe)
      if (g) g.items.push(f); else out.push({ nom: f.groupe, items: [f] })
    }
    return out
  }, [])

  const changer = (role, fonctionnalite, niveau) => {
    setSuccess('')
    setMatrice((prev) => ({ ...prev, [role]: { ...prev[role], [fonctionnalite]: niveau } }))
  }

  const enregistrer = async () => {
    setSaving(true); setError(''); setSuccess('')
    try {
      const res = await appel('/api/superadmin/permissions', {
        method: 'POST',
        body: JSON.stringify({ clientId, matrice, copierVersGroupe: copierGroupe }),
      })
      setInitiale(matrice)
      setSuccess(res.etablissements > 1
        ? `✓ Droits enregistrés pour ${res.etablissements} établissements du groupe.`
        : '✓ Droits enregistrés.')
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  if (!autorise || loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F4F4F5' }}>
        <ChefLoader message="Chargement des droits..." />
      </div>
    )
  }

  const cellule = (role, f) => {
    const valeur = matrice[role][f.id]
    const parDefaut = niveauParDefaut(f.id, role)
    return (
      <td key={role} style={{ padding: '8px 6px', textAlign: 'center', borderBottom: '0.5px solid #F4F4F5', position: 'relative' }}>
        <div role="radiogroup" aria-label={`${f.label} — ${ROLE_LABELS[role]}`} style={{ display: 'inline-flex', borderRadius: 8, border: '0.5px solid #E4E4E7', overflow: 'hidden' }}>
          {NIVEAUX_UI.map((n) => {
            const actif = valeur === n.id
            return (
              <button key={n.id} role="radio" aria-checked={actif} onClick={() => changer(role, f.id, n.id)}
                title={n.id === parDefaut ? 'Valeur par défaut' : ''}
                style={{ padding: isMobile ? '5px 6px' : '5px 9px', fontSize: 11, fontWeight: actif ? 600 : 400, border: 'none', cursor: 'pointer',
                  background: actif ? n.bg : 'white', color: actif ? n.color : '#A1A1AA' }}>
                {n.label}
              </button>
            )
          })}
        </div>
        {valeur !== parDefaut && (
          <span title={`Modifié (défaut : ${NIVEAUX_UI.find((n) => n.id === parDefaut)?.label})`}
            style={{ position: 'absolute', top: 6, right: 4, width: 7, height: 7, borderRadius: '50%', background: '#6366F1' }} />
        )}
      </td>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F4F4F5' }}>
      <div style={{ background: '#18181B', padding: isMobile ? '0 12px' : '0 24px', height: 56, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.push('/superadmin')}
          style={{ background: 'transparent', border: '0.5px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer' }}>
          ← Superadmin
        </button>
        <span style={{ color: 'white', fontSize: 14, fontWeight: 600 }}>Droits — {client?.nom_etablissement || '…'}</span>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? 16 : 24 }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 'clamp(1.2rem, 4vw, 1.8rem)', fontWeight: 600, color: '#18181B', margin: '0 0 4px' }}>Droits par rôle</h1>
          <p style={{ fontSize: 14, color: '#71717A', margin: 0 }}>
            Pour chaque fonctionnalité, ce que chaque rôle de <strong>{client?.nom_etablissement}</strong> peut faire : rien, voir, ou modifier.
            Le point violet signale une case différente des droits par défaut ({nbEcarts} {nbEcarts > 1 ? 'cases modifiées' : 'case modifiée'}).
            Le superadmin a toujours tous les droits ; les modules de l&apos;établissement restent nécessaires.
          </p>
        </div>

        {error && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 14 }}>{error}</div>}
        {success && <div style={{ background: '#DCFCE7', border: '0.5px solid #BBF7D0', color: '#166534', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 14 }}>{success}</div>}

        <div style={{ background: 'white', borderRadius: 12, border: '0.5px solid #E4E4E7', overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
              <thead>
                <tr style={{ background: '#F4F4F5' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: '#71717A', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Fonctionnalité</th>
                  {ROLES.map((r) => (
                    <th key={r} style={{ padding: '10px 6px', fontSize: 11, color: '#71717A', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{ROLE_LABELS[r]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupes.map((g) => (
                  <FragmentGroupe key={g.nom} nom={g.nom} colonnes={ROLES.length + 1}>
                    {g.items.map((f) => (
                      <tr key={f.id}>
                        <td style={{ padding: '8px 14px', borderBottom: '0.5px solid #F4F4F5', minWidth: 220 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#18181B' }}>{f.label}</div>
                          {f.detail && <div style={{ fontSize: 11, color: '#71717A', marginTop: 2 }}>{f.detail}</div>}
                        </td>
                        {ROLES.map((r) => cellule(r, f))}
                      </tr>
                    ))}
                  </FragmentGroupe>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button onClick={() => { setSuccess(''); setMatrice(matriceComplete([])) }}
              style={{ padding: '9px 14px', borderRadius: 8, border: '0.5px solid #E4E4E7', background: 'white', color: '#71717A', fontSize: 13, cursor: 'pointer' }}>
              Rétablir les droits par défaut
            </button>
            {modifie && (
              <button onClick={() => { setSuccess(''); setMatrice(initiale) }}
                style={{ padding: '9px 14px', borderRadius: 8, border: '0.5px solid #E4E4E7', background: 'white', color: '#71717A', fontSize: 13, cursor: 'pointer' }}>
                Annuler les changements
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            {autres.length > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#18181B', cursor: 'pointer' }}>
                <input type="checkbox" checked={copierGroupe} onChange={(e) => setCopierGroupe(e.target.checked)} />
                Appliquer aussi à : {autres.map((a) => a.nom_etablissement).join(', ')}
              </label>
            )}
            <button onClick={enregistrer} disabled={saving || (!modifie && !copierGroupe)}
              style={{ padding: '10px 22px', borderRadius: 8, border: 'none', fontSize: 14, fontWeight: 500, color: 'white',
                background: saving || (!modifie && !copierGroupe) ? '#A5B4FC' : '#6366F1', cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FragmentGroupe({ nom, colonnes, children }) {
  return (
    <>
      <tr>
        <td colSpan={colonnes} style={{ padding: '12px 14px 6px', fontSize: 11, fontWeight: 700, color: '#6366F1', textTransform: 'uppercase', letterSpacing: '0.06em', background: '#FAFAFA' }}>{nom}</td>
      </tr>
      {children}
    </>
  )
}
