/**
 * test-db.js — Script de diagnostic pour la table ventes_journalieres
 *
 * Usage :
 *   node --env-file=.env.local test-db.js
 *
 * Ce script vérifie :
 *   A. Connexion avec la service role key (bypass RLS) → confirme que les données existent
 *   B. Connexion avec la anon key (comme le front) → révèle si RLS bloque
 *   C. Filtre .eq('jour', ...) → révèle un type mismatch de colonne
 *   D. Filtre .gte/.lt range sur jour → méthode robuste date ET timestamptz
 *   E. Filtre .eq('client_id', ...) → confirme le bon client_id
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Date à tester — modifiez si besoin (format YYYY-MM-DD)
const TEST_JOUR = process.env.TEST_JOUR || new Date().toISOString().slice(0, 10)

// client_id à tester — remplacez par le vrai UUID de votre établissement
const TEST_CLIENT_ID = process.env.TEST_CLIENT_ID || 'fa725e66-2cad-4ea4-892a-7eb3e90496a7'

function mask(s) {
  if (!s) return '(non défini)'
  return s.slice(0, 8) + '...' + s.slice(-4)
}

async function run() {
  console.log('=== test-db.js — Diagnostic ventes_journalieres ===\n')

  // Vérification de l'environnement
  console.log('📋 Variables d\'environnement :')
  console.log('  NEXT_PUBLIC_SUPABASE_URL     :', SUPABASE_URL || '(non défini ⚠️)')
  console.log('  NEXT_PUBLIC_SUPABASE_ANON_KEY:', mask(ANON_KEY))
  console.log('  SUPABASE_SERVICE_ROLE_KEY    :', mask(SERVICE_KEY))
  console.log('  TEST_JOUR                    :', TEST_JOUR)
  console.log('  TEST_CLIENT_ID               :', TEST_CLIENT_ID)
  console.log()

  if (!SUPABASE_URL || !ANON_KEY) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY manquant.')
    console.error('   Créez un fichier .env.local (voir .env.local.example) et relancez :')
    console.error('   node --env-file=.env.local test-db.js')
    process.exit(1)
  }

  const anonClient = createClient(SUPABASE_URL, ANON_KEY)
  const serviceClient = SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY) : null

  // ── Test A : Service role, aucun filtre ──────────────────────────────────
  console.log('── Test A : service role, count global (bypass RLS) ──')
  if (!serviceClient) {
    console.log('   ⏭  SUPABASE_SERVICE_ROLE_KEY absent — test ignoré')
    console.log('   → Ajoutez SUPABASE_SERVICE_ROLE_KEY dans .env.local pour ce test\n')
  } else {
    const { count, error } = await serviceClient
      .from('ventes_journalieres')
      .select('*', { count: 'exact', head: true })
    if (error) {
      console.log('   ❌ Erreur :', error.message, '| Code :', error.code)
    } else {
      console.log('   ✅ Total lignes dans la table :', count)
      if (count === 0) console.log('   ⚠️  La table est vide côté base — vérifiez les migrations.')
    }
    console.log()
  }

  // ── Test B : Anon key, aucun filtre (RLS check) ──────────────────────────
  console.log('── Test B : anon key, count global (RLS check) ──')
  {
    const { count, error } = await anonClient
      .from('ventes_journalieres')
      .select('*', { count: 'exact', head: true })
    if (error) {
      console.log('   ❌ Erreur :', error.message, '| Code :', error.code)
      if (error.code === '42501' || error.message.includes('permission')) {
        console.log('   → La politique RLS bloque l\'accès anon. Ajoutez une policy SELECT pour les utilisateurs authentifiés.')
      }
    } else {
      console.log('   Résultat count :', count)
      if (count === 0) {
        console.log('   ⚠️  RLS bloque probablement : 0 ligne visible avec la clé anon (sans auth).')
        console.log('   → Vérifiez les politiques RLS dans Supabase > Authentication > Policies.')
      } else {
        console.log('   ✅ Lignes visibles sans filtre :', count)
      }
    }
    console.log()
  }

  // ── Test C : Filtre .eq('jour', ...) — détecte un type mismatch ──────────
  console.log(`── Test C : anon key, .eq('jour', '${TEST_JOUR}') ──`)
  {
    const { count, error } = await anonClient
      .from('ventes_journalieres')
      .select('*', { count: 'exact', head: true })
      .eq('jour', TEST_JOUR)
    if (error) {
      console.log('   ❌ Erreur :', error.message, '| Code :', error.code)
    } else {
      console.log('   Résultat count :', count)
      if (count === 0) {
        console.log('   ⚠️  Aucune ligne avec .eq() exact. Causes possibles :')
        console.log('      - Colonne "jour" est de type timestamptz → utilisez la range query (Test D)')
        console.log('      - RLS bloque (vérifiez Test B)')
        console.log('      - Pas de données pour ce jour')
      }
    }
    console.log()
  }

  // ── Test D : Range .gte/.lt — robuste pour date ET timestamptz ───────────
  const nextDay = new Date(TEST_JOUR)
  nextDay.setDate(nextDay.getDate() + 1)
  const nextDayStr = nextDay.toISOString().slice(0, 10)
  console.log(`── Test D : anon key, .gte('jour', '${TEST_JOUR}').lt('jour', '${nextDayStr}') ──`)
  {
    const { count, error } = await anonClient
      .from('ventes_journalieres')
      .select('*', { count: 'exact', head: true })
      .gte('jour', TEST_JOUR)
      .lt('jour', nextDayStr)
    if (error) {
      console.log('   ❌ Erreur :', error.message, '| Code :', error.code)
    } else {
      console.log('   Résultat count :', count)
      if (count !== null && count > 0) {
        console.log('   ✅ La range query fonctionne — la page doit être corrigée avec .gte/.lt')
      }
    }
    console.log()
  }

  // ── Test E : Filtre client_id ─────────────────────────────────────────────
  console.log(`── Test E : anon key, .eq('client_id', '${TEST_CLIENT_ID}') ──`)
  {
    const { count, error } = await anonClient
      .from('ventes_journalieres')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', TEST_CLIENT_ID)
    if (error) {
      console.log('   ❌ Erreur :', error.message, '| Code :', error.code)
    } else {
      console.log('   Résultat count :', count)
      if (count === 0) {
        console.log('   ⚠️  Aucune ligne pour ce client_id.')
        console.log('   → Vérifiez que TEST_CLIENT_ID correspond bien aux données Supabase.')
        console.log('   → Passez TEST_CLIENT_ID=<uuid> en variable d\'env pour tester un autre client.')
      } else {
        console.log('   ✅ Lignes pour ce client :', count)
      }
    }
    console.log()
  }

  console.log('=== Diagnostic terminé ===')
}

run().catch((err) => {
  console.error('Erreur fatale :', err)
  process.exit(1)
})
