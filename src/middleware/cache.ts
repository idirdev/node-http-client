import { HttpClient } from '../client';
import { RequestConfig, Response, HttpMethod } from '../types';
import { serializeParams } from '../utils';

export interface CacheOptions {
  /** Time-to-live for cached entries in milliseconds. Default: 60000 (1 minute) */
  ttl?: number;
  /** Maximum number of entries in the cache. Default: 100 */
  maxSize?: number;
  /** HTTP methods to cache. Default: ['GET'] */
  methods?: HttpMethod[];
  /** Custom function to generate cache keys from request config */
  keyGenerator?: (config: RequestConfig) => string;
}

interface CacheEntry {
  response: Response;
  expiresAt: number;
  createdAt: number;
}

const DEFAULT_TTL = 60 * 1000; // 1 minute
const DEFAULT_MAX_SIZE = 100;
const DEFAULT_CACHEABLE_METHODS: HttpMethod[] = ['GET'];

/**
 * Response cache middleware with in-memory Map storage, TTL expiration,
 * and max-entries eviction (LRU-style oldest-first).
 *
 * Only caches responses for configured HTTP methods (GET by default).
 * Cache keys are generated from method + URL + serialized query params.
 *
 * @example
 * ```ts
 * const client = new HttpClient({ baseURL: 'https://api.example.com' });
 * const cache = new CacheMiddleware(client, { ttl: 30000, maxSize: 50 });
 *
 * // First request hits the network
 * await client.get('/users');
 *
 * // Second identical request returns from cache
 * await client.get('/users');
 *
 * // Manually clear the cache
 * cache.clear();
 * ```
 */
export class CacheMiddleware {
  private store: Map<string, CacheEntry> = new Map();
  private ttl: number;
  private maxSize: number;
  private methods: HttpMethod[];
  private keyGenerator: (config: RequestConfig) => string;
  private requestInterceptorId: number;
  private responseInterceptorId: number;
  private client: HttpClient;

  constructor(client: HttpClient, options: CacheOptions = {}) {
    this.client = client;
    this.ttl = options.ttl ?? DEFAULT_TTL;
    this.maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
    this.methods = options.methods ?? DEFAULT_CACHEABLE_METHODS;
    this.keyGenerator = options.keyGenerator ?? CacheMiddleware.defaultKeyGenerator;

    // Register a request interceptor to check the cache before sending
    this.requestInterceptorId = client.interceptors.request.use(
      (config: RequestConfig) => {
        const method = (config.method || 'GET') as HttpMethod;

        if (!this.isCacheable(method)) {
          return config;
        }

        const key = this.keyGenerator(config);
        const cached = this.get(key);

        if (cached) {
          // Mark the config so the response interceptor knows to skip caching
          (config as any)._fromCache = true;
          (config as any)._cachedResponse = cached;
        }

        return config;
      },
    );

    // Register a response interceptor to return cached data or store new responses
    this.responseInterceptorId = client.interceptors.response.use(
      (response: Response) => {
        const config = response.config;

        // If this response was served from cache, return the cached version
        if ((config as any)._fromCache && (config as any)._cachedResponse) {
          const cachedResponse = (config as any)._cachedResponse as Response;
          delete (config as any)._fromCache;
          delete (config as any)._cachedResponse;
          return cachedResponse;
        }

        // Cache the new response if the method is cacheable
        const method = (config.method || 'GET') as HttpMethod;
        if (this.isCacheable(method)) {
          const key = this.keyGenerator(config);
          this.set(key, response);
        }

        return response;
      },
    );
  }

  /**
   * Generate a default cache key from method, full URL, and query params.
   */
  static defaultKeyGenerator(config: RequestConfig): string {
    const method = config.method || 'GET';
    const base = config.baseURL || '';
    const url = config.url || '';
    const fullUrl = base ? `${base.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}` : url;
    const params = config.params ? serializeParams(config.params) : '';
    return `${method}:${fullUrl}${params ? '?' + params : ''}`;
  }

  /**
   * Check if a method is eligible for caching.
   */
  private isCacheable(method: HttpMethod): boolean {
    return this.methods.includes(method);
  }

  /**
   * Get a cached response by key. Returns undefined if not found or expired.
   */
  public get(key: string): Response | undefined {
    const entry = this.store.get(key);

    if (!entry) {
      return undefined;
    }

    // Check if the entry has expired
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.response;
  }

  /**
   * Store a response in the cache with TTL.
   * Evicts the oldest entry if the cache is full.
   */
  public set(key: string, response: Response): void {
    // Evict oldest entries if we are at capacity
    while (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      } else {
        break;
      }
    }

    this.store.set(key, {
      response,
      expiresAt: Date.now() + this.ttl,
      createdAt: Date.now(),
    });
  }

  /**
   * Delete a specific entry from the cache.
   */
  public delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Clear all entries from the cache.
   */
  public clear(): void {
    this.store.clear();
  }

  /**
   * Get the current number of entries in the cache.
   */
  public get size(): number {
    return this.store.size;
  }

  /**
   * Check if a key exists in the cache and is not expired.
   */
  public has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Remove the cache interceptors from the client.
   * Call this to fully detach the cache middleware.
   */
  public detach(): void {
    this.client.interceptors.request.eject(this.requestInterceptorId);
    this.client.interceptors.response.eject(this.responseInterceptorId);
    this.clear();
  }

  /**
   * Purge all expired entries from the cache without waiting for access.
   */
  public prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        pruned++;
      }
    }

    return pruned;
  }
}
