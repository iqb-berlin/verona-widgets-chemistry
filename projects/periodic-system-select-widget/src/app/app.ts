import { Component } from '@angular/core';
import { VeronaWidget } from 'verona-widget';
import { PeriodicSystemSelect } from '../periodic-system-select/periodic-system-select';

@Component({
  selector: 'app-root',
  imports: [VeronaWidget, PeriodicSystemSelect],
  template: `
    <lib-verona-widget metadataSelector="#metadata">
      <ng-template #content>
        <app-periodic-system-select></app-periodic-system-select>
      </ng-template>
    </lib-verona-widget>
  `,
})
export class App {
}
