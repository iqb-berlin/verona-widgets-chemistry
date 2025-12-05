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
  readonly orientation: 'N' | 'E' | 'S' | 'W'; // north, east, south, or west
}

export namespace ElectronView {
  export function singleCoordinates(e: ElectronView, [cx, cy]: Vector2, d: number) {
    switch (e.orientation) {
      case 'N':
        return { x: cx, y: cy - d };
      case 'E':
        return { x: cx + d, y: cy };
      case 'S':
        return { x: cx, y: cy + d };
      case 'W':
        return { x: cx - d, y: cy };
    }
  }

  export function doubleCoordinates(e: ElectronView, [cx, cy]: Vector2, d: number, w: number) {
    switch (e.orientation) {
      case 'N':
        return { x1: cx - w, y1: cy - d, x2: cx + w, y2: cy - d };
      case 'E':
        return { x1: cx + d, y1: cy - w, x2: cx + d, y2: cy + w };
      case 'S':
        return { x1: cx - w, y1: cy + d, x2: cx + w, y2: cy + d };
      case 'W':
        return { x1: cx - d, y1: cy - w, x2: cx - d, y2: cy + w };
    }
  }
}
