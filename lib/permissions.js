// Droits par établissement : matrice Rôle × Fonctionnalité à 3 niveaux.
//
// Le superadmin règle, pour chaque établissement, le niveau d'accès de chaque
// rôle à chaque fonctionnalité (Superadmin › Établissement › Droits). Les
// lignes stockées (table permissions_roles) ne contiennent que les écarts :
// sans ligne, le niveau par défaut ci-dessous s'applique. Les défauts
// reproduisent exactement les droits codés en dur avant la matrice.
//
// Utilisé côté navigateur (menus, accès aux pages, boutons d'édition via
// lib/usePermissions.js) et côté serveur (routes API via
// lib/apiGuards.js › requirePermission). Module JS sans dépendance pour être
// importable des deux côtés.
//
// Les défauts sont dupliqués en SQL (public.permission_defaut, utilisée par
// les policies RLS, cf. 20261018170000_rls_matrice_droits.sql). Changer un
// défaut ou ajouter une fonctionnalité = recréer permission_defaut dans une
// nouvelle migration ; lib/__tests__/permissionsSql.test.ts échoue sinon.

export const NIVEAUX = ['aucun', 'lecture', 'modification']
export const RANG = { aucun: 0, lecture: 1, modification: 2 }

export const ROLES = ['admin', 'directeur', 'cuisine', 'bar', 'consultant', 'commercial']

const M = 'modification'
const L = 'lecture'
const A = 'aucun'

// defauts : [admin, directeur, cuisine, bar, consultant, commercial]
export const FONCTIONNALITES = [
  // ── Fiches et contenus ─────────────────────────────────────────────────────
  { id: 'fiches_cuisine', groupe: 'Fiches et contenus', label: 'Fiches techniques cuisine',
    detail: 'Fiches, sous-fiches, archives, récap food cost, import de fiches',
    chemins: ['/fiches', '/sous-fiches', '/archives', '/recap', '/import'], defauts: [M, L, M, A, L, L] },
  { id: 'fiches_bar', groupe: 'Fiches et contenus', label: 'Fiches techniques bar',
    detail: 'Fiches bar, sous-fiches, archives, récap bev cost, import',
    chemins: ['/bar/fiches', '/bar/sous-fiches', '/bar/archives', '/bar/recap', '/bar/import'], defauts: [M, L, A, M, L, L] },
  { id: 'couts_fiches', groupe: 'Fiches et contenus', label: 'Coûts et marges sur les fiches',
    detail: 'Coût de revient, food cost et prix conseillé affichés sur une fiche',
    chemins: [], defauts: [M, L, A, A, L, A] },
  { id: 'ingredients', groupe: 'Fiches et contenus', label: 'Ingrédients',
    detail: 'Liste et prix des ingrédients cuisine et bar',
    chemins: ['/ingredients', '/bar/ingredients'], defauts: [M, L, M, M, A, A] },
  { id: 'menus_cartes', groupe: 'Fiches et contenus', label: 'Menus et cartes',
    chemins: ['/menus', '/cartes'], defauts: [M, M, M, M, M, L] },
  { id: 'avis', groupe: 'Fiches et contenus', label: 'Avis clients',
    detail: 'Avis et réponses générées par IA',
    chemins: ['/avis'], defauts: [M, L, M, L, L, L] },

  // ── Gestion ────────────────────────────────────────────────────────────────
  { id: 'achats', groupe: 'Gestion', label: 'Achats et factures',
    detail: 'Factures, BL, lecture IA, mercuriale, achats par produit',
    chemins: ['/controle-gestion/achats', '/bar/achats', '/controle-gestion/mercuriale', '/controle-gestion/achats-par-produit'],
    defauts: [M, L, L, L, L, A] },
  { id: 'fournisseurs', groupe: 'Gestion', label: 'Fournisseurs',
    chemins: ['/controle-gestion/fournisseurs'], defauts: [M, L, L, L, L, A] },
  { id: 'inventaire', groupe: 'Gestion', label: 'Inventaires',
    detail: 'Création, saisie, import, comparaison',
    chemins: ['/inventaire'], defauts: [M, L, M, M, L, A] },
  { id: 'food_cost', groupe: 'Gestion', label: 'Food cost (rapports)',
    chemins: ['/controle-gestion/food-cost'], defauts: [M, M, A, A, A, A] },
  { id: 'analyses', groupe: 'Gestion', label: 'Analyses CA et marges',
    chemins: ['/controle-gestion/analyses', '/controle-gestion/analyses-v2'], defauts: [M, M, A, A, A, A] },
  { id: 'ventes', groupe: 'Gestion', label: 'Suivi du CA et saisie des ventes',
    chemins: ['/controle-gestion/ventes'], defauts: [M, M, M, M, M, A] },
  { id: 'budgets', groupe: 'Gestion', label: 'Budgets CA',
    chemins: ['/controle-gestion/ventes/budgets'], defauts: [M, M, M, M, M, A] },
  { id: 'rapport_hebdo', groupe: 'Gestion', label: 'Rapport hebdomadaire',
    chemins: ['/controle-gestion/ventes/rapport-hebdo'], defauts: [M, M, A, A, A, A] },
  { id: 'import_ventes', groupe: 'Gestion', label: 'Import des ventes (Lightspeed)',
    chemins: ['/controle-gestion/import'], defauts: [M, A, A, A, A, A] },
  { id: 'ecarts_conso', groupe: 'Gestion', label: 'Écarts de consommation',
    chemins: ['/controle-gestion/ecarts-conso'], defauts: [M, L, L, L, L, A] },
  { id: 'vue_groupe', groupe: 'Gestion', label: 'Vue groupe',
    detail: 'Nécessite aussi le module Vue groupe sur l’établissement',
    chemins: ['/groupe'], defauts: [M, M, A, A, A, A] },

  // ── Commercial et administration ───────────────────────────────────────────
  { id: 'crm', groupe: 'Commercial et administration', label: 'CRM traiteur',
    detail: 'Clients, événements, devis',
    chemins: ['/crm'], defauts: [M, M, A, A, A, M] },
  { id: 'administration', groupe: 'Commercial et administration', label: 'Utilisateurs et paramètres',
    detail: 'Invitations, rôles, journal d’activité, paramètres de l’établissement',
    chemins: ['/admin', '/parametres'], defauts: [M, A, A, A, A, A] },
  { id: 'export_donnees', groupe: 'Commercial et administration', label: 'Export complet des données',
    detail: 'Export RGPD de toutes les données de l’établissement (Mon compte)',
    chemins: [], defauts: [M, M, A, A, A, A] },
]

const PAR_ID = new Map(FONCTIONNALITES.map((f) => [f.id, f]))

export function niveauParDefaut(fonctionnalite, role) {
  const f = PAR_ID.get(fonctionnalite)
  const i = ROLES.indexOf(role)
  if (!f || i < 0) return A
  return f.defauts[i]
}

/**
 * Niveau effectif d'un rôle pour une fonctionnalité dans un établissement.
 * @param {Array<{role:string, fonctionnalite:string, niveau:string}>} lignes  écarts stockés pour l'établissement
 */
export function niveauEffectif(lignes, role, fonctionnalite) {
  const ligne = (lignes || []).find((l) => l.role === role && l.fonctionnalite === fonctionnalite)
  if (ligne && RANG[ligne.niveau] !== undefined) return ligne.niveau
  return niveauParDefaut(fonctionnalite, role)
}

/** true si `niveau` atteint au moins `requis` ('lecture' ou 'modification'). */
export function atteint(niveau, requis) {
  return (RANG[niveau] ?? 0) >= (RANG[requis] ?? 99)
}

/** Fonctionnalité qui gouverne un chemin de page (préfixe le plus long), ou null. */
export function fonctionnalitePourChemin(chemin) {
  const path = (chemin || '').split('?')[0]
  let meilleur = null
  let longueur = -1
  for (const f of FONCTIONNALITES) {
    for (const c of f.chemins) {
      if ((path === c || path.startsWith(c + '/')) && c.length > longueur) {
        meilleur = f.id
        longueur = c.length
      }
    }
  }
  return meilleur
}

/** Matrice complète {role: {fonctionnalite: niveau}} pour l'écran superadmin. */
export function matriceComplete(lignes) {
  return Object.fromEntries(ROLES.map((role) => [
    role,
    Object.fromEntries(FONCTIONNALITES.map((f) => [f.id, niveauEffectif(lignes, role, f.id)])),
  ]))
}

/** Écarts à stocker : seulement les cases qui diffèrent du défaut. */
export function ecartsAStocker(matrice) {
  const out = []
  for (const role of ROLES) {
    for (const f of FONCTIONNALITES) {
      const niveau = matrice?.[role]?.[f.id]
      if (niveau && RANG[niveau] !== undefined && niveau !== niveauParDefaut(f.id, role)) {
        out.push({ role, fonctionnalite: f.id, niveau })
      }
    }
  }
  return out
}
