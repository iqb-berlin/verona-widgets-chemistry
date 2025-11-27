import type { PsElement } from 'periodic-system-common';
import type { BondMultiplicity, ItemId, Vector2 } from './molecule-editor.model';

export interface MoleculeEditorView {
  readonly atoms: ReadonlyArray<AtomView>;
  readonly bonds: ReadonlyArray<BondView>;
}

export interface AtomView {
  readonly itemId: ItemId;
  readonly position: Vector2;
  readonly element: PsElement;
  readonly outerElectrons: number;
  readonly selected: boolean;
  readonly temporary: boolean;
}

export interface BondView {
  readonly itemId: ItemId;
  readonly multiplicity: BondMultiplicity;
  readonly leftPosition: Vector2;
  readonly rightPosition: Vector2;
  readonly selected: boolean;
  readonly temporary: boolean;
}
