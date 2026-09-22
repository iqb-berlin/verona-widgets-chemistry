import { Component, inject } from '@angular/core';
import {
  provideShowcaseVeronaWidgetService,
  ShowcaseVeronaWidgetConfig,
  ShowcaseVeronaWidgetService,
} from '../service/showcase-verona-widget.service';
import { ShowcaseVeronaWidgetDirective } from '../service/showcase-verona-widget.directive';
import { Calculator } from '../../../calculator-widget/src/components/calculator/calculator';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-calculator-page',
  imports: [ShowcaseVeronaWidgetDirective, Calculator, FormsModule],
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
}
