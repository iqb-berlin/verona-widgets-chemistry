import { Component } from '@angular/core';
import { VeronaWidget } from 'verona-widget';
import { Calculator } from '../components/calculator/calculator';

@Component({
  selector: 'app-calculator-root',
  imports: [VeronaWidget, Calculator],
  template: `
    <lib-verona-widget metadataSelector="#metadata">
      <ng-template #content>
        <app-calculator></app-calculator>
      </ng-template>
    </lib-verona-widget>
  `,
})
export class CalculatorApp {}
