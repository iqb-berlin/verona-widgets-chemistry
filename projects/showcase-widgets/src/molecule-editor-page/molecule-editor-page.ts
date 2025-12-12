import { Component, computed, inject } from '@angular/core';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatOption, MatSelect } from '@angular/material/select';
import { PsLocale } from 'periodic-system-common';
import {
  provideShowcaseVeronaWidgetService,
  ShowcaseVeronaWidgetConfig,
  ShowcaseVeronaWidgetService,
} from '../service/showcase-verona-widget.service';
import { ShowcaseVeronaWidgetDirective } from '../service/showcase-verona-widget.directive';
import { MoleculeEditor } from '../../../molecule-editor-widget/src/components/molecule-editor/molecule-editor';
import {
  MoleculeEditorBondingType,
  MoleculeEditorParam,
  MoleculeEditorSharedParam,
} from '../../../molecule-editor-widget/src/services/molecule-editor.service';
import { typeCastParam } from '../widget-page-common/param-converters';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-molecule-editor-page',
  imports: [ShowcaseVeronaWidgetDirective, MoleculeEditor, MatFormField, MatLabel, MatOption, MatSelect, FormsModule],
  templateUrl: './molecule-editor-page.html',
  styleUrls: ['./molecule-editor-page.scss', '../widget-page-common/widget-page.scss'],
  providers: [
    provideShowcaseVeronaWidgetService({
      dummySessionId: 'molecule-builder',
      initParameters: {
        [MoleculeEditorParam.language]: PsLocale.German,
      },
      initSharedParameters: {
        [MoleculeEditorSharedParam.bondingType]: MoleculeEditorBondingType.valence,
      },
    }),
  ],
})
export class MoleculeEditorPage {
  readonly config = inject(ShowcaseVeronaWidgetConfig);
  readonly service = inject(ShowcaseVeronaWidgetService);

  readonly language = this.config.parameterSignal(MoleculeEditorParam.language, typeCastParam());
  readonly bondingType = this.config.sharedParameterSignal(MoleculeEditorSharedParam.bondingType, typeCastParam());

  readonly stateData = this.service.stateData;
  readonly parsedStateData = computed(() => {
    try {
      const data = this.stateData();
      return data ? JSON.parse(data) : undefined;
    } catch (error) {
      return error;
    }
  });
  readonly prettyStateData = computed(() => {
    const data = this.parsedStateData();
    if (data === undefined) return undefined;
    else if (data instanceof Error) return `ERROR: ${data.message}`;
    else return JSON.stringify(data, null, 2);
  });
  readonly stateDataImageUrl = computed(() => {
    const data = this.parsedStateData();
    if (data === undefined || data instanceof Error) return undefined;
    else return data.asImage || undefined;
  });

  protected readonly BondingTypeValence = MoleculeEditorBondingType.valence;
  protected readonly BondingTypeElectrons = MoleculeEditorBondingType.electrons;

  protected readonly PsLangGerman = PsLocale.German;
  protected readonly PsLangEnglish = PsLocale.English;
  protected readonly PsLangLatin = PsLocale.Latin;
}
