import { Component, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CONSTANTS, EditSequence, EditToken } from '../../models';
import { CaretContext } from './caret-context';

@Component({
  selector: '[appEditSequence]',
  templateUrl: './display-edit-sequence.html',
  styleUrl: './display-edit-sequence.scss',
  imports: [NgTemplateOutlet],
})
export class DisplayEditSequence {
  readonly caret = inject(CaretContext);

  readonly sequence = input.required<EditSequence>({ alias: 'appEditSequence' });
  readonly interactive = input<boolean>(false);
  readonly topLevel = input<boolean>(false);

  protected readonly CONSTANTS = CONSTANTS;
  protected readonly OPERATOR_SYMBOLS = {
    '+': '\u002B',
    '-': '\u2212',
    '/': '\u00F7',
    '*': '\u00D7',
  } as const satisfies Record<EditToken.Operator['operator'], string>;

  protected asToken(unknownToken: unknown): EditToken {
    return unknownToken as EditToken;
  }

  // The caret is only part of the display while this sequence is being edited
  protected showsCaretAtStart(): boolean {
    return this.interactive() && this.caret.isAtStartOf(this.sequence());
  }

  protected showsCaretBehind(token: EditToken): boolean {
    return this.interactive() && this.caret.isBehind(token);
  }

  // A root without a degree is a square root, written without an index — unless the empty
  // degree is the one being edited, which needs its placeholder to be visible
  showsRootIndex(token: EditToken.Root): boolean {
    return token.degree.items.length > 0 || this.caret.isAtStartOf(token.degree);
  }

  cursorStyle(): undefined | string {
    return this.interactive() ? 'pointer' : undefined;
  }

  /**
   * Put the caret where the token was clicked: behind it, or in front of it when the click
   * landed on its left half — which is the only way to reach the position in front of the
   * first token of a sequence.
   */
  handleClick(token: EditToken, index: number, event: PointerEvent): void {
    if (!this.interactive()) return;
    event.stopPropagation();

    if (!clickedInFrontOf(event)) return this.caret.placeBehind(token);
    const { items, id } = this.sequence();
    this.caret.placeAt(index > 0 ? items[index - 1].id : id);
  }

  // An empty sequence has one position only: inside it
  handleEmptyClick(sequence: EditSequence, event: PointerEvent): void {
    if (!this.interactive()) return;
    event.stopPropagation();
    this.caret.placeInside(sequence);
  }
}

function clickedInFrontOf(event: PointerEvent): boolean {
  const target = event.currentTarget;
  if (!(target instanceof Element)) return false;
  const bounds = target.getBoundingClientRect();
  return event.clientX < bounds.left + bounds.width / 2;
}
