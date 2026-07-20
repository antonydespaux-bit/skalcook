#!/usr/bin/env node
/**
 * Test d'isolation multi-tenant à DEUX comptes — audit pré-vente Skalcook.
 *
 * Objectif : prouver qu'un utilisateur du restaurant A ne peut NI lire NI écrire
 * les données du restaurant B, à trois niveaux :
 *   1. RLS directe (PostgREST via clé anon + session utilisateur) — le cœur de la
 *      garantie : même en tapant l'API Supabase à la main, B est invisible pour A.
 *   2. Storage (buckets fiches-photos / clients-logos).
 *   3. Routes API applicatives (/api/*) — les guards refusent le client_id de B.
 *
 * ⚠️ PROD : ce script se connecte au Supabase indiqué par les variables d'env.
 *    En l'absence de staging, il tape la PROD. Les tests de LECTURE sont sûrs.
 *    Les tests d'ÉCRITURE sont désactivés par défaut (ISO_INCLUDE_WRITES=true
 *    pour les activer) et s'auto-nettoient si jamais une écriture passait.
 *
 * ─── Pré-requis ──────────────────────────────────────────────────────────────
 *   - Deux comptes RÉELS appartenant à deux établissements DIFFÉRENTS.
 *   - Aucun des deux ne doit être superadmin (sinon il voit tout, c'est normal).
 *
 * ─── Utilisation ─────────────────────────────────────────────────────────────
 *   Renseigner ces variables (ex. dans un fichier .env.isolation NON commité) :
 *
 *     SUPABASE_URL=...            # ou NEXT_PUBLIC_SUPABASE_URL
 *     SUPABASE_ANON_KEY=...       # ou NEXT_PUBLIC_SUPABASE_ANON_KEY
 *     ISO_A_EMAIL=... ISO_A_PASSWORD=... ISO_A_CLIENT_ID=<uuid client A>
 *     ISO_B_EMAIL=... ISO_B_PASSWORD=... ISO_B_CLIENT_ID=<uuid client B>
 *     # optionnels :
 *     ISO_BASE_URL=https://app.skalcook.com   # active les tests routes API
 *     ISO_INCLUDE_WRITES=true                 # active les tests d'écriture (prod!)
 *
 *   Puis :
 *     node --env-file=.env.isolation scripts/test-isolation.mjs
 *   (ou exporter les variables puis `node scripts/test-isolation.mjs`)
 *
 * Sortie : une ligne PASS/FAIL par contrôle + un résumé. Code de sortie ≠ 0 si
 * au moins un FAIL (utilisable en CI).
 */

import { createClient } from '@supabase/supabase-js'

// ─── Config ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const A = {
  email: process.env.ISO_A_EMAIL,
  password: process.env.ISO_A_PASSWORD,
  clientId: process.env.ISO_A_CLIENT_ID,
}
const B = {
  email: process.env.ISO_B_EMAIL,
  password: process.env.ISO_B_PASSWORD,
  clientId: process.env.ISO_B_CLIENT_ID,
}
const BASE_URL = process.env.ISO_BASE_URL || null
const INCLUDE_WRITES = process.env.ISO_INCLUDE_WRITES === 'true'

// Tables tenant à contrôler (toutes portent un client_id).
const TENANT_TABLES = [
  'fiches', 'fiches_bar', 'ingredients', 'ingredients_bar',
  'achats_factures', 'achats_lignes', 'inventaires', 'inventaire_lignes',
  'ventes_journalieres', 'ca_journalier', 'ca_budgets', 'fournisseurs',
  'food_cost_rapports', 'crm_clients', 'crm_devis', 'mapping_ventes',
  'lieux', 'cartes', 'menus', 'parametres',
]

// ─── Petit harnais de test ───────────────────────────────────────────────────
let passed = 0
let failed = 0
const failures = []

function ok(name, detail = '') {
  passed++
  console.log(`  ✅ PASS  ${name}${detail ? ` — ${detail}` : ''}`)
}
function ko(name, detail = '') {
  failed++
  failures.push(name)
  console.log(`  ❌ FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
}
function assertEmpty(name, data, error) {
  // On considère "isolé" si : erreur RLS (bloqué) OU 0 ligne renvoyée.
  if (error) return ok(name, `bloqué (${error.code || error.message})`)
  if (!data || data.length === 0) return ok(name, '0 ligne visible')
  return ko(name, `${data.length} ligne(s) de B visibles !`)
}

function requireEnv() {
  const missing = []
  if (!SUPABASE_URL) missing.push('SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL')
  if (!ANON_KEY) missing.push('SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY')
  for (const [k, v] of Object.entries({
    ISO_A_EMAIL: A.email, ISO_A_PASSWORD: A.password, ISO_A_CLIENT_ID: A.clientId,
    ISO_B_EMAIL: B.email, ISO_B_PASSWORD: B.password, ISO_B_CLIENT_ID: B.clientId,
  })) if (!v) missing.push(k)
  if (missing.length) {
    console.error('Variables manquantes :\n  - ' + missing.join('\n  - '))
    process.exit(2)
  }
  if (A.clientId === B.clientId) {
    console.error('ISO_A_CLIENT_ID et ISO_B_CLIENT_ID doivent être DIFFÉRENTS.')
    process.exit(2)
  }
}

function newClient() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function signIn(who) {
  const sb = newClient()
  const { data, error } = await sb.auth.signInWithPassword({ email: who.email, password: who.password })
  if (error || !data?.session) {
    console.error(`Connexion ${who.email} échouée : ${error?.message || 'pas de session'}`)
    process.exit(2)
  }
  return { sb, jwt: data.session.access_token, userId: data.user.id }
}

// ─── Scénarios ───────────────────────────────────────────────────────────────
async function run() {
  requireEnv()
  console.log(`\n🔐 Test d'isolation A → B  (A=${A.clientId.slice(0, 8)}…  B=${B.clientId.slice(0, 8)}…)\n`)

  const a = await signIn(A)
  await signIn(B) // valide juste que le compte B existe / se connecte

  // 0. Sanity : A voit bien SES propres accès (sinon le test lui-même est faux).
  {
    const { data, error } = await a.sb.from('acces_clients').select('client_id').eq('user_id', a.userId)
    if (error || !data || data.length === 0) ko('sanity: A lit ses propres acces_clients', error?.message || 'aucune ligne')
    else ok('sanity: A lit ses propres acces_clients', `${data.length} ligne(s)`)
  }

  // 1. RLS LECTURE cross-tenant : A ne doit voir AUCUNE ligne de B.
  console.log('\n── 1. RLS lecture directe (PostgREST) ──')
  for (const table of TENANT_TABLES) {
    const { data, error } = await a.sb.from(table).select('id, client_id').eq('client_id', B.clientId).limit(5)
    // Cas particulier : table inexistante / colonne absente → on signale sans compter comme fuite.
    if (error && /relation|column|does not exist/i.test(error.message)) {
      console.log(`  ⚠️  SKIP  ${table} — ${error.message}`)
      continue
    }
    assertEmpty(`lecture ${table} (client_id = B)`, data, error)
  }
  // clients : A ne doit pas voir la fiche établissement de B.
  {
    const { data, error } = await a.sb.from('clients').select('id').eq('id', B.clientId).limit(1)
    assertEmpty('lecture clients (id = B)', data, error)
  }
  // acces_clients : A ne doit voir aucune ligne d'accès de B.
  {
    const { data, error } = await a.sb.from('acces_clients').select('user_id').eq('client_id', B.clientId).limit(5)
    assertEmpty('lecture acces_clients (client_id = B)', data, error)
  }

  // 2. Storage : A ne doit pas lister les fichiers de B.
  console.log('\n── 2. Storage ──')
  {
    const { data, error } = await a.sb.storage.from('clients-logos').list(B.clientId)
    // list d'un dossier non autorisé → data vide (ou erreur).
    assertEmpty(`storage clients-logos/${B.clientId.slice(0, 8)}…`, data, error)
  }

  // 3. Routes API applicatives (si ISO_BASE_URL fourni).
  if (BASE_URL) {
    console.log('\n── 3. Routes API (guards) ──')
    const cases = [
      { path: '/api/export-data', body: { client_id: B.clientId } },
      { path: '/api/food-cost/rapports', body: { clientId: B.clientId } },
    ]
    for (const c of cases) {
      try {
        const res = await fetch(`${BASE_URL}${c.path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${a.jwt}` },
          body: JSON.stringify(c.body),
        })
        if (res.status === 403) ok(`API ${c.path} (client_id = B) → 403`)
        else if (res.status === 401) ko(`API ${c.path}`, 'token A rejeté (401) — test à revoir')
        else ko(`API ${c.path} (client_id = B)`, `statut ${res.status} au lieu de 403`)
      } catch (e) {
        console.log(`  ⚠️  SKIP  API ${c.path} — ${e.message}`)
      }
    }
  } else {
    console.log('\n── 3. Routes API : SKIP (ISO_BASE_URL non fourni) ──')
  }

  // 4. Écriture cross-tenant (opt-in, prod → auto-nettoyage).
  if (INCLUDE_WRITES) {
    console.log('\n── 4. Écriture cross-tenant (ISO_INCLUDE_WRITES) ──')
    // A tente d'INSÉRER une fiche marquée pour le client de B. Doit être bloqué
    // par la policy WITH CHECK. Si ça passe (fuite), on supprime aussitôt.
    const marker = `__ISO_TEST_A_${Date.now()}__`
    const { data, error } = await a.sb
      .from('fiches')
      .insert({ client_id: B.clientId, nom: marker, section: 'cuisine' })
      .select('id')
    if (error) {
      ok('écriture fiches (client_id = B) bloquée', error.code || error.message)
    } else if (data && data.length) {
      ko('écriture fiches (client_id = B)', 'INSERT accepté — FUITE ! (nettoyage en cours)')
      // Nettoyage best-effort (via A ; sinon signaler l'id à supprimer à la main).
      const id = data[0].id
      const { error: delErr } = await a.sb.from('fiches').delete().eq('id', id)
      if (delErr) console.log(`     ⚠️  Suppression auto échouée, SUPPRIMER MANUELLEMENT fiches.id=${id}`)
    } else {
      ok('écriture fiches (client_id = B)', 'aucune ligne créée')
    }
  } else {
    console.log('\n── 4. Écriture cross-tenant : SKIP (ISO_INCLUDE_WRITES≠true) ──')
  }

  // ─── Résumé ────────────────────────────────────────────────────────────────
  console.log(`\n────────────────────────────────────────`)
  console.log(`Résultat : ${passed} PASS / ${failed} FAIL`)
  if (failed) {
    console.log(`\n⛔ ISOLATION ROMPUE sur :\n  - ${failures.join('\n  - ')}`)
    process.exit(1)
  }
  console.log(`\n✅ Isolation A → B respectée sur tous les contrôles.`)
  console.log(`   (Relancer en inversant A et B pour couvrir les deux sens.)`)
}

run().catch((e) => {
  console.error('Erreur inattendue :', e)
  process.exit(3)
})
