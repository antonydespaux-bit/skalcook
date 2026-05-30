'use client'
import { TenantProvider } from '../lib/useTenant'
import NavigationTracker from './NavigationTracker'
import I18nProvider from './I18nProvider'

export default function Providers({ children }) {
  return (
    <I18nProvider>
      <TenantProvider>
        <NavigationTracker />
        {children}
      </TenantProvider>
    </I18nProvider>
  )
}
