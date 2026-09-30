import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatFormField, MatInput, MatLabel } from '@angular/material/input';
import {
  provideShowcaseVeronaWidgetService,
  ShowcaseVeronaWidgetConfig,
  ShowcaseVeronaWidgetService,
} from '../service/showcase-verona-widget.service';
import { intParam } from '../widget-page-common/param-converters';
import { ShowcaseVeronaWidgetDirective } from '../service/showcase-verona-widget.directive';
import { Calculator } from '../../../calculator-widget/src/components/calculator/calculator';

@Component({
  selector: 'app-calculator-page',
  imports: [ShowcaseVeronaWidgetDirective, Calculator, FormsModule, MatFormField, MatInput, MatLabel, MatCheckbox],
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
export class CalculatorPage implements OnInit, OnDestroy {
  readonly config = inject(ShowcaseVeronaWidgetConfig);
  readonly service = inject(ShowcaseVeronaWidgetService);

  readonly calculatorActive = signal<boolean>(true);
  readonly imageWidthParam = this.config.parameterSignal('MAX_IMAGE_WIDTH_PX', intParam);
  readonly journalLinesParam = this.config.parameterSignal('JOURNAL_LINES', intParam);

  readonly decodedStateData = computed(() => {
    try {
      const stateData = this.service.stateData();
      return JSON.parse(stateData);
    } catch (error: unknown) {
      console.warn('Failed to decode widget state-data:', error);
      return [];
    }
  });

  private abortController?: AbortController;

  constructor() {
    this.imageWidthParam.set(400);
    this.journalLinesParam.set(3);
  }

  ngOnInit() {
    this.abortController = new AbortController();
    const abortSignal = this.abortController.signal;
    this.service.addEventListener('return', () => this.calculatorActive.set(false), { signal: abortSignal });
  }

  ngOnDestroy() {
    this.abortController?.abort('ngOnDestroy');
    delete this.abortController;
  }
}
