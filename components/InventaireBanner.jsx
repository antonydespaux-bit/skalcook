'use client'
import { useState, useEffect } from 'react'
import { supabase, getClientId } from '../lib/supabase'
import { useRouter } from 'next/navigation'
import { useTheme } from '../lib/useTheme'

/**
 * Banner non-intrusive affichée quand un inventaire tournant est dû.
 * Vérifie la fréquence configurée et la date du dernier inventaire.
 */
export default function InventaireBanner() {
  const [show, setShow] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const { c } = useTheme()
  const router = useRouter()

  useEffect(() => {
    checkIfDue()
  }, [])

  const checkIfDue = async () => {
    try {
      const clientId = await getClientId()
      if (!clientId) return

      const { data: client } = await supabase
        .from('clients')
        .select('inventaire_tournant_actif, inventaire_tournant_frequence, inventaire_tournant_jour_semaine, inventaire_tournant_heure, inventaire_tournant_dernier')
        .eq('id', clientId)
        .single()

      if (!client || !client.inventaire_tournant_actif) return

      const now = new Date()
      const jourActuel = now.getDay() // 0=dim, 1=lun, ...
      const heureActuelle = now.getHours()
      const jourCible = client.inventaire_tournant_jour_semaine ?? 1
      const heureCible = client.inventaire_tournant_heure ?? 8

      // Vérifier si on est le bon jour et après l'heure cible
      if (jourActuel !== jourCible || heureActuelle < heureCible) return

      // Vérifier la fréquence
      const dernier = client.inventaire_tournant_dernier
        ? new Date(client.inventaire_tournant_dernier)
        : null

      if (dernier) {
        const daysSince = Math.floor((now - dernier) / (1000 * 60 * 60 * 24))
        const freq = client.inventaire_tournant_frequence || 'weekly'
        const minDays = freq === 'weekly' ? 5 : freq === 'biweekly' ? 12 : 25

        if (daysSince < minDays) return
      }

      // Vérifier qu'il n'y a pas déjà un brouillon en cours
      const { data: brouillon } = await supabase
        .from('inventaires')
        .select('id')
        .eq('client_id', clientId)
        .eq('statut', 'brouillon')
        .eq('type', 'tournant')
        .limit(1)
        .maybeSingle()

      if (brouillon) return // brouillon déjà en cours

      // Vérifier session storage pour ne pas re-montrer
      const dismissKey = `inv_banner_${new Date().toISOString().slice(0, 10)}`
      if (typeof window !== 'undefined' && sessionStorage.getItem(dismissKey)) return

      setShow(true)
    } catch {
      // Silently ignore
    }
  }

  const dismiss = () => {
    setDismissed(true)
    const dismissKey = `inv_banner_${new Date().toISOString().slice(0, 10)}`
    if (typeof window !== 'undefined') sessionStorage.setItem(dismissKey, '1')
    setTimeout(() => setShow(false), 300)
  }

  if (!show) return null

  return (
    <div
      className="no-print"
      style={{
        padding: '12px 16px',
        background: 'linear-gradient(135deg, #EEF2FF, #E0E7FF)',
        borderBottom: '1px solid #C7D2FE',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap',
        opacity: dismissed ? 0 : 1,
        transition: 'opacity 0.3s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
        <span style={{ fontSize: '18px' }}>⚡</span>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '500', color: '#3730A3' }}>
            Inventaire Flash recommandé
          </div>
          <div style={{ fontSize: '12px', color: '#6366F1' }}>
            Contrôlez vos produits critiques (Pareto 80/20)
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button
          onClick={dismiss}
          style={{
            padding: '6px 14px', background: 'transparent',
            border: '1px solid #A5B4FC', borderRadius: '8px',
            color: '#6366F1', fontSize: '12px', cursor: 'pointer'
          }}
        >
          Plus tard
        </button>
        <button
          onClick={() => router.push('/inventaire/nouveau')}
          style={{
            padding: '6px 14px', background: '#6366F1',
            border: 'none', borderRadius: '8px',
            color: 'white', fontSize: '12px', fontWeight: '500', cursor: 'pointer'
          }}
        >
          Lancer
        </button>
      </div>
    </div>
  )
}
