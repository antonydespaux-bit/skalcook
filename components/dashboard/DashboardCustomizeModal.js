'use client'
import {
  WIDGET_BY_ID,
  DEFAULT_LAYOUT,
  saveDashboardLayout,
  resetDashboardLayout,
  isWidgetAvailable,
} from '../../lib/dashboardPreferences'
import WidgetsCustomizeModal from './WidgetsCustomizeModal'

// Wrapper rétro-compatible : la page /dashboard continue de monter
// <DashboardCustomizeModal …/> tel quel ; on injecte ici le catalogue,
// le layout par défaut et les fonctions save/reset propres au dashboard.
export default function DashboardCustomizeModal({ c, initialLayout, modulesActifs = [], onClose, onSaved }) {
  return (
    <WidgetsCustomizeModal
      c={c}
      initialLayout={initialLayout}
      modulesActifs={modulesActifs}
      widgetById={WIDGET_BY_ID}
      defaultLayout={DEFAULT_LAYOUT}
      saveLayout={saveDashboardLayout}
      resetLayout={resetDashboardLayout}
      isWidgetAvailable={isWidgetAvailable}
      title="Personnaliser mon tableau de bord"
      onClose={onClose}
      onSaved={onSaved}
    />
  )
}
