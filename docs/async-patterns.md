# Async / Await & Callbacks — patterns dans skalcook

> Document interne d'onboarding. Décrit comment et pourquoi le projet utilise
> `async/await` partout en métier, et où les callbacks restent inévitables.

## TL;DR

- **`async/await` partout** où on attend une I/O (Supabase, fetch, services).
- **`Promise.all`** pour les requêtes indépendantes (parallélisme).
- **Callbacks uniquement** aux frontières imposées par le runtime :
  React event handlers, `useEffect`, `setTimeout`, `FileReader`.
- **Erreurs** : on `throw` des erreurs typées dans les services
  (`ValidationError`, `NotFoundError`, `ConflictError`) ; `lib/apiHandler.ts`
  les attrape et les transforme en `Response.json({ error }, { status })`.

---

## 1. async/await — la forme par défaut

### 1.1 Côté API route

Toutes les routes Next sont déclarées via `apiHandler` (`lib/apiHandler.ts`),
qui prend un `handler` async et gère validation + auth + erreurs autour :

```ts
// app/api/inventaire/create/route.ts
export const POST = apiHandler({
  schema: createInventaireSchema,
  guard: 'memberOfClient',
  clientIdFrom: 'body.client_id',
  handler: async ({ data, db }) => {
    const result = await createInventaire(
      db, data.client_id, data.type, data.section, data.categorie_ids
    )
    return Response.json(result)
  },
})
```

Pas de `try/catch` à recopier dans chaque route — `apiHandler` (lignes 152-164)
le fait une fois pour tout le monde.

### 1.2 Côté service (logique métier)

Les services (`lib/services/*.ts`) sont des fonctions async pures, sans
dépendance HTTP. Elles enchaînent des `await` Supabase et `throw` en cas de
problème métier :

```ts
// lib/services/inventaire.service.ts
export async function validerInventaire(db, inventaireId, clientId, userId) {
  const { data: inv } = await db
    .from('inventaires')
    .select('id, statut, type')
    .eq('id', inventaireId)
    .eq('client_id', clientId)
    .maybeSingle()

  if (!inv) throw new NotFoundError('Inventaire introuvable.')
  if (inv.statut === 'valide') throw new ConflictError('Inventaire déjà validé.')

  const { error } = await db
    .from('inventaires')
    .update({ statut: 'valide', date_validation: new Date().toISOString(), valide_par: userId })
    .eq('id', inventaireId)
  if (error) throw new Error(error.message)

  return { validated: true }
}
```

Ordre d'exécution évident, gestion d'erreurs uniforme, testable sans HTTP.

### 1.3 Côté client React

Dans les composants, on déclare des fonctions async et on les appelle
depuis les handlers ou `useEffect`.

```js
// app/inventaire/page.js
const loadInventaires = async () => {
  const clientId = await getClientId()
  if (!clientId) { router.push('/'); return }

  const { data } = await supabase
    .from('inventaires')
    .select('*')
    .eq('client_id', clientId)
    .order('date_inventaire', { ascending: false })

  setInventaires(data || [])
  setLoading(false)
}
```

Pour les requêtes API internes :

```js
// app/inventaire/[id]/saisie/page.js
const handleValider = async () => {
  if (!window.confirm('Valider définitivement cet inventaire ?')) return
  setValidating(true)
  try {
    const clientId = await getClientId()
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/inventaire/valider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ inventaireId, clientId })
    })
    if (res.ok) {
      router.push(`/inventaire/${inventaireId}`)
    } else {
      const json = await res.json()
      alert(json.error || 'Erreur lors de la validation.')
      setValidating(false)
    }
  } catch {
    alert('Erreur réseau.')
    setValidating(false)
  }
}
```

---

## 2. Promise.all — paralléliser ce qui peut l'être

Quand plusieurs `await` ne dépendent pas les uns des autres, on les groupe :

```ts
// lib/services/inventaire.service.ts (calculateStockTheorique)
const [ingredientsRes, dernierInvRes] = await Promise.all([
  db.from(ingredientTable).select('id, nom, unite, prix_kg, categorie_id').eq('client_id', clientId),
  db.from('inventaires')
    .select('id, date_inventaire')
    .eq('client_id', clientId)
    .eq('statut', 'valide')
    .in('section', [section, 'global'])
    .order('date_inventaire', { ascending: false })
    .limit(1)
    .maybeSingle(),
])
```

Idem dans `lib/services/achats.service.ts` (`getMercuriale`,
`getReconciliationData`) et dans `app/api/export-data/route.ts` qui charge
les 12 tables RGPD en parallèle.

**Règle pratique** : si tu vois deux `await` qui ne se servent pas du résultat
l'un de l'autre, regroupe-les en `Promise.all`. La latence passe de N×t à
max(t).

---

## 3. Callbacks — où ils restent inévitables

### 3.1 Event handlers React

```jsx
<button onClick={() => router.push('/inventaire/nouveau')}>+ Nouvel inventaire</button>
<input onChange={e => setRecherche(e.target.value)} />
```

Si l'action est async, on met `async` dans le handler :

```jsx
<button onClick={async () => {
  const res = await fetch('/api/...')
  if (!res.ok) showToast('err', 'Erreur')
}}>
```

### 3.2 useEffect

Le callback de `useEffect` ne peut **pas** être `async` directement (il doit
retourner soit `undefined`, soit une fonction de cleanup). Le pattern propre :

```js
// app/controle-gestion/mercuriale/page.js
useEffect(() => {
  let cancelled = false
  ;(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      if (!session) { router.replace('/'); return }
      const cid = await getClientId()
      if (cancelled) return
      setClientId(cid)
      setAuthReady(true)
    } catch {
      if (!cancelled) router.replace('/')
    }
  })()
  return () => { cancelled = true }
}, [router])
```

Le flag `cancelled` est important : si l'utilisateur navigue ailleurs avant
la fin du fetch, on ne fait pas `setState` sur un composant démonté
(warning React). À utiliser systématiquement quand un `useEffect` fait
plusieurs awaits.

### 3.3 Debounce avec setTimeout

```js
// app/inventaire/[id]/saisie/page.js
const debounceTimers = useRef({})

const handleQuantiteChange = (ligneId, value) => {
  setLignes(prev => prev.map(l =>
    l.id === ligneId ? { ...l, quantite_reelle: value === '' ? null : Number(value) } : l
  ))

  if (debounceTimers.current[ligneId]) {
    clearTimeout(debounceTimers.current[ligneId])
  }
  debounceTimers.current[ligneId] = setTimeout(() => {
    saveLigne(ligneId, value)
  }, 500)
}
```

`setTimeout` impose un callback. Le contenu du callback **appelle** une
fonction async (`saveLigne`) sans `await` — c'est volontaire, on déclenche
sans bloquer.

### 3.4 FileReader (legacy callback API)

```js
// components/ImportView.jsx
const reader = new FileReader()
reader.onload = (evt) => {
  const data = evt.target.result
  const workbook = XLSX.read(data, { type: 'binary' })
  // ...
}
reader.readAsBinaryString(fichier)
```

`FileReader` est une API navigateur ancienne, basée sur events. Si tu n'as
pas besoin de `binary` ni de l'API legacy, préfère la version moderne qui
retourne directement une Promise :

```js
// app/mon-compte/page.js (import RGPD JSON)
const text = await fichier.text()
const payload = JSON.parse(text)
```

---

## 4. Gestion d'erreurs

### 4.1 Erreurs typées dans les services

```ts
// lib/errors.js
export class ValidationError extends ApiError { /* status 400 */ }
export class NotFoundError extends ApiError    { /* status 404 */ }
export class ConflictError extends ApiError    { /* status 409 */ }
```

Dans les services on `throw` directement :

```ts
if (!inv) throw new NotFoundError('Inventaire introuvable.')
if (existing) throw new ConflictError("Cet ingrédient est déjà dans l'inventaire.")
```

### 4.2 Attrapées centralement par apiHandler

```ts
// lib/apiHandler.ts
} catch (err) {
  if (err instanceof ValidationError) {
    return Response.json({ error: err.message, details: err.details }, { status: err.status })
  }
  if (err instanceof ApiError) {
    return Response.json({ error: err.message }, { status: err.status })
  }
  console.error('[API Error]', err)
  return Response.json({ error: 'Erreur serveur interne' }, { status: 500 })
}
```

Conséquence : **dans 99 % des cas un service n'a pas besoin de `try/catch`**.
Il throw, le `apiHandler` répond proprement.

### 4.3 Côté client

```js
const res = await fetch('/api/...', { ... })
const json = await res.json()
if (!res.ok) {
  alert(json.error || 'Erreur')
  return
}
// suite
```

Toujours vérifier `res.ok`, lire `json.error` pour le message côté serveur,
fallback générique sinon.

---

## 5. Anti-patterns à éviter

### ❌ Mélanger .then() et await

```js
const x = await fetchA()
fetchB().then(y => doStuff(y))   // perte de contrôle de l'ordre
```

À la place :
```js
const [x, y] = await Promise.all([fetchA(), fetchB()])
doStuff(y)
```

### ❌ Boucle for + await quand Promise.all suffit

```js
// Lent (séquentiel) :
for (const id of ids) {
  await db.from('table').delete().eq('id', id)
}

// Rapide (parallèle) :
await Promise.all(ids.map(id => db.from('table').delete().eq('id', id)))
```

À noter : on **doit** garder le séquentiel quand chaque itération dépend du
résultat précédent, ou quand on veut limiter la concurrence (cf. le batch
de 50 dans `components/ImportView.jsx:238` qui throttle volontairement les
inserts Supabase).

### ❌ Oublier le await (Promise abandonnée)

```js
async function save() {
  db.from('table').update(...)   // ❌ pas de await — silencieusement perdu si erreur
}
```

Toujours `await` ou retourner la Promise.

### ❌ Throw dans un callback non-async non-attendu

```js
setTimeout(() => {
  if (!ok) throw new Error('boom')   // l'erreur disparaît dans la stack
}, 1000)
```

À la place, gérer dans le callback (toast, setState d'erreur, etc.).

---

## 6. Récap visuel : la chaîne d'appel d'une action utilisateur

```
[Composant React]
  handleClick async
    ↓ await fetch('/api/inventaire/valider', { body: JSON.stringify({...}) })
[Next.js API route]
  apiHandler({ handler: async ({ data, user, db }) => ... })
    ↓ schema.safeParse(body)        ← validation Zod
    ↓ requireMemberOfClient(...)    ← auth
    ↓ await validerInventaire(db, ...)
[Service]
  async function validerInventaire(db, ...)
    ↓ await db.from(...).select(...).maybeSingle()
    ↓ throw new NotFoundError('...')   ← si KO
    ↓ await db.from(...).update(...)
    ↓ throw new Error(error.message)   ← si KO
    ↓ return { validated: true }
[Retour]
  apiHandler catch → Response.json({ error, status }) si throw
                  → return des handler            si succès
[Composant React]
  if (!res.ok) alert(json.error)
  else router.push(...)
```

Cette uniformité explique pourquoi la quasi-totalité des bugs corrigés
pendant la migration POC → production étaient des **décalages de noms de
champs** (snake_case vs camelCase, alias de colonnes) et **pas** des bugs
asynchrones : `async/await` rend l'ordre tellement explicite qu'il n'y a
pas de place pour des courses ou des callbacks orphelins.

---

## 7. Liens utiles dans le code

| Fichier | Pattern à voir |
|---|---|
| `lib/apiHandler.ts` | Wrapper async + try/catch centralisé |
| `lib/errors.js` | Hiérarchie d'erreurs typées |
| `lib/services/inventaire.service.ts` | Service async pur, throw d'erreurs |
| `lib/services/achats.service.ts` (`getMercuriale`) | `Promise.all` + agrégation |
| `app/api/export-data/route.ts` | `Promise.all` sur 12 tables |
| `app/inventaire/[id]/saisie/page.js` | Debounce avec `setTimeout` + `useRef` |
| `app/controle-gestion/mercuriale/page.js` | `useEffect` avec flag `cancelled` |
| `components/ImportView.jsx` | `FileReader` callback + batch async |
| `app/mon-compte/page.js` | `fichier.text()` (FileReader moderne) |
