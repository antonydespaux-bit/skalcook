// GET /api/cron/thefork — tâche de nuit (Vercel Cron, cf. vercel.json).
//
// Vercel envoie `Authorization: Bearer $CRON_SECRET` ; sans CRON_SECRET
// configuré, la route refuse tout appel. Synchronise chaque groupe actif qui
// a ses identifiants TheFork, dans le temps imparti ; ce qui n'est pas fini
// reste dans la file et reprend au passage suivant.

import { getServiceClient } from '../../../../lib/apiGuards'
import { synchroniserTheFork } from '../../../../lib/services/theforkSync.service'

export const maxDuration = 60

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const db = getServiceClient()
  const { data: groupes } = await db.from('crm_thefork_sync').select('groupe_id')
    .eq('actif', true).not('vault_secret_id', 'is', null).not('thefork_group_uuid', 'is', null)
  const fin = Date.now() + 50_000
  const resultats: Record<string, unknown> = {}
  for (const { groupe_id } of groupes || []) {
    const reste = fin - Date.now()
    if (reste < 5_000) break
    resultats[groupe_id] = await synchroniserTheFork(db, groupe_id, { budgetMs: reste - 5_000 })
  }
  return Response.json({ ok: true, resultats })
}
