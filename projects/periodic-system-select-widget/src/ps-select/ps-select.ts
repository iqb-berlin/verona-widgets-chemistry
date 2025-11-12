import { Component } from '@angular/core';
import { PeriodicSystemModule, PsService } from 'periodic-system-common';
import { PsSelectService } from './ps-select.service';

@Component({
  selector: 'app-ps-select',
  template: '<lib-ps-table></lib-ps-table>',
  imports: [PeriodicSystemModule],
  providers: [
    {
      provide: PsService,
      useClass: PsSelectService,
    },
  ],
})
export class PsSelect {}
