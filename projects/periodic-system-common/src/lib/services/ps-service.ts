import { InjectionToken, Signal } from '@angular/core';
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
