// GET /api/cron/thefork — tâche de nuit (Vercel Cron, cf. vercel.json).
//
// Vercel envoie `Authorization: Bearer $CRON_SECRET` ; sans CRON_SECRET
// configuré, la route refuse tout appel. Synchronise chaque groupe actif dans
// le temps imparti ; ce qui n'est pas fini reprend la nuit suivante.

import { getServiceClient } from '../../../../lib/apiGuards'
import { clientTheForkDepuisEnv } from '../../../../lib/services/thefork.service'
import { synchroniserTheFork } from '../../../../lib/services/theforkSync.service'

export const maxDuration = 60

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Non autorisé' }, { status: 401 })
  }
  const api = clientTheForkDepuisEnv()
  if (!api) return Response.json({ ok: true, ignore: 'Identifiants TheFork absents' })

  const db = getServiceClient()
  const { data: groupes } = await db.from('crm_thefork_sync').select('groupe_id').eq('actif', true)
  const fin = Date.now() + 50_000
  const resultats: Record<string, unknown> = {}
  for (const { groupe_id } of groupes || []) {
    const reste = fin - Date.now()
    if (reste < 5_000) break
    resultats[groupe_id] = await synchroniserTheFork(db, api, groupe_id, { budgetMs: reste - 5_000 })
  }
  return Response.json({ ok: true, resultats })
}
