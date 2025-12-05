import { Nominal, PsElementNumber } from 'periodic-system-common';
import { produce, WritableDraft } from 'immer';

// --- Model data-structs ---

/** Vector in 2D Euclidean space */
export type Vector2 = readonly [x: number, y: number];

/** Single, double, or triple bonds */
export type BondMultiplicity = 1 | 2 | 3;

/** Tools available in the editor */
export type ToolMode =
  | { readonly mode: 'pointer' }
  | { readonly mode: 'duplicate' }
  | { readonly mode: 'groupMove' }
  | { readonly mode: 'bonding'; readonly multiplicity: BondMultiplicity };

/** Possible active states of the editor */
export type EditorState =
  | {
  readonly state: 'idle';
}
  | {
  readonly state: 'selected';
  readonly itemId: ItemId;
}
  | {
  readonly state: 'addingAtom';
  readonly elementNr: PsElementNumber;
  readonly hoverPos: Vector2;
}
  | {
  readonly state: 'preMoveAtom';
  readonly atomId: AtomId;
}
  | {
  readonly state: 'movingAtom';
  readonly atomId: AtomId;
  readonly targetPos: Vector2;
}
  | {
  readonly state: 'addingBond';
  readonly startId: AtomId;
  readonly hoverPos: Vector2;
  readonly multiplicity: BondMultiplicity;
}
  | {
  readonly state: 'movingGroup';
  readonly startPos: Vector2;
  readonly targetPos: Vector2;
  readonly groupItemIds: ReadonlyArray<ItemId>;
};

/** Union literal of known item types */
export type ItemType = 'Atom' | 'Bond';

/** Nominal identifier type of model items */
export type ItemId = Nominal<string, 'ItemId'>;

/** Declared marker symbol for ItemId subtype branding */
declare const itemType: unique symbol;

type ItemIdSubtype<T extends ItemType> = ItemId & { [itemType]: T };

export type AtomId = ItemIdSubtype<'Atom'>;
export type BondId = ItemIdSubtype<'Bond'>;

type ReadonlyRecord<K extends PropertyKey, T> = Readonly<Record<K, T>>;

/** Core model representing content of the molecule-editor */
export interface MoleculeEditorModel {
  readonly atoms: ReadonlyRecord<ItemId, AtomModel>;
  readonly bonds: ReadonlyRecord<ItemId, BondModel>;
}

interface ModelBase<T extends ItemType> {
  readonly type: T;
  readonly itemId: ItemIdSubtype<T>;
}

export interface AtomModel extends ModelBase<'Atom'> {
  readonly position: Vector2;
  readonly elementNr: PsElementNumber;
  readonly electrons: number;
}

export interface BondModel extends ModelBase<'Bond'> {
  readonly leftAtomId: AtomId;
  readonly rightAtomId: AtomId;
  readonly multiplicity: BondMultiplicity;
}

/** Indexed graph of connections within the model, used internally for operations that require item relations */
export interface MoleculeEditorGraph {
  readonly model: MoleculeEditorModel;
  readonly itemIndex: ReadonlyMap<ItemId, AtomModel | BondModel>;
  readonly atomBonds: ReadonlyMap<AtomModel, ReadonlyArray<BondModel>>;
  readonly bondAtoms: ReadonlyMap<BondModel, readonly [left: AtomModel, right: AtomModel]>;
}

// --- Model functions ---

export namespace ItemId {
  /** Item IDs ""item:..." are generated from random numbers */
  export function generate<T extends ItemType>(): ItemIdSubtype<T> {
    const randomValue = Math.random().toString(36);
    const randomItemId = randomValue.replace('0.', 'item:');
    return randomItemId as ItemIdSubtype<T>;
  }

  export const tmpAddAtom = 'tmp:addAtom' as AtomId;
  export const tmpAddBond = 'tmp:addBond' as BondId;

  export function tmpMoveAtom(atomId: AtomId): AtomId {
    return `tmp:moveAtom:${atomId}` as AtomId;
  }

  export function tmpMoveBond(bondId: BondId): BondId {
    return `tmp:moveBond:${bondId}` as BondId;
  }
}

export namespace Vector2 {
  export function add([ax, ay]: Vector2, [bx, by]: Vector2): Vector2 {
    return [ax + bx, ay + by] as const;
  }

  export function sub([ax, ay]: Vector2, [bx, by]: Vector2): Vector2 {
    return [ax - bx, ay - by] as const;
  }

  export function middle([ax, ay]: Vector2, [bx, by]: Vector2): Vector2 {
    return [(ax + bx) / 2, (ay + by) / 2];
  }

  export function scale(s: number, [x, y]: Vector2): Vector2 {
    return [x * s, y * s] as const;
  }

  export function neg([x, y]: Vector2): Vector2 {
    return [-x, -y] as const;
  }

  export function flipY([x, y]: Vector2): Vector2 {
    return [x, -y] as const;
  }

  export function flipX([x, y]: Vector2): Vector2 {
    return [-x, y] as const;
  }

  export function magnitude([x, y]: Vector2): number {
    return Math.sqrt(x * x + y * y);
  }

  export function normalize(v: Vector2): Vector2 {
    const l = Vector2.magnitude(v);
    return [v[0] / l, v[1] / l] as const;
  }
}

export namespace MoleculeEditorModel {
  // Helper function to create a temporary mutable copy of a Vector2 tuple, for usage in immer recipes
  const v2 = ([x, y]: Vector2): [number, number] => [x, y];

  export const empty: MoleculeEditorModel = { atoms: {}, bonds: {} } as const;

  export const addAtom = produce<MoleculeEditorModel, [AtomId, PsElementNumber, Vector2]>(
    (model, atomId, elementNr, position) => {
      model.atoms[atomId] = {
        type: 'Atom',
        itemId: atomId,
        elementNr,
        position: v2(position),
        electrons: 0,
      } satisfies AtomModel;
    },
  );

  export const moveAtom = produce<MoleculeEditorModel, [AtomId, Vector2]>((model, atomId, position) => {
    const atom = model.atoms[atomId];
    if (atom) atom.position = v2(position);
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

      const bond = {
        type: 'Bond',
        itemId: bondId,
        leftAtomId,
        rightAtomId,
        multiplicity,
      } satisfies BondModel;

      // Add new bond
      model.bonds[bondId] = bond;

      // Trim number of electrons for atoms connected by new bond
      trimBondConnectedAtomElectrons(model, bond);
    },
  );

  export const setBondMultiplicity = produce<MoleculeEditorModel, [ItemId, BondMultiplicity]>(
    (model, bondId, multiplicity) => {
      const bond = model.bonds[bondId];
      if (bond) {
        bond.multiplicity = multiplicity;

        // Trim number of electrons for atoms connected by modified bond
        trimBondConnectedAtomElectrons(model, bond);
      }
    },
  );

  export const changeAtomElectrons = produce<MoleculeEditorModel, [atomId: ItemId, delta: number]>(
    (model, atomId, delta) => {
      const atom = model.atoms[atomId];
      if (atom) {
        atom.electrons = limitAtomElectrons(model, atom, atom.electrons + delta);
      }
    },
  );

  export const setAtomElectrons = produce<MoleculeEditorModel, [atomId: ItemId, count: number]>(
    (model, atomId, count) => {
      const atom = model.atoms[atomId];
      if (atom) {
        atom.electrons = limitAtomElectrons(model, atom, count);
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

  export const moveGroup = produce<MoleculeEditorModel, [Vector2, ReadonlyArray<ItemId>]>(
    (model, moveDelta, groupItemIds) => {
      for (const itemId of groupItemIds) {
        const atom = model.atoms[itemId];
        if (atom) {
          atom.position[0] += moveDelta[0];
          atom.position[1] += moveDelta[1];
        }
      }
    },
  );

  export const ATOM_TOTAL_MAX_ELECTRONS = 8;

  /**
   * Helper function determining the maximum allowed number of electrons an atom is allowed to have.
   * Outer electrons are limited to `8 - sum(bond.multiplicity for bond where bond.left == atom or bond.right == atom)`
   */
  function limitAtomElectrons(model: MoleculeEditorModel, atom: AtomModel, electrons: number): number {
    const occupiedByBonds = Object.values(model.bonds)
      .filter(bond => (bond.leftAtomId === atom.itemId) || (bond.rightAtomId === atom.itemId))
      .reduce((sum, bond) => sum + bond.multiplicity, 0);

    const maxElectrons = ATOM_TOTAL_MAX_ELECTRONS - occupiedByBonds;
    return Math.max(0, Math.min(maxElectrons, electrons));
  }

  /** Helper function trimming excess electrons from atoms connected by a given bond */
  function trimBondConnectedAtomElectrons(model: WritableDraft<MoleculeEditorModel>, bond: BondModel) {
    const { [bond.leftAtomId]: leftAtom, [bond.rightAtomId]: rightAtom } = model.atoms;
    if (leftAtom) leftAtom.electrons = limitAtomElectrons(model, leftAtom, leftAtom.electrons);
    if (rightAtom) rightAtom.electrons = limitAtomElectrons(model, rightAtom, rightAtom.electrons);
  }
}

export namespace ToolMode {
  export const pointer = { mode: 'pointer' } as const satisfies ToolMode;
  export const duplicate = { mode: 'duplicate' } as const satisfies ToolMode;
  export const groupMove = { mode: 'groupMove' } as const satisfies ToolMode;
  export const bonding = (multiplicity: BondMultiplicity) => {
    return { mode: 'bonding', multiplicity } as const satisfies ToolMode;
  };
}

export namespace EditorState {
  export const idle = { state: 'idle' } as const satisfies EditorState;

  export function select(itemId: ItemId) {
    return { state: 'selected', itemId } as const satisfies EditorState;
  }

  export function addAtom(elementNr: PsElementNumber, hoverPosition: Vector2) {
    return { state: 'addingAtom', elementNr, hoverPos: hoverPosition } as const satisfies EditorState;
  }

  export function prepareMoveAtom(atomId: AtomId) {
    return { state: 'preMoveAtom', atomId } as const satisfies EditorState;
  }

  export function moveAtom(atomId: AtomId, targetPosition: Vector2) {
    return { state: 'movingAtom', atomId, targetPos: targetPosition } as const satisfies EditorState;
  }

  export function groupMove(startPos: Vector2, groupItemIds: ReadonlyArray<ItemId>) {
    return { state: 'movingGroup', startPos, targetPos: startPos, groupItemIds } as const satisfies EditorState;
  }

  export function addBond(startId: AtomId, multiplicity: BondMultiplicity, hoverPos: Vector2) {
    return {
      state: 'addingBond',
      startId,
      multiplicity,
      hoverPos,
    } as const satisfies EditorState;
  }

  type EditorSubstate<S extends EditorState['state']> = EditorState & { state: S };

  export function isMovingAtom(state: EditorState, atomId: ItemId): state is EditorSubstate<'movingAtom' | 'movingGroup'> {
    return (state.state === 'movingAtom' && state.atomId === atomId)
      || (state.state === 'movingGroup' && state.groupItemIds.includes(atomId));
  }

  export function isItemSelected(state: EditorState, atomId: ItemId): state is EditorSubstate<'selected'> {
    return state.state === 'selected' && state.itemId === atomId;
  }

  export function isItemTargeted(state: EditorState, itemId: ItemId): state is EditorSubstate<'addingBond'> {
    return state.state === 'addingBond' && state.startId === itemId;
  }
}

export namespace MoleculeEditorGraph {
  export function createFrom(model: MoleculeEditorModel): MoleculeEditorGraph {
    const itemIndex = new Map<ItemId, AtomModel | BondModel>;
    const atomBonds = new Map<AtomModel, Array<BondModel>>;
    const bondAtoms = new Map<BondModel, [AtomModel, AtomModel]>;

    for (const atomKey in model.atoms) {
      const atomId = atomKey as AtomId;
      const atomModel = model.atoms[atomId];
      itemIndex.set(atomId, atomModel);
      atomBonds.set(atomModel, []);
    }

    for (const bondKey in model.bonds) {
      const bondId = bondKey as BondId;
      const bondModel = model.bonds[bondId];
      const { leftAtomId, rightAtomId } = bondModel;
      const { [leftAtomId]: leftAtomModel, [rightAtomId]: rightAtomModel } = model.atoms;

      itemIndex.set(bondId, bondModel);
      atomBonds.get(leftAtomModel)?.push(bondModel);
      atomBonds.get(rightAtomModel)?.push(bondModel);
      bondAtoms.set(bondModel, [leftAtomModel, rightAtomModel]);
    }

    return { model, itemIndex, atomBonds, bondAtoms } as const;
  }

  export function findGroup(graph: MoleculeEditorGraph, pivotItemId: ItemId): Array<ItemId> {
    const pivotItem = graph.itemIndex.get(pivotItemId);
    if (pivotItem === undefined) {
      return [];
    } else switch (pivotItem.type) {
      case 'Atom':
        return findAtomRelationsRecursive(graph, pivotItem, new Set());
      case 'Bond':
        return [];
      default:
        console.error('Unknown pivot item: ', pivotItem satisfies never);
        return [];
    }
  }

  function findAtomRelationsRecursive(graph: MoleculeEditorGraph, atom: AtomModel, visited: Set<ItemId>): Array<ItemId> {
    if (visited.has(atom.itemId)) return [];
    else visited.add(atom.itemId);

    const bonds = graph.atomBonds.get(atom) ?? [];
    const relations = bonds.flatMap(bond => findBondRelationsRecursive(graph, bond, visited));
    relations.push(atom.itemId);
    return relations;
  }

  function findBondRelationsRecursive(graph: MoleculeEditorGraph, bond: BondModel, visited: Set<ItemId>): Array<ItemId> {
    if (visited.has(bond.itemId)) return [];
    else visited.add(bond.itemId);

    const atoms = graph.bondAtoms.get(bond) ?? [];
    const relations = atoms.flatMap(atom => findAtomRelationsRecursive(graph, atom, visited));
    relations.push(bond.itemId);
    return relations;
  }
}
