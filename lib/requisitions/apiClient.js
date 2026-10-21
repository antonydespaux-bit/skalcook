'use client'
import { supabase } from '../supabase'

/**
 * Appel des routes /api/requisitions/* avec le jeton de session.
 * Lève une Error portant le message renvoyé par la route.
 */
export async function appelApiRequisitions(chemin, { method = 'GET', body } = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  const res = await fetch(chemin, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
  return json
}
