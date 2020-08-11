import * as url from 'url';
import { Headers, QueryParams, RequestConfig, ClientConfig } from './types';

/**
 * Check if a URL is absolute (starts with http:// or https:// or //)
 */
export function isAbsoluteURL(urlStr: string): boolean {
  return /^https?:\/\//i.test(urlStr) || urlStr.startsWith('//');
}

/**
 * Combine a base URL with a relative URL
 */
export function combineURLs(baseURL: string, relativeURL: string): string {
  if (!baseURL) return relativeURL;
  if (!relativeURL) return baseURL;
  if (isAbsoluteURL(relativeURL)) return relativeURL;

  const base = baseURL.replace(/\/+$/, '');
  const relative = relativeURL.replace(/^\/+/, '');
  return `${base}/${relative}`;
}

/**
 * Build a full URL from config, combining baseURL, url, and params
 */
export function buildURL(config: RequestConfig): string {
  let fullURL = config.url || '';

  if (config.baseURL && !isAbsoluteURL(fullURL)) {
    fullURL = combineURLs(config.baseURL, fullURL);
  }

  if (config.params) {
    const serialized = serializeParams(config.params);
    if (serialized) {
      const separator = fullURL.indexOf('?') === -1 ? '?' : '&';
      fullURL += separator + serialized;
    }
  }

  return fullURL;
}

/**
 * Serialize query parameters into a URL query string
 */
export function serializeParams(params: QueryParams): string {
  const parts: string[] = [];

  Object.keys(params).forEach((key) => {
    const value = params[key];
    if (value === undefined || value === null) return;

    const values = Array.isArray(value) ? value : [value];
    const encodedKey = encodeURIComponent(key);

    values.forEach((v) => {
      parts.push(`${encodedKey}=${encodeURIComponent(String(v))}`);
    });
  });

  return parts.join('&');
}

/**
 * Normalize header names to a consistent format (lowercase)
 */
export function normalizeHeaders(headers: Headers): Headers {
  const normalized: Headers = {};
  Object.keys(headers).forEach((key) => {
    normalized[key.toLowerCase()] = headers[key];
  });
  return normalized;
}

/**
 * Deep merge two config objects, with the second taking precedence
 */
export function mergeConfig(defaults: ClientConfig, overrides: RequestConfig): RequestConfig {
  const merged: RequestConfig = { ...defaults as RequestConfig };

  // Simple scalar properties: override wins
  const scalarKeys: Array<keyof RequestConfig> = [
    'url', 'method', 'baseURL', 'timeout', 'maxRedirects',
    'validateStatus', 'responseType', 'data', 'agent',
    'auth', 'maxContentLength', 'decompress',
  ];

  scalarKeys.forEach((key) => {
    if ((overrides as any)[key] !== undefined) {
      (merged as any)[key] = (overrides as any)[key];
    }
  });

  // Merge headers: defaults + overrides
  if (defaults.headers || overrides.headers) {
    merged.headers = {
      ...normalizeHeaders(defaults.headers || {}),
      ...normalizeHeaders(overrides.headers || {}),
    };
  }

  // Merge params
  if (overrides.params) {
    merged.params = overrides.params;
  }

  // Merge transform arrays
  if (overrides.transformRequest) {
    merged.transformRequest = overrides.transformRequest;
  }
  if (overrides.transformResponse) {
    merged.transformResponse = overrides.transformResponse;
  }

  return merged;
}

/**
 * Parse a URL string into its protocol, hostname, port, and path components
 */
export function parseURL(urlStr: string): url.UrlWithStringQuery {
  return url.parse(urlStr);
}

/**
 * Determine if a status code represents a successful response
 */
export function defaultValidateStatus(status: number): boolean {
  return status >= 200 && status < 300;
}
