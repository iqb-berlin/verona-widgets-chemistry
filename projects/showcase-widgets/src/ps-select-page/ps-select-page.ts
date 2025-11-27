import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatInput, MatSuffix } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { PsLocale } from 'periodic-system-common';
import {
  provideShowcaseVeronaWidgetService,
  ShowcaseVeronaWidgetConfig,
  ShowcaseVeronaWidgetService,
} from '../service/showcase-verona-widget.service';
import { ShowcaseVeronaWidgetDirective } from '../service/showcase-verona-widget.directive';
import { PsSelect } from '../../../periodic-system-select-widget/src/ps-select/ps-select';
import {
  PeriodicSystemSelectParam,
  PeriodicSystemSharedParam,
} from '../../../periodic-system-select-widget/src/ps-select/ps-select.service';
import { boolParam, intParam, typeCastParam } from '../widget-page-common/param-converters';

@Component({
  selector: 'app-ps-select-page',
  imports: [
    PsSelect,
    MatFormField,
    MatLabel,
    MatInput,
    FormsModule,
    MatSlideToggle,
    MatSelect,
    MatOption,
    ShowcaseVeronaWidgetDirective,
    MatSuffix,
    MatIconButton,
    MatIcon,
  ],
  templateUrl: './ps-select-page.html',
  styleUrls: ['./ps-select-page.scss', '../widget-page-common/widget-page.scss'],
  providers: [
    provideShowcaseVeronaWidgetService({
      dummySessionId: 'ps-select',
      initParameters: {
        [PeriodicSystemSelectParam.language]: 'de',
        [PeriodicSystemSelectParam.showInfoOrder]: '1',
        [PeriodicSystemSelectParam.showInfoSymbol]: '1',
        [PeriodicSystemSelectParam.showInfoName]: '1',
        [PeriodicSystemSelectParam.showInfoAMass]: '1',
        [PeriodicSystemSelectParam.showInfoENeg]: '0',
        [PeriodicSystemSelectParam.highlightBlocks]: '0',
        [PeriodicSystemSelectParam.maxNumberOfSelections]: '1',
        [PeriodicSystemSelectParam.closeOnSelection]: '0',
      },
      initSharedParameters: {
        [PeriodicSystemSharedParam.textColor]: undefined,
        [PeriodicSystemSharedParam.backgroundColor]: undefined,
      },
    }),
  ],
})
export class PsSelectPage {
  readonly config = inject(ShowcaseVeronaWidgetConfig);
  readonly service = inject(ShowcaseVeronaWidgetService);

  readonly language = this.config.parameterSignal(PeriodicSystemSelectParam.language, typeCastParam());
  readonly showInfoOrder = this.config.parameterSignal(PeriodicSystemSelectParam.showInfoOrder, boolParam);
  readonly showInfoSymbol = this.config.parameterSignal(PeriodicSystemSelectParam.showInfoSymbol, boolParam);
  readonly showInfoName = this.config.parameterSignal(PeriodicSystemSelectParam.showInfoName, boolParam);
  readonly showInfoAMass = this.config.parameterSignal(PeriodicSystemSelectParam.showInfoAMass, boolParam);
  readonly showInfoENeg = this.config.parameterSignal(PeriodicSystemSelectParam.showInfoENeg, boolParam);
  readonly highlightBlocks = this.config.parameterSignal(PeriodicSystemSelectParam.highlightBlocks, boolParam);
  readonly maxNrOfSelections = this.config.parameterSignal(PeriodicSystemSelectParam.maxNumberOfSelections, intParam);
  readonly closeOnSelection = this.config.parameterSignal(PeriodicSystemSelectParam.closeOnSelection, boolParam);

  readonly textColor = this.config.sharedParameterSignal(PeriodicSystemSharedParam.textColor);
  readonly backgroundColor = this.config.sharedParameterSignal(PeriodicSystemSharedParam.backgroundColor);

  readonly stateData = this.service.stateData;

  protected readonly PsLangGerman = PsLocale.German;
  protected readonly PsLangEnglish = PsLocale.English;
  protected readonly PsLangLatin = PsLocale.Latin;
}
