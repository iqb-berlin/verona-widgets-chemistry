import { Component, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CONSTANTS, EditSequence, EditToken } from '../../models';
import { FocusContext } from './focus-context';

@Component({
  selector: '[appEditSequence]',
  templateUrl: './display-edit-sequence.html',
  imports: [NgTemplateOutlet],
})
export class DisplayEditSequence {
  readonly focusContext = inject(FocusContext);

  readonly sequence = input.required<EditSequence>({ alias: 'appEditSequence' });
  readonly interactive = input<boolean>(false);

  protected readonly CONSTANTS = CONSTANTS;

  protected asToken(unknownToken: unknown): EditToken {
    return unknownToken as EditToken;
  }

  cursorStyle(token: EditToken) {
    if (!this.interactive()) return undefined;
    if (this.focusContext.focusId() === token.id) return 'pointer';
    return undefined;
  }

  handleClick(token: EditToken, event: PointerEvent) {
    if (this.interactive()) {
      event.stopPropagation();
      this.focusContext.focusOn(token);
    }
  }
}
