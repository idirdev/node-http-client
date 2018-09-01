# node-http-client

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D8.0-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3.1+-3178C6?logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)
![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)

A lightweight, zero-dependency HTTP client library for Node.js built on top of the native `http`/`https` modules. Features request/response interceptors, automatic retry with exponential backoff, response caching, and a Promise-based API inspired by axios.

## Features

- **Zero dependencies** - Uses only Node.js built-in modules (`http`, `https`, `zlib`)
- **Promise-based API** - Async/await friendly with typed responses
- **Interceptors** - Request and response interceptors with eject support
- **Automatic retry** - Configurable retry with exponential backoff and jitter
- **Response caching** - In-memory cache with TTL, max-size eviction, and manual control
- **Request/response transforms** - Pipeline-style data transformations
- **Redirect handling** - Automatic redirect following (configurable depth)
- **Timeout support** - Per-request timeout with descriptive errors
- **Decompression** - Automatic gzip/deflate response decompression
- **TypeScript** - Full type definitions included

## Installation

```bash
npm install node-http-client
```

## Quick Start

```ts
import client, { createClient } from 'node-http-client';

// Use the default client
const response = await client.get('https://jsonplaceholder.typicode.com/posts/1');
console.log(response.data); // { userId: 1, id: 1, title: '...', body: '...' }

// Or create a configured instance
const api = createClient({
  baseURL: 'https://api.example.com/v1',
  timeout: 5000,
  headers: {
    'authorization': 'Bearer my-token',
  },
});

const users = await api.get('/users');
```

## API Reference

### `createClient(config?)`

Factory function that returns a new `HttpClient` instance.

```ts
const client = createClient({
  baseURL: 'https://api.example.com',
  timeout: 10000,
  headers: { 'x-api-key': 'secret' },
  responseType: 'json', // 'json' | 'text' | 'buffer' | 'stream'
});
```

### HTTP Methods

All methods return `Promise<Response<T>>`:

```ts
client.get<T>(url, config?)
client.post<T>(url, data?, config?)
client.put<T>(url, data?, config?)
client.patch<T>(url, data?, config?)
client.delete<T>(url, config?)
client.head<T>(url, config?)
client.options<T>(url, config?)
```

### Interceptors

```ts
// Add a request interceptor
const id = client.interceptors.request.use(
  (config) => {
    config.headers = { ...config.headers, 'x-request-id': generateId() };
    return config;
  },
  (error) => Promise.reject(error),
);

// Add a response interceptor
client.interceptors.response.use(
  (response) => {
    console.log(`${response.config.method} ${response.config.url} -> ${response.status}`);
    return response;
  },
  (error) => {
    if (error.status === 401) {
      // Handle unauthorized
    }
    return Promise.reject(error);
  },
);

// Remove an interceptor
client.interceptors.request.eject(id);

// Clear all interceptors
client.interceptors.request.clear();
```

### Retry Middleware

Automatically retry failed requests with exponential backoff:

```ts
import { HttpClient, retryMiddleware } from 'node-http-client';

const client = new HttpClient({ baseURL: 'https://api.example.com' });

retryMiddleware(client, {
  retries: 3,              // Max retry attempts (default: 3)
  retryDelay: 300,         // Base delay in ms (default: 300)
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
  retryableMethods: ['GET', 'HEAD', 'OPTIONS'],
  onRetry: (attempt, error, config) => {
    console.log(`Retry #${attempt} for ${config.url}: ${error.message}`);
  },
});
```

### Cache Middleware

Cache GET responses in memory with automatic TTL expiration:

```ts
import { HttpClient, CacheMiddleware } from 'node-http-client';

const client = new HttpClient({ baseURL: 'https://api.example.com' });

const cache = new CacheMiddleware(client, {
  ttl: 60000,         // Cache lifetime: 1 minute (default)
  maxSize: 100,       // Max cached entries (default: 100)
  methods: ['GET'],   // Which methods to cache (default: ['GET'])
});

// First call hits the network
await client.get('/users');

// Second identical call returns instantly from cache
await client.get('/users');

// Manual cache management
cache.clear();           // Clear all entries
cache.delete(key);       // Delete a specific entry
cache.prune();           // Remove all expired entries
cache.detach();          // Remove middleware from client entirely
console.log(cache.size); // Number of cached entries
```

## Error Handling

```ts
import { isHttpError, isTimeoutError, isNetworkError } from 'node-http-client';

try {
  await client.get('/might-fail');
} catch (error) {
  if (isHttpError(error)) {
    console.log(error.status);       // 404, 500, etc.
    console.log(error.response.data); // Response body
  } else if (isTimeoutError(error)) {
    console.log(error.timeout);       // Timeout value in ms
  } else if (isNetworkError(error)) {
    console.log(error.code);          // 'ECONNREFUSED', etc.
  }
}
```

## Comparison with axios

| Feature | node-http-client | axios |
|---------|:----------------:|:-----:|
| Zero dependencies | Yes | No (follow-redirects, form-data, proxy-from-env) |
| TypeScript built-in | Yes | Yes |
| Interceptors | Yes | Yes |
| Retry middleware | Built-in | Plugin (axios-retry) |
| Response caching | Built-in | Plugin (axios-cache-interceptor) |
| Browser support | No (Node.js only) | Yes |
| Bundle size | ~8 KB | ~50 KB |
| Automatic transforms | Yes | Yes |
| Stream responses | Yes | Yes |

## License

MIT
