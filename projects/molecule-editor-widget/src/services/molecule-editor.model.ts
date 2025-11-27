import { Nominal, PsElement, PsElementNumber } from 'periodic-system-common';
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
  | { readonly state: 'selected', readonly itemId: ItemId }
  | { readonly state: 'addingAtom', readonly element: PsElement, readonly hoverPosition: Vector2 }
  | { readonly state: 'preMoveAtom', readonly itemId: ItemId }
  | { readonly state: 'movingAtom', readonly itemId: ItemId, readonly targetPosition: Vector2 }
  | {
  readonly state: 'addingBond',
  readonly startId: ItemId,
  readonly multiplicity: BondMultiplicity,
  readonly hoverPosition: Vector2
}
  ;

export type ItemId = Nominal<string, 'ItemId'>

export namespace ItemId {
  export const temporaryAdd = 'tmp:add' as ItemId;
  export const temporaryMove = 'tmp:move' as ItemId;
}

export function uniqueItemId() {
  const randomValue = Math.random().toString(36);
  const randomItemId = randomValue.replace('0.', 'item:');
  return randomItemId as ItemId;
}

type ReadonlyRecord<K extends PropertyKey, T> = Readonly<Record<K, T>>

export interface MoleculeEditorModel {
  readonly items: ReadonlyRecord<ItemId, ItemModel>;
  readonly elementElectrons: ReadonlyRecord<PsElementNumber, number>;
}

export interface ModelBase<T extends string> {
  readonly type: T;
  readonly itemId: ItemId;
}

export interface AtomModel extends ModelBase<'Atom'> {
  readonly position: Vector2;
  readonly element: PsElement;
}

export interface BondModel extends ModelBase<'Bond'> {
  readonly leftAtomId: ItemId;
  readonly rightAtomId: ItemId;
  readonly multiplicity: BondMultiplicity;
}

export type ItemModel =
  | AtomModel
  | BondModel
  ;

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
    items: {},
    elementElectrons: {},
  } as const;

  export const addAtom = produce<MoleculeEditorModel, [ItemId, PsElement, Vector2]>((model, atomId, element, position) => {
    model.items[atomId] = {
      type: 'Atom',
      itemId: atomId,
      element,
      position: v2(position),
    } satisfies AtomModel;
  });

  export const moveAtom = produce<MoleculeEditorModel, [ItemId, Vector2]>((model, atomId, position) => {
    const atom = model.items[atomId];
    if (atom && atom.type === 'Atom') {
      atom.position = v2(position);
    }
  });

  export const addBond = produce<MoleculeEditorModel, [ItemId, ItemId, ItemId, BondMultiplicity]>(
    (model, bondId, leftAtomId, rightAtomId, multiplicity) => {
      // Remove existing bonds, if any already exists for the given atoms
      for (const item of Object.values(model.items)) {
        if (item.type === 'Bond') {
          if (item.leftAtomId === leftAtomId && item.rightAtomId === rightAtomId) {
            delete model.items[item.itemId];
          }
          if (item.leftAtomId === rightAtomId && item.rightAtomId === leftAtomId) {
            delete model.items[item.itemId];
          }
        }
      }

      // Add new bond
      model.items[bondId] = {
        type: 'Bond',
        itemId: bondId,
        leftAtomId,
        rightAtomId,
        multiplicity,
      } satisfies BondModel;
    },
  );

  export const deleteItem = produce<MoleculeEditorModel, [ItemId]>((model, itemId) => {
    // Lookup item to be deleted
    const deletedItem = model.items[itemId];
    if (!deletedItem) return;

    // Delete item from model
    delete model.items[itemId];

    // Delete dependencies from model
    switch (deletedItem.type) {
      case 'Atom': {
        // Delete bonds connected to deleted atom
        for (const [dependencyKey, dependencyItem] of Object.entries(model.items)) {
          const dependencyId = dependencyKey as ItemId;
          if (dependencyItem.type === 'Bond') {
            if (dependencyItem.leftAtomId === itemId || dependencyItem.rightAtomId === itemId) {
              delete model.items[dependencyId];
            }
          }
        }
        break;
      }
      case 'Bond': {
        // No dependencies
        break;
      }
      default: {
        const unknownItem: never = deletedItem;
        console.warn('Deleted unknown item:', unknownItem);
        break;
      }
    }
  });

  export const setElementElectrons = produce<MoleculeEditorModel, [PsElement, number]>((model, element, electrons) => {
    model.elementElectrons[element.number] = electrons;
  });
}

export namespace EditorState {
  export const idle = { state: 'idle' } as const satisfies EditorState;

  export function select(itemId: ItemId) {
    return { state: 'selected', itemId } as const satisfies EditorState;
  }

  export function addAtom(element: PsElement, hoverPosition: Vector2) {
    return { state: 'addingAtom', element, hoverPosition } as const satisfies EditorState;
  }

  export function prepareMoveAtom(itemId: ItemId) {
    return { state: 'preMoveAtom', itemId } as const satisfies EditorState;
  }

  export function moveAtom(itemId: ItemId, targetPosition: Vector2) {
    return { state: 'movingAtom', itemId, targetPosition } as const satisfies EditorState;
  }

  export function addBond(startId: ItemId, multiplicity: BondMultiplicity, hoverPosition: Vector2) {
    return { state: 'addingBond', startId, multiplicity, hoverPosition } as const satisfies EditorState;
  }

  export function isMovingAtom(state: EditorState, atomId: ItemId): state is (EditorState & { state: 'movingAtom' }) {
    return state.state === 'movingAtom' && state.itemId === atomId;
  }

  export function isItemSelected(state: EditorState, atomId: ItemId): state is (EditorState & { state: 'selected' }) {
    return state.state === 'selected' && state.itemId === atomId;
  }
}
