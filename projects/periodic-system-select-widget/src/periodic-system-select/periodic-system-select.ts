import { Component, computed, effect, inject, Injectable, signal, WritableSignal } from '@angular/core';
import {
  PeriodicSystemModule,
  PsAppearance,
  PsElement,
  PsElementBlock,
  PsElementNumber,
  PsElements,
  PsInteraction,
  PsLocale,
  PsService,
} from 'periodic-system-common';
import { VeronaWidgetService } from 'verona-widget';

@Injectable()
class PeriodicSystemSelectService implements PsService {
  private readonly widgetService = inject(VeronaWidgetService);

  readonly interaction = new PeriodicSystemSelectInteraction(this.widgetService);

  readonly appearance = computed((): PsAppearance => {
    const config = this.widgetService.configuration();
    const {
      defaultTextColor = '#ffffff',
      defaultBaseColor = '#4000ff',
    } = config.parameters;

    //TODO: Derive appearance from widget configuration

    return {
      locale: PsLocale.English,
      showSymbol: true,
      showName: true,
      showMass: true,
      enableBlockColors: true,
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

@Component({
  selector: 'app-periodic-system-select',
  template: '<lib-ps-table></lib-ps-table>',
  imports: [PeriodicSystemModule],
  providers: [
    {
      provide: PsService,
      useClass: PeriodicSystemSelectService,
    },
  ],
})
export class PeriodicSystemSelect {
}

const elementByNumber: ReadonlyMap<PsElementNumber, PsElement> = new Map(PsElements.map(element => {
  return [element.number, element] as const;
}));

const elementBySymbolLowercase: ReadonlyMap<string, PsElement> = new Map(PsElements.map(element => {
  return [element.symbol.toLowerCase(), element] as const;
}));

class PeriodicSystemSelectInteraction implements PsInteraction {
  readonly selectedElementList: WritableSignal<ReadonlyArray<PsElementNumber>>;

  constructor(
    private readonly widgetService: VeronaWidgetService,
  ) {
    // Deserialize initial state received by widget
    const initialSerializedElementSymbols = this.widgetService.stateData();
    const initialElements = initialSerializedElementSymbols
      .split(/\s+/)
      .filter(item => Boolean(item))
      .map(item => elementBySymbolLowercase.get(item.toLowerCase()))
      .filter(element => element !== undefined)
      .map(element => element.number);

    this.selectedElementList = signal(initialElements);

    // Serialize selection state to widget on change
    let firedOnce = false;
    effect(() => {
      const selectedElementList = this.selectedElementList();
      if (!firedOnce) { // ignore initial value on first run
        firedOnce = true;
        return;
      }

      const serializedElementSymbols = selectedElementList
        .map(nr => elementByNumber.get(nr))
        .filter(element => element !== undefined)
        .map(element => element.symbol)
        .join(' ');

      this.widgetService.stateData.set(serializedElementSymbols);
    });
  }

  readonly selectedElements = computed(() => {
    return new Set(this.selectedElementList());
  });

  readonly interactionConfig = computed(() => {
    const config = this.widgetService.configuration();
    const { multiSelect, maxSelectCount } = config.parameters;
    return {
      multiSelect: multiSelect === 'true' || multiSelect === '1',
      maxSelectCount: Number.parseInt(maxSelectCount) || -1,
    } as const;
  });

  readonly elementClickBlocked = computed(() => {
    const { multiSelect, maxSelectCount } = this.interactionConfig();
    const selectedElements = this.selectedElementList();
    return multiSelect && maxSelectCount > 0 && selectedElements.length >= maxSelectCount;
  });

  clickElement(element: PsElement): void | Promise<void> {
    const { multiSelect, maxSelectCount } = this.interactionConfig();
    this.selectedElementList.update((list) => {
      const alreadyIncluded = list.includes(element.number);
      if (!multiSelect) {
        // single-select toggle
        return alreadyIncluded ? [] : [element.number];
      } else if (alreadyIncluded) {
        // multi-select remove click
        return list.filter((x) => x !== element.number);
      } else if (maxSelectCount < 1 || list.length < maxSelectCount) {
        // multi-select add click
        return list.concat(element.number);
      } else {
        // no change
        return list;
      }
    });
  }
}
