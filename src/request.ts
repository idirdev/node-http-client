import * as http from 'http';
import * as https from 'https';
import * as zlib from 'zlib';
import { RequestConfig, Response, Headers } from './types';
import { buildURL, parseURL, defaultValidateStatus } from './utils';
import { HttpError, TimeoutError, NetworkError } from './errors';

/**
 * Execute an HTTP request using Node.js built-in http/https modules.
 * Returns a Promise that resolves with a Response object.
 */
export function dispatchRequest<T = any>(config: RequestConfig): Promise<Response<T>> {
  return new Promise((resolve, reject) => {
    const fullURL = buildURL(config);
    const parsed = parseURL(fullURL);
    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;

    // Prepare request data
    let requestData: string | Buffer | undefined;
    const headers: Headers = { ...config.headers };

    if (config.data !== undefined && config.data !== null) {
      if (typeof config.data === 'string' || Buffer.isBuffer(config.data)) {
        requestData = config.data;
      } else {
        requestData = JSON.stringify(config.data);
        if (!headers['content-type']) {
          headers['content-type'] = 'application/json';
        }
      }

      if (requestData) {
        headers['content-length'] = String(Buffer.byteLength(requestData as string));
      }
    }

    // Set Accept-Encoding for decompression
    if (config.decompress !== false) {
      headers['accept-encoding'] = 'gzip, deflate';
    }

    // Build basic auth header
    if (config.auth) {
      const credentials = Buffer.from(
        `${config.auth.username}:${config.auth.password}`,
      ).toString('base64');
      headers['authorization'] = `Basic ${credentials}`;
    }

    const requestOptions: http.RequestOptions = {
      method: config.method || 'GET',
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.path,
      headers: headers as http.OutgoingHttpHeaders,
      agent: config.agent as http.Agent | undefined,
    };

    const req = transport.request(requestOptions, (res: http.IncomingMessage) => {
      // Handle redirects
      const maxRedirects = config.maxRedirects !== undefined ? config.maxRedirects : 5;
      if (
        res.statusCode &&
        [301, 302, 303, 307, 308].includes(res.statusCode) &&
        maxRedirects > 0 &&
        res.headers.location
      ) {
        const redirectConfig: RequestConfig = {
          ...config,
          url: res.headers.location,
          maxRedirects: maxRedirects - 1,
        };

        // 303 should always become GET
        if (res.statusCode === 303) {
          redirectConfig.method = 'GET';
          redirectConfig.data = undefined;
        }

        resolve(dispatchRequest<T>(redirectConfig));
        return;
      }

      // Decompress response stream if needed
      let stream: NodeJS.ReadableStream = res;
      const encoding = res.headers['content-encoding'];
      if (config.decompress !== false && encoding) {
        if (encoding === 'gzip') {
          stream = res.pipe(zlib.createGunzip());
        } else if (encoding === 'deflate') {
          stream = res.pipe(zlib.createInflate());
        }
      }

      // Return stream directly if requested
      if (config.responseType === 'stream') {
        const response: Response<T> = {
          data: stream as any,
          status: res.statusCode || 0,
          statusText: res.statusMessage || '',
          headers: res.headers as Headers,
          config,
          request: req,
        };
        resolve(response);
        return;
      }

      // Collect response body
      const chunks: Buffer[] = [];
      let totalLength = 0;

      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        totalLength += chunk.length;

        if (config.maxContentLength && totalLength > config.maxContentLength) {
          req.abort();
          reject(new NetworkError(
            `Response content length exceeds maxContentLength of ${config.maxContentLength} bytes`,
            config,
          ));
        }
      });

      stream.on('end', () => {
        const buffer = Buffer.concat(chunks);
        let data: any;

        if (config.responseType === 'buffer') {
          data = buffer;
        } else {
          const text = buffer.toString('utf-8');
          if (config.responseType === 'text') {
            data = text;
          } else {
            // Default: try to parse as JSON, fall back to text
            try {
              data = JSON.parse(text);
            } catch {
              data = text;
            }
          }
        }

        // Apply response transforms
        if (config.transformResponse) {
          config.transformResponse.forEach((transform) => {
            data = transform(data);
          });
        }

        const response: Response<T> = {
          data,
          status: res.statusCode || 0,
          statusText: res.statusMessage || '',
          headers: res.headers as Headers,
          config,
          request: req,
        };

        const validate = config.validateStatus || defaultValidateStatus;
        if (validate(response.status)) {
          resolve(response);
        } else {
          reject(new HttpError(
            `Request failed with status code ${response.status}`,
            config,
            response,
          ));
        }
      });

      stream.on('error', (err: Error) => {
        reject(new NetworkError(err.message, config));
      });
    });

    // Handle request errors
    req.on('error', (err: NodeJS.ErrnoException) => {
      reject(new NetworkError(err.message, config, err.code));
    });

    // Handle timeout
    if (config.timeout && config.timeout > 0) {
      req.setTimeout(config.timeout, () => {
        req.abort();
        reject(new TimeoutError(config, config.timeout!));
      });
    }

    // Apply request transforms and send data
    if (requestData !== undefined) {
      if (config.transformRequest) {
        config.transformRequest.forEach((transform) => {
          requestData = transform(requestData, headers);
        });
      }
      req.write(requestData);
    }

    req.end();
  });
}
