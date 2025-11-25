import { computed, InjectionToken, Signal } from '@angular/core';
import { PsElement, PsElementBlock, PsElementNumber, PsLocale } from '../data/PsData';
import { ReadonlyRecord } from '../util/typing';

export const PsService = new InjectionToken<PsService>('PsService');

export interface PsService {
  readonly interaction: PsInteraction;
  readonly appearance: Signal<PsAppearance>;
}

export interface PsAppearance {
  readonly locale: PsLocale;
  readonly showSymbol: boolean;
  readonly showNumber: boolean;
  readonly showName: boolean;
  readonly showMass: boolean;
  readonly showENeg: boolean;
  readonly enableBlockColors: boolean;
  readonly defaultTextColor: string;
  readonly defaultBaseColor: string;
  readonly blockColors: ReadonlyRecord<PsElementBlock, string>;
}

export interface PsInteraction {
  readonly selectedElements: Signal<ReadonlySet<PsElementNumber>>;
  readonly elementClickBlocked: Signal<boolean>;

  clickElement(element: PsElement): void;
}

export function computeElementName(service: PsService, element: Signal<PsElement>): Signal<string> {
  return computed(() => {
    const e = element();
    const a = service.appearance();
    return e.names[a.locale];
  });
}

export function computeElementSelected(service: PsService, element: Signal<PsElement>): Signal<boolean> {
  return computed(() => {
    const e = element();
    const s = service.interaction.selectedElements();
    return s.has(e.number);
  });
}
