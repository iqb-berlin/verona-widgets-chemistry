import { computed, CreateSignalOptions, signal, Signal, untracked, WritableSignal } from '@angular/core';

/**
 * Extension of a {@link WritableSignal} with undo/redo history functionality
 * @see historySignal
 */
export interface HistorySignal<T> extends WritableSignal<T> {
  set(value: T, record?: boolean): void;

  update(fn: (value: T) => T, record?: boolean): void;

  undo(): void;

  redo(): void;

  readonly undoAvailable: Signal<boolean>;
  readonly redoAvailable: Signal<boolean>;
}

export interface HistorySignalOptions<T> extends CreateSignalOptions<T> {
  readonly capacity: number;
}

/**
 * Create a {@link HistorySignal} instance with a current value, and undo- and a redo-stack
 */
export function historySignal<T>(initialValue: T, options: HistorySignalOptions<T>): HistorySignal<T> {
  const currentValue = signal(initialValue, options);
  const undoStack = signal<ReadonlyArray<T>>([]);
  const redoStack = signal<ReadonlyArray<T>>([]);

  const setCurrentValue = currentValue.set;
  const updateCurrentValue = currentValue.update;

  function commit(nextValue: T) {
    const appendedUndo = [...untracked(undoStack), untracked(currentValue)];
    const limitedUndo = appendedUndo.length > options.capacity ? appendedUndo.slice(1) : appendedUndo;
    undoStack.set(limitedUndo);
    redoStack.set([]);
    setCurrentValue(nextValue);
  }

  function set(value: T, record: boolean = true) {
    if (record) commit(value);
    else setCurrentValue(value);
  }

  function update(fn: (value: T) => T, record: boolean = true) {
    if (record) commit(fn(untracked(currentValue)));
    else updateCurrentValue(fn);
  }

  function undo() {
    const prevUndo = untracked(undoStack);
    if (prevUndo.length === 0) return;

    const previous = prevUndo[prevUndo.length - 1];
    undoStack.set(prevUndo.slice(0, -1));
    redoStack.set([untracked(currentValue), ...untracked(redoStack)]);
    setCurrentValue(previous);
  }

  function redo() {
    const nextRedo = untracked(redoStack);
    if (nextRedo.length === 0) return;

    const next = nextRedo[0];
    redoStack.set(nextRedo.slice(1));
    undoStack.set([...untracked(undoStack), untracked(currentValue)]);
    setCurrentValue(next);
  }

  return Object.assign(currentValue, {
    set,
    update,
    undo,
    redo,
    undoAvailable: computed(() => undoStack().length > 0),
    redoAvailable: computed(() => redoStack().length > 0),
  });
}
