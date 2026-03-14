import type { PsElementNumber } from 'periodic-system-common';
import type { AtomId, AtomModel, FormulaSymbolId, ItemId, MoleculeEditorGraph } from './molecule-editor.model';
import { BondMultiplicity, Vector2 } from './molecule-editor.shared';
import { snapProximityRadius, snapRadius } from './molecule-editor.constants';

/** Possible active states of the molecule editor */
export type EditorState =
  | EditorState.Idle
  | EditorState.ItemSelected
  | EditorState.AddingAtom
  | EditorState.PreMoveAtom
  | EditorState.MovingAtom
  | EditorState.AddingBond
  | EditorState.MovingGroup
  | EditorState.PreMoveOther
  | EditorState.MovingOther;

// --- EditorState types and variants ---

export namespace EditorState {
  interface StateBase<T extends string> {
    readonly state: T;
  }

  /** Editor is idle, no specific action is being taken */
  export interface Idle extends StateBase<'idle'> {}

  /** An item has been selected */
  export interface ItemSelected extends StateBase<'selected'> {
    readonly itemId: ItemId;
  }

  /** A new atom is hovering, ready to be added to the canvas */
  export interface AddingAtom extends StateBase<'addingAtom'> {
    readonly elementNr: PsElementNumber;
    readonly hoverPos: Vector2;
    readonly snap: undefined | AtomSnap;
  }

  /** Data structure representing an atom being available to snap to a target position */
  export interface AtomSnap {
    readonly targetId: AtomId;
    readonly snapPos: Vector2;
  }

  /**
   * Atom has been clicked, but not yet moved
   * (state used to disambiguate clicking on atoms for selection, or clicking and dragging for movement)
   */
  export interface PreMoveAtom extends StateBase<'preMoveAtom'> {
    readonly atomId: AtomId;
  }

  /** An atom is currently being moved, and a potential snap may be available */
  export interface MovingAtom extends StateBase<'movingAtom'> {
    readonly atomId: AtomId;
    readonly targetPos: Vector2;
    readonly snap: undefined | AtomSnap;
  }

  /** A new bond is currently being added, attached to a starting atom and hovering at a specific position */
  export interface AddingBond extends StateBase<'addingBond'> {
    readonly startId: AtomId;
    readonly hoverPos: Vector2;
    readonly multiplicity: BondMultiplicity;
  }

  /** A group of atoms connected by bonds (i.e. a molecule) is being moved together */
  export interface MovingGroup extends StateBase<'movingGroup'> {
    readonly startPos: Vector2;
    readonly targetPos: Vector2;
    readonly groupItemIds: ReadonlyArray<ItemId>;
  }

  /** An object other than an atom is either about to be moved, or clicked on for selection */
  // NOTE: Currently, only Formula Symbols can be moved; other objects might be added here in the future
  export interface PreMoveOther extends StateBase<'preMoveOther'> {
    readonly moveType: 'FormulaSymbol';
    readonly itemId: FormulaSymbolId;
  }

  export interface MovingOther extends StateBase<'movingOther'> {
    readonly moveType: 'FormulaSymbol';
    readonly itemId: FormulaSymbolId;
    readonly targetPos: Vector2;
  }
}

// --- EditorState values and functions ---

export namespace EditorState {
  export const idle = { state: 'idle' } as const satisfies EditorState;

  export function select(itemId: ItemId) {
    return { state: 'selected', itemId } as const satisfies EditorState;
  }

  export function addAtom(elementNr: PsElementNumber, hoverPos: Vector2) {
    return { state: 'addingAtom', elementNr, hoverPos, snap: undefined } as const satisfies EditorState;
  }

  export function prepareMoveAtom(atomId: AtomId) {
    return { state: 'preMoveAtom', atomId } as const satisfies EditorState;
  }

  export function moveAtom(atomId: AtomId, targetPos: Vector2) {
    return { state: 'movingAtom', atomId, targetPos, snap: undefined } as const satisfies EditorState;
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

  export type Substate<S extends EditorState['state']> = EditorState & { state: S };

  export function isMovingAtom(state: EditorState, atomId: ItemId): state is Substate<'movingAtom' | 'movingGroup'> {
    return (
      (state.state === 'movingAtom' && state.atomId === atomId) ||
      (state.state === 'movingGroup' && state.groupItemIds.includes(atomId))
    );
  }

  export function isItemSelected(state: EditorState, atomId: ItemId): state is Substate<'selected'> {
    return state.state === 'selected' && state.itemId === atomId;
  }

  export function isItemBondTargeted(state: EditorState, itemId: ItemId): state is Substate<'addingBond'> {
    return state.state === 'addingBond' && state.startId === itemId;
  }

  export function isItemSnapTargeted(state: EditorState, itemId: ItemId): boolean {
    return (state.state === 'addingAtom' || state.state === 'movingAtom') && state.snap?.targetId === itemId;
  }

  export function searchSnap<S extends Substate<'addingAtom' | 'movingAtom'>>(state: S, graph: MoleculeEditorGraph): S {
    const position = state.state === 'addingAtom' ? state.hoverPos : state.targetPos;
    const excludeId = state.state === 'addingAtom' ? undefined : state.atomId;
    const snap = findAtomSnapTarget(position, excludeId, graph);
    return { ...state, snap };
  }

  function findAtomSnapTarget(
    position: Vector2,
    excludeId: AtomId | undefined,
    graph: MoleculeEditorGraph,
  ): undefined | AtomSnap {
    // Find atom with the least distance, within proximity radius
    let targetAtom: undefined | AtomModel;
    let minDistance = Number.POSITIVE_INFINITY;
    for (const [atom, atomBonds] of graph.atomBonds.entries()) {
      // Exclude target atom, or atoms bonded to target atom
      if (excludeId) {
        if (atom.itemId === excludeId) {
          continue;
        }
        if (atomBonds.some((bond) => bond.leftAtomId === excludeId || bond.rightAtomId === excludeId)) {
          continue;
        }
      }

      const distance = Vector2.distance(position, atom.position);
      if (distance < snapProximityRadius && distance < minDistance) {
        minDistance = distance;
        targetAtom = atom;
      }
    }
    if (!targetAtom) {
      return undefined;
    }

    // Find snapping position on horizontal/vertical axis
    const [deltaX, deltaY] = Vector2.sub(position, targetAtom.position);
    const horizontal = Math.abs(deltaX) > Math.abs(deltaY);
    const snapOffset = horizontal
      ? ([Math.sign(deltaX) * snapRadius, 0] as const)
      : ([0, Math.sign(deltaY) * snapRadius] as const);

    // Snap to x/y axis
    return {
      targetId: targetAtom.itemId,
      snapPos: Vector2.add(targetAtom.position, snapOffset),
    };
  }
}
