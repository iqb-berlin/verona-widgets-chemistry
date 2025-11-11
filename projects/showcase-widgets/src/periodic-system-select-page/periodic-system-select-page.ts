import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { PsLocale } from 'periodic-system-common';
import {
  provideShowcaseVeronaWidgetService,
  ShowcaseVeronaWidgetConfig,
  ShowcaseVeronaWidgetService,
} from '../service/showcase-verona-widget.service';
import { ShowcaseVeronaWidgetDirective } from '../service/showcase-verona-widget.directive';
import {
  PeriodicSystemSelect,
  PeriodicSystemSelectParam,
  PeriodicSystemSharedParam,
} from '../../../periodic-system-select-widget/src/periodic-system-select/periodic-system-select';

@Component({
  selector: 'app-periodic-system-select-page',
  imports: [
    PeriodicSystemSelect,
    MatFormField,
    MatLabel,
    MatInput,
    FormsModule,
    MatSlideToggle,
    MatSelect,
    MatOption,
    ShowcaseVeronaWidgetDirective,
  ],
  templateUrl: './periodic-system-select-page.html',
  styleUrl: './periodic-system-select-page.scss',
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
        [PeriodicSystemSharedParam.textColor]: '#ffffff',
        //[PeriodicSystemSharedParam.backgroundColor]: '#bf0089',
      },
    }),
  ],
})
export class PeriodicSystemSelectPage {
  readonly config = inject(ShowcaseVeronaWidgetConfig);
  readonly service = inject(ShowcaseVeronaWidgetService);

  readonly language = this.config.parameterSignal(PeriodicSystemSelectParam.language, languageParam);
  readonly showInfoOrder = this.config.parameterSignal(PeriodicSystemSelectParam.showInfoOrder, boolParam);
  readonly showInfoSymbol = this.config.parameterSignal(PeriodicSystemSelectParam.showInfoSymbol, boolParam);
  readonly showInfoName = this.config.parameterSignal(PeriodicSystemSelectParam.showInfoName, boolParam);
  readonly showInfoAMass = this.config.parameterSignal(PeriodicSystemSelectParam.showInfoAMass, boolParam);
  readonly showInfoENeg = this.config.parameterSignal(PeriodicSystemSelectParam.showInfoENeg, boolParam);
  readonly highlightBlocks = this.config.parameterSignal(PeriodicSystemSelectParam.highlightBlocks, boolParam);
  readonly maxNumberOfSelections = this.config.parameterSignal(
    PeriodicSystemSelectParam.maxNumberOfSelections,
    intParam
  );
  readonly closeOnSelection = this.config.parameterSignal(PeriodicSystemSelectParam.closeOnSelection, boolParam);

  readonly stateData = this.service.stateData;

  protected readonly PsLangGerman = PsLocale.German;
  protected readonly PsLangEnglish = PsLocale.English;
  protected readonly PsLangLatin = PsLocale.Latin;
}

const intParam = {
  read: (value: string) => Number.parseInt(value, 10),
  write: (value: number) => value.toString(10),
} as const;

const boolParam = {
  read: (value: string) => value === 'true' || value === '1',
  write: (value: boolean) => (value ? 'true' : 'false'),
} as const;

const languageParam = {
  read: (value: string) => value as PsLocale,
  write: (value: PsLocale) => value,
} as const;
