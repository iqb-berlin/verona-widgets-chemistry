import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButton } from '@angular/material/button';
import { PsTable } from './components/ps-table/ps-table';
import { PsTableElement } from './components/ps-table-element/ps-table-element';
import { PsElementFocusDirective } from './components/ps-element-focus/ps-element-focus';
import {
  PsTableHighlightContext,
  PsTableHighlightDirective,
} from './components/directives/ps-table-highlight.directive';
import { PsTableInteractionsDirective } from './components/directives/ps-table-interactions.directive';
import { PsTableNotificationDirective } from './components/directives/ps-table-notification.directive';

export { PsTable, PsTableElement, PsElementFocusDirective };
export { PsTableHighlightContext, PsTableHighlightDirective };
export { PsTableInteractionsDirective };
export { PsTableNotificationDirective };

@NgModule({
  imports: [
    CommonModule,
    MatButton,
    PsTable,
    PsTableElement,
    PsTableHighlightDirective,
    PsElementFocusDirective,
    PsTableInteractionsDirective,
    PsTableNotificationDirective,
  ],
  exports: [
    PsTable,
    PsTableElement,
    PsTableHighlightDirective,
    PsElementFocusDirective,
    PsTableInteractionsDirective,
    PsTableNotificationDirective,
  ],
})
export class PeriodicSystemModule {}
