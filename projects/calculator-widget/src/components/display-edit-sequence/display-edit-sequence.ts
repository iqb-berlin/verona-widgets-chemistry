import { Component, computed, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CalculatorService } from '../../services/calculator-service';
import { CONSTANTS, EditSequence, EditToken } from '../../models';

@Component({
  selector: 'math:mrow[appEditSequence]',
  templateUrl: './display-edit-sequence.html',
  styleUrl: './display-edit-sequence.scss',
  imports: [NgTemplateOutlet],
  host: { '[class.problem]': `hostProblem()` },
})
export class DisplayEditSequence {
  readonly service = inject(CalculatorService);

  readonly sequence = input.required<EditSequence>({ alias: 'appEditSequence' });
  readonly interactive = input<boolean>(false);
  readonly topLevel = input<boolean>(false);

  readonly hostProblem = computed(() => {
    const sequence = this.sequence();
    const topLevel = this.topLevel();
    const problemTokenId = this.service.problemTokenId();
    return (!topLevel || sequence.items.length > 0) && problemTokenId === sequence.id;
  });

  protected readonly CONSTANTS = CONSTANTS;
  protected readonly OPERATOR_SYMBOLS = {
    '+': '\u002B', // &plus;
    '-': '\u2212', // &minus;
    '/': '\u00F7', // &divide;
    '*': '\u00D7', // &times;
  } as const satisfies Record<EditToken.Operator['operator'], string>;

  protected asToken(unknownToken: unknown): EditToken {
    return unknownToken as EditToken;
  }

  // The caret is only part of the display while this sequence is being edited
  protected showsCaretAtStart(): boolean {
    return this.interactive() && this.service.isCaretOn(this.sequence());
  }

  protected showsCaretBehind(token: EditToken): boolean {
    return this.interactive() && this.service.isCaretOn(token);
  }

  cursorStyle(): undefined | string {
    return this.interactive() ? 'pointer' : undefined;
  }

  // A root without a degree is a square root, written without an index — unless the empty
  // degree is the one being edited, which needs its placeholder to be visible
  showsRootIndex(token: EditToken.Root): boolean {
    return token.degree.items.length > 0 || this.service.isCaretOn(token.degree);
  }

  // Put the caret where the token was clicked: Behind it, or in front of it when the click
  // landed on its left half - which is the only way to reach the position in front of the
  // first token of a sequence.
  handleClick(token: EditToken, index: number, event: PointerEvent): void {
    if (!this.interactive()) return;
    event.stopPropagation();

    if (!clickedInFrontOf(event)) {
      this.service.placeCaret(token.id);
    } else {
      const { items, id } = this.sequence();
      this.service.placeCaret(index > 0 ? items[index - 1].id : id);
    }
  }

  // An empty sequence has one position only: inside it
  handleEmptyClick(sequence: EditSequence, event: PointerEvent): void {
    if (!this.interactive()) return;
    event.stopPropagation();

    this.service.placeCaret(sequence.id);
  }
}

function clickedInFrontOf(event: PointerEvent): boolean {
  const target = event.currentTarget;
  if (!(target instanceof Element)) return false;
  const bounds = target.getBoundingClientRect();
  return event.clientX < bounds.left + bounds.width / 2;
}
