import { computed, Injectable, Signal, signal } from '@angular/core';
import { FormulaNode, FormulaNodeId } from '../../models';

@Injectable()
export class FormulaContext {
  private readonly _focusId = signal<null | FormulaNodeId>(null);
  readonly focusId = this._focusId.asReadonly();

  computeFocused(node: Signal<FormulaNode>): Signal<boolean> {
    return computed(() => node().id === this._focusId());
  }

  focusOn(node: FormulaNode): void {
    this._focusId.set(node.id);
  }

  focus(focusId: FormulaNodeId): void {
    this._focusId.set(focusId);
  }

  blur(): void {
    this._focusId.set(null);
  }
}
