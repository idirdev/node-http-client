import {
  ClientConfig,
  RequestConfig,
  Response,
  HttpMethod,
  HttpClientInterface,
} from './types';
import { InterceptorManager } from './interceptors';
import { dispatchRequest } from './request';
import { mergeConfig } from './utils';

/**
 * HttpClient - A configurable HTTP client with interceptors, request/response
 * transforms, timeout handling, and defaults merging.
 *
 * Wraps Node.js built-in http/https modules with a Promise-based API.
 */
export class HttpClient implements HttpClientInterface {
  public defaults: ClientConfig;
  public interceptors: {
    request: InterceptorManager<RequestConfig>;
    response: InterceptorManager<Response>;
  };

  constructor(config: ClientConfig = {}) {
    this.defaults = {
      timeout: 0,
      maxRedirects: 5,
      responseType: 'json',
      decompress: true,
      headers: {
        'accept': 'application/json, text/plain, */*',
        'user-agent': 'node-http-client/1.0.0',
      },
      ...config,
    };

    this.interceptors = {
      request: new InterceptorManager<RequestConfig>(),
      response: new InterceptorManager<Response>(),
    };
  }

  /**
   * Send an HTTP request with full configuration.
   * Applies request interceptors before sending and response interceptors after.
   */
  public async request<T = any>(config: RequestConfig): Promise<Response<T>> {
    // Merge defaults with per-request config
    let mergedConfig = mergeConfig(this.defaults, config);

    // Apply request transforms from defaults if not overridden
    if (!config.transformRequest && this.defaults.transformRequest) {
      mergedConfig.transformRequest = this.defaults.transformRequest;
    }
    if (!config.transformResponse && this.defaults.transformResponse) {
      mergedConfig.transformResponse = this.defaults.transformResponse;
    }

    // Run request interceptors in order (FIFO)
    const requestInterceptors: Array<{
      fulfilled: (value: RequestConfig) => RequestConfig | Promise<RequestConfig>;
      rejected?: (error: any) => any;
    }> = [];
    this.interceptors.request.forEach((interceptor) => {
      requestInterceptors.push(interceptor);
    });

    for (const interceptor of requestInterceptors) {
      try {
        mergedConfig = await interceptor.fulfilled(mergedConfig);
      } catch (error) {
        if (interceptor.rejected) {
          mergedConfig = await interceptor.rejected(error);
        } else {
          throw error;
        }
      }
    }

    // Dispatch the actual HTTP request
    let response: Response<T>;
    try {
      response = await dispatchRequest<T>(mergedConfig);
    } catch (error) {
      // Allow response interceptors to handle errors too
      const responseInterceptors: Array<{
        fulfilled: (value: Response) => Response | Promise<Response>;
        rejected?: (error: any) => any;
      }> = [];
      this.interceptors.response.forEach((interceptor) => {
        responseInterceptors.push(interceptor);
      });

      let handledError = error;
      for (const interceptor of responseInterceptors) {
        if (interceptor.rejected) {
          try {
            const result = await interceptor.rejected(handledError);
            // If the rejected handler returns a value, treat it as a recovered response
            if (result && typeof result === 'object' && 'status' in result) {
              return result as Response<T>;
            }
            handledError = result;
          } catch (e) {
            handledError = e;
          }
        }
      }
      throw handledError;
    }

    // Run response interceptors in order (FIFO)
    const responseInterceptors: Array<{
      fulfilled: (value: Response) => Response | Promise<Response>;
      rejected?: (error: any) => any;
    }> = [];
    this.interceptors.response.forEach((interceptor) => {
      responseInterceptors.push(interceptor);
    });

    let processedResponse: Response = response;
    for (const interceptor of responseInterceptors) {
      try {
        processedResponse = await interceptor.fulfilled(processedResponse);
      } catch (error) {
        if (interceptor.rejected) {
          processedResponse = await interceptor.rejected(error);
        } else {
          throw error;
        }
      }
    }

    return processedResponse as Response<T>;
  }

  /**
   * Send a GET request.
   */
  public get<T = any>(url: string, config: RequestConfig = {}): Promise<Response<T>> {
    return this.request<T>({ ...config, url, method: 'GET' });
  }

  /**
   * Send a POST request with an optional request body.
   */
  public post<T = any>(url: string, data?: any, config: RequestConfig = {}): Promise<Response<T>> {
    return this.request<T>({ ...config, url, method: 'POST', data });
  }

  /**
   * Send a PUT request with an optional request body.
   */
  public put<T = any>(url: string, data?: any, config: RequestConfig = {}): Promise<Response<T>> {
    return this.request<T>({ ...config, url, method: 'PUT', data });
  }

  /**
   * Send a PATCH request with an optional request body.
   */
  public patch<T = any>(url: string, data?: any, config: RequestConfig = {}): Promise<Response<T>> {
    return this.request<T>({ ...config, url, method: 'PATCH', data });
  }

  /**
   * Send a DELETE request.
   */
  public delete<T = any>(url: string, config: RequestConfig = {}): Promise<Response<T>> {
    return this.request<T>({ ...config, url, method: 'DELETE' });
  }

  /**
   * Send a HEAD request (response body is discarded by the server).
   */
  public head<T = any>(url: string, config: RequestConfig = {}): Promise<Response<T>> {
    return this.request<T>({ ...config, url, method: 'HEAD' });
  }

  /**
   * Send an OPTIONS request (used for CORS preflight checks).
   */
  public options<T = any>(url: string, config: RequestConfig = {}): Promise<Response<T>> {
    return this.request<T>({ ...config, url, method: 'OPTIONS' });
  }
}
