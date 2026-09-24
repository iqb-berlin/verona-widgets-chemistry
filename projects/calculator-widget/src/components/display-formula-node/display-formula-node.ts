import { Component, computed, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  CONSTANTS,
  DivisionNotation,
  FormulaNode,
  FormulaSlot,
  GroupFence,
  MultiplyNotation,
  needsParentheses,
} from '../../models';
import { FormulaContext } from './formula-context';

@Component({
  selector: '[appFormulaNode]',
  templateUrl: './display-formula-node.html',
  host: {
    '[attr.data-node-id]': 'node().id',
    '[attr.data-node-kind]': 'node().kind',
    '[class.focused]': 'isFocused()',
  },
  imports: [NgTemplateOutlet],
})
export class DisplayFormulaNode {
  readonly context = inject(FormulaContext);

  readonly node = input.required<FormulaNode>({ alias: 'appFormulaNode' });
  readonly interactive = input<boolean>(false);
  readonly isFocused = this.context.computeFocused(this.node);
  readonly cursorStyle = computed(() => (this.interactive() ? 'pointer' : undefined));

  protected readonly needsParentheses = needsParentheses;
  protected readonly CONSTANTS = CONSTANTS;

  protected readonly FENCES = {
    parentheses: ['(', ')'],
    brackets: ['[', ']'],
    braces: ['{', '}'],
  } as const satisfies Record<GroupFence, [string, string]>;

  protected MULTIPLIERS = {
    dot: '\u00B7', // middle dot
    cross: '\u00D7', // multiplication sign
    implicit: '\u2062', // invisible multiplication
  } as const satisfies Record<MultiplyNotation, string>;

  protected DIVIDERS = {
    solidus: '\u2215', // division slash
  } as const satisfies Record<Exclude<DivisionNotation, 'fraction'>, string>;

  protected getSlot(node: FormulaNode, slot: FormulaSlot): FormulaNode {
    const container = node as unknown as Record<FormulaSlot, FormulaNode>;
    return container[slot];
  }

  handleClick(event: PointerEvent) {
    if (this.interactive()) {
      event.stopPropagation();
      this.context.focusOn(this.node());
    }
  }
}
