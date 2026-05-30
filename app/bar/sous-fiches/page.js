'use client'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase, getClientId } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import { useIsMobile } from '../../../lib/useIsMobile'
import { useTheme } from '../../../lib/useTheme'
import { useRole } from '../../../lib/useRole'
import Navbar from '../../../components/Navbar'
import { ALLERGENES } from '../../../lib/allergenes'
import { formatSaison } from '../../../lib/saison'
import ChefLoader from '../../../components/ChefLoader'
import { Badge } from '../../../components/ui'

export default function BarSousFichesPage() {
  const [fiches, setFiches] = useState([])
  const [loading, setLoading] = useState(true)
  const [recherche, setRecherche] = useState('')
  const router = useRouter()
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const { c } = useTheme()
  const { role } = useRole()
  const peutModifier = role === 'admin' || role === 'bar'

  useEffect(() => {
    checkUser()
    loadFiches()
  }, [])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

  const loadFiches = async () => {
    const clientId = await getClientId()
    if (!clientId) { setLoading(false); router.push('/'); return }
    const { data } = await supabase
      .from('fiches_bar')
      .select('*')
      .eq('client_id', clientId)
      .eq('categorie', 'Sous-fiche')
      .eq('archive', false)
      .order('nom')
    setFiches(data || [])
    setLoading(false)
  }

  const fichesFiltrees = fiches.filter(f =>
    f.nom.toLowerCase().includes(recherche.toLowerCase())
  )

  const coutMoyen = fiches.filter(f => f.cout_portion).length > 0
    ? fiches.filter(f => f.cout_portion).reduce((sum, f) => sum + Number(f.cout_portion), 0) / fiches.filter(f => f.cout_portion).length
    : null

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="bar" />
      <div style={{ padding: isMobile ? '12px' : '24px', maxWidth: '1000px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: isMobile ? '8px' : '12px', marginBottom: isMobile ? '16px' : '24px' }}>
          {[
            { label: t('bar.sousFiches.totalSousFiches'), value: fiches.length },
            { label: t('bar.sousFiches.avgCostPerUnit'), value: coutMoyen ? `${coutMoyen.toFixed(2)} €` : '—' },
            { label: t('bar.sousFiches.usedAsIngredient'), value: fiches.length },
          ].map((stat, i) => (
            <div key={i} style={{ background: c.blanc, borderRadius: '10px', padding: isMobile ? '12px' : '16px', border: `0.5px solid ${c.bordure}` }}>
              <div style={{ fontSize: '10px', color: c.texteMuted, fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>{stat.label}</div>
              <div style={{ fontSize: isMobile ? '20px' : '26px', fontWeight: '500', color: c.texte }}>{stat.value}</div>
            </div>
          ))}
        </div>
        <input type="text" placeholder={t('bar.sousFiches.searchPlaceholder')}
          value={recherche} onChange={e => setRecherche(e.target.value)}
          style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: `0.5px solid ${c.bordure}`, fontSize: '14px', background: c.blanc, outline: 'none', color: c.texte, marginBottom: '16px' }}
        />
        {loading ? (
          <ChefLoader />
        ) : fichesFiltrees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: c.blanc, borderRadius: '12px', border: `0.5px solid ${c.bordure}` }}>
            <div style={{ fontSize: '14px', color: c.texteMuted, marginBottom: '16px' }}>{t('bar.sousFiches.empty')}</div>
            {peutModifier && (
              <button onClick={() => router.push('/bar/fiches/nouvelle')} style={{ background: '#C4956A', color: '#3C3489', border: 'none', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>{t('bar.sousFiches.createFirst')}</button>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: isMobile ? '10px' : '14px' }}>
            {fichesFiltrees.map(fiche => {
              const uniteLabel = (fiche.unite_production && fiche.unite_production !== 'portions') ? fiche.unite_production : t('bar.sousFiches.portion')
              return (
                <div key={fiche.id} style={{ background: c.blanc, borderRadius: '12px', padding: '18px', border: `0.5px solid ${c.bordure}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ background: '#7F77DD', color: 'white', borderRadius: '6px', padding: '2px 8px', fontSize: '11px', fontWeight: '500', flexShrink: 0 }}>SF</span>
                      <span style={{ fontSize: isMobile ? '14px' : '15px', fontWeight: '500', color: c.texte }}>{fiche.nom}</span>
                    </div>
                    {fiche.cout_portion && (
                      <div style={{ background: '#EEEDFE', borderRadius: '8px', padding: '6px 10px', textAlign: 'right', flexShrink: 0, marginLeft: '8px' }}>
                        <div style={{ fontSize: '10px', color: '#3C3489', opacity: 0.7 }}>/ {uniteLabel}</div>
                        <div style={{ fontSize: '14px', fontWeight: '500', color: '#3C3489' }}>{Number(fiche.cout_portion).toFixed(3)} €</div>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: c.texteMuted, marginBottom: fiche.allergenes?.length > 0 ? '8px' : '14px' }}>
                    {fiche.nb_portions} {uniteLabel}{fiche.nb_portions > 1 && uniteLabel === 'portion' ? 's' : ''}
                    {(fiche.saison || fiche.annee) && ` — ${formatSaison(fiche.saison, fiche.annee)}`}
                  </div>
                  {fiche.allergenes && fiche.allergenes.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '14px' }}>
                      {fiche.allergenes.map(id => {
                        const a = ALLERGENES.find(al => al.id === id)
                        return a ? (
                          <Badge key={id} title={a.label} bg={'#FCEBEB'} color={'#A32D2D'} border="0.5px solid #F09595" size="sm">
                            {a.emoji} {a.label}
                          </Badge>
                        ) : null
                      })}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => router.push(`/bar/fiches/${fiche.id}`)} style={{ flex: 1, padding: '8px', background: '#EEEDFE', color: '#3C3489', border: '0.5px solid #AFA9EC', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}>{t('bar.common.view')}</button>
                    {peutModifier && (
                      <button onClick={() => router.push(`/bar/fiches/${fiche.id}/modifier`)} style={{ flex: 1, padding: '8px', background: 'transparent', color: c.texteMuted, border: `0.5px solid ${c.bordure}`, borderRadius: '8px', fontSize: '12px', cursor: 'pointer' }}>{t('bar.common.edit')}</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
