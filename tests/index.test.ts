import { describe, it, expect } from 'vitest';
import {
  isAbsoluteURL,
  combineURLs,
  buildURL,
  serializeParams,
  normalizeHeaders,
  mergeConfig,
  defaultValidateStatus,
} from '../src/utils';
import { InterceptorManager } from '../src/interceptors';
import { HttpClient } from '../src/client';
import { HttpError, TimeoutError, NetworkError, isHttpError, isTimeoutError, isNetworkError } from '../src/errors';

describe('isAbsoluteURL', () => {
  it('should detect http URLs as absolute', () => {
    expect(isAbsoluteURL('http://example.com')).toBe(true);
  });

  it('should detect https URLs as absolute', () => {
    expect(isAbsoluteURL('https://example.com')).toBe(true);
  });

  it('should detect protocol-relative URLs as absolute', () => {
    expect(isAbsoluteURL('//example.com')).toBe(true);
  });

  it('should detect relative URLs as not absolute', () => {
    expect(isAbsoluteURL('/api/users')).toBe(false);
    expect(isAbsoluteURL('api/users')).toBe(false);
  });
});

describe('combineURLs', () => {
  it('should combine base and relative URLs', () => {
    expect(combineURLs('http://example.com', '/api/users')).toBe('http://example.com/api/users');
  });

  it('should strip trailing slashes from base', () => {
    expect(combineURLs('http://example.com/', '/api')).toBe('http://example.com/api');
  });

  it('should strip leading slashes from relative', () => {
    expect(combineURLs('http://example.com', '///api')).toBe('http://example.com/api');
  });

  it('should return relative URL if absolute', () => {
    expect(combineURLs('http://base.com', 'http://other.com/path')).toBe('http://other.com/path');
  });

  it('should return relative URL if base is empty', () => {
    expect(combineURLs('', '/api')).toBe('/api');
  });

  it('should return base URL if relative is empty', () => {
    expect(combineURLs('http://example.com', '')).toBe('http://example.com');
  });
});

describe('buildURL', () => {
  it('should return url as-is when no baseURL or params', () => {
    expect(buildURL({ url: 'http://example.com/api' })).toBe('http://example.com/api');
  });

  it('should combine baseURL with relative url', () => {
    expect(buildURL({ baseURL: 'http://example.com', url: '/api/users' })).toBe('http://example.com/api/users');
  });

  it('should append params to URL', () => {
    const result = buildURL({ url: 'http://example.com/api', params: { page: 1, limit: 10 } });
    expect(result).toContain('page=1');
    expect(result).toContain('limit=10');
    expect(result).toContain('?');
  });

  it('should use & separator when URL already has query params', () => {
    const result = buildURL({ url: 'http://example.com/api?existing=1', params: { page: 2 } });
    expect(result).toContain('&page=2');
  });

  it('should not combine baseURL with absolute url', () => {
    const result = buildURL({ baseURL: 'http://base.com', url: 'http://other.com/api' });
    expect(result).toBe('http://other.com/api');
  });
});

describe('serializeParams', () => {
  it('should serialize simple params', () => {
    const result = serializeParams({ name: 'test', page: 1 });
    expect(result).toContain('name=test');
    expect(result).toContain('page=1');
  });

  it('should skip null and undefined values', () => {
    const result = serializeParams({ a: 'yes', b: undefined, c: null });
    expect(result).toBe('a=yes');
  });

  it('should encode special characters', () => {
    const result = serializeParams({ q: 'hello world' });
    expect(result).toBe('q=hello%20world');
  });

  it('should handle array values', () => {
    const result = serializeParams({ ids: [1, 2, 3] });
    expect(result).toContain('ids=1');
    expect(result).toContain('ids=2');
    expect(result).toContain('ids=3');
  });

  it('should return empty string for empty params', () => {
    expect(serializeParams({})).toBe('');
  });
});

describe('normalizeHeaders', () => {
  it('should lowercase all header keys', () => {
    const result = normalizeHeaders({ 'Content-Type': 'application/json', 'X-Custom': 'value' });
    expect(result['content-type']).toBe('application/json');
    expect(result['x-custom']).toBe('value');
  });
});

describe('mergeConfig', () => {
  it('should merge defaults with overrides', () => {
    const defaults = { baseURL: 'http://example.com', timeout: 5000 };
    const overrides = { url: '/api', timeout: 10000 };
    const result = mergeConfig(defaults, overrides);
    expect(result.baseURL).toBe('http://example.com');
    expect(result.url).toBe('/api');
    expect(result.timeout).toBe(10000);
  });

  it('should merge headers from both configs', () => {
    const defaults = { headers: { 'Accept': 'application/json' } };
    const overrides = { headers: { 'Authorization': 'Bearer token' } };
    const result = mergeConfig(defaults, overrides);
    expect(result.headers!['accept']).toBe('application/json');
    expect(result.headers!['authorization']).toBe('Bearer token');
  });

  it('should override scalar values', () => {
    const defaults = { timeout: 5000, maxRedirects: 5 };
    const overrides = { timeout: 0 };
    const result = mergeConfig(defaults, overrides);
    expect(result.timeout).toBe(0);
    expect(result.maxRedirects).toBe(5);
  });
});

describe('defaultValidateStatus', () => {
  it('should accept 2xx status codes', () => {
    expect(defaultValidateStatus(200)).toBe(true);
    expect(defaultValidateStatus(201)).toBe(true);
    expect(defaultValidateStatus(299)).toBe(true);
  });

  it('should reject non-2xx status codes', () => {
    expect(defaultValidateStatus(100)).toBe(false);
    expect(defaultValidateStatus(301)).toBe(false);
    expect(defaultValidateStatus(400)).toBe(false);
    expect(defaultValidateStatus(500)).toBe(false);
  });
});

describe('InterceptorManager', () => {
  it('should register and iterate interceptors', () => {
    const manager = new InterceptorManager<string>();
    manager.use((val) => val + '!');
    manager.use((val) => val + '?');

    const results: string[] = [];
    manager.forEach((interceptor) => {
      results.push(interceptor.fulfilled('test'));
    });

    expect(results).toEqual(['test!', 'test?']);
  });

  it('should return an id when registering', () => {
    const manager = new InterceptorManager<string>();
    const id = manager.use((val) => val);
    expect(typeof id).toBe('number');
  });

  it('should eject interceptors by id', () => {
    const manager = new InterceptorManager<string>();
    manager.use((val) => val + 'A');
    const id = manager.use((val) => val + 'B');
    manager.use((val) => val + 'C');

    manager.eject(id);

    const results: string[] = [];
    manager.forEach((interceptor) => {
      results.push(interceptor.fulfilled(''));
    });

    expect(results).toEqual(['A', 'C']);
  });

  it('should clear all interceptors', () => {
    const manager = new InterceptorManager<string>();
    manager.use((val) => val);
    manager.use((val) => val);
    manager.clear();
    expect(manager.count).toBe(0);
  });

  it('should track active interceptor count', () => {
    const manager = new InterceptorManager<string>();
    manager.use((val) => val);
    const id = manager.use((val) => val);
    expect(manager.count).toBe(2);
    manager.eject(id);
    expect(manager.count).toBe(1);
  });
});

describe('HttpClient', () => {
  it('should create with default config', () => {
    const client = new HttpClient();
    expect(client.defaults.timeout).toBe(0);
    expect(client.defaults.maxRedirects).toBe(5);
    expect(client.defaults.responseType).toBe('json');
    expect(client.defaults.headers!['accept']).toContain('application/json');
    expect(client.defaults.headers!['user-agent']).toContain('node-http-client');
  });

  it('should accept custom config', () => {
    const client = new HttpClient({
      baseURL: 'http://example.com',
      timeout: 5000,
    });
    expect(client.defaults.baseURL).toBe('http://example.com');
    expect(client.defaults.timeout).toBe(5000);
  });

  it('should have interceptor managers', () => {
    const client = new HttpClient();
    expect(client.interceptors.request).toBeInstanceOf(InterceptorManager);
    expect(client.interceptors.response).toBeInstanceOf(InterceptorManager);
  });
});

describe('Error classes', () => {
  it('should create HttpError with correct properties', () => {
    const config = { url: 'http://example.com', method: 'GET' as const };
    const response = { data: null, status: 404, statusText: 'Not Found', headers: {}, config };
    const error = new HttpError('Not found', config, response);

    expect(error.message).toBe('Not found');
    expect(error.status).toBe(404);
    expect(error.statusText).toBe('Not Found');
    expect(error.name).toBe('HttpError');
    expect(error.isHttpError).toBe(true);
  });

  it('should create TimeoutError with correct properties', () => {
    const config = { url: 'http://example.com', method: 'GET' as const };
    const error = new TimeoutError(config, 5000);

    expect(error.message).toContain('5000ms');
    expect(error.timeout).toBe(5000);
    expect(error.name).toBe('TimeoutError');
    expect(error.isTimeoutError).toBe(true);
  });

  it('should create NetworkError with correct properties', () => {
    const config = { url: 'http://example.com', method: 'GET' as const };
    const error = new NetworkError('Connection refused', config, 'ECONNREFUSED');

    expect(error.message).toBe('Connection refused');
    expect(error.code).toBe('ECONNREFUSED');
    expect(error.name).toBe('NetworkError');
    expect(error.isNetworkError).toBe(true);
  });

  it('should support type guard functions', () => {
    const config = { url: 'http://example.com', method: 'GET' as const };
    const response = { data: null, status: 500, statusText: 'Error', headers: {}, config };

    expect(isHttpError(new HttpError('err', config, response))).toBe(true);
    expect(isHttpError(new Error('regular'))).toBe(false);
    expect(isTimeoutError(new TimeoutError(config, 5000))).toBe(true);
    expect(isTimeoutError(new Error('regular'))).toBe(false);
    expect(isNetworkError(new NetworkError('err', config))).toBe(true);
    expect(isNetworkError(new Error('regular'))).toBe(false);
  });

  it('should serialize HttpError to JSON', () => {
    const config = { url: 'http://example.com', method: 'GET' as const };
    const response = { data: null, status: 404, statusText: 'Not Found', headers: {}, config };
    const error = new HttpError('Not found', config, response);
    const json = error.toJSON() as any;

    expect(json.status).toBe(404);
    expect(json.url).toBe('http://example.com');
    expect(json.method).toBe('GET');
  });
});
