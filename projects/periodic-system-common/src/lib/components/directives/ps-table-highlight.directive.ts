import { Directive } from '@angular/core';
import { PsElement } from '../../data/PsData';

export interface PsTableHighlightContext {
  readonly hoveredElement: undefined | PsElement;
}

@Directive({
  selector: 'ng-template[psTableHighlight]',
})
export class PsTableHighlightDirective {
  // Enable typing for ngTemplateOutlet directive
  static ngTemplateContextGuard(_dir: PsTableHighlightDirective, ctx: unknown): ctx is PsTableHighlightContext {
    return true;
  }
}
