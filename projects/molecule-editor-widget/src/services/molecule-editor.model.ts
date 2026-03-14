import { Nominal, PsElementNumber } from 'periodic-system-common';
import { BondMultiplicity, FormulaSymbol, Vector2 } from './molecule-editor.shared';
import { castDraft, produce, WritableDraft } from 'immer';

// --- Model data-types ---

/** Tools available in the editor */
export type ToolMode =
  | { readonly mode: 'pointer' }
  | { readonly mode: 'duplicate' }
  | { readonly mode: 'groupMove' }
  | { readonly mode: 'bonding'; readonly multiplicity: BondMultiplicity };

/** Union literal of known item types */
export type ItemType = 'Atom' | 'Bond' | 'FormulaSymbol' | 'PartialCharge';

/** Nominal identifier type of model items */
export type ItemId = Nominal<string, 'ItemId'>;

/** Declared marker symbol for ItemId subtype branding */
declare const itemType: unique symbol;

type ItemIdSubtype<T extends ItemType> = ItemId & { [itemType]: T };

export type AtomId = ItemIdSubtype<'Atom'>;
export type BondId = ItemIdSubtype<'Bond'>;
export type FormulaSymbolId = ItemIdSubtype<'FormulaSymbol'>;

type ReadonlyRecord<K extends PropertyKey, T> = Readonly<Record<K, T>>;

/** Core model representing content of the molecule-editor */
export interface MoleculeEditorModel {
  readonly atoms: ReadonlyRecord<ItemId, AtomModel>;
  readonly bonds: ReadonlyRecord<ItemId, BondModel>;
  readonly symbols: ReadonlyRecord<ItemId, FormulaSymbolModel>;
}

/** Properties shared among all model data-structures */
interface ModelBase<T extends ItemType> {
  readonly type: T;
  readonly itemId: ItemIdSubtype<T>;
}

/** Atom model data-structure, representing an instance of a specific element */
export interface AtomModel extends ModelBase<'Atom'> {
  readonly position: Vector2;
  readonly elementNr: PsElementNumber;
  readonly electrons: number;
  readonly formalCharge: number;
}

/** Bond model data-structure, representing a single-, double-, or triple-bond between two atoms */
export interface BondModel extends ModelBase<'Bond'> {
  readonly leftAtomId: AtomId;
  readonly rightAtomId: AtomId;
  readonly multiplicity: BondMultiplicity;
}

/** Formula-symbol data-structure, representing a chemical formula symbol placed on the canvas */
export interface FormulaSymbolModel extends ModelBase<'FormulaSymbol'> {
  readonly position: Vector2;
  readonly symbol: FormulaSymbol;
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
  const ITEM_PREFIX = 'item:';
  const TEMP_PREFIX = 'tmp:';

  /** Item IDs ""item:..." are generated from random numbers */
  export function generate<T extends ItemType>(): ItemIdSubtype<T> {
    const randomValue = Math.random().toString(36);
    const randomItemId = randomValue.replace('0.', ITEM_PREFIX);
    return randomItemId as ItemIdSubtype<T>;
  }

  export const tmpAddAtom = (TEMP_PREFIX + 'addAtom') as AtomId;
  export const tmpAddBond = (TEMP_PREFIX + 'addBond') as BondId;

  export function tmpMoveAtom(atomId: AtomId): AtomId {
    return (TEMP_PREFIX + 'moveAtom:' + atomId) as AtomId;
  }

  export function isTemporaryId(id: ItemId): boolean {
    return id.startsWith('tmp:');
  }
}

export namespace MoleculeEditorModel {
  export const empty: MoleculeEditorModel = {
    atoms: {},
    bonds: {},
    symbols: {},
  } as const;

  export const addAtom = produce<MoleculeEditorModel, [AtomId, PsElementNumber, Vector2]>(
    (model, atomId, elementNr, position) => {
      model.atoms[atomId] = {
        type: 'Atom',
        itemId: atomId,
        elementNr,
        position: castDraft(position),
        electrons: 0,
        formalCharge: 0,
      } satisfies AtomModel;
    },
  );

  export const moveAtom = produce<MoleculeEditorModel, [AtomId, Vector2]>((model, atomId, position) => {
    const atom = model.atoms[atomId];
    if (atom) atom.position = castDraft(position);
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

  export const changeAtomCharge = produce<MoleculeEditorModel, [atomId: ItemId, delta: number]>(
    (model, atomId, delta) => {
      const atom = model.atoms[atomId];
      if (atom) {
        atom.formalCharge = limitFormalCharge(atom.formalCharge + delta);
      }
    },
  );

  export const deleteItem = produce<MoleculeEditorModel, [ItemId]>((model, itemId) => {
    const atom = model.atoms[itemId];
    delete model.atoms[itemId];
    delete model.bonds[itemId];
    delete model.symbols[itemId];

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
  export const ATOM_TOTAL_MIN_FORMAL_CHARGE = -3;
  export const ATOM_TOTAL_MAX_FORMAL_CHARGE = +3;

  function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  // Helper function determining the maximum allowed number of electrons an atom is allowed to have.
  // Outer electrons are limited to `8 - sum(bond.multiplicity for bond where bond.left == atom or bond.right == atom)`
  function limitAtomElectrons(model: MoleculeEditorModel, atom: AtomModel, electrons: number): number {
    const occupiedByBonds = Object.values(model.bonds)
      .filter((bond) => bond.leftAtomId === atom.itemId || bond.rightAtomId === atom.itemId)
      .reduce((sum, bond) => sum + bond.multiplicity, 0);

    const maxElectrons = ATOM_TOTAL_MAX_ELECTRONS - occupiedByBonds;
    return clamp(electrons, 0, maxElectrons);
  }

  // Helper function trimming excess electrons from atoms connected by a given bond
  function trimBondConnectedAtomElectrons(model: WritableDraft<MoleculeEditorModel>, bond: BondModel) {
    const { [bond.leftAtomId]: leftAtom, [bond.rightAtomId]: rightAtom } = model.atoms;
    if (leftAtom) leftAtom.electrons = limitAtomElectrons(model, leftAtom, leftAtom.electrons);
    if (rightAtom) rightAtom.electrons = limitAtomElectrons(model, rightAtom, rightAtom.electrons);
  }

  function limitFormalCharge(formalCharge: number): number {
    return clamp(formalCharge, ATOM_TOTAL_MIN_FORMAL_CHARGE, ATOM_TOTAL_MAX_FORMAL_CHARGE);
  }
}

export namespace ToolMode {
  export const pointer = { mode: 'pointer' } as const satisfies ToolMode;
  export const duplicate = { mode: 'duplicate' } as const satisfies ToolMode;
  export const groupMove = { mode: 'groupMove' } as const satisfies ToolMode;

  export function bonding(multiplicity: BondMultiplicity) {
    return { mode: 'bonding', multiplicity } as const satisfies ToolMode;
  }
}

export namespace MoleculeEditorGraph {
  export function createFrom(model: MoleculeEditorModel): MoleculeEditorGraph {
    const itemIndex = new Map<ItemId, AtomModel | BondModel>();
    const atomBonds = new Map<AtomModel, Array<BondModel>>();
    const bondAtoms = new Map<BondModel, [AtomModel, AtomModel]>();

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
    } else
      switch (pivotItem.type) {
        case 'Atom':
          return findAtomRelationsRecursive(graph, pivotItem, new Set());
        case 'Bond':
          return findBondRelationsRecursive(graph, pivotItem, new Set());
        default:
          console.error('Unknown pivot item: ', pivotItem satisfies never);
          return [];
      }
  }

  function findAtomRelationsRecursive(
    graph: MoleculeEditorGraph,
    atom: AtomModel,
    visited: Set<ItemId>,
  ): Array<ItemId> {
    if (visited.has(atom.itemId)) return [];
    else visited.add(atom.itemId);

    const bonds = graph.atomBonds.get(atom) ?? [];
    const relations = bonds.flatMap((bond) => findBondRelationsRecursive(graph, bond, visited));
    relations.push(atom.itemId);
    return relations;
  }

  function findBondRelationsRecursive(
    graph: MoleculeEditorGraph,
    bond: BondModel,
    visited: Set<ItemId>,
  ): Array<ItemId> {
    if (visited.has(bond.itemId)) return [];
    else visited.add(bond.itemId);

    const atoms = graph.bondAtoms.get(bond) ?? [];
    const relations = atoms.flatMap((atom) => findAtomRelationsRecursive(graph, atom, visited));
    relations.push(bond.itemId);
    return relations;
  }
}
