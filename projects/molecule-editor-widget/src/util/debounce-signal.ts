import { effect, signal, Signal, untracked } from '@angular/core';

export interface DebounceSignal<T> extends Signal<T> {
  /** Duration in milliseconds by which this signal is debounced from its source */
  readonly debounceMillis: number;

  /** Cancel the debounce timeout, if one is currently pending */
  cancelPending(): void;
}

type TimeoutRef = ReturnType<typeof setTimeout>;

export function debounceSignal<T>(input: Signal<T>, debounceMillis: number): DebounceSignal<T> {
  let timeout: undefined | TimeoutRef;

  const debounced = signal(untracked(input));
  effect((onCleanup) => {
    const value = input();
    timeout = setTimeout(() => debounced.set(value), debounceMillis);
    onCleanup(() => clearTimeout(timeout));
  });

  return Object.assign(debounced, {
    debounceMillis,
    cancelPending() {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    },
  });
}
