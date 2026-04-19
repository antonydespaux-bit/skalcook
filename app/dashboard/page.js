'use client'
import { useState, useEffect } from 'react'
import { supabase, getClientId, getParametres } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { theme } from '../../lib/theme.jsx'
import { useIsMobile } from '../../lib/useIsMobile'
import { useTheme } from '../../lib/useTheme'
import { useRole } from '../../lib/useRole'
import { calculerFoodCost, foodCostColor, getSeuilsFromParams } from '../../lib/foodCost'
import { getDashboardLayout, WIDGET_BY_ID } from '../../lib/dashboardPreferences'
import Navbar from '../../components/Navbar'
import InventaireBanner from '../../components/InventaireBanner'
import ChefLoader from '../../components/ChefLoader'
import { Badge } from '../../components/ui'
import KpiFoodCostMoyen from '../../components/dashboard/widgets/KpiFoodCostMoyen'
import KpiFichesActives from '../../components/dashboard/widgets/KpiFichesActives'
import KpiFichesAlerte from '../../components/dashboard/widgets/KpiFichesAlerte'
import KpiPrixModifies from '../../components/dashboard/widgets/KpiPrixModifies'
import SectionFichesAlerte from '../../components/dashboard/widgets/SectionFichesAlerte'
import SectionFichesParEspace from '../../components/dashboard/widgets/SectionFichesParEspace'
import SectionPrixModifies from '../../components/dashboard/widgets/SectionPrixModifies'
import SectionAllergenes from '../../components/dashboard/widgets/SectionAllergenes'

export default function DashboardPage() {
  const [fiches, setFiches] = useState([])
  const [menus, setMenus] = useState([])
  const [ingredientsPrixHausse, setIngredientsPrixHausse] = useState([])
  const [params, setParams] = useState({})
  const [lieux, setLieux] = useState([])
  const [layout, setLayout] = useState(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const isMobile = useIsMobile()
  const { c } = useTheme()
  const { role, nom, loading: roleLoading } = useRole()

  useEffect(() => {
    checkUser()
    loadData()
  }, [])

  useEffect(() => {
    if (!roleLoading && role && !['admin', 'cuisine', 'directeur'].includes(role)) {
      router.push(role === 'bar' ? '/bar/dashboard' : '/dashboard')
    }
  }, [role, roleLoading])

  const checkUser = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) router.push('/')
  }

  const loadData = async () => {
    const clientId = await getClientId()
    if (!clientId) { setLoading(false); return }
    const p = await getParametres()
    setParams(p)
    const [{ data: fichesData }, { data: lieuxData }, { data: menusData }, { data: prixData }, layoutData] = await Promise.all([
      supabase.from('fiches').select('*').eq('client_id', clientId).neq('categorie', 'Sous-fiche').eq('archive', false),
      supabase.from('lieux').select('id, nom, emoji').eq('client_id', clientId).eq('section', 'cuisine').order('ordre'),
      supabase.from('menus').select('*').eq('client_id', clientId).eq('archive', false),
      supabase.from('ingredients').select('*').eq('client_id', clientId)
        .not('prix_precedent', 'is', null)
        .order('prix_updated_at', { ascending: false })
        .limit(20),
      getDashboardLayout(),
    ])
    setFiches(fichesData || [])
    setLieux(lieuxData || [])
    setMenus(menusData || [])
    setIngredientsPrixHausse(prixData || [])
    setLayout(layoutData)
    setLoading(false)
  }

  const { seuilVert, seuilOrange, tva } = getSeuilsFromParams(params, 'cuisine')
  const foodCostFiche = (fiche) => calculerFoodCost(fiche.cout_portion, fiche.prix_ttc, tva)

  const fichesAvecFC = fiches.filter((f) => f.cout_portion && f.prix_ttc)
  const foodCostMoyen = fichesAvecFC.length > 0
    ? fichesAvecFC.reduce((sum, f) => sum + foodCostFiche(f), 0) / fichesAvecFC.length
    : null

  const fichesAlerte = fiches
    .filter((f) => { const fc = foodCostFiche(f); return fc && fc > seuilOrange })
    .sort((a, b) => foodCostFiche(b) - foodCostFiche(a))

  const fichesFCColor = (fc) => foodCostColor(fc, seuilVert, seuilOrange)

  const fichesByCategorie = theme.categories.map((cat) => ({
    cat, nb: fiches.filter((f) => f.categorie === cat).length,
  })).filter((item) => item.nb > 0)

  const maxFiches = Math.max(...fichesByCategorie.map((item) => item.nb), 1)

  if (loading || roleLoading || !layout) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: c.fond }}>
      <ChefLoader />
    </div>
  )

  const renderWidget = (id) => {
    switch (id) {
      case 'kpi-food-cost-moyen':
        return <KpiFoodCostMoyen c={c} isMobile={isMobile} foodCostMoyen={foodCostMoyen} nbFiches={fichesAvecFC.length} fichesFCColor={fichesFCColor} />
      case 'kpi-fiches-actives':
        return <KpiFichesActives c={c} isMobile={isMobile} nbFiches={fiches.length} nbMenus={menus.length} onClick={() => router.push('/fiches')} />
      case 'kpi-fiches-alerte':
        return <KpiFichesAlerte c={c} isMobile={isMobile} nbAlertes={fichesAlerte.length} seuilOrange={seuilOrange} />
      case 'kpi-prix-modifies':
        return <KpiPrixModifies c={c} isMobile={isMobile} nbPrix={ingredientsPrixHausse.length} />
      case 'section-fiches-alerte':
        return <SectionFichesAlerte c={c} fichesAlerte={fichesAlerte} foodCostFiche={foodCostFiche} seuilOrange={seuilOrange} onFicheClick={(id) => router.push(`/fiches/${id}`)} />
      case 'section-fiches-par-espace':
        return <SectionFichesParEspace c={c} fichesByCategorie={fichesByCategorie} maxFiches={maxFiches} />
      case 'section-prix-modifies':
        return <SectionPrixModifies c={c} ingredientsPrixHausse={ingredientsPrixHausse} />
      case 'section-allergenes':
        return <SectionAllergenes c={c} fiches={fiches} lieux={lieux} params={params} />
      // Widgets déclarés dans le catalog mais pas encore implémentés (étape 4) :
      // kpi-ca-mtd, kpi-marge-mtd, section-crm-evenements
      default:
        return null
    }
  }

  const visibleLayout = layout.filter((l) => l.visible && WIDGET_BY_ID[l.id])
  const kpiLayout = visibleLayout.filter((l) => WIDGET_BY_ID[l.id].size === 'kpi')
  const sectionLayout = visibleLayout.filter((l) => WIDGET_BY_ID[l.id].size !== 'kpi')

  const kpiCols = isMobile ? 2 : Math.min(Math.max(kpiLayout.length, 1), 4)

  // Grouper les sections en lignes : deux 'half' consécutives s'associent,
  // sinon chaque widget prend toute la largeur.
  const sectionRows = []
  let i = 0
  while (i < sectionLayout.length) {
    const current = sectionLayout[i]
    const next = sectionLayout[i + 1]
    const currentSize = WIDGET_BY_ID[current.id].size
    const nextSize = next ? WIDGET_BY_ID[next.id].size : null
    if (currentSize === 'half' && nextSize === 'half') {
      sectionRows.push([current, next])
      i += 2
    } else {
      sectionRows.push([current])
      i += 1
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: c.fond }}>
      <Navbar section="cuisine" />
      <InventaireBanner />

      <div className="no-print" style={{ padding: isMobile ? '12px' : '24px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', color: c.texteMuted, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: '500' }}>
            Tableau de bord Cuisine — {params['nom_etablissement'] || 'La Fantaisie'}
          </div>
          {nom && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: c.texteMuted }}>
                Bonjour, <strong style={{ color: c.texte }}>{nom}</strong>
              </span>
              <Badge
                bg={role === 'admin' ? '#F0E8E0' : role === 'cuisine' ? '#EAF3DE' : '#FAEEDA'}
                color={role === 'admin' ? '#2C1810' : role === 'cuisine' ? '#3B6D11' : '#854F0B'}
              >
                {role === 'admin' ? 'Administrateur' : role === 'cuisine' ? 'Cuisine' : 'Directeur'}
              </Badge>
            </div>
          )}
        </div>

        {kpiLayout.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: `repeat(${kpiCols}, 1fr)`,
            gap: isMobile ? '10px' : '16px', marginBottom: '24px',
          }}>
            {kpiLayout.map((l) => <div key={l.id}>{renderWidget(l.id)}</div>)}
          </div>
        )}

        {sectionRows.map((row, idx) => (
          <div
            key={row.map((r) => r.id).join('|')}
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile || row.length === 1 ? '1fr' : '1fr 1fr',
              gap: isMobile ? '12px' : '16px',
              marginBottom: idx < sectionRows.length - 1 ? (isMobile ? '12px' : '16px') : 0,
            }}
          >
            {row.map((l) => <div key={l.id}>{renderWidget(l.id)}</div>)}
          </div>
        ))}
      </div>
    </div>
  )
}
