import type { EffectRef, Signal, WritableSignal } from '@angular/core';
import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { PsAppearance, PsElement, PsElementNumber, PsInteraction, PsLocale } from 'periodic-system-common';
import { PsElementBlock, PsElements, PsService } from 'periodic-system-common';
import { VeronaWidgetService } from 'verona-widget';

export const enum PeriodicSystemSelectParam {
  language = 'LANGUAGE',
  showInfoOrder = 'SHOW_INFO_ORDER',
  showInfoName = 'SHOW_INFO_NAME',
  showInfoSymbol = 'SHOW_INFO_SYMBOL',
  showInfoENeg = 'SHOW_INFO_E_NEG',
  showInfoAMass = 'SHOW_INFO_A_MASS',
  showInfoLabels = 'SHOW_INFO_LABELS',
  maxNumberOfSelections = 'MAX_NUMBER_OF_SELECTIONS',
  highlightBlocks = 'HIGHLIGHT_BLOCKS',
  closeOnSelection = 'CLOSE_ON_SELECTION',
}

export const enum PeriodicSystemSharedParam {
  textColor = 'TEXT_COLOR',
  backgroundColor = 'BACKGROUND_COLOR',
}

@Injectable()
export class PsSelectService implements PsService {
  private readonly widgetService = inject(VeronaWidgetService);

  readonly interaction = new PeriodicSystemSelectInteraction(this.widgetService);

  readonly appearance = computed((): PsAppearance => {
    const config = this.widgetService.configuration();
    const {
      [PeriodicSystemSharedParam.textColor]: defaultTextColor = '#ffffff',
      [PeriodicSystemSharedParam.backgroundColor]: defaultBaseColor = '#6b369a',
    } = config.sharedParameters;

    const {
      [PeriodicSystemSelectParam.language]: language = 'de',
      [PeriodicSystemSelectParam.showInfoOrder]: showInfoOrder = 'true',
      [PeriodicSystemSelectParam.showInfoSymbol]: showInfoSymbol = 'true',
      [PeriodicSystemSelectParam.showInfoName]: showInfoName = 'true',
      [PeriodicSystemSelectParam.showInfoENeg]: showInfoENeg = 'false',
      [PeriodicSystemSelectParam.showInfoAMass]: showInfoAMass = 'false',
      [PeriodicSystemSelectParam.showInfoLabels]: showInfoLabels = 'true',
      [PeriodicSystemSelectParam.highlightBlocks]: highlightBlocks = 'false',
    } = config.parameters;

    return {
      locale: language as PsLocale,
      showSymbol: flagAsBool(showInfoSymbol),
      showName: flagAsBool(showInfoName),
      showNumber: flagAsBool(showInfoOrder),
      showMass: flagAsBool(showInfoAMass),
      showENeg: flagAsBool(showInfoENeg),
      showLabels: flagAsBool(showInfoLabels),
      enableBlockColors: flagAsBool(highlightBlocks),
      defaultTextColor,
      defaultBaseColor,
      blockColors: {
        [PsElementBlock.S]: '#cd2f2f',
        [PsElementBlock.P]: '#559955',
        [PsElementBlock.D]: '#6699dd',
        [PsElementBlock.F]: '#ff8822',
        [PsElementBlock.G]: '#000000',
      },
    };
  });
}

class PeriodicSystemSelectInteraction implements PsInteraction {
  readonly highlightedElement: WritableSignal<undefined | PsElementNumber>;
  readonly selectedElementList: WritableSignal<ReadonlyArray<PsElementNumber>>;

  constructor(private readonly widgetService: VeronaWidgetService) {
    this.highlightedElement = signal(undefined);

    // Deserialize initial state received by widget
    const initialSerializedElementSymbols = this.widgetService.stateData();
    this.selectedElementList = signal(parseSerializedElements(initialSerializedElementSymbols));

    // Serialize selection state to widget on change
    changeEffect(this.selectedElementList, (selectedElementList) => {
      const serializedElementSymbols = serializeElementSymbols(selectedElementList);
      this.widgetService.stateData.set(serializedElementSymbols);
    });

    // Request close on selection if configured accordingly
    changeEffect(this.selectedElementList, (selectedElementList) => {
      const { closeOnSelection } = untracked(this.interactionConfig);
      const firstSelectedElement = selectedElementList[0];
      if (closeOnSelection && firstSelectedElement) {
        this.widgetService.sendReturn(true);
      }
    });
  }

  readonly selectedElements = computed(() => {
    return new Set(this.selectedElementList());
  });

  readonly interactionConfig = computed(() => {
    const config = this.widgetService.configuration();

    const {
      [PeriodicSystemSelectParam.maxNumberOfSelections]: maxNumberOfSelections = '1',
      [PeriodicSystemSelectParam.closeOnSelection]: closeOnSelection = 'false',
    } = config.parameters;

    const maxSelectCount = flagAsInt(maxNumberOfSelections, 1);
    return {
      maxSelectCount,
      multiSelect: maxSelectCount !== 1,
      closeOnSelection: flagAsBool(closeOnSelection),
    } as const;
  });

  readonly elementClickBlocked = computed(() => {
    const { multiSelect, maxSelectCount } = this.interactionConfig();
    const selectedElements = this.selectedElementList();
    return multiSelect && maxSelectCount > 0 && selectedElements.length >= maxSelectCount;
  });

  highlightElement(element: undefined | PsElement): void {
    this.highlightedElement.set(element?.number);
  }

  clickElement(element: PsElement): void {
    const { multiSelect, maxSelectCount } = this.interactionConfig();
    const selected = this.selectedElementList();
    const alreadyIncluded = selected.includes(element.number);

    if (!multiSelect) {
      // single-select toggle
      if (alreadyIncluded) {
        this.selectedElementList.set([]);
        this.highlightedElement.set(undefined);
      } else {
        this.selectedElementList.set([element.number]);
        this.highlightedElement.set(element.number);
      }
    } else if (alreadyIncluded) {
      // multi-select remove click
      this.selectedElementList.set(selected.filter((x) => x !== element.number));
      this.highlightedElement.set(undefined);
    } else if (maxSelectCount < 1 || selected.length < maxSelectCount) {
      // multi-select add click (either no max select count, or still below max select count)
      this.selectedElementList.set(selected.concat(element.number));
      this.highlightedElement.set(element.number);
    } else {
      // no change (max select count reached),
      // but still highlight clicked element to show information
      this.highlightedElement.set(element.number);
    }
  }
}

function flagAsBool(flag: unknown): boolean {
  // Check for common "truthy" parameter values, including non-standard types; Everything else is considered false
  return flag === 'true' || flag === '1' || flag === true || flag === 1;
}

function flagAsInt(flag: string, defaultValue = 0): number {
  const value = Number.parseInt(flag);
  return Number.isNaN(value) ? defaultValue : value;
}

function changeEffect<T>(source: Signal<T>, onChange: (newValue: T, oldValue: T) => void): EffectRef {
  let oldValue = untracked(source);
  return effect(() => {
    const newValue = source();
    if (!Object.is(oldValue, newValue)) {
      onChange(newValue, oldValue);
    }
  });
}

// Index elements by element-symbol, e.g. "He => Element(Helium)"
const elementBySymbolLowercase: ReadonlyMap<string, PsElement> = new Map(
  PsElements.map((element) => {
    return [element.symbol.toLowerCase(), element] as const;
  }),
);

function parseSerializedElements(serializedElementSymbols: string): ReadonlyArray<PsElementNumber> {
  return serializedElementSymbols
    .split(/\s+/)
    .filter((item) => Boolean(item))
    .map((item) => elementBySymbolLowercase.get(item.toLowerCase()))
    .filter((element) => element !== undefined)
    .map((element) => element.number);
}

// Index elements by element-number, e.g. "2 => Element(Helium)"
const elementByNumber: ReadonlyMap<PsElementNumber, PsElement> = new Map(
  PsElements.map((element) => {
    return [element.number, element] as const;
  }),
);

function serializeElementSymbols(selectedElementList: ReadonlyArray<PsElementNumber>): string {
  return selectedElementList
    .map((nr) => elementByNumber.get(nr))
    .filter((element) => element !== undefined)
    .map((element) => element.symbol)
    .join(' ');
}
