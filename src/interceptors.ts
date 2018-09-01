import { Interceptor, InterceptorManagerInterface } from './types';

/**
 * Manages a stack of interceptors that can be applied to requests or responses.
 * Interceptors are executed in the order they are added for requests,
 * and in reverse order for responses.
 */
export class InterceptorManager<T> implements InterceptorManagerInterface<T> {
  private handlers: Array<Interceptor<T> | null> = [];

  /**
   * Register a new interceptor.
   * @param fulfilled - Called when the promise is fulfilled
   * @param rejected - Called when the promise is rejected
   * @returns An ID that can be used to eject the interceptor later
   */
  public use(
    fulfilled: (value: T) => T | Promise<T>,
    rejected?: (error: any) => any,
  ): number {
    this.handlers.push({
      fulfilled,
      rejected,
    });
    return this.handlers.length - 1;
  }

  /**
   * Remove a previously registered interceptor by its ID.
   * @param id - The interceptor ID returned by `use()`
   */
  public eject(id: number): void {
    if (this.handlers[id]) {
      this.handlers[id] = null;
    }
  }

  /**
   * Iterate over all registered interceptors (skipping ejected ones).
   * @param fn - Callback invoked for each active interceptor
   */
  public forEach(fn: (interceptor: Interceptor<T>) => void): void {
    this.handlers.forEach((handler) => {
      if (handler !== null) {
        fn(handler);
      }
    });
  }

  /**
   * Remove all registered interceptors.
   */
  public clear(): void {
    this.handlers = [];
  }

  /**
   * Get the number of active (non-ejected) interceptors.
   */
  public get count(): number {
    return this.handlers.filter((h) => h !== null).length;
  }
}
