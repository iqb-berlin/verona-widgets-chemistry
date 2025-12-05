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

const elementByNumber: ReadonlyMap<PsElementNumber, PsElement> = new Map(PsElements.map((e) => [e.number, e] as const));

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

export function lookupElement(elementNr: PsElementNumber): PsElement {
  return elementByNumber.get(elementNr) ?? unknownElement;
}
