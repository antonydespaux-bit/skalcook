'use client'
import { useState } from 'react'
import { supabase, getClientId } from '../../../lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTheme } from '../../../lib/useTheme'
import { useRole } from '../../../lib/useRole'
import { useIsMobile } from '../../../lib/useIsMobile'
import Navbar from '../../../components/Navbar'

const todayIso = () => new Date().toISOString().slice(0, 10)

export default function NouvelInventairePage() {
  const [step, setStep] = useState(1)
  const [type, setType] = useState(null)
  const [section, setSection] = useState(null)
  const [dateInventaire, setDateInventaire] = useState(todayIso())
  const [categories, setCategories] = useState([])
  const [selectedCategorieIds, setSelectedCategorieIds] = useState([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const { c } = useTheme()
  const { role } = useRole()
  const isMobile = useIsMobile()

  // ?section=bar/cuisine passé depuis la navbar bar : pré-sélectionne la
  // section et force la navbar dans le bon contexte.
  const sectionParam = searchParams.get('section')
  const sectionForced = sectionParam === 'bar' || sectionParam === 'cuisine' ? sectionParam : null
  const navbarSection = sectionForced || (role === 'bar' ? 'bar' : 'cuisine')
  const queryString = sectionForced ? `?section=${sectionForced}` : ''

  // Si une section est imposée par l'URL, on n'autorise plus le choix manuel
  // (l'utilisateur reste dans le contexte d'où il vient).
  const canChooseSection = !sectionForced && (role === 'admin' || role === 'directeur')

  const handleCreate = async (chosenSection, chosenType, chosenCategorieIds) => {
    setCreating(true)
    setError('')
    try {
      const clientId = await getClientId()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session || !clientId) { router.push('/'); return }

      const body = {
        client_id: clientId,
        type: chosenType,
        section: chosenSection,
        date_inventaire: dateInventaire || todayIso(),
      }
      if (chosenType === 'tournant' && chosenCategorieIds && chosenCategorieIds.length > 0) {
        body.categorie_ids = chosenCategorieIds
      }

      const res = await fetch('/api/inventaire/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify(body)
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Erreur lors de la création.')
        setCreating(false)
        return
      }

      router.push(`/inventaire/${data.inventaire.id}/saisie${queryString}`)
    } catch (err) {
      setError('Erreur réseau.')
      setCreating(false)
    }
  }

  const goToCategoryStep = async (chosenSection, chosenType) => {
    setSection(chosenSection)
    if (chosenType !== 'tournant') {
      handleCreate(chosenSection, chosenType, [])
      return
    }
    try {
      const clientId = await getClientId()
      if (!clientId) return
      const sections = chosenSection === 'global' ? ['cuisine', 'bar'] : [chosenSection]
      const { data } = await supabase
        .from('categories_ingredients')
        .select('id, nom, emoji, section')
        .eq('client_id', clientId)
        .in('section', sections)
        .order('ordre')
      setCategories(data || [])
      setSelectedCategorieIds([])
      setStep(canChooseSection ? 3 : 2)
    } catch {
      setError('Erreur chargement des catégories.')
    }
  }

  const selectType = (t) => {
    setType(t)
    if (!canChooseSection) {
      // Si la section est imposée par l'URL, on l'utilise directement.
      // Sinon, fallback au rôle (bar → bar, autre → cuisine).
      const sec = sectionForced || (role === 'bar' ? 'bar' : 'cuisine')
      goToCategoryStep(sec, t)
    } else {
      setStep(2)
    }
  }

  const selectSection = (s) => {
    goToCategoryStep(s, type)
  }

  const toggleCategorie = (id) => {
    setSelectedCategorieIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 2) return prev
      return [...prev, id]
    })
  }

  const confirmCategories = () => {
    handleCreate(section, type, selectedCategorieIds)
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
      <Navbar section={navbarSection} />

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

        {/* Date de l'inventaire — par défaut aujourd'hui, modifiable (ex. saisie
            d'un inventaire passé). */}
        <div style={{ background: c.blanc, borderRadius: '12px', padding: '14px 16px', border: `0.5px solid ${c.bordure}`, marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <label htmlFor="date-inv" style={{ fontSize: '13px', fontWeight: '500', color: c.texte }}>
            📅 Date de l&apos;inventaire
          </label>
          <input
            id="date-inv"
            type="date"
            value={dateInventaire}
            max={todayIso()}
            onChange={e => setDateInventaire(e.target.value)}
            disabled={creating}
            style={{ padding: '8px 12px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte, cursor: creating ? 'not-allowed' : 'pointer' }}
          />
        </div>

        {/* Étape 1 : Choix du type */}
        {step === 1 && (
          <>
            <h1 style={{ fontSize: '18px', fontWeight: '600', color: c.texte, marginBottom: '8px' }}>Quel inventaire faire ?</h1>
            <p style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '24px' }}>Choisissez le type d&apos;inventaire à réaliser.</p>

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
        {step === 2 && canChooseSection && (
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

        {/* Étape catégories : uniquement pour Flash */}
        {((canChooseSection && step === 3) || (!canChooseSection && step === 2)) && type === 'tournant' && (
          <>
            <h1 style={{ fontSize: '18px', fontWeight: '600', color: c.texte, marginBottom: '8px' }}>Catégories d&apos;ingrédients</h1>
            <p style={{ fontSize: '13px', color: c.texteMuted, marginBottom: '20px' }}>
              Choisissez 1 ou 2 catégories à inventorier (max 25 produits), ou ignorez pour utiliser le Pareto par défaut.
            </p>

            {categories.length === 0 ? (
              <div style={{ padding: '16px', background: c.fond, borderRadius: '10px', fontSize: '13px', color: c.texteMuted, marginBottom: '16px' }}>
                Aucune catégorie disponible.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                {categories.map((cat) => {
                  const selected = selectedCategorieIds.includes(cat.id)
                  const disabled = !selected && selectedCategorieIds.length >= 2
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => !creating && !disabled && toggleCategorie(cat.id)}
                      disabled={creating || disabled}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '20px',
                        border: `1px solid ${selected ? c.accent : c.bordure}`,
                        background: selected ? c.accentClair : c.blanc,
                        color: selected ? c.accent : c.texte,
                        fontSize: '13px',
                        cursor: creating || disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.4 : 1,
                      }}
                    >
                      {cat.emoji} {cat.nom}
                    </button>
                  )
                })}
              </div>
            )}

            <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: '12px' }}>
              {selectedCategorieIds.length} / 2 sélectionnée{selectedCategorieIds.length > 1 ? 's' : ''}
            </div>

            <div style={{ display: 'flex', gap: '10px', flexDirection: isMobile ? 'column' : 'row' }}>
              <button
                type="button"
                onClick={() => !creating && handleCreate(section, type, [])}
                disabled={creating}
                style={{
                  flex: 1, padding: '14px', background: c.blanc,
                  border: `0.5px solid ${c.bordure}`, borderRadius: '12px',
                  color: c.texte, fontSize: '14px',
                  cursor: creating ? 'not-allowed' : 'pointer',
                }}
              >
                Pareto par défaut
              </button>
              <button
                type="button"
                onClick={() => !creating && confirmCategories()}
                disabled={creating || selectedCategorieIds.length === 0}
                style={{
                  flex: 2, padding: '14px',
                  background: selectedCategorieIds.length === 0 ? c.bordure : c.accent,
                  color: 'white', border: 'none', borderRadius: '12px',
                  fontSize: '14px', fontWeight: '500',
                  cursor: creating || selectedCategorieIds.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Créer l&apos;inventaire flash →
              </button>
            </div>
          </>
        )}

        {creating && (
          <div style={{ textAlign: 'center', padding: '24px', color: c.texteMuted, fontSize: '14px' }}>
            Préparation de l&apos;inventaire en cours...
          </div>
        )}
      </div>
    </div>
  )
}
