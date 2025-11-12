import { Component } from '@angular/core';
import { VeronaWidget } from 'verona-widget';
import { PsSelect } from '../ps-select/ps-select';

@Component({
  selector: 'app-ps-select-root',
  imports: [VeronaWidget, PsSelect],
  template: `
    <lib-verona-widget metadataSelector="#metadata">
      <ng-template #content>
        <app-ps-select></app-ps-select>
      </ng-template>
    </lib-verona-widget>
  `,
})
export class PsSelectApp {}
