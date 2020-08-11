import * as http from 'http';
import * as https from 'https';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface Headers {
  [key: string]: string | string[] | undefined;
}

export interface QueryParams {
  [key: string]: string | number | boolean | Array<string | number | boolean> | undefined;
}

export interface RequestConfig {
  url?: string;
  method?: HttpMethod;
  baseURL?: string;
  headers?: Headers;
  params?: QueryParams;
  data?: any;
  timeout?: number;
  maxRedirects?: number;
  validateStatus?: (status: number) => boolean;
  responseType?: 'json' | 'text' | 'buffer' | 'stream';
  transformRequest?: Array<(data: any, headers: Headers) => any>;
  transformResponse?: Array<(data: any) => any>;
  agent?: http.Agent | https.Agent;
  auth?: {
    username: string;
    password: string;
  };
  maxContentLength?: number;
  decompress?: boolean;
}

export interface Response<T = any> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
  config: RequestConfig;
  request?: http.ClientRequest;
}

export interface Interceptor<T> {
  fulfilled: (value: T) => T | Promise<T>;
  rejected?: (error: any) => any;
}

export interface InterceptorManagerInterface<T> {
  use(fulfilled: (value: T) => T | Promise<T>, rejected?: (error: any) => any): number;
  eject(id: number): void;
  forEach(fn: (interceptor: Interceptor<T>) => void): void;
  clear(): void;
}

export interface ClientConfig {
  baseURL?: string;
  timeout?: number;
  headers?: Headers;
  maxRedirects?: number;
  validateStatus?: (status: number) => boolean;
  responseType?: 'json' | 'text' | 'buffer' | 'stream';
  transformRequest?: Array<(data: any, headers: Headers) => any>;
  transformResponse?: Array<(data: any) => any>;
  decompress?: boolean;
}

export interface HttpClientInterface {
  defaults: ClientConfig;
  interceptors: {
    request: InterceptorManagerInterface<RequestConfig>;
    response: InterceptorManagerInterface<Response>;
  };
  request<T = any>(config: RequestConfig): Promise<Response<T>>;
  get<T = any>(url: string, config?: RequestConfig): Promise<Response<T>>;
  post<T = any>(url: string, data?: any, config?: RequestConfig): Promise<Response<T>>;
  put<T = any>(url: string, data?: any, config?: RequestConfig): Promise<Response<T>>;
  patch<T = any>(url: string, data?: any, config?: RequestConfig): Promise<Response<T>>;
  delete<T = any>(url: string, config?: RequestConfig): Promise<Response<T>>;
  head<T = any>(url: string, config?: RequestConfig): Promise<Response<T>>;
  options<T = any>(url: string, config?: RequestConfig): Promise<Response<T>>;
}

export interface RetryConfig {
  retries?: number;
  retryDelay?: number;
  retryCondition?: (error: any) => boolean;
  shouldResetTimeout?: boolean;
}

export interface CacheConfig {
  ttl?: number;
  maxSize?: number;
  methods?: HttpMethod[];
  keyGenerator?: (config: RequestConfig) => string;
}
