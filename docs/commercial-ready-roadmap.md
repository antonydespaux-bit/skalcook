# Checklist de Mise en Production Commerciale — Skalcook

> État des lieux du 2026-05-30. Objectif : passer du prototype interne au **SaaS B2B commercialisable, performant, ultra-sécurisé et scalable**.
> Sévérités : 🔴 **Critique** (bloque la vente) · 🟠 **Élevé** (à faire avant les premiers clients payants) · 🟡 **Moyen** (à planifier) · ⚪ **Faible** (confort/dette).

---

## Verdict global

| Axe | Note | Synthèse |
|---|---|---|
| 1. Multi-tenant & rôles | 🟠 4/5 | Isolation **par client** solide (guards + RLS + UUID). **Mais** les rôles bar/cuisine ne sont PAS cloisonnés : un compte « cuisine » peut techniquement écrire les fiches bar et inversement. |
| 2. Performance & CSS | 🟠 2/5 | Design System immature (4 primitives, 27 imports). 4708 `style={{}}` inline, 1089 hex en dur. Code mort confirmé. Pas de `next/image`, `xlsx` importé en statique, `select('*')` massif. |
| 3. Robustesse import/export | 🔴 partiel | **L'import Excel de fiches techniques n'existe pas** — or c'est l'argument de vente n°1 (« j'arrive avec 300 fiches »). Import ingrédients en ~600 requêtes séquentielles, sans transaction ni batch. |
| 4. Sécurité de production | 🟠 3,5/5 | Headers/HSTS OK, rate-limit Upstash réel, Zod sur ~50 routes. **Mais** : route `avis-response` sans guard (Denial-of-Wallet sur Claude Opus), CVE `xlsx`, CSP permissive. |

**On peut vendre techniquement le cœur food-cost**, mais 3 points bloquent une mise en marché propre :
1. 🔴 Cloisonnement des rôles bar/cuisine (sécurité multi-tenant).
2. 🔴 Absence d'import Excel des fiches (promesse commerciale non tenue).
3. 🟠 Route `avis-response` non protégée (risque de facture API incontrôlée).

---

## Priorité 1 — Multi-tenant & rôles

### 🔴 BLOCKER : les rôles bar/cuisine ne sont pas cloisonnés
- `requireMemberOfClient` ([lib/apiGuards.js:148](lib/apiGuards.js:148)) accepte **n'importe quel rôle** dès qu'on est membre du client.
- Les policies RLS de `fiches` / `fiches_bar` / `ingredients` / `ingredients_bar` ([migration 20260408000000:107](supabase/migrations/20260408000000_rls_hardening_drop_user_metadata.sql:107)) ne testent que `user_has_client_access(client_id)` — **aucune condition de rôle/section**.
- `useRole.js:99` est purement **cosmétique** (cache des boutons côté front, sans barrière serveur).
- **Conséquence** : un compte « cuisine » peut appeler l'API/écrire en base les données bar (et inversement). Pas une fuite *cross-client*, mais une fuite *cross-rôle* à l'intérieur d'un client → inacceptable pour un produit vendu à des hôtels avec équipes séparées.
- **Fix** : ajouter un paramètre de section/rôle à `requireMemberOfClient` + conditions RLS par section. **C'est le point de départ recommandé.**

### 🟡 Moyen
- JWT passé en query string dans [app/api/achats/fichier-facture/route.ts:21](app/api/achats/fichier-facture/route.ts:21) (`?token=`) pour les iframes → token loggable (proxys, historique). Préférer un cookie/Authorization header ou une signed URL courte.
- ~30 tables sont lues **directement depuis le navigateur** et reposent entièrement sur RLS. Risque connu : les overrides dashboard peuvent diverger des migrations (cf. audit RLS du 2026-05-30). À re-vérifier régulièrement en prod.
- [app/api/avis-response](app/api/avis-response) en `guard:'none'` (voir aussi Priorité 4).

✅ **Solide** : guards cohérents, scoping `client_id` systématique, identifiants UUID, rôle vérifié contre `acces_clients`. Le service_role (`getServiceClient()`) bypasse RLS uniquement côté serveur, jamais exposé.

---

## Priorité 2 — Performance & nettoyage CSS

### 🟠 Élevé
- **Design System immature (2/5)** : seulement 4 primitives dans `components/ui/` (Button, Card, Badge, Alert) et **27 imports** seulement. À l'inverse : **4708 `style={{}}`** inline répartis sur 131 fichiers.
  - Pires offenders : [controle-gestion/ventes/budgets/page.js](app/controle-gestion/ventes/budgets/page.js) (197), [achats/import/page.js](app/achats/import/page.js) (187), [fiches/[id]/page.js](app/fiches/[id]/page.js) (126).
- **1089 couleurs hex en dur** dans 92 fichiers → branding par établissement (cf. [[feedback-button-text-color]]) fragile et non maintenable.
- **`xlsx` importé en statique** (IngredientsView.jsx:5, ImportView.jsx:8, achats/page.js:5) → alourdit le bundle de toutes les pages. À passer en `import()` dynamique.

### 🟡 Moyen
- **74/78 pages en `'use client'`** → quasi aucun rendu serveur, mauvais pour le TTFB et le SEO de la landing.
- **0 `next/image`**, 15 `<img>` bruts → pas d'optimisation d'images.
- `select('*')` dans 83 endroits + `.limit(5000)` dans ~7 fichiers → sur-fetch, ne scale pas à 300+ fiches.

### ⚪ Faible — code mort confirmé (suppression sûre)
- `components/marges/DateSelector.jsx`, `components/marges/StatsCards.jsx`, `components/marges/helpers.js`, `components/FicheFormShared.jsx` — aucune référence. Cleanup pur.

---

## Priorité 3 — Robustesse importation (JSON/Excel)

### 🔴 BLOCKER : pas d'import Excel des fiches techniques
- Seul existe un round-trip **JSON de backup** ([app/api/import-data/route.ts](app/api/import-data/route.ts)). **Aucun import Excel/CSV de fiches.**
- C'est pourtant l'argument de vente n°1 : « le client arrive avec ses 300 fiches ». **Promesse non tenue aujourd'hui.**

### 🟠 Élevé
- [components/ImportView.jsx](components/ImportView.jsx) importe les ingrédients via **~600 requêtes séquentielles** pour 300 lignes → lent, fragile, timeout probable. À convertir en batch/upsert.
- **Aucune transactionnalité** dans `import-data` → un échec à mi-parcours laisse des données partielles incohérentes.
- **Limite de payload ~4,5 MB** (pas de `sizeLimit`/`vercel.json`) → un gros fichier casse l'import sans message clair.

✅ **Bon** : l'export ([app/api/export-data/route.ts](app/api/export-data/route.ts)) est correctement scopé par `client_id`.

---

## Priorité 4 — Sécurité de production

### 🟠 Élevé
- **Denial-of-Wallet** : [app/api/avis-response/route.ts:15](app/api/avis-response/route.ts:15) en `guard:'none'` appelle **Claude Opus** sans authentification → un attaquant peut faire exploser la facture API. **À protéger en priorité (guard + rate-limit dédié).**
- **CVE `xlsx@0.18.5`** (Prototype Pollution / ReDoS sur fichier Excel uploadé). Migrer vers `xlsx` patché (CDN SheetJS) ou `exceljs`.
- **CSP permissive** : `'unsafe-inline' 'unsafe-eval'` dans `script-src` ([proxy.ts:155](proxy.ts:155)) + CSP minimale redondante dans [next.config.mjs:9](next.config.mjs:9). À consolider en une seule CSP stricte.

### 🟡 Moyen
- `NEXT_PUBLIC_SUPERADMIN_EMAILS` exposé dans le bundle client ([lib/superadmin.js:22](lib/superadmin.js:22)).
- Clé anon en dur dans [components/LandingClient.jsx:9](components/LandingClient.jsx:9) (anon = pas un secret, mais à centraliser).
- CORS `*` sur [app/docs/route.js:7](app/docs/route.js:7).

✅ **Solide** : headers complets (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy) dans [proxy.ts:155](proxy.ts:155), rate-limit Upstash réel (60 req/min/IP sur `/api/*`), Zod sur ~50/52 routes, DOMPurify, pas d'injection SQL/SSRF détectée.

### ⚪ Hors de notre contrôle immédiat
- `auth_leaked_password_protection` : nécessite le **plan Pro Supabase** (bloqué par le tier gratuit). À activer dès l'upgrade.

---

## Plan d'action recommandé (ordre)

1. 🔴 **Cloisonnement rôles bar/cuisine** — `lib/apiGuards.js` + nouvelle migration RLS. *(point de départ)*
2. 🟠 **Guard sur `avis-response`** — `app/api/avis-response/route.ts` (rapide, stoppe le risque financier).
3. 🔴 **Import Excel des fiches** — nouvelle route + UI (la feature qui débloque la vente).
4. 🟠 **Upgrade `xlsx` + CSP stricte** — sécurité.
5. 🟠 **Batch/transaction sur les imports** — robustesse.
6. 🟡 **Design System** : étendre `components/ui/`, migrer les pires `page.js`, hex → tokens.
7. ⚪ **Cleanup** code mort + `select('*')` ciblés + `next/image`.

---

## Par quel fichier commencer

**`lib/apiGuards.js`** (puis une migration RLS associée).

C'est le seul **vrai blocker de sécurité d'isolation** : aujourd'hui un membre « cuisine » peut écrire les données « bar » du même établissement parce que `requireMemberOfClient` ([lib/apiGuards.js:148](lib/apiGuards.js:148)) ignore le rôle. On corrige le guard serveur **et** les policies RLS pour cloisonner par section. C'est rapide, ça ferme une faille réelle, et ça pose la brique sur laquelle le reste du produit multi-tenant s'appuie.

En parallèle quasi-immédiat (5 min) : poser le guard sur [app/api/avis-response/route.ts](app/api/avis-response/route.ts) pour couper le risque de Denial-of-Wallet.
