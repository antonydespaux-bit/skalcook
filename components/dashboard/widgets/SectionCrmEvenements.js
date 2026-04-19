import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase, getClientId } from '../../../lib/supabase'
import { Badge } from '../../ui'

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })
}

const STATUT_LABELS = {
  demande: 'Demande',
  devis_envoye: 'Devis envoyé',
  degustation: 'Dégustation',
  negociation: 'Négociation',
  acompte: 'Acompte',
  confirme: 'Confirmé',
  realise: 'Réalisé',
  facture: 'Facturé',
  paye: 'Payé',
}

export default function SectionCrmEvenements({ c }) {
  const [evenements, setEvenements] = useState([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const clientId = await getClientId()
      if (!clientId) { setLoading(false); return }
      const { data } = await supabase
        .from('crm_evenements')
        .select('id, titre, date_evenement, heure_debut, nb_convives, statut, crm_client_id')
        .eq('client_id', clientId)
        .gte('date_evenement', todayIso())
        .not('statut', 'in', '(annule,perdu)')
        .order('date_evenement', { ascending: true })
        .limit(5)
      if (cancelled) return
      setEvenements(data || [])
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  return (
    <div style={{ background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}`, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: `0.5px solid ${c.bordure}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '13px', fontWeight: '500', color: c.texte }}>📅 Événements à venir</div>
        <span style={{ fontSize: '11px', color: c.texteMuted }}>5 prochains</span>
      </div>
      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', color: c.texteMuted, fontSize: '13px' }}>Chargement…</div>
      ) : evenements.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: c.texteMuted, fontSize: '13px' }}>Aucun événement à venir</div>
      ) : (
        <div>
          {evenements.map((ev, i) => (
            <div
              key={ev.id}
              onClick={() => router.push(`/crm/evenements/${ev.id}`)}
              style={{
                padding: '12px 20px', cursor: 'pointer',
                borderBottom: i < evenements.length - 1 ? `0.5px solid ${c.bordure}` : 'none',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
                background: c.blanc,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = c.fond)}
              onMouseLeave={(e) => (e.currentTarget.style.background = c.blanc)}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '13px', fontWeight: '500', color: c.texte, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {ev.titre || 'Sans titre'}
                </div>
                <div style={{ fontSize: '11px', color: c.texteMuted, marginTop: '2px' }}>
                  {formatDate(ev.date_evenement)}
                  {ev.heure_debut ? ` · ${ev.heure_debut.slice(0, 5)}` : ''}
                  {ev.nb_convives ? ` · ${ev.nb_convives} convives` : ''}
                </div>
              </div>
              <Badge bg={'#F0E8E0'} color={'#2C1810'} size="sm">
                {STATUT_LABELS[ev.statut] || ev.statut}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
