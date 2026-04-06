# Analyse Concurrentielle : Pauco & Co vs Skalcook V2

**Date** : 6 avril 2026
**Source** : Inspection du code source public de demo.paucoandco.com (2 288 lignes, 141 337 caracteres)

---

## 1. Stack Technique de Pauco & Co

### Architecture

| Composant | Pauco & Co | Skalcook V2 |
|-----------|-----------|-------------|
| **Rendu** | Server-Side Rendering (HTML monolithique) | Next.js 16 App Router (SSR/CSR hybride) |
| **Framework JS** | Aucun (Vanilla JS inline) | React 19 |
| **CSS** | CSS custom properties, fait main (~500 lignes inline) | Tailwind CSS 4 + design system custom |
| **UI Library** | Aucune | Aucune (custom aussi) |
| **Charts** | Chart.js 4.4.7 via CDN (jsdelivr) | Recharts 3.8.1 (React-native) |
| **Fonts** | Google Fonts : Fraunces, DM Sans, Outfit | System fonts / custom |
| **Hebergement** | Railway (container unique) | Vercel (Edge CDN global) |
| **Base de donnees** | PostgreSQL Railway (probable) | Supabase (PostgreSQL + RLS + Realtime + Auth + Storage) |
| **Auth** | Custom (sessions server-side) | Supabase Auth (JWT, roles natifs) |
| **IA** | Aucune | Claude Opus 4.5 (OCR factures + reponses avis) |
| **PWA** | Oui (Service Worker + manifest.json) | Non |
| **Analytics** | Google Analytics (G-KTW42QRBBX) + Google Ads (AW-18006689412) | Google Analytics + Axeptio (RGPD) |
| **Dark Mode** | Oui (CSS variables + localStorage) | Oui (ThemeContext + localStorage) |

### Constat technique cle

**Pauco est une application monolithique server-side** : tout le HTML, CSS et JS est dans un seul fichier.
Le serveur genere la page complete cote serveur (template engine, probablement Python/Flask ou Node/Express vu la structure `controllers/`, `core/`, `elements/`, `helpers/` visible dans les DevTools Sources).

**Pas de SPA, pas de framework frontend.** Chaque navigation = rechargement complet de page.

### Endpoints API detectes

```
POST /gestion/fiches-techniques/save
POST /gestion/fiches-techniques/delete/:id
POST /gestion/fiches-techniques/archive/:id
POST /gestion/fiches-techniques/restore/:id
GET  /categories/list?type=food|cocktails|bar
POST /categories/manage  (actions: add, rename, delete, reorder)
POST /feedback
```

### Performance

| Aspect | Pauco | Skalcook |
|--------|-------|----------|
| **Taille HTML initiale** | ~141 KB (tout inline) | Pages individuelles legeres |
| **Nombre de requetes** | 1 (tout dans le HTML) + Chart.js CDN | Multiples (chunks JS, API calls) |
| **Lazy loading charts** | Oui (IntersectionObserver) | Non implemente |
| **Skeleton loaders** | CSS (definis mais peu utilises) | Non |
| **Code splitting** | Impossible (monolithique) | Possible mais non implemente |
| **CDN Edge** | Non (Railway = container unique) | Oui (Vercel Edge Network) |
| **Service Worker** | Oui (cache offline) | Non |

**Analyse** : Le rendu initial de Pauco est probablement rapide (1 seul fichier HTML, pas de JS framework a hydrater). Mais la taille du payload (141 KB de HTML pur) et l'absence de CDN edge penalisent les visiteurs eloignes du serveur. Skalcook, avec Vercel Edge, a un avantage latence global mais charge plus de JS.

---

## 2. Fonctionnalites : Comparaison exhaustive

### Cartographie complete des modules Pauco (extraite de la sidebar)

#### GESTION (Core)
| Fonctionnalite | Pauco | Skalcook V2 | Avantage |
|---------------|-------|-------------|----------|
| Tableau de bord | Oui | Oui (dashboard cuisine + bar) | Egal |
| Recettes (suivi CA) | Oui | Oui (ventes journalieres) | Egal |
| Saisie rapide du soir | Oui (mobile-first) | Non | **Pauco** |
| Depenses & charges | Oui | Oui (achats/controle-gestion) | Egal |
| Analyse des depenses | Oui (page dediee) | Oui (marges, Pareto) | **Skalcook** (plus avance) |
| Fournisseurs | Oui | Oui (+ historique prix) | Egal |
| Fiches techniques Food | Oui | Oui (+ sous-fiches, saisonnalite) | **Skalcook** |
| Fiches Cocktails | Oui (separe) | Oui (fiches bar) | Egal |
| Fiches Bar (boissons) | Oui | Oui | Egal |
| Sante financiere / Ratios | Oui + page exemples | Oui (marges, menu engineering) | **Skalcook** |
| Calendrier | Oui | Non | **Pauco** |
| Gestion categories | Oui (reordonnement, renommage) | Par sections (cuisine/bar) | **Pauco** (plus flexible) |

#### RH
| Fonctionnalite | Pauco | Skalcook V2 | Avantage |
|---------------|-------|-------------|----------|
| Planning equipe | Oui (style Combo/Skello) | Non | **Pauco** |
| Shifts | Oui | Non | **Pauco** |
| Effectifs / Mon equipe | Oui | Non | **Pauco** |
| Fiche employe | Oui | Non | **Pauco** |
| Gestion des postes | Oui | Non | **Pauco** |

#### LEGAL & CONFORMITE
| Fonctionnalite | Pauco | Skalcook V2 | Avantage |
|---------------|-------|-------------|----------|
| Conformite legale | Oui | Non | **Pauco** |
| Allergenes | Oui | Oui (cascade sous-fiches, export Excel) | **Skalcook** |
| Horaires de travail | Oui | Non | **Pauco** |
| Gestes utiles | Oui | Non | **Pauco** |

#### HYGIENE HACCP
| Fonctionnalite | Pauco | Skalcook V2 | Avantage |
|---------------|-------|-------------|----------|
| Etiquetage HACCP | Oui | Non | **Pauco** |
| Releve temperatures | Oui | Non | **Pauco** |
| Reception marchandises | Oui | Non | **Pauco** |
| Origine des viandes | Oui | Non | **Pauco** |
| Tracabilite viandes | Oui | Non | **Pauco** |
| Checklists quotidiennes | Oui | Non | **Pauco** |
| Kit Hygiene | Oui (OPTION payante) | Non | **Pauco** |

#### E-REPUTATION
| Fonctionnalite | Pauco | Skalcook V2 | Avantage |
|---------------|-------|-------------|----------|
| Vue d'ensemble avis | Oui | Non | **Pauco** |
| Liste des avis | Oui | Non (mais reponse IA existe) | **Pauco** |
| Statistiques avis | Oui | Non | **Pauco** |
| Reponse IA aux avis | Non detecte | Oui (Claude multilingue) | **Skalcook** |

#### MARKETING (Options payantes Pauco)
| Fonctionnalite | Pauco | Skalcook V2 | Avantage |
|---------------|-------|-------------|----------|
| Publicite / Ads | OPTION | Non | **Pauco** |
| Performances Ads | OPTION (locked) | Non | **Pauco** |
| Reseaux sociaux | OPTION | Non | **Pauco** |
| Calendrier editorial | OPTION (locked) | Non | **Pauco** |
| Shooting photo/video | OPTION | Non | **Pauco** |

#### RECRUTEMENT (Option payante Pauco)
| Fonctionnalite | Pauco | Skalcook V2 | Avantage |
|---------------|-------|-------------|----------|
| Trouver un profil | OPTION | Non | **Pauco** |
| Candidatures | OPTION (locked) | Non | **Pauco** |
| Vivier de profils | OPTION (locked) | Non | **Pauco** |

#### INFRASTRUCTURE & ARCHITECTURE
| Fonctionnalite | Pauco | Skalcook V2 | Avantage |
|---------------|-------|-------------|----------|
| Multi-etablissement | Non detecte (1 seul restaurant visible) | Oui natif (tenant par hostname, roles, isolation) | **Skalcook** |
| Roles utilisateurs | Oui (page Roles visible) | Oui (admin, cuisine, bar, directeur, superadmin) | Egal |
| Gestion utilisateurs | Oui | Oui (acces_clients) | Egal |
| OCR factures IA | Non | Oui (Claude Vision) | **Skalcook** |
| Inventaire | Non detecte | Oui (tournant/complet, Pareto 80/20) | **Skalcook** |
| Stock theorique | Non | Oui (snapshots pre-calcules) | **Skalcook** |
| Menu engineering | Non detecte | Oui (analyse croisee) | **Skalcook** |
| Export Excel | Non detecte | Oui (allergenes, rapports) | **Skalcook** |
| Messagerie interne | Oui | Non | **Pauco** |
| Ressources / Formation | Oui (5 categories) | Non | **Pauco** |
| Widget feedback | Oui (bug + suggestion) | Non | **Pauco** |

---

## 3. Modele economique Pauco

- **Prix fondateur** : 99 EUR/mois, garanti a vie
- **Options payantes supplementaires** :
  - Kit Hygiene HACCP
  - Publicite (Google Ads management)
  - Reseaux Sociaux
  - Shooting Photo & Video
  - Recrutement
- **Conversion** : Tracking Google Ads avec event `ads_conversion_Prise_de_rendez_vous_1`
- **Contact** : Telephone direct (+33 7 83 47 06 57 — "Appeler Paul"), formulaire de contact
- **Positionnement** : Solution tout-en-un pour restaurateur independant (1 restaurant)

---

## 4. Forces et faiblesses de Pauco

### Forces
1. **Perimetre fonctionnel tres large** : RH, HACCP, legal, marketing, recrutement — bien au-dela de la gestion pure
2. **PWA** : Service worker = utilisable hors-ligne, installable sur mobile
3. **Design soigne** : Dark mode, animations, responsive 3 breakpoints, touch targets 44px
4. **Saisie rapide du soir** : Feature mobile-first pertinente pour les restaurateurs en fin de service
5. **HACCP complet** : Temperatures, tracabilite, checklists — forte valeur reglementaire
6. **UX** : Skeleton loaders, countup animations, toast notifications, feedback widget

### Faiblesses
1. **Architecture monolithique** : 141 KB de HTML inline, pas de code splitting, pas scalable
2. **Pas de multi-etablissement** : Le sidebar montre "Le Bistrot du Port" sans option de switcher — cible mono-restaurant
3. **Pas d'IA** : Aucune integration IA detectee (pas d'OCR, pas de generation, pas d'analyse automatique)
4. **Pas d'inventaire** : Aucune mention d'inventaire, stock, ou comptage
5. **Fiches techniques basiques** : Pas de sous-fiches, pas de cascade allergenes, pas de saisonnalite
6. **Railway = pas d'edge** : Latence variable, pas de CDN natif, scaling limite
7. **Vanilla JS** : Maintenabilite douteuse a mesure que le produit grandit (~2300 lignes dans 1 fichier)
8. **Options marketing = partenariat probable** : "Publicite", "Shooting" suggerent du service humain, pas du logiciel pur
9. **Donnees de demo statiques** : Les ingredients sont vides (`"ingredients": []`), pas de vraies donnees

---

## 5. Avantages competitifs de Skalcook V2

### Avantages techniques decisifs

1. **Multi-etablissement natif** — C'est le vrai fosse. Un groupe de 10 restaurants ne peut PAS utiliser Pauco. Skalcook gere : detection tenant par hostname, isolation des donnees, roles par etablissement, hub de choix. C'est des semaines de refonte pour un concurrent qui n'a pas prevu ca.

2. **IA integree (Claude)** — OCR factures automatique + reponses avis multilingues. Pauco ne propose rien de comparable. C'est un gain de temps reel pour le restaurateur.

3. **Inventaire avance** — Tournant/complet, Pareto 80/20, stock theorique. Module absent chez Pauco.

4. **Controle de gestion avance** — Menu engineering, Pareto, marges en temps reel, couverture. Pauco a des ratios basiques.

5. **Cascade allergenes** — Sous-fiche vers fiche parent, export Excel. Pauco a des allergenes mais sans cascade.

6. **Infrastructure Vercel + Supabase** — CDN global, Auth managee, Storage, Realtime. Bien superieur a Railway mono-container.

### Avantages fonctionnels de Pauco a considerer

Pauco couvre des besoins que Skalcook n'adresse pas encore :

| Module Pauco | Priorite pour Skalcook | Effort estime |
|-------------|----------------------|---------------|
| **HACCP (temperatures, tracabilite, checklists)** | HAUTE — obligation legale | Moyen (nouvelles tables + pages) |
| **Planning RH** | MOYENNE — forte demande terrain | Eleve (module complet) |
| **Saisie rapide du soir** | HAUTE — quick win mobile | Faible (1 page) |
| **PWA / Service Worker** | MOYENNE — UX mobile | Faible (config Next.js) |
| **Messagerie** | BASSE — WhatsApp/Teams existent | Moyen |
| **Marketing (Ads, Reseaux)** | BASSE — service humain, pas logiciel | N/A |
| **Recrutement** | BASSE — hors perimetre core | N/A |

---

## 6. Recommandations strategiques

### Quick wins (< 1 semaine chacun)

1. **Ajouter un Service Worker** pour le mode PWA — Next.js le supporte nativement via `next-pwa`. Permet l'installation sur mobile et le cache offline.

2. **Page "Saisie rapide"** — Version simplifiee de la saisie des ventes du jour, optimisee mobile, pour la fin de service.

3. **Skeleton loaders** — Ajouter des squelettes de chargement sur les pages dashboard et marges.

### Moyen terme (1-3 mois)

4. **Module HACCP minimal** — Releves de temperatures + checklists quotidiennes. Obligation legale = argument de vente fort.

5. **Optimisations performance V2** — `next/dynamic` pour code splitting, `next/image` pour les photos, Suspense boundaries.

6. **Calendrier** — Vue calendrier mensuelle des evenements (changements de carte, inventaires prevus, etc.)

### Positionnement recommande

> **Skalcook = la solution pour les groupes de restaurants qui veulent piloter leurs couts avec l'IA.**
> **Pauco = la solution tout-en-un pour le restaurateur independant.**

Ne pas essayer de copier les modules RH/Marketing/Recrutement de Pauco — ce sont des services, pas du logiciel core. Se concentrer sur l'approfondissement des avantages :
- Multi-etablissement (fosse competitif)
- IA (differenciant technologique)
- Controle de gestion avance (valeur metier)
- HACCP (obligation legale = retention)

---

## 7. Roadmap inspiree de l'analyse

### Quick wins (a integrer rapidement)
1. **Saisie rapide du soir** — Page mobile simplifiee pour saisir le CA en fin de service
2. **Widget feedback** — Bouton flottant "?" pour bug reports et suggestions utilisateurs
3. **Skeleton loaders + countup animations** — Sur les dashboards pour perception de vitesse

### V3 — Dashboard personnalisable (idee strategique)
**Concept** : Le directeur du restaurant choisit les widgets/KPIs qu'il voit a sa connexion.

**Pourquoi c'est un avantage competitif majeur** :
- Pauco a un dashboard fige — meme vue pour tout le monde
- Un directeur veut voir CA + marges, un chef veut voir fiches + allergenes, un gerant multi-sites veut la vue consolidee
- Ca combine parfaitement avec le multi-etablissement (chaque role, chaque etablissement = un dashboard different)

**Implementation envisagee** :
- Systeme de widgets drag & drop (CA du jour, marges par categorie, alertes stock, ratio MP, top fiches, graph evolution, inventaire en cours, etc.)
- Layout sauvegarde par utilisateur dans Supabase (`dashboard_config` par user/role/etablissement)
- Presets par role : "Vue Directeur", "Vue Chef", "Vue Gerant groupe"
- Responsive : reflow automatique des widgets sur mobile

**Widgets possibles** :
| Widget | Source de donnees existante |
|--------|---------------------------|
| CA du jour / semaine / mois | `ventes_journalieres` |
| Ratio MP global | `fiches` + `achats` |
| Top 5 fiches par marge | `fiches` |
| Alertes stock critique | `inventaire` |
| Derniers achats | `achats` |
| Graphe evolution CA | `ventes_journalieres` (Recharts) |
| Pareto 80/20 | `inventaire` + `achats` |
| Allergenes a verifier | `fiches` + cascade |
| Score e-reputation | API avis (futur) |
| Checklist HACCP du jour | `checklists` (futur) |

### V3 — Module HACCP minimal
- Releves de temperatures (frigos, livraisons)
- Checklists quotidiennes (ouverture, fermeture, nettoyage)
- Obligation legale = retention client

### V3 — Refonte landing page (se differencier du "template IA")

**Constat** : Les landing pages de Skalcook et Pauco sont quasi identiques — meme layout
genere par IA (badge vert, titre serif italic colore, sous-titre gris, 2 CTA, faux mockup
navigateur avec 3 dots). Ce pattern est devenu le cliche universel des SaaS generes par IA
en 2025-2026. Il faut s'en eloigner pour paraitre credible et professionnel.

**Changements prevus** :

| Priorite | Changement | Detail | Effort |
|----------|-----------|--------|--------|
| 1 | **Video/GIF du vrai produit** | Remplacer le faux mockup navigateur par une capture reelle de l'app (8-10s autoplay muette) : clic fiche > ingredients > ratio calcule > badge vert | Moyen |
| 2 | **Titre hero oriente resultat** | Passer de "Les fiches techniques qui font la difference" a quelque chose comme "Vos marges en un coup d'oeil. Pour chaque plat, chaque service." | Faible |
| 3 | **Social proof immediate** | Ajouter sous le hero : nombre de clients, nombre de fiches creees, temoignage court d'un chef. Pauco ne peut pas faire ca (pas de vrais clients). Nous si. | Faible |
| 4 | **CTA unique et fort** | Remplacer les 2 boutons par un seul : "Essayer gratuitement" ou "Voir la demo en 2 min". Le double CTA cree de l'hesitation. | Faible |
| 5 | **Palette chaude + ambiance food** | Quitter le blanc/gris froid generique. Fond creme chaud, photos reelles de cuisine en ambiance, couleurs qui evoquent la gastronomie. | Moyen |
| 6 | **Section Avant/Apres** | Remplacer la liste de features generique par un contraste concret : "Je calcule mes couts sur Excel" vs "Le food cost se met a jour automatiquement" | Faible |
| 7 | **Supprimer le faux navigateur** | Les 3 dots rouge/jaune/vert = signal "IA-generated" en 2026. Montrer le produit dans un cadre neutre ou en plein ecran. | Faible |

**Erreurs a eviter** :
- Le titre serif italic colore (Fraunces/Playfair) = cliche IA numero 1
- Le fond blanc pur sans texture = generique, froid
- Les sous-titres de 3 lignes en gris = personne ne les lit
- Lister des features avant de montrer un resultat concret

**Inspirations (vrais SaaS, pas generes par IA)** :
- Linear.app : minimaliste mais avec video reelle du produit
- Notion.so : social proof massive + templates concrets
- Arc.net : personnalite forte, ton unique, pas de jargon

---

## 8. Annexe : Donnees techniques brutes

### Google Analytics Pauco
- Property : G-KTW42QRBBX
- Google Ads : AW-18006689412
- Conversion event : `ads_conversion_Prise_de_rendez_vous_1`

### Structure des fichiers (visible dans DevTools Sources)
```
demo.paucoandco.com/
  gestion/
    fiches-techniques (HTML monolithique)
  static/
    favicon.svg
    manifest.json
    sw.js
    icons/icon-192.png
```

### Variables CSS Pauco (design tokens)
```css
--bg: #F7F4EF       /* fond creme */
--white: #FFF
--dark: #0F1F14      /* sidebar vert fonce */
--green: #2D6A4A     /* accent principal */
--green-l: #6DBF85
--border: #E4DDD3
--text: #17120D
--muted: #6A6059
--amber: #D97706     /* warning ratios */
--red: #DC2626       /* danger ratios */
--r: 12px            /* border-radius standard */
--sidebar: 260px
```

### Seuils de ratios Pauco (color-coding)
- **Vert** : ratio < 35%, coefficient > 3.0
- **Amber** : ratio 35-45%, coefficient 2.0-3.0
- **Rouge** : ratio > 45%, coefficient < 2.0
