import { CreateEffectOptions, effect, EffectRef } from '@angular/core';

export interface DebounceEffectRef extends EffectRef {
  readonly debounceMs: number;
  cancelPending(): void;
}

export interface CreateDebounceEffectOptions extends CreateEffectOptions {
  readonly debounceMs: number;
}

type EffectCleanupFn = () => void;
type EffectCleanupRegisterFn = (cleanupFn: EffectCleanupFn) => void;
type SetupEffectFn<T> = (onCleanup: EffectCleanupRegisterFn) => T;
type DebouncedEffectFn<T> = (input: T) => void;

export function debounceEffect<T>(
  setupEffectFn: SetupEffectFn<T>,
  debouncedEffectFn: DebouncedEffectFn<T>,
  options: CreateDebounceEffectOptions,
): DebounceEffectRef {
  let timeout: undefined | ReturnType<typeof setTimeout>;

  function cancelPending(): void {
    if (timeout !== undefined) {
      clearTimeout(timeout);
      timeout = undefined;
    }
  }

  function executeEffect(input: T): void {
    timeout = undefined;
    debouncedEffectFn(input);
  }

  const { debounceMs } = options;
  const ref = effect((onCleanup) => {
    const input = setupEffectFn(onCleanup);
    cancelPending();
    timeout = setTimeout(executeEffect, debounceMs, input);
    onCleanup(cancelPending);
  }, options);

  return Object.assign(ref, { debounceMs, cancelPending });
}
