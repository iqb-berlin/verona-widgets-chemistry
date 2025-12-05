import { Component, computed, contentChild, inject, Signal, TemplateRef } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { PsElement, PsElementBlock, PsElements } from '../../data/PsData';
import { PsTableElement } from '../ps-table-element/ps-table-element';
import { PsTableHighlightContext, PsTableHighlightDirective } from '../directives/ps-table-highlight.directive';
import { PsTableInteractionsDirective } from '../directives/ps-table-interactions.directive';
import { PsTableNotificationDirective } from '../directives/ps-table-notification.directive';
import { PsService } from '../../services/ps-service';

type ContentChildTemplateRef<T = {}> = Signal<undefined | TemplateRef<T>>;

@Component({
  selector: 'lib-ps-table',
  imports: [PsTableElement, NgTemplateOutlet],
  templateUrl: './ps-table.html',
  styleUrl: './ps-table.scss',
})
export class PsTable {
  readonly service = inject(PsService);

  protected readonly elements = PsElements;
  protected readonly elementByNumber = new Map(this.elements.map((e) => [e.number, e] as const));

  protected readonly periodNumbers = [1, 2, 3, 4, 5, 6, 7] as const;
  protected readonly groupNumbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] as const;

  readonly highlightRef: ContentChildTemplateRef<PsTableHighlightContext> = contentChild(PsTableHighlightDirective, {
    read: TemplateRef,
  });
  readonly interactionsRef: ContentChildTemplateRef = contentChild(PsTableInteractionsDirective, { read: TemplateRef });
  readonly notificationRef: ContentChildTemplateRef = contentChild(PsTableNotificationDirective, { read: TemplateRef });

  readonly hoveredElement = computed<undefined | PsElement>(() => {
    const highlightedElementNr = this.service.interaction.highlightedElement();
    if (highlightedElementNr === undefined) return undefined;
    return this.elementByNumber.get(highlightedElementNr);
  });

  protected elementClassNames(element: PsElement): ReadonlyArray<string> {
    return [
      this.groupClassName(element.group),
      this.periodClassName(element.period),
      this.columnClassName(element.column),
      this.blockClassName(element.block),
    ];
  }

  protected groupClassName(groupNr: number): string {
    return `g${groupNr}`; // Group "g1" - "g20"
  }

  protected periodClassName(periodNr: number): string {
    return `p${periodNr}`; // Period "p1" - "p7"
  }

  protected columnClassName(columnNr: number): string {
    return `c${columnNr}`; // Column "c1" - "c32"
  }

  protected blockClassName(block: PsElementBlock): string {
    return `b-${block}`; // Block "b-s", "b-p", "b-d", "b-f", "b-g"
  }
}
