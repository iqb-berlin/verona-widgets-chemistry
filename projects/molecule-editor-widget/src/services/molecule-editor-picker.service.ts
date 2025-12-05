import { computed, inject, Injectable } from '@angular/core';
import { VeronaWidgetService } from 'verona-widget';
import type {
  PsAppearance,
  PsElement,
  PsElementNumber,
  PsInteraction,
  PsLocale,
  PsService,
} from 'periodic-system-common';
import { PsElementBlock } from 'periodic-system-common';
import { MoleculeEditorParam, MoleculeEditorService } from './molecule-editor.service';

@Injectable()
export class MoleculeEditorPickerService implements PsService, PsInteraction {
  readonly widgetService = inject(VeronaWidgetService);
  readonly moleculeEditorService = inject(MoleculeEditorService);

  readonly interaction = this;

  readonly appearance = computed((): PsAppearance => {
    const config = this.widgetService.configuration();
    const {
      [MoleculeEditorParam.language]: language = 'de',
      [MoleculeEditorParam.showInfoName]: showInfoName = 'false',
      [MoleculeEditorParam.showInfoOrder]: showInfoOrder = 'false',
      [MoleculeEditorParam.highlightBlocks]: highlightBlocks = 'false',
    } = config.parameters;

    return {
      showENeg: false,
      showMass: false,
      showName: flagAsBool(showInfoName),
      showNumber: flagAsBool(showInfoOrder),
      showSymbol: true,
      showLabels: false,
      locale: language as PsLocale,
      defaultBaseColor: 'var(--mat-sys-primary)',
      defaultTextColor: 'var(--mat-sys-on-primary)',
      enableBlockColors: flagAsBool(highlightBlocks),
      blockColors: {
        [PsElementBlock.S]: '#cd2f2f',
        [PsElementBlock.P]: '#559955',
        [PsElementBlock.D]: '#6699dd',
        [PsElementBlock.F]: '#ff8822',
        [PsElementBlock.G]: '#000000',
      },
    };
  });

  readonly selectedElements = computed(() => new Set<PsElementNumber>()); // always empty
  readonly highlightedElement = computed(() => undefined); // always undefined
  readonly elementClickBlocked = computed(() => false); // always false

  clickElement(element: PsElement): void {
    this.moleculeEditorService.elementPickerCallback(element);
  }

  highlightElement() {
    // Do nothing
  }
}

function flagAsBool(flag: unknown): boolean {
  return flag === 'true' || flag === '1' || flag === true || flag === 1;
}
