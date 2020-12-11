import { HttpClient } from './client';
import { ClientConfig, RequestConfig, Response, HttpMethod, Headers, QueryParams } from './types';
import { HttpError, TimeoutError, NetworkError, isHttpError, isTimeoutError, isNetworkError } from './errors';
import { InterceptorManager } from './interceptors';
import { retryMiddleware, RetryOptions } from './middleware/retry';
import { CacheMiddleware, CacheOptions } from './middleware/cache';

/**
 * Factory function to create a new HttpClient instance with a base configuration.
 */
export function createClient(baseConfig: ClientConfig = {}): HttpClient {
  return new HttpClient(baseConfig);
}

// Default client instance for convenience
const defaultClient = new HttpClient();

export default defaultClient;

// Re-export everything
export {
  HttpClient,
  InterceptorManager,
  HttpError,
  TimeoutError,
  NetworkError,
  isHttpError,
  isTimeoutError,
  isNetworkError,
  retryMiddleware,
  CacheMiddleware,
};

export type {
  ClientConfig,
  RequestConfig,
  Response,
  HttpMethod,
  Headers,
  QueryParams,
  RetryOptions,
  CacheOptions,
  HttpClientInterface,
  Interceptor,
};
