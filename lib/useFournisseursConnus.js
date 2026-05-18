'use client'
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * Charge les noms des fournisseurs existants d'un client pour autocomplete.
 * Utilisé sur l'écran d'import (création) et d'édition de facture pour
 * éviter les doublons orthographiques (ex: "Metro" vs "METRO").
 */
export function useFournisseursConnus(clientId) {
  const [fournisseurs, setFournisseurs] = useState([])

  useEffect(() => {
    let cancel = false
    ;(async () => {
      if (!clientId) {
        if (!cancel) setFournisseurs([])
        return
      }
      const { data } = await supabase
        .from('fournisseurs')
        .select('nom')
        .eq('client_id', clientId)
        .order('nom')
      if (!cancel) setFournisseurs((data || []).map((f) => f.nom).filter(Boolean))
    })()
    return () => { cancel = true }
  }, [clientId])

  return fournisseurs
}
