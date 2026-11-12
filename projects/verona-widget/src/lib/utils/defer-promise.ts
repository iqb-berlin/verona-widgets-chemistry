type ResolveFn<T> = (value: T | PromiseLike<T>) => void;
type RejectFn = (reason?: unknown) => void;

export interface DeferredPromise<T> extends Promise<T> {
  readonly resolve: ResolveFn<T>;
  readonly reject: RejectFn;
}

export function deferPromise<T>(): DeferredPromise<T> {
  let resolve!: ResolveFn<T>;
  let reject!: RejectFn;
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return Object.assign(promise, { resolve, reject });
}
