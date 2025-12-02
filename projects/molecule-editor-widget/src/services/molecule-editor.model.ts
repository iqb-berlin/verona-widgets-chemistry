import { Nominal, PsElement } from 'periodic-system-common';
import { produce } from 'immer';

export type Vector2 = readonly [x: number, y: number];

export type BondMultiplicity = 1 | 2 | 3;

export type ToolMode =
  | { readonly mode: 'pointer' }
  | { readonly mode: 'duplicate' }
  | { readonly mode: 'bonding', readonly multiplicity: BondMultiplicity }
  ;

export type EditorState =
  | { readonly state: 'idle' }
  | { readonly state: 'selected', readonly id: ItemId }
  | { readonly state: 'addingAtom', readonly element: PsElement, readonly hoverPos: Vector2 }
  | { readonly state: 'preMoveAtom', readonly id: AtomId }
  | { readonly state: 'movingAtom', readonly id: AtomId, readonly targetPos: Vector2 }
  | {
  readonly state: 'addingBond',
  readonly startId: AtomId,
  readonly multi: BondMultiplicity,
  readonly hoverPos: Vector2
}
  ;

declare const itemType: unique symbol;

export type ItemType = 'Atom' | 'Bond';

export type ItemId = Nominal<string, 'ItemId'>

type ItemIdSubtype<T extends ItemType> = ItemId & { [itemType]: T }

export type AtomId = ItemIdSubtype<'Atom'>
export type BondId = ItemIdSubtype<'Bond'>

export namespace ItemId {
  export const tmpAddAtom = 'tmp:addAtom' as AtomId;
  export const tmpMoveAtom = 'tmp:moveAtom' as AtomId;
  export const tmpAddBond = 'tmp:addBond' as BondId;
}

export function uniqueItemId<T extends ItemType>(): ItemIdSubtype<T> {
  const randomValue = Math.random().toString(36);
  const randomItemId = randomValue.replace('0.', 'item:');
  return randomItemId as ItemIdSubtype<T>;
}

type ReadonlyRecord<K extends PropertyKey, T> = Readonly<Record<K, T>>

export interface MoleculeEditorModel {
  readonly atoms: ReadonlyRecord<ItemId, AtomModel>;
  readonly bonds: ReadonlyRecord<ItemId, BondModel>;
}

export interface ModelBase<T extends ItemType> {
  readonly type: T;
  readonly itemId: ItemIdSubtype<T>;
}

export interface AtomModel extends ModelBase<'Atom'> {
  readonly position: Vector2;
  readonly element: PsElement;
  readonly electrons: number;
}

export interface BondModel extends ModelBase<'Bond'> {
  readonly leftAtomId: AtomId;
  readonly rightAtomId: AtomId;
  readonly multiplicity: BondMultiplicity;
}

export namespace Vector2 {
  export function add([ax, ay]: Vector2, [bx, by]: Vector2): Vector2 {
    return [ax + bx, ay + by] as const;
  }

  export function sub([ax, ay]: Vector2, [bx, by]: Vector2): Vector2 {
    return [ax - bx, ay - by] as const;
  }

  export function mul([x, y]: Vector2, s: number): Vector2 {
    return [x * s, y * s] as const;
  }

  export function neg([x, y]: Vector2): Vector2 {
    return [-x, -y] as const;
  }
}

export namespace MoleculeEditorModel {
  const v2 = ([x, y]: Vector2): [number, number] => [x, y];

  export const empty: MoleculeEditorModel = {
    atoms: {},
    bonds: {},
  } as const;

  export const addAtom = produce<MoleculeEditorModel, [AtomId, PsElement, Vector2]>((model, atomId, element, position) => {
    model.atoms[atomId] = {
      type: 'Atom',
      itemId: atomId,
      element,
      position: v2(position),
      electrons: 0,
    } satisfies AtomModel;
  });

  export const moveAtom = produce<MoleculeEditorModel, [AtomId, Vector2]>((model, atomId, position) => {
    const atom = model.atoms[atomId];
    if (atom && atom.type === 'Atom') {
      atom.position = v2(position);
    }
  });

  export const addBond = produce<MoleculeEditorModel, [BondId, AtomId, AtomId, BondMultiplicity]>(
    (model, bondId, leftAtomId, rightAtomId, multiplicity) => {
      // Remove existing bonds, if any already exists for the given atoms
      for (const bond of Object.values(model.bonds)) {
        if (bond.leftAtomId === leftAtomId && bond.rightAtomId === rightAtomId) {
          delete model.bonds[bond.itemId];
        }
        if (bond.leftAtomId === rightAtomId && bond.rightAtomId === leftAtomId) {
          delete model.bonds[bond.itemId];
        }
      }

      // Add new bond
      model.bonds[bondId] = {
        type: 'Bond',
        itemId: bondId,
        leftAtomId,
        rightAtomId,
        multiplicity,
      } satisfies BondModel;
    },
  );

  export const setBondMultiplicity = produce<MoleculeEditorModel, [ItemId, BondMultiplicity]>((model, bondId, multiplicity) => {
    const bond = model.bonds[bondId];
    if (bond) {
      bond.multiplicity = multiplicity;
    }
  });


  export const ATOM_MIN_ELECTRONS = 0;
  export const ATOM_MAX_ELECTRONS = 8;

  export const clampAtomElectrons = (count: number): number => {
    return Math.max(ATOM_MIN_ELECTRONS, Math.min(ATOM_MAX_ELECTRONS, count));
  };

  export const changeAtomElectrons = produce<MoleculeEditorModel, [atomId: ItemId, delta: number]>(
    (model, atomId, delta) => {
      const atom = model.atoms[atomId];
      if (atom) {
        atom.electrons = clampAtomElectrons(atom.electrons + delta);
      }
    },
  );

  export const setAtomElectrons = produce<MoleculeEditorModel, [atomId: ItemId, count: number]>(
    (model, atomId, count) => {
      const atom = model.atoms[atomId];
      if (atom) {
        atom.electrons = clampAtomElectrons(count);
      }
    },
  );

  export const deleteItem = produce<MoleculeEditorModel, [ItemId]>((model, itemId) => {
    const atom = model.atoms[itemId];
    delete model.atoms[itemId];
    delete model.bonds[itemId];

    if (atom) {
      // Delete all bonds connected to atom
      for (const bondKey in model.bonds) {
        const bondId = bondKey as BondId;
        const { leftAtomId, rightAtomId } = model.bonds[bondId];
        if (leftAtomId == itemId || rightAtomId == itemId) {
          delete model.bonds[bondId];
        }
      }
    }
  });
}

export namespace EditorState {
  export const idle = { state: 'idle' } as const satisfies EditorState;

  export function select(id: ItemId) {
    return { state: 'selected', id } as const satisfies EditorState;
  }

  export function addAtom(element: PsElement, hoverPosition: Vector2) {
    return { state: 'addingAtom', element, hoverPos: hoverPosition } as const satisfies EditorState;
  }

  export function prepareMoveAtom(id: AtomId) {
    return { state: 'preMoveAtom', id } as const satisfies EditorState;
  }

  export function moveAtom(id: AtomId, targetPosition: Vector2) {
    return { state: 'movingAtom', id, targetPos: targetPosition } as const satisfies EditorState;
  }

  export function addBond(startId: AtomId, multiplicity: BondMultiplicity, hoverPosition: Vector2) {
    return {
      state: 'addingBond',
      startId,
      multi: multiplicity,
      hoverPos: hoverPosition,
    } as const satisfies EditorState;
  }

  export function isMovingAtom(state: EditorState, atomId: ItemId): state is (EditorState & { state: 'movingAtom' }) {
    return state.state === 'movingAtom' && state.id === atomId;
  }

  export function isItemSelected(state: EditorState, atomId: ItemId): state is (EditorState & { state: 'selected' }) {
    return state.state === 'selected' && state.id === atomId;
  }
}
