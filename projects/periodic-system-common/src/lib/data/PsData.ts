import PsDataJson from './PsData.json';
import { Nominal, ReadonlyRecord } from '../util/typing';

export interface PsData {
  readonly elements: ReadonlyArray<PsElement>;
}

export interface PsElement {
  readonly number: PsElementNumber;
  readonly column: PsColumnNumber;
  readonly group: PsGroupNumber;
  readonly period: PsPeriodNumber;
  readonly block: PsElementBlock;
  readonly names: ReadonlyRecord<PsLocale, PsElementName>;
  readonly symbol: PsElementSymbol;
  readonly atomic_mass: number;
  readonly negativity?: PsElementNegativity;
}

export const enum PsElementBlock {
  S = 's',
  P = 'p',
  D = 'd',
  F = 'f',
  G = 'g',
}

export const enum PsLocale {
  English = 'en',
  German = 'de',
  Latin = 'la',
}

export interface PsElementNegativity {
  readonly pauling?: number;
}

export type PsElementSymbol = Nominal<string, 'PsElementSymbol'>;
export type PsElementName = Nominal<string, 'PsElementName'>;

export type PsElementNumber = Nominal<number, 'PsElementNumber'>;
export type PsColumnNumber = Nominal<number, 'PsColumnNumber'>;
export type PsGroupNumber = Nominal<number, 'PsGroupNumber'>;
export type PsPeriodNumber = Nominal<number, 'PsPeriodNumber'>;

// Static export of "PSE_Data.json" as PsData instance
export const PsData = PsDataJson as unknown as PsData;
export const PsElements = PsData.elements;
export default PsData;
