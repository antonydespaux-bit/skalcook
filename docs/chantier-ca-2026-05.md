# Chantier CA & Budgets — mai 2026

Travaux réalisés sur la **gestion des ventes, budgets et analyses CA** entre les 9 et 11 mai 2026, soit **15 PR** mergées en prod.

Le chantier couvre :

1. **Analyses CA** : page d'analyse multi-widgets remplaçant l'ancien `/marges`
2. **Suivi CA** : améliorations vue mensuelle (Δ Budget, Month to date)
3. **Budgets CA** : override nb_jours par mois / service / lieu, fermetures (dates spécifiques + hebdo)
4. **Excel équipes** : template mensuel pré-rempli à envoyer aux équipes
5. **Rapport hebdo** : page in-app pour générer le mail récap hebdomadaire

---

## 1️⃣ Analyses CA — PR #64 → #69

Nouvelle route `/controle-gestion/analyses` (admin / directeur) qui remplace l'ancienne page `/marges`.

### Migration architecture

- Migration `20260510000000` : colonne `page` sur `user_dashboard_preferences` → permet plusieurs layouts à widgets par user/tenant
- Système de widgets générique : `WidgetsCustomizeModal` extrait pour être réutilisé entre `/dashboard` (cuisine) et `/analyses`
- Helpers calculs purs et testés dans `lib/caAnalyses.js` (pickGranularity, bucketDays, perfByWeekday, aggregateBySerie, etc.)

### Filtres globaux

- **Période** : Aujourd'hui / 7j / 30j / Mois en cours (défaut) / Mois préc. / Trimestre / Année / Personnalisé
- **Comparaison** : Aucune / vs même période N-1 / vs Budget
- **Lieu** : multi-select avec chips
- **Service** : multi-select (Déjeuner / Dîner)
- **Jours-de-semaine** : multi-select (Lun → Dim)
- Mode **multi-séries** auto quand 2+ lieux ou services cochés

### Widgets

| Widget | Type | Détails |
|---|---|---|
| KPI Couverts | KPI | δ vs comparaison + breakdown par lieu/service |
| KPI CA TTC | KPI | δ + breakdown |
| KPI CA HT | KPI | TVA 10/20/10 + breakdown |
| KPI Ticket moyen | KPI | δ + breakdown |
| KPI Écart Budget % | KPI | vs budget projeté |
| Évolution CA | Line chart | Granularité auto + budget en barres (mode cumulé) ou multi-séries (split) |
| Évolution Couverts | Line chart | Granularité auto |
| Perf jour-semaine | Bar chart | Moyennes par lundi/mardi/… ou groupées par série |
| Mix Food/Bev | Camembert | + Mode « Détaillé » service × catégorie en % |
| Top et Bottom jours | Tableau | Top 5 / Bottom 5 par CA TTC |
| Tableau jour-jour | Table | Δ Budget coloré + mode split (lieu × service) |
| Food cost moyen | KPI marges | Pondéré ventes (rapatrié de `/marges`) |
| Marge brute | KPI marges | € + % |
| Charts marges | Composé | AreaChart CA vs Coût + ScatterChart Menu Engineering |
| Détail CA par plat | Table | Tri + filtre catégorie |
| Conso ingrédients | Table | Quantités théoriques d'ingrédients |

### Fonctionnalités

- Personnalisation des widgets via modal (visibilité + ordre, persistée par user)
- **Export Excel multi-onglets** : un onglet par widget visible + onglet Période & filtres
- **Impression A4 paysage** : `@media print` avec `page-break-inside: avoid`
- **Redirect 301** : `/controle-gestion/marges` → `/controle-gestion/analyses`

### PRs

| PR | Titre |
|---|---|
| [#64](https://github.com/antonydespaux-bit/skalcook/pull/64) | feat(ca): colonne Δ Budget colorée sur le Suivi CA mensuel |
| [#65](https://github.com/antonydespaux-bit/skalcook/pull/65) | feat(analyses): squelette page Analyses CA + système widgets |
| [#66](https://github.com/antonydespaux-bit/skalcook/pull/66) | feat(analyses): charts évolution + perf jour-semaine + mix Food/Bev + top/bottom |
| [#67](https://github.com/antonydespaux-bit/skalcook/pull/67) | feat(analyses): export Excel multi-onglets + impression A4 paysage |
| [#68](https://github.com/antonydespaux-bit/skalcook/pull/68) | feat(analyses): rapatrie les widgets marges + redirect 301 /marges → /analyses |
| [#69](https://github.com/antonydespaux-bit/skalcook/pull/69) | feat(analyses): vue multi-lieu / multi-service + mix détaillé |

---

## 2️⃣ Suivi CA — PR #73, #74

Page `/controle-gestion/ventes` (vue mensuelle existante) renforcée.

- **Colonne Month to date** (renommée depuis Δ Budget) : cellule jour = Δ jour, total = réel cumulé − budget cumulé **sur les jours déjà saisis**
- **Colonne Δ Mois total** ajoutée : réel cumulé − budget projeté du mois entier (overrides nb_jours respectés, aligné avec le Récap annuel)
- **En-têtes de colonnes sticky** sous la Navbar quand on scrolle (CSS `position: sticky`, `top: 56px`)

| PR | Titre |
|---|---|
| [#73](https://github.com/antonydespaux-bit/skalcook/pull/73) | feat(ventes): colonne Month to date + Δ Mois total sur Suivi CA |
| [#74](https://github.com/antonydespaux-bit/skalcook/pull/74) | feat(ventes): en-têtes de colonnes sticky sur CA mensuel |

---

## 3️⃣ Budgets CA — PR #70, #71, #72, #78

Page `/controle-gestion/ventes/budgets` enrichie pour gérer les exceptions saisonnières.

### Override du nombre de jours par mois

- Nouvelle table `ca_budget_jours_override (client_id, annee, mois, jour_semaine, service, lieu_service_id, nb_jours)`
- Cas typique : « janvier 2026 a 5 jeudis calendaires mais je veux baser ma projection sur 4 » (fermeture exceptionnelle)
- Évolution progressive de la granularité :
  - PR #70 : override par `(mois, jour_semaine)` global
  - PR #72 : ajout du service → différencier midi/soir (4 jeudis midi + 5 jeudis soir possible)
  - PR #78 : ajout du `lieu_service_id` → un override par lieu (rétro-compat NULL = global)
- Priorité lookup : `(lieu)` > `(global)` > calendrier
- PR #71 : fix du Récap annuel qui ignorait les overrides

### Excel équipes (PR #75)

- Bouton **📤 Excel équipes** sur la page Budgets CA
- Génère un fichier mensuel à envoyer aux équipes en début de mois :
  - **1 onglet par jour ouvré** reproduisant le format historique Marsan (grille saisie par lieu × service, ticket budget jaune pré-rempli, pavés synthèse en bas avec formules)
  - **1 onglet Synthèse mensuelle** avec cumul Budget / Cumul Réel / Δ Cumul (toutes en formules SUMIF)
- Lib utilisée : **exceljs** (lazy import pour ne pas alourdir le bundle initial)
- Tests : 16 nouveaux tests vitest

### Fermetures (PR #75)

Deux types de fermetures, configurables via modal **🗓 Jours fermés** :

- **Dates spécifiques** : table `ca_jours_fermes (client_id, date, motif)` — pour les fériés, privatisations, vacances ponctuelles. Pré-remplissage optionnel des 11 fériés FR standards (Pâques via algorithme Meeus).
- **Hebdomadaires** : table `ca_jours_fermes_hebdo (client_id, jour_semaine, motif)` — pour le restaurant fermé tous les lundis-mardis (recurring).

Effets :
- Pré-remplit la colonne **Exception** dans l'onglet Synthèse de l'Excel équipes → les formules SUMIF excluent automatiquement ces lignes du Cumul Budget / Cumul Réel
- Respecté également par le **rapport hebdo** (PR #77)

### PRs

| PR | Titre |
|---|---|
| [#70](https://github.com/antonydespaux-bit/skalcook/pull/70) | feat(budgets): override du nb d'occurrences d'un jour-de-semaine par mois |
| [#71](https://github.com/antonydespaux-bit/skalcook/pull/71) | fix(budgets): le récap annuel respecte l'override nb_jours |
| [#72](https://github.com/antonydespaux-bit/skalcook/pull/72) | feat(budgets): override nb_jours distinct entre déjeuner et dîner |
| [#75](https://github.com/antonydespaux-bit/skalcook/pull/75) | feat(budgets): export Excel équipes (1 onglet par jour pré-rempli) |
| [#78](https://github.com/antonydespaux-bit/skalcook/pull/78) | feat(budgets): override nb_jours distinct par lieu |

---

## 4️⃣ Rapport hebdo — PR #76, #77

Nouvelle route `/controle-gestion/ventes/rapport-hebdo` (admin / directeur) qui remplace le calcul manuel sous Excel.

### Migrations

- `ca_rapports_hebdo (client_id, debut, fin, commentaire, titre, articles_ventes JSONB, created_by)` — métadonnées + commentaire libre + qtés vendues par article. Les chiffres sont recalculés au load pour rester cohérents.
- `ca_articles (client_id, nom, type 'menu'|'supplement', service, ordre, actif)` — référentiel des menus et suppléments suivis (saisis manuellement depuis Lightspeed)

### Sections générées automatiquement

- CA TTC réel vs budget (période + cumul mois)
- Ticket moyen par lieu × service avec écart %
- Ticket moyen Food / Beverage par service (midi, soir, total)
- Mix Food / Beverage en % du TM total
- Couverts midi / soir / total vs budget
- Tableau couverts jour-par-jour avec mise en forme conditionnelle (vert / orange / rouge)
- Ventes par menu et suppléments (qté + % vs couverts) — saisie manuelle inline
- Commentaires libres (textarea éditable)

### Fonctionnalités

- Sélecteur période + presets **« Semaine précédente »** (défaut) / **« Semaine en cours »**
- Modal **📋 Articles** pour gérer le référentiel client
- Toggle **⇄ Comparer** : panel multi-périodes avec tableau côte à côte sur 10 KPIs clés (CA TTC, couverts, TM Food/Bev par service)
- **Sauvegarde** + listing des archives en sidebar
- **📋 Copier pour email** : HTML rich-text dans le presse-papier, colle directement dans Gmail/Outlook avec mise en forme préservée
- **📥 Télécharger HTML** : fichier .html autonome
- Respect des **fermetures hebdo + dates spécifiques** : ces jours sont exclus du cumul budget pour rester cohérent avec la projection mensuelle

### PRs

| PR | Titre |
|---|---|
| [#76](https://github.com/antonydespaux-bit/skalcook/pull/76) | feat(rapport-hebdo): page MVP rapport hebdomadaire à envoyer aux équipes |
| [#77](https://github.com/antonydespaux-bit/skalcook/pull/77) | feat(rapport-hebdo): articles (menus + suppléments) + comparaison multi-périodes |

---

## Migrations Supabase

| Date | Migration | Objet |
|---|---|---|
| 2026-05-10 | `20260510000000_user_dashboard_preferences_page.sql` | Colonne `page` pour layouts widgets multiples |
| 2026-05-10 | `20260510000001_ca_budget_jours_override.sql` | Table override nb_jours par mois |
| 2026-05-10 | `20260510000002_ca_budget_jours_override_service.sql` | Ajout colonne `service` à l'override |
| 2026-05-11 | `20260511000000_ca_jours_fermes.sql` | Dates fermées spécifiques |
| 2026-05-11 | `20260511000001_ca_jours_fermes_hebdo.sql` | Fermetures hebdomadaires |
| 2026-05-11 | `20260511000002_ca_rapports_hebdo.sql` | Rapports hebdo archivés |
| 2026-05-11 | `20260511000003_ca_articles.sql` | Référentiel articles + colonne `articles_ventes` |
| 2026-05-11 | `20260511000004_ca_budget_jours_override_lieu.sql` | Ajout colonne `lieu_service_id` à l'override |

Toutes appliquées en prod via le MCP Supabase et committées dans `supabase/migrations/`.

---

## Tests

- 142 tests vitest passent (lib/caAnalyses, lib/analysesExport, lib/margesData, lib/rapportHebdo, lib/budgetsExcelTemplate)
- Couverture : helpers purs de calcul (agrégation, période, conversions HT, budgets, formats)

---

## Dépendances ajoutées

- `exceljs` (~500 KB) — génération Excel avec formules SUMIF + styles (couleurs, mise en forme conditionnelle). Lazy-importé pour ne pas alourdir le bundle des pages où il n'est pas appelé.

---

## Pages affectées

- `/controle-gestion/ventes` — Suivi CA mensuel (Month to date + Δ Mois total + sticky headers)
- `/controle-gestion/ventes/budgets` — Saisie budgets + Excel équipes + Jours fermés + override par lieu
- `/controle-gestion/ventes/rapport-hebdo` — Nouveau, génère le mail récap
- `/controle-gestion/analyses` — Nouveau, remplace `/controle-gestion/marges` (redirect 301)
- `/controle-gestion/marges` — Supprimée

---

## Backlog ouvert

Identifié pendant le chantier mais hors-scope :

- Faire respecter `ca_jours_fermes` + `ca_jours_fermes_hebdo` sur la page **Analyses** (KPIs et tableau jour-jour) pour cohérence totale entre les pages
- Vue **calendrier in-app** des budgets (1 ligne par jour × 1 colonne par lieu) — proposée mais non livrée, l'Excel équipes suffit pour l'instant
- Cleanup `DEBUG_FALLBACK_CLIENT_ID` dans les pages ventes existantes (déjà mentionné dans `MEMORY.md`)
- Tests vitest pour `parseExcelBudget` et `consolidateRows` (page budgets)
- UI saisie `ca_offerts` (table existe en BDD, écran à coder)
- Intégration **import POS Lightspeed** pour automatiser la saisie menus / suppléments dans le rapport hebdo (actuellement manuelle)
