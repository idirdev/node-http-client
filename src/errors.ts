import { RequestConfig, Response } from './types';

export class HttpError extends Error {
  public readonly status: number;
  public readonly statusText: string;
  public readonly config: RequestConfig;
  public readonly response: Response;
  public readonly isHttpError: boolean = true;

  constructor(message: string, config: RequestConfig, response: Response) {
    super(message);
    this.name = 'HttpError';
    this.status = response.status;
    this.statusText = response.statusText;
    this.config = config;
    this.response = response;

    // Fix prototype chain for instanceof checks (TypeScript downlevel issue)
    Object.setPrototypeOf(this, HttpError.prototype);
  }

  public toJSON(): object {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      statusText: this.statusText,
      url: this.config.url,
      method: this.config.method,
    };
  }
}

export class TimeoutError extends Error {
  public readonly config: RequestConfig;
  public readonly timeout: number;
  public readonly isTimeoutError: boolean = true;

  constructor(config: RequestConfig, timeout: number) {
    super(`Timeout of ${timeout}ms exceeded for ${config.method} ${config.url}`);
    this.name = 'TimeoutError';
    this.config = config;
    this.timeout = timeout;
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

export class NetworkError extends Error {
  public readonly config: RequestConfig;
  public readonly code: string | undefined;
  public readonly isNetworkError: boolean = true;

  constructor(message: string, config: RequestConfig, code?: string) {
    super(message);
    this.name = 'NetworkError';
    this.config = config;
    this.code = code;
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}

export function isHttpError(error: any): error is HttpError {
  return error && error.isHttpError === true;
}

export function isTimeoutError(error: any): error is TimeoutError {
  return error && error.isTimeoutError === true;
}

export function isNetworkError(error: any): error is NetworkError {
  return error && error.isNetworkError === true;
}
