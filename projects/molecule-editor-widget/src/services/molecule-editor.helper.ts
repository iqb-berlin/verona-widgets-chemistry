import {
  PsColumnNumber,
  PsElement,
  PsElementBlock,
  PsElementName,
  PsElementNumber,
  PsElements,
  PsElementSymbol,
  PsGroupNumber,
  PsLocale,
  PsPeriodNumber,
} from 'periodic-system-common';

const indexElements = <T>(by: (e: PsElement) => T) => new Map(PsElements.map((e) => [by(e), e] as const));
const elementByNumber: ReadonlyMap<PsElementNumber, PsElement> = indexElements((e) => e.number);
const elementBySymbol: ReadonlyMap<PsElementSymbol, PsElement> = indexElements((e) => e.symbol);

export function lookupElementNr(elementNr: PsElementNumber): PsElement {
  return elementByNumber.get(elementNr) ?? unknownElement;
}

export function lookupElementSymbol(elementSymbol: string | PsElementSymbol): PsElement {
  return elementBySymbol.get(elementSymbol as PsElementSymbol) ?? unknownElement;
}

// Used when an unknown element is referenced - this should never happen
const unknownElement = {
  number: -1 as PsElementNumber,
  symbol: '??' as PsElementSymbol,
  names: {
    [PsLocale.English]: 'Unknown' as PsElementName,
    [PsLocale.German]: 'Unbekannt' as PsElementName,
    [PsLocale.Latin]: 'Ignotus' as PsElementName,
  },
  atomic_mass: -1,
  column: -1 as PsColumnNumber,
  group: -1 as PsGroupNumber,
  period: -1 as PsPeriodNumber,
  block: PsElementBlock.G,
} satisfies PsElement;
