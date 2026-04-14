'use client'
import { TenantProvider } from '../lib/useTenant'
import NavigationTracker from './NavigationTracker'

export default function Providers({ children }) {
  return (
    <TenantProvider>
      <NavigationTracker />
      {children}
    </TenantProvider>
  )
}
