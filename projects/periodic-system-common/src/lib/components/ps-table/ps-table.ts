import type { Signal, ValueEqualityFn } from '@angular/core';
import { Component, contentChild, inject, signal, TemplateRef, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { PsElement, PsElements } from '../../data/PsData';
import { PsTableElement } from '../ps-table-element/ps-table-element';
import { PsTableHighlightContext, PsTableHighlightDirective } from '../directives/ps-table-highlight.directive';
import { PsService } from '../../services/ps-service';
import { PsTableInteractionsDirective } from '../../periodic-system-module';

type ContentChildRef<T> = Signal<undefined | TemplateRef<T>>;

const psElementEqual: ValueEqualityFn<undefined | PsElement> = (a, b) => a?.number === b?.number;

@Component({
  selector: 'lib-ps-table',
  imports: [PsTableElement, NgTemplateOutlet],
  templateUrl: './ps-table.html',
  styleUrl: './ps-table.scss',
})
export class PsTable {
  readonly service = inject(PsService);
  readonly hoveredElement = signal<undefined | PsElement>(undefined, { equal: psElementEqual });

  readonly highlightRef: ContentChildRef<PsTableHighlightContext> = contentChild(PsTableHighlightDirective, {
    read: TemplateRef,
  });
  readonly interactionsRef: ContentChildRef<{}> = contentChild(PsTableInteractionsDirective, { read: TemplateRef });

  protected readonly elements = PsElements;
  protected readonly periodNumbers = [1, 2, 3, 4, 5, 6, 7] as const;
  protected readonly groupNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] as const;

  protected elementClassNames(element: PsElement): ReadonlyArray<string> {
    return [
      `g${element.group}`, // Group "g1" - "g20"
      `p${element.period}`, // Period "p1" - "p7"
      `c${element.column}`, // Column "c1" - "c32"
      `b-${element.block}`, // Block "b-s", "b-p", "b-d", "b-f", "b-g"
    ];
  }

  protected periodClassNames(periodNr: number): ReadonlyArray<string> {
    return [`p${periodNr}`];
  }

  protected groupClassNames(groupNr: number): ReadonlyArray<string> {
    return [`g${groupNr}`];
  }

  protected enterElementHover(element: PsElement) {
    this.hoveredElement.set(element);
  }

  protected leaveElementHover(element: PsElement) {
    const current = untracked(this.hoveredElement);
    if (psElementEqual(current, element)) {
      this.hoveredElement.set(undefined);
    }
  }
}
