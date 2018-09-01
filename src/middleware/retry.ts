import { HttpClient } from '../client';
import { RequestConfig, Response, HttpMethod } from '../types';
import { HttpError, TimeoutError, NetworkError, isHttpError, isTimeoutError, isNetworkError } from '../errors';

export interface RetryOptions {
  /** Maximum number of retry attempts. Default: 3 */
  retries?: number;
  /** Base delay in milliseconds for exponential backoff. Default: 300 */
  retryDelay?: number;
  /** HTTP status codes that trigger a retry. Default: [408, 429, 500, 502, 503, 504] */
  retryableStatusCodes?: number[];
  /** HTTP methods that are safe to retry. Default: ['GET', 'HEAD', 'OPTIONS'] */
  retryableMethods?: HttpMethod[];
  /** Callback invoked before each retry attempt */
  onRetry?: (retryCount: number, error: any, config: RequestConfig) => void;
  /** Custom condition to determine if an error is retryable */
  retryCondition?: (error: any) => boolean;
}

const DEFAULT_RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];
const DEFAULT_RETRYABLE_METHODS: HttpMethod[] = ['GET', 'HEAD', 'OPTIONS'];
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 300;

/**
 * Calculate exponential backoff delay with jitter.
 * Formula: baseDelay * 2^(attempt-1) + random jitter (0-100ms)
 */
function getBackoffDelay(attempt: number, baseDelay: number): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 100;
  return exponentialDelay + jitter;
}

/**
 * Determine whether an error is retryable based on its type and the retry options.
 */
function isRetryableError(error: any, options: Required<RetryOptions>): boolean {
  // User-supplied custom condition takes precedence
  if (options.retryCondition) {
    return options.retryCondition(error);
  }

  // Network errors (connection refused, DNS failure, etc.) are always retryable
  if (isNetworkError(error)) {
    return true;
  }

  // Timeout errors are always retryable
  if (isTimeoutError(error)) {
    return true;
  }

  // HTTP errors: check if the status code and method are retryable
  if (isHttpError(error)) {
    const httpErr = error as HttpError;
    const method = (httpErr.config.method || 'GET') as HttpMethod;
    const isMethodRetryable = options.retryableMethods.includes(method);
    const isStatusRetryable = options.retryableStatusCodes.includes(httpErr.status);
    return isMethodRetryable && isStatusRetryable;
  }

  return false;
}

/**
 * Sleep for a specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Apply retry middleware to an HttpClient instance.
 * Registers a response interceptor that automatically retries failed requests
 * using exponential backoff.
 *
 * @param client - The HttpClient instance to attach retry behavior to
 * @param options - Retry configuration options
 * @returns The interceptor ID (can be used to eject the middleware later)
 *
 * @example
 * ```ts
 * const client = new HttpClient({ baseURL: 'https://api.example.com' });
 * const interceptorId = retryMiddleware(client, { retries: 3, retryDelay: 500 });
 * ```
 */
export function retryMiddleware(client: HttpClient, options: RetryOptions = {}): number {
  const resolvedOptions = {
    retries: options.retries ?? DEFAULT_RETRIES,
    retryDelay: options.retryDelay ?? DEFAULT_RETRY_DELAY,
    retryableStatusCodes: options.retryableStatusCodes ?? DEFAULT_RETRYABLE_STATUS_CODES,
    retryableMethods: options.retryableMethods ?? DEFAULT_RETRYABLE_METHODS,
    onRetry: options.onRetry ?? (() => {}),
    retryCondition: options.retryCondition ?? null,
  } as Required<RetryOptions>;

  // Track retry counts per request using a WeakMap-style approach on the config object
  const retryCountMap = new Map<string, number>();

  function getRequestKey(config: RequestConfig): string {
    return `${config.method || 'GET'}:${config.baseURL || ''}${config.url || ''}:${Date.now()}`;
  }

  const interceptorId = client.interceptors.response.use(
    // On success: pass through
    (response: Response) => response,

    // On error: evaluate retry logic
    async (error: any) => {
      const config = error.config || error.response?.config;
      if (!config) {
        throw error;
      }

      // Initialize or increment retry counter stored on the config itself
      if (config._retryCount === undefined) {
        config._retryCount = 0;
      }

      const currentAttempt = config._retryCount as number;

      if (currentAttempt >= resolvedOptions.retries) {
        throw error;
      }

      if (!isRetryableError(error, resolvedOptions)) {
        throw error;
      }

      // Increment retry counter
      config._retryCount = currentAttempt + 1;

      // Notify caller of the retry attempt
      resolvedOptions.onRetry(config._retryCount, error, config);

      // Wait with exponential backoff
      const delay = getBackoffDelay(config._retryCount, resolvedOptions.retryDelay);
      await sleep(delay);

      // Retry the request
      return client.request(config);
    },
  );

  return interceptorId;
}
