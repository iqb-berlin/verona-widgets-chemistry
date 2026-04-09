import type { PsElement } from 'periodic-system-common';
import type { AtomId, BondId, FormulaSymbolId, PartialChargeId } from './molecule-editor.model';
import { AngleMath, BondMultiplicity, FormulaSymbol, PartialCharge, Vector2 } from './molecule-editor.shared';

// --- View data-types ---

export interface MoleculeEditorView {
  readonly atoms: ReadonlyArray<AtomView>;
  readonly bonds: ReadonlyArray<BondView>;
  readonly partials: ReadonlyArray<PartialChargeView>;
  readonly symbols: ReadonlyArray<FormulaSymbolView>;
}

export interface AtomView {
  readonly itemId: AtomId;
  readonly position: Vector2;
  readonly element: PsElement;
  readonly electrons: ReadonlyArray<ElectronView>;
  readonly formalCharge: null | FormalChargeView;
  readonly selected: boolean;
  readonly temporary: boolean;
  readonly targeted: boolean;
}

export interface BondView {
  readonly itemId: BondId;
  readonly multiplicity: BondMultiplicity;
  readonly leftPosition: Vector2;
  readonly rightPosition: Vector2;
  readonly selected: boolean;
  readonly temporary: boolean;
}

export interface ElectronView {
  readonly type: 1 | 2; // single or double
  readonly orientation: ElectronOrientation; // north, east, south, or west
}

export interface FormalChargeView {
  readonly position: Vector2;
  readonly color: string;
  readonly label: string;
  readonly labelLarge: boolean;
}

export interface PartialChargeView {
  readonly itemId: PartialChargeId;
  readonly absolutePosition: Vector2;
  readonly targetAtomId: null | AtomId;
  readonly targetAtomPosition: null | Vector2;
  readonly charge: PartialCharge;
  readonly selected: boolean;
  readonly temporary: boolean;
  readonly showConnection: boolean;
}

export interface FormulaSymbolView {
  readonly itemId: FormulaSymbolId;
  readonly position: Vector2;
  readonly symbol: FormulaSymbol;
  readonly selected: boolean;
  readonly temporary: boolean;
}

export const enum ElectronOrientation {
  N = 'N',
  E = 'E',
  S = 'S',
  W = 'W',
}

// --- View functions ---

export namespace BondView {
  export type LineDef = readonly [a: Vector2, b: Vector2]; // Definition of a line using two points "a" and "b"

  const deg90 = AngleMath.deg(90); // counter-clockwise 90° constant

  export function valenceBondLines(
    { leftPosition, rightPosition, multiplicity }: BondView,
    separationDistance: number,
  ): Array<LineDef> {
    const centeredLine = [leftPosition, rightPosition] as const;
    const bondLineAngle = AngleMath.angleBetween(leftPosition, rightPosition);
    const bondLineSeparation = Vector2.scale(separationDistance, AngleMath.anglePosition(bondLineAngle + deg90));

    switch (multiplicity) {
      case 1:
        return [centeredLine];
      case 2:
        return [
          offsetLine(centeredLine, Vector2.scale(-0.5, bondLineSeparation)),
          offsetLine(centeredLine, Vector2.scale(+0.5, bondLineSeparation)),
        ];
      case 3:
        return [
          centeredLine,
          offsetLine(centeredLine, bondLineSeparation),
          offsetLine(centeredLine, Vector2.neg(bondLineSeparation)),
        ];
      default:
        console.warn('Invalid bond multiplicity:', multiplicity satisfies never);
        return [];
    }
  }

  function offsetLine([a, b]: LineDef, offset: Vector2): LineDef {
    const offsetA = Vector2.add(a, offset);
    const offsetB = Vector2.add(b, offset);
    return [offsetA, offsetB] as const;
  }

  export function electronBondDots(
    { leftPosition, rightPosition, multiplicity }: BondView,
    separationDistance: number,
  ): Array<Vector2> {
    const centerPosition = Vector2.middle(leftPosition, rightPosition);
    const bondLineAngle = AngleMath.angleBetween(leftPosition, rightPosition);
    const lineForwardOffset = Vector2.scale(separationDistance, AngleMath.anglePosition(bondLineAngle));
    const separationOffset = Vector2.scale(separationDistance, AngleMath.anglePosition(bondLineAngle + deg90));

    const c1 = Vector2.add(centerPosition, lineForwardOffset);
    const c2 = Vector2.add(centerPosition, Vector2.neg(lineForwardOffset));

    switch (multiplicity) {
      case 1:
        return [c1, c2];
      case 2: {
        const o1 = separationOffset;
        const o2 = Vector2.neg(o1);
        return [Vector2.add(c1, o1), Vector2.add(c2, o1), Vector2.add(c1, o2), Vector2.add(c2, o2)];
      }
      case 3: {
        const o1 = Vector2.scale(1.5, separationOffset);
        const o2 = Vector2.neg(o1);
        return [c1, c2, Vector2.add(c1, o1), Vector2.add(c2, o1), Vector2.add(c1, o2), Vector2.add(c2, o2)];
      }
      default:
        console.warn('Invalid bond multiplicity:', multiplicity satisfies never);
        return [];
    }
  }
}

export namespace ElectronView {
  export function singleCoordinates(e: ElectronView, [cx, cy]: Vector2, d: number) {
    switch (e.orientation) {
      case ElectronOrientation.N:
        return { x: cx, y: cy - d };
      case ElectronOrientation.E:
        return { x: cx + d, y: cy };
      case ElectronOrientation.S:
        return { x: cx, y: cy + d };
      case ElectronOrientation.W:
        return { x: cx - d, y: cy };
    }
  }

  export function doubleCoordinates(e: ElectronView, [cx, cy]: Vector2, d: number, w: number) {
    switch (e.orientation) {
      case ElectronOrientation.N:
        return { x1: cx - w, y1: cy - d, x2: cx + w, y2: cy - d };
      case ElectronOrientation.E:
        return { x1: cx + d, y1: cy - w, x2: cx + d, y2: cy + w };
      case ElectronOrientation.S:
        return { x1: cx - w, y1: cy + d, x2: cx + w, y2: cy + d };
      case ElectronOrientation.W:
        return { x1: cx - d, y1: cy - w, x2: cx - d, y2: cy + w };
    }
  }

  export function prioritizeOrientations(occupied: ReadonlyArray<ElectronOrientation>): Array<ElectronOrientation> {
    const result = [ElectronOrientation.N, ElectronOrientation.E, ElectronOrientation.S, ElectronOrientation.W];

    // Single orientation occupied -> Move opposite orientation to front as preferred
    if (occupied.length === 1) {
      const preferred = oppositeOrientation(occupied[0]);
      moveToFront(result, preferred);
    }

    // Move occupied directions to back
    for (const orientation of occupied) {
      moveToBack(result, orientation);
    }

    return result;
  }

  export function oppositeOrientation(orientation: ElectronOrientation): ElectronOrientation {
    switch (orientation) {
      case ElectronOrientation.N:
        return ElectronOrientation.S;
      case ElectronOrientation.E:
        return ElectronOrientation.W;
      case ElectronOrientation.S:
        return ElectronOrientation.N;
      case ElectronOrientation.W:
        return ElectronOrientation.E;
    }
  }

  function moveToFront<T>(items: Array<T>, item: T) {
    const index = items.indexOf(item);
    if (index >= 0) {
      items.splice(index, 1);
      items.unshift(item);
    }
  }

  function moveToBack<T>(items: Array<T>, item: T) {
    const index = items.indexOf(item);
    if (index >= 0) {
      items.splice(index, 1);
      items.push(item);
    }
  }
}

export namespace FormalChargeView {
  export function formalChargeLabel(formalCharge: number): string {
    const n = Math.abs(formalCharge);
    if (formalCharge === -1) return '–';
    else if (formalCharge === +1) return '+';
    else if (formalCharge < -1) return `${n}–`;
    else if (formalCharge > +1) return `${n}+`;
    else return '';
  }

  export function formalChargeLabelLarge(formalCharge: number): boolean {
    return formalCharge <= 1 && -1 <= formalCharge;
  }
}
