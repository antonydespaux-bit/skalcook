'use client'
import { TenantProvider } from '../lib/useTenant'
import NavigationTracker from './NavigationTracker'
import I18nProvider from './I18nProvider'
import PermissionGate from './PermissionGate'
import { PermissionsProvider } from '../lib/usePermissions'

export default function Providers({ children }) {
  return (
    <I18nProvider>
      <TenantProvider>
        <PermissionsProvider>
          <NavigationTracker />
          <PermissionGate />
          {children}
        </PermissionsProvider>
      </TenantProvider>
    </I18nProvider>
  )
}
