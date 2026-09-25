import { computed, Injectable, Signal, signal } from '@angular/core';
import { EditToken, EditTokenId } from '../../models';

@Injectable()
export class FocusContext {
  private readonly _focusId = signal<null | EditTokenId>(null);
  readonly focusId = this._focusId.asReadonly();

  computeFocused(token: Signal<EditToken>): Signal<boolean> {
    return computed(() => token().id === this._focusId());
  }

  focusOn(token: EditToken): void {
    this._focusId.set(token.id);
  }

  focus(focusId: EditTokenId): void {
    this._focusId.set(focusId);
  }

  blur(): void {
    this._focusId.set(null);
  }
}
