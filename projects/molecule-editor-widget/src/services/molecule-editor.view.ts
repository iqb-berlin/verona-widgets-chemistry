import type { PsElement, ReadonlyRecord } from 'periodic-system-common';
import type { AtomId, BondId, BondMultiplicity, Vector2 } from './molecule-editor.model';

export interface MoleculeEditorView {
  readonly atoms: ReadonlyArray<AtomView>;
  readonly bonds: ReadonlyArray<BondView>;
}

export interface AtomView {
  readonly itemId: AtomId;
  readonly position: Vector2;
  readonly element: PsElement;
  readonly outerElectrons: number;
  readonly bondAngles: ReadonlyArray<number>;
  readonly selected: boolean;
  readonly temporary: boolean;
}

export interface BondView {
  readonly itemId: BondId;
  readonly multiplicity: BondMultiplicity;
  readonly leftPosition: Vector2;
  readonly rightPosition: Vector2;
  readonly selected: boolean;
  readonly temporary: boolean;
}

export interface MoleculeEditorAnimatedView {
  readonly atomElectronAnimations: ReadonlyRecord<AtomId, AtomAnimatedElectronsView>;
}

export interface AtomAnimatedElectronsView {
  readonly itemId: AtomId;
  readonly bondAngles: ReadonlyArray<number>;
  readonly electronAngles: ReadonlyArray<number>;
}
