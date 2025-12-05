import type { PsElement } from 'periodic-system-common';
import type { AtomId, BondId, BondMultiplicity, Vector2 } from './molecule-editor.model';

export interface MoleculeEditorView {
  readonly atoms: ReadonlyArray<AtomView>;
  readonly bonds: ReadonlyArray<BondView>;
}

export interface AtomView {
  readonly itemId: AtomId;
  readonly position: Vector2;
  readonly element: PsElement;
  readonly electrons: ReadonlyArray<ElectronView>;
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

export const enum ElectronOrientation {
  N = 'N',
  E = 'E',
  S = 'S',
  W = 'W',
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
      result.splice(result.indexOf(preferred), 1);
      result.unshift(preferred);
    }

    // Move occupied directions to back
    for (const orientation of occupied) {
      result.splice(result.indexOf(orientation), 1);
      result.push(orientation);
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
}
