# node-http-client

> **[EN]** Lightweight zero-dependency HTTP/HTTPS client for Node.js with a familiar axios-like API — retries, redirects, interceptors and auth built in.
> **[FR]** Client HTTP/HTTPS léger sans dépendance pour Node.js avec une API familière similaire à axios — retries, redirections, intercepteurs et authentification intégrés.

---

## Features / Fonctionnalités

**[EN]**
- Zero production dependencies — built on Node.js `http`/`https` core modules
- Shorthand methods: `get`, `post`, `put`, `patch`, `delete`, `head`
- Automatic JSON serialization of request bodies and deserialization of responses
- Automatic redirect following (configurable `maxRedirects`)
- Configurable retry with exponential backoff on ECONNRESET / ECONNREFUSED / ETIMEDOUT
- Request and response interceptors (add auth headers, log, transform)
- Bearer token and Basic auth shorthand via `auth` option
- Configurable per-request timeout with clean rejection

**[FR]**
- Aucune dépendance de production — basé sur les modules core `http`/`https` de Node.js
- Méthodes raccourcies : `get`, `post`, `put`, `patch`, `delete`, `head`
- Sérialisation JSON automatique des corps de requête et désérialisation des réponses
- Suivi automatique des redirections (`maxRedirects` configurable)
- Retry configurable avec backoff exponentiel sur ECONNRESET / ECONNREFUSED / ETIMEDOUT
- Intercepteurs de requête et réponse (ajouter des en-têtes auth, journaliser, transformer)
- Raccourci token Bearer et auth Basic via l'option `auth`
- Timeout configurable par requête avec rejet propre

---

## Installation

```bash
npm install @idirdev/node-http-client
```

---

## API (Programmatic) / API (Programmation)

### Quick usage / Utilisation rapide

```js
const http = require('@idirdev/node-http-client');

// Simple GET (default client) / GET simple (client par défaut)
const res = await http.get('https://api.example.com/users');
console.log(res.status);  // 200
console.log(res.data);    // parsed JSON array
console.log(res.ok);      // true

// POST JSON / POST JSON
const created = await http.post('https://api.example.com/users', {
  name: 'Alice',
  role: 'admin',
});
console.log(created.status);  // 201
```

### Instance with config / Instance avec configuration

```js
const { HttpClient, create } = require('@idirdev/node-http-client');

const client = create({
  baseURL: 'https://api.example.com',
  timeout: 8000,
  headers: { 'X-App-Version': '2.0.0' },
  maxRedirects: 3,
  retry: { count: 3, delay: 500 },  // exponential backoff / backoff exponentiel
});

// Bearer auth / Auth Bearer
const me = await client.get('/me', {
  auth: { bearer: 'eyJhbGci...' },
});

// Basic auth / Auth Basic
const data = await client.get('/protected', {
  auth: { username: 'admin', password: 'secret' },
});

// PUT and DELETE / PUT et DELETE
await client.put('/users/42', { name: 'Bob' });
await client.delete('/users/42');
```

### Interceptors / Intercepteurs

```js
// Add auth token to every request / Ajouter le token auth à chaque requête
client.interceptors.request.push(async (config) => {
  config.headers['Authorization'] = 'Bearer ' + getToken();
  return config;
});

// Log every response / Journaliser chaque réponse
client.interceptors.response.push(async (response) => {
  console.log(response.status, response.duration + 'ms');
  return response;
});
```

### Response shape / Structure de réponse

```js
{
  status: 200,          // HTTP status code
  ok: true,             // status >= 200 && < 300
  headers: { ... },     // response headers object
  data: { ... },        // parsed JSON or raw string
  body: Buffer,         // raw response buffer
  duration: 83,         // milliseconds
}
```

---

## License

MIT — idirdev
