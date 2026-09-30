import { signal, Signal, untracked } from '@angular/core';
import { debounceEffect } from './debounce-effect';

export interface DebounceSignal<T> extends Signal<T> {
  /** Duration in milliseconds by which this signal is debounced from its source */
  readonly debounceMs: number;

  /** Cancel the debounce timeout, if one is currently pending */
  cancelPending(): void;
}

export function debounceSignal<T>(input: Signal<T>, debounceMs: number): DebounceSignal<T> {
  const debounced = signal(untracked(input));
  const { cancelPending } = debounceEffect(input, debounced.set, { debounceMs });
  return Object.assign(debounced, { debounceMs, cancelPending });
}
