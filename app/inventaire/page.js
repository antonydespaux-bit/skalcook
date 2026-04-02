'use client'
import { useState, useEffect } from 'react'
import { supabase, getClientId } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { useTheme } from '../../lib/useTheme'
import { useRole } from '../../lib/useRole'
import { useIsMobile } from '../../lib/useIsMobile'
import Navbar from '../../components/Navbar'

export default function InventairePage() {
  const [inventaires, setInventaires] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtre, setFiltre] = useState('tous') // tous | tournant | complet
  const [deleting, setDeleting] = useState(null)
  const router = useRouter()
  const { c } = useTheme()
  const { role } = useRole()
  const isMobile = useIsMobile()

  useEffect(() => { loadInventaires() }, [])

  const loadInventaires = async () => {
    const clientId = await getClientId()
    if (!clientId) { router.push('/'); return }

    const { data, error } = await supabase
      .from('inventaires')
      .select('*')
      .eq('client_id', clientId)
      .order('date_inventaire', { ascending: false })

    setInventaires(data || [])
    setLoading(false)
  }

  const deleteInventaire = async (inv, e) => {
    e.stopPropagation()
    if (!window.confirm(`Supprimer cet inventaire brouillon (${inv.type === 'tournant' ? 'Flash' : 'Complet'} — ${inv.section}) ?`)) return

    setDeleting(inv.id)
    try {
      const clientId = await getClientId()
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/inventaire/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ inventaire_id: inv.id, client_id: clientId })
      })
      await loadInventaires()
    } finally {
      setDeleting(null)
    }
  }

  const brouillon = inventaires.find(i => i.statut === 'brouillon')
  const filtered = inventaires.filter(i => filtre === 'tous' || i.type === filtre)

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

  if (loading) return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px', color: c.texteMuted }}>Chargement...</div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />

      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '900px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <h1 style={{ fontSize: '20px', fontWeight: '600', color: c.texte, margin: 0 }}>Inventaires</h1>
          <button
            onClick={() => router.push('/inventaire/nouveau')}
            style={{
              padding: '10px 20px', background: c.accent, color: 'white',
              border: 'none', borderRadius: '10px', fontSize: '14px',
              fontWeight: '500', cursor: 'pointer'
            }}
          >
            + Nouvel inventaire
          </button>
        </div>

        {/* Banner brouillon */}
        {brouillon && (
          <div
            onClick={() => router.push(`/inventaire/${brouillon.id}/saisie`)}
            style={{
              padding: '16px', background: '#FFFBEB', border: '0.5px solid #FDE68A',
              borderRadius: '12px', marginBottom: '16px', cursor: 'pointer',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}
          >
            <div>
              <div style={{ fontSize: '14px', fontWeight: '500', color: '#92400E' }}>
                Inventaire en cours ({brouillon.type === 'tournant' ? 'Flash' : 'Complet'})
              </div>
              <div style={{ fontSize: '12px', color: '#B45309', marginTop: '2px' }}>
                Commencé le {formatDate(brouillon.date_inventaire)} — cliquez pour reprendre
              </div>
            </div>
            <span style={{ fontSize: '20px' }}>→</span>
          </div>
        )}

        {/* Filtres */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
          {[
            { id: 'tous', label: 'Tous' },
            { id: 'tournant', label: 'Flash' },
            { id: 'complet', label: 'Complets' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFiltre(f.id)}
              style={{
                padding: '6px 14px', borderRadius: '20px', fontSize: '13px',
                border: `0.5px solid ${filtre === f.id ? c.accent : c.bordure}`,
                background: filtre === f.id ? c.accentClair : c.blanc,
                color: filtre === f.id ? c.accent : c.texteMuted,
                cursor: 'pointer', fontWeight: filtre === f.id ? '500' : '400'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Liste */}
        {filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: c.texteMuted, fontSize: '14px' }}>
            Aucun inventaire pour le moment.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {filtered.map(inv => (
              <div
                key={inv.id}
                onClick={() => router.push(inv.statut === 'brouillon' ? `/inventaire/${inv.id}/saisie` : `/inventaire/${inv.id}`)}
                style={{
                  padding: '16px', background: c.blanc,
                  border: `0.5px solid ${c.bordure}`, borderRadius: '12px',
                  cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center', gap: '12px'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: '500', color: c.texte }}>
                      {inv.type === 'tournant' ? 'Flash' : 'Complet'} — {inv.section}
                    </span>
                    <span style={{
                      fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
                      background: inv.statut === 'valide' ? '#DCFCE7' : '#FEF3C7',
                      color: inv.statut === 'valide' ? '#16A34A' : '#92400E',
                    }}>
                      {inv.statut === 'valide' ? 'Validé' : 'Brouillon'}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: c.texteMuted, marginTop: '4px' }}>
                    {formatDate(inv.date_inventaire)}
                    {inv.date_validation && ` — validé le ${formatDate(inv.date_validation)}`}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {inv.statut === 'brouillon' && (
                    <button
                      onClick={(e) => deleteInventaire(inv, e)}
                      disabled={deleting === inv.id}
                      style={{
                        padding: '6px 10px', background: 'none',
                        border: `0.5px solid ${c.bordure}`, borderRadius: '8px',
                        fontSize: '13px', color: deleting === inv.id ? c.texteMuted : '#DC2626',
                        cursor: deleting === inv.id ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {deleting === inv.id ? '...' : 'Supprimer'}
                    </button>
                  )}
                  <span style={{ fontSize: '16px', color: c.texteMuted }}>›</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
