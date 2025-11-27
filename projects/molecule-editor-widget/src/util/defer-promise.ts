interface Resolver<T> {
  (value: T | PromiseLike<T>): void;
}

interface Rejecter {
  (reason?: unknown): void;
}

export interface DeferredPromise<T> extends Promise<T> {
  readonly resolve: Resolver<T>;
  readonly reject: Rejecter;
}

export function deferPromise<T>(): DeferredPromise<T> {
  let resolve!: Resolver<T>;
  let reject!: Rejecter;
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return Object.assign(promise, { resolve, reject });
}
