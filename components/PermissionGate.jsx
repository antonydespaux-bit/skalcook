'use client'
import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { usePermissions } from '../lib/usePermissions'
import { fonctionnalitePourChemin } from '../lib/permissions'

// Garde central : une page dont la fonctionnalité est à « aucun » pour le rôle
// de l'utilisateur dans l'établissement actif renvoie vers le tableau de bord.
// Les pages hors catalogue (dashboard, mon compte, superadmin…) ne sont pas
// concernées. Les routes serveur appliquent les mêmes droits (requirePermission).
export default function PermissionGate() {
  const pathname = usePathname()
  const router = useRouter()
  const { loading, role, peutVoir } = usePermissions()

  useEffect(() => {
    if (loading || !role) return
    const f = fonctionnalitePourChemin(pathname)
    if (f && !peutVoir(f)) router.replace(role === 'bar' ? '/bar/dashboard' : '/dashboard')
  }, [loading, role, pathname, peutVoir, router])

  return null
}
