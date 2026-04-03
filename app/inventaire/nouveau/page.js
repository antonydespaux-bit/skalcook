'use client'
import { useState } from 'react'
import { supabase, getClientId } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { useTheme } from '../../../lib/useTheme'
import { useRole } from '../../../lib/useRole'
import { useIsMobile } from '../../../lib/useIsMobile'
import Navbar from '../../../components/Navbar'

export default function NouvelInventairePage() {
  const [step, setStep] = useState(1)
  const [type, setType] = useState(null)
  const [section, setSection] = useState(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const { c } = useTheme()
  const { role } = useRole()
  const isMobile = useIsMobile()

  const canChooseSection = role === 'admin' || role === 'directeur'

  const handleCreate = async (chosenSection, chosenType) => {
    setCreating(true)
    setError('')
    try {
      const clientId = await getClientId()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || !clientId) { router.push('/'); return }

      const res = await fetch('/api/inventaire/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          client_id: clientId,
          type: chosenType,
          section: chosenSection,
        })
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Erreur lors de la création.')
        setCreating(false)
        return
      }

      router.push(`/inventaire/${data.inventaire.id}/saisie`)
    } catch (err) {
      setError('Erreur réseau.')
      setCreating(false)
    }
  }

  const selectType = (t) => {
    setType(t)
    if (!canChooseSection) {
      // Déterminer automatiquement la section selon le rôle
      // Passer t directement : setType est asynchrone, le state n'est pas encore mis à jour
      const sec = role === 'bar' ? 'bar' : 'cuisine'
      handleCreate(sec, t)
    } else {
      setStep(2)
    }
  }

  const selectSection = (s) => {
    setSection(s)
    handleCreate(s, type)
  }

  const cardStyle = (selected) => ({
    padding: isMobile ? '20px' : '28px',
    background: selected ? c.accentClair : c.blanc,
    border: `1px solid ${selected ? c.accent : c.bordure}`,
    borderRadius: '14px',
    cursor: creating ? 'not-allowed' : 'pointer',
    flex: 1,
    textAlign: 'center',
    transition: 'all 0.15s',
    opacity: creating ? 0.6 : 1,
  })

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />

      <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '600px', margin: '0 auto' }}>

        {/* Back */}
        <button
          onClick={() => step > 1 ? setStep(step - 1) : router.push('/inventaire')}
          style={{ background: 'none', border: 'none', color: c.texteMuted, fontSize: '13px', cursor: 'pointer', marginBottom: '20px', padding: 0 }}
        >
          ← Retour
        </button>

        {error && (
          <div style={{ padding: '12px', background: '#FEE2E2', border: '0.5px solid #FECACA', borderRadius: '10px', color: '#DC2626', fontSize: '13px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {/* Étape 1 : Choix du type */}
        {step === 1 && (
          <>
            <h1 style={{ fontSize: '18px', fontWeight: '600', color: c.texte, marginBottom: '8px' }}>Quel inventaire faire ?</h1>
            <p style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '24px' }}>Choisissez le type d'inventaire à réaliser.</p>

            <div style={{ display: 'flex', gap: '12px', flexDirection: isMobile ? 'column' : 'row' }}>
              <div onClick={() => !creating && selectType('tournant')} style={cardStyle(type === 'tournant')}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚡</div>
                <div style={{ fontSize: '16px', fontWeight: '600', color: c.texte, marginBottom: '6px' }}>Inventaire Flash</div>
                <div style={{ fontSize: '13px', color: c.texteMuted, lineHeight: '1.4' }}>
                  Les 20% de produits les plus chers (Pareto). Rapide, ~15 min.
                </div>
              </div>

              <div onClick={() => !creating && selectType('complet')} style={cardStyle(type === 'complet')}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>📦</div>
                <div style={{ fontSize: '16px', fontWeight: '600', color: c.texte, marginBottom: '6px' }}>Inventaire Complet</div>
                <div style={{ fontSize: '13px', color: c.texteMuted, lineHeight: '1.4' }}>
                  100% du stock. Clôture mensuelle ou trimestrielle.
                </div>
              </div>
            </div>
          </>
        )}

        {/* Étape 2 : Choix de la section */}
        {step === 2 && (
          <>
            <h1 style={{ fontSize: '18px', fontWeight: '600', color: c.texte, marginBottom: '8px' }}>Quelle section ?</h1>
            <p style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '24px' }}>
              {type === 'tournant' ? 'Flash' : 'Complet'} — choisissez la section à inventorier.
            </p>

            <div style={{ display: 'flex', gap: '12px', flexDirection: isMobile ? 'column' : 'row' }}>
              <div onClick={() => !creating && selectSection('cuisine')} style={cardStyle(section === 'cuisine')}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>🍳</div>
                <div style={{ fontSize: '15px', fontWeight: '500', color: c.texte }}>Cuisine</div>
              </div>

              <div onClick={() => !creating && selectSection('bar')} style={cardStyle(section === 'bar')}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>🍸</div>
                <div style={{ fontSize: '15px', fontWeight: '500', color: c.texte }}>Bar</div>
              </div>

              <div onClick={() => !creating && selectSection('global')} style={cardStyle(section === 'global')}>
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>📋</div>
                <div style={{ fontSize: '15px', fontWeight: '500', color: c.texte }}>Les deux</div>
              </div>
            </div>
          </>
        )}

        {creating && (
          <div style={{ textAlign: 'center', padding: '24px', color: c.texteMuted, fontSize: '14px' }}>
            Préparation de l'inventaire en cours...
          </div>
        )}
      </div>
    </div>
  )
}
