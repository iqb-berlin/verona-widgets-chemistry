import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  provideShowcaseVeronaWidgetService,
  ShowcaseVeronaWidgetConfig,
  ShowcaseVeronaWidgetService,
} from '../service/showcase-verona-widget.service';
import { intParam } from '../widget-page-common/param-converters';
import { ShowcaseVeronaWidgetDirective } from '../service/showcase-verona-widget.directive';
import { Calculator } from '../../../calculator-widget/src/components/calculator/calculator';
import { MatFormField, MatInput, MatLabel } from '@angular/material/input';

@Component({
  selector: 'app-calculator-page',
  imports: [ShowcaseVeronaWidgetDirective, Calculator, FormsModule, MatFormField, MatInput, MatLabel],
  templateUrl: './calculator-page.html',
  styleUrls: ['./calculator-page.scss', '../widget-page-common/widget-page.scss'],
  providers: [
    provideShowcaseVeronaWidgetService({
      dummySessionId: 'calculator',
      initParameters: {},
      initSharedParameters: {},
    }),
  ],
})
export class CalculatorPage {
  readonly config = inject(ShowcaseVeronaWidgetConfig);
  readonly service = inject(ShowcaseVeronaWidgetService);

  readonly imageWidthParam = this.config.parameterSignal('MAX_IMAGE_WIDTH_PX', intParam);

  readonly decodedStateData = computed(() => {
    try {
      const stateData = this.service.stateData();
      return JSON.parse(stateData);
    } catch (error: unknown) {
      console.warn('Failed to decode widget state-data:', error);
      return [];
    }
  });

  constructor() {
    this.imageWidthParam.set(400);
  }
}
