import {NgModule} from '@angular/core';
import {CommonModule} from '@angular/common';
import {MatButton} from '@angular/material/button';
import {PsTable} from './components/ps-table/ps-table';
import {PsTableElement} from './components/ps-table-element/ps-table-element';

export {PsTable, PsTableElement};

@NgModule({
  imports: [
    CommonModule,
    MatButton,
    PsTable,
    PsTableElement
  ],
  exports: [
    PsTable,
    PsTableElement,
  ],
})
export class PeriodicSystemModule {
}
