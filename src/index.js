'use strict';

/**
 * @module node-http-client
 * @description Lightweight HTTP client with interceptors, retries, and exponential backoff.
 * @author idirdev
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * Lightweight HTTP client with support for interceptors, retries, and JSON.
 */
class HttpClient {
  /**
   * Create a new HttpClient instance.
   *
   * @param {object} [opts={}] - Client configuration.
   * @param {string} [opts.baseUrl=''] - Base URL prepended to every request path.
   * @param {object} [opts.defaultHeaders={}] - Headers sent with every request.
   * @param {number} [opts.timeout=30000] - Request timeout in ms.
   * @param {number} [opts.retries=0] - Number of retry attempts on failure.
   * @param {number} [opts.retryDelay=200] - Base retry delay in ms.
   * @param {boolean} [opts.backoff=true] - Use exponential backoff for retries.
   */
  constructor(opts = {}) {
    this.baseUrl = opts.baseUrl || '';
    this.defaultHeaders = opts.defaultHeaders || {};
    this.timeout = opts.timeout != null ? opts.timeout : 30000;
    this.retries = opts.retries || 0;
    this.retryDelay = opts.retryDelay != null ? opts.retryDelay : 200;
    this.backoff = opts.backoff !== false;

    /** @type {Function[]} */
    this._requestInterceptors = [];
    /** @type {Function[]} */
    this._responseInterceptors = [];
  }

  /**
   * Register a request interceptor.
   * The function receives the request config object and must return it (optionally modified).
   *
   * @param {Function} fn - Interceptor function: (config) => config.
   * @returns {this}
   */
  addRequestInterceptor(fn) {
    this._requestInterceptors.push(fn);
    return this;
  }

  /**
   * Register a response interceptor.
   * The function receives the response object and must return it (optionally modified).
   *
   * @param {Function} fn - Interceptor function: (response) => response.
   * @returns {this}
   */
  addResponseInterceptor(fn) {
    this._responseInterceptors.push(fn);
    return this;
  }

  /**
   * Perform a GET request.
   *
   * @param {string} path - Request path (appended to baseUrl).
   * @param {object} [opts={}] - Per-request options.
   * @returns {Promise<HttpClientResponse>}
   */
  get(path, opts = {}) {
    return this.request('GET', path, opts);
  }

  /**
   * Perform a POST request.
   *
   * @param {string} path - Request path.
   * @param {*} body - Request body (auto-serialised to JSON if object).
   * @param {object} [opts={}] - Per-request options.
   * @returns {Promise<HttpClientResponse>}
   */
  post(path, body, opts = {}) {
    return this.request('POST', path, { ...opts, body });
  }

  /**
   * Perform a PUT request.
   *
   * @param {string} path - Request path.
   * @param {*} body - Request body.
   * @param {object} [opts={}] - Per-request options.
   * @returns {Promise<HttpClientResponse>}
   */
  put(path, body, opts = {}) {
    return this.request('PUT', path, { ...opts, body });
  }

  /**
   * Perform a PATCH request.
   *
   * @param {string} path - Request path.
   * @param {*} body - Request body.
   * @param {object} [opts={}] - Per-request options.
   * @returns {Promise<HttpClientResponse>}
   */
  patch(path, body, opts = {}) {
    return this.request('PATCH', path, { ...opts, body });
  }

  /**
   * Perform a DELETE request.
   *
   * @param {string} path - Request path.
   * @param {object} [opts={}] - Per-request options.
   * @returns {Promise<HttpClientResponse>}
   */
  delete(path, opts = {}) {
    return this.request('DELETE', path, opts);
  }

  /**
   * Core request method. Applies interceptors, handles retries with backoff.
   *
   * @param {string} method - HTTP method.
   * @param {string} path - Request path or full URL.
   * @param {object} [opts={}] - Per-request options (headers, body, timeout, retries).
   * @returns {Promise<HttpClientResponse>}
   */
  async request(method, path, opts = {}) {
    let config = {
      method: method.toUpperCase(),
      url: path.startsWith('http') ? path : this.baseUrl + path,
      headers: { ...this.defaultHeaders, ...(opts.headers || {}) },
      body: opts.body,
      timeout: opts.timeout != null ? opts.timeout : this.timeout,
    };

    for (const interceptor of this._requestInterceptors) {
      config = await interceptor(config);
    }

    const maxAttempts = (opts.retries != null ? opts.retries : this.retries) + 1;

    let lastError;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        const delay = this.backoff
          ? this.retryDelay * Math.pow(2, attempt - 1)
          : this.retryDelay;
        await new Promise((r) => setTimeout(r, delay));
      }

      try {
        let response = await this._send(config);

        for (const interceptor of this._responseInterceptors) {
          response = await interceptor(response);
        }

        const shouldRetry = response.status >= 500 && attempt < maxAttempts - 1;
        if (shouldRetry) {
          lastError = new Error(`Server error: ${response.status}`);
          continue;
        }

        return response;
      } catch (err) {
        lastError = err;
        if (attempt >= maxAttempts - 1) throw err;
      }
    }

    throw lastError;
  }

  /**
   * Internal HTTP send helper.
   *
   * @param {object} config - Resolved request configuration.
   * @returns {Promise<HttpClientResponse>}
   * @private
   */
  _send(config) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(config.url);
      const lib = parsed.protocol === 'https:' ? https : http;

      let bodyData;
      const sendHeaders = { ...config.headers };

      if (config.body !== undefined && config.body !== null) {
        if (typeof config.body === 'object' && !Buffer.isBuffer(config.body)) {
          bodyData = JSON.stringify(config.body);
          if (!sendHeaders['content-type'] && !sendHeaders['Content-Type']) {
            sendHeaders['content-type'] = 'application/json';
          }
        } else {
          bodyData = config.body;
        }
        sendHeaders['content-length'] = Buffer.byteLength(bodyData);
      }

      const reqOpts = {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: config.method,
        headers: sendHeaders,
      };

      const start = Date.now();

      const req = lib.request(reqOpts, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString();
          const timing = Date.now() - start;

          let data = raw;
          const ct = (res.headers['content-type'] || '').toLowerCase();
          if (ct.includes('application/json')) {
            try { data = JSON.parse(raw); } catch (_) { data = raw; }
          }

          resolve({ status: res.statusCode, headers: res.headers, data, timing });
        });
      });

      req.setTimeout(config.timeout, () =>
        req.destroy(new Error(`Request timed out after ${config.timeout}ms`))
      );
      req.on('error', reject);

      if (bodyData !== undefined) req.write(bodyData);
      req.end();
    });
  }

  /**
   * Static factory method to create a pre-configured HttpClient.
   *
   * @param {object} config - Configuration passed to the constructor.
   * @returns {HttpClient} New HttpClient instance.
   */
  static create(config) {
    return new HttpClient(config);
  }
}

/**
 * @typedef {object} HttpClientResponse
 * @property {number} status - HTTP status code.
 * @property {object} headers - Response headers.
 * @property {*} data - Parsed response data (JSON object or string).
 * @property {number} timing - Elapsed time in ms.
 */

module.exports = { HttpClient };
