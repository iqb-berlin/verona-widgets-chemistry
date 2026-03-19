import { computed, effect, inject, Injectable, Signal, signal, untracked } from '@angular/core';
import { VeronaWidgetService } from 'verona-widget';
import { PsElement, PsElementNumber } from 'periodic-system-common';
import { MoleculeCanvasTransform } from './molecule-editor.event';
import {
  AtomId,
  FormulaSymbolId,
  ItemId,
  MoleculeEditorModel,
  PartialChargeId,
  ToolMode,
} from './molecule-editor.model';
import { defaultBondingType, editorHistoryCapacity } from './molecule-editor.constants';
import { EditorState } from './molecule-editor.state';
import { BondMultiplicity, FormulaSymbol, PartialCharge, Vector2 } from './molecule-editor.shared';
import { MoleculeEditorGraph } from './molecule-editor.graph';
import { deferPromise, DeferredPromise } from '../util/defer-promise';
import { historySignal } from '../util/history-signal';

export const enum MoleculeEditorParam {
  language = 'LANGUAGE',
  showInfoName = 'SHOW_INFO_NAME',
  showInfoOrder = 'SHOW_INFO_ORDER',
  highlightBlocks = 'HIGHLIGHT_BLOCKS',
}

export const enum MoleculeEditorSharedParam {
  bondingType = 'BONDING_TYPE',
}

export type MoleculeEditorBondingType = 'VALENCE' | 'ELECTRONS';

export interface MoleculeEditorAppearance {
  readonly bondingType: MoleculeEditorBondingType;
}

@Injectable()
export class MoleculeEditorService {
  readonly widgetService = inject(VeronaWidgetService);

  readonly appearance = computeMoleculeEditorAppearance(this.widgetService);

  readonly model = historySignal(MoleculeEditorModel.empty, { capacity: editorHistoryCapacity });
  readonly toolMode = signal<ToolMode>(ToolMode.pointer);
  readonly editorState = signal<EditorState>(EditorState.idle);
  readonly canvasScale = signal(1.0);
  readonly openPicker = signal(false);

  readonly graph = computed(() => MoleculeEditorGraph.createFrom(this.model()));

  private _canvasTransform!: MoleculeCanvasTransform;
  private _currentPickElementPromise?: DeferredPromise<PsElement>;

  constructor() {
    // Initialize editor-model from serialized state when opening widget
    const initialStateData = this.widgetService.stateData();
    this.model.set(parseSerializedEditorModel(initialStateData), false);

    // Effect: PsTable closed without picking an element
    effect(() => {
      if (!this.openPicker()) {
        this._currentPickElementPromise?.reject();
      }
    });

    // Effect: Reset editor-state when tool-mode changes
    effect(() => {
      const toolMode = this.toolMode(); // reset editor-state when tool-mode changes
      const editorState = untracked(this.editorState); // do NOT trigger on editor-state change!

      // special case: selecting multiplicity while adding a bond, set new multiplicity and keep state
      if (toolMode.mode === 'bonding' && editorState.state === 'addingBond') {
        const { multiplicity } = toolMode;
        this.editorState.set({ ...editorState, multiplicity: multiplicity });
      }
      // special case: selecting multiplicity while a bond is selected, set new multiplicity and keep selection
      else if (toolMode.mode === 'bonding' && editorState.state === 'selected') {
        this.model.update((model) => {
          const bond = model.bonds[editorState.itemId];
          return bond ? MoleculeEditorModel.setBondMultiplicity(model, bond.id, toolMode.multiplicity) : model;
        });
      }
      // special case: selecting duplicate/bonding while adding an atom, keep state
      else if ((toolMode.mode === 'duplicate' || toolMode.mode === 'bonding') && editorState.state === 'addingAtom') {
        // Do nothing
      }
      // default case: reset state to idle
      else {
        this.editorState.set(EditorState.idle);
      }
    });

    // Uncomment for debugging: Log state/mode/model changes
    effect(() => console.log('tool mode =', this.toolMode()));
    effect(() => console.log('editor state =', this.editorState()));
    effect(() => console.log('editor model =', this.model()));
  }

  registerCanvasTransform(transform: MoleculeCanvasTransform) {
    this._canvasTransform = transform;
  }

  clearModel() {
    this.model.set(MoleculeEditorModel.empty, true);
    this.editorState.set(EditorState.idle);
  }

  //region Add/pick element

  async pickElementFromTable(): Promise<PsElement> {
    // Create/replace a deferred promise that can be resolved/rejected from other sources
    this._currentPickElementPromise?.reject();
    this._currentPickElementPromise = deferPromise();
    try {
      this.openPicker.set(true);
      return await this._currentPickElementPromise;
    } finally {
      delete this._currentPickElementPromise;
      this.openPicker.set(false);
    }
  }

  dismissElementPicker() {
    this._currentPickElementPromise?.reject();
    this.openPicker.set(false);
  }

  elementPickerCallback(element: PsElement) {
    this._currentPickElementPromise?.resolve(element);
    this.openPicker.set(false);
  }

  addElementToCanvas(element: PsElementNumber, pointerEvent: PointerEvent) {
    const { position } = this._canvasTransform(pointerEvent);
    this.editorState.set(EditorState.addAtom(element, position));
  }

  //endregion
  //region Modify element electrons

  changeSelectedElementAtoms(delta: -1 | 1) {
    const state = this.editorState();
    if (state.state === 'selected') {
      this.model.update((model) => MoleculeEditorModel.changeAtomElectrons(model, state.itemId, delta), true);
    }
  }

  changeSelectedElementFormalCharge(delta: -1 | 1) {
    const state = this.editorState();
    if (state.state === 'selected') {
      this.model.update((model) => MoleculeEditorModel.changeAtomCharge(model, state.itemId, delta), true);
    }
  }

  //endregion
  //region Delete atom/bond/partialCharge

  deleteSelectedItem() {
    const state = this.editorState();
    if (state.state === 'selected') {
      this.model.update((model) => MoleculeEditorModel.deleteItem(model, state.itemId), true);
      this.editorState.set(EditorState.idle);
    }
  }

  //endregion
  //region Canvas pointer events

  handleCanvasEvent(pointerEvent: PointerEvent) {
    const { event, position } = this._canvasTransform(pointerEvent);
    switch (event) {
      case 'move':
        this.handleCanvasMove(position);
        break;
      case 'up':
        this.handleCanvasUp(position);
        break;
      case 'down':
        // Ignore for now - possibly "drag to select area"?
        break;
      case 'click':
        this.handleCanvasClick(position);
        break;
      default:
        console.warn('Unknown canvas event:', event satisfies never);
    }
  }

  private handleCanvasClick(position: Vector2) {
    const mode = this.toolMode();
    const state = this.editorState();

    switch (state.state) {
      case 'idle':
      case 'preMoveAtom':
      case 'movingAtom':
      case 'movingGroup':
      case 'preMoveFormulaSymbol':
      case 'movingFormulaSymbol':
      case 'movingPartialCharge':
        break; // Do nothing
      case 'selected': {
        this.editorState.set(EditorState.idle);
        break;
      }
      case 'addingAtom': {
        const { atomId, elementNr, nextPosition } = this.finishAddAtom(state, position, mode);
        this.editorState.set(EditorState.idle);
        setTimeout(() => this.afterAtomAdded(atomId, elementNr, nextPosition), 0);
        break;
      }
      case 'addingPartialCharge': {
        const result = this.finishAddPartialCharge(state, position);
        if (result) {
          const { id, charge, hoverPos } = result;
          this.editorState.set(EditorState.select(id));
          setTimeout(() => this.afterPartialChargeAdded(charge, hoverPos), 0);
        } else {
          this.editorState.set(EditorState.idle);
        }
        break;
      }
      case 'addingBond': {
        this.editorState.set(EditorState.idle);
        break;
      }
      case 'addingFormulaSymbol': {
        const { symbolId, symbol } = this.finishAddFormulaSymbol(state, position);
        this.editorState.set(EditorState.select(symbolId));
        setTimeout(() => this.afterFormulaSymbolAdded(symbolId, symbol, position), 0);
        break;
      }
      default: {
        const unknownState = state satisfies never;
        console.error('canvas click unknown state:', unknownState);
      }
    }
  }

  private finishAddAtom(state: EditorState.AddingAtom, position: Vector2, mode: ToolMode) {
    const { elementNr, snap } = this.searchSnap({ ...state, hoverPos: position });

    const atomId = ItemId.generate<'Atom'>();
    if (snap) {
      const bondId = ItemId.generate<'Bond'>();
      const multiplicity = mode.mode === 'bonding' ? mode.multiplicity : 1;
      this.model.update((modelBefore) => {
        const modelAfter = MoleculeEditorModel.addAtom(modelBefore, atomId, elementNr, snap.snapPos);
        return MoleculeEditorModel.addBond(modelAfter, bondId, atomId, snap.targetId, multiplicity);
      }, true);
    } else {
      this.model.update((model) => {
        return MoleculeEditorModel.addAtom(model, atomId, elementNr, position);
      }, true);
    }

    const nextPosition = snap ? snap.snapPos : position;
    return { atomId, elementNr, nextPosition } as const;
  }

  private afterAtomAdded(id: AtomId, elementNr: PsElementNumber, position: Vector2) {
    const toolMode = this.toolMode();
    switch (toolMode.mode) {
      case 'pointer': {
        // In pointer-mode, select newly created atom
        this.editorState.set(EditorState.select(id));
        break;
      }
      case 'duplicate':
      case 'bonding': {
        // In duplicate-mode, add another atom of the same element
        this.editorState.set(EditorState.addAtom(elementNr, position));
        break;
      }
    }
  }

  private finishAddPartialCharge(state: EditorState.AddingPartialCharge, position: Vector2) {
    const targetAtomId = this.searchNearestAtomForPartialCharge(position, undefined);
    if (!targetAtomId) return null;

    const { atoms } = this.model();
    const targetAtom = atoms[targetAtomId];
    if (!targetAtom) return null;

    const id = ItemId.generate<'PartialCharge'>();
    const { charge, hoverPos } = state;
    const relativePos = Vector2.sub(hoverPos, targetAtom.position);
    this.model.update((model) => MoleculeEditorModel.addPartialCharge(model, id, targetAtomId, charge, relativePos));

    return { id, charge, hoverPos } as const;
  }

  private afterPartialChargeAdded(charge: PartialCharge, position: Vector2) {
    const toolMode = this.toolMode();
    if (toolMode.mode === 'duplicate') {
      const targetAtomId = this.searchNearestAtomForPartialCharge(position, undefined);
      if (targetAtomId) {
        this.editorState.set(EditorState.addPartialCharge(charge, position, targetAtomId));
      }
    }
  }

  private finishAddFormulaSymbol(state: EditorState.AddingFormulaSymbol, position: Vector2) {
    const symbolId = ItemId.generate<'FormulaSymbol'>();
    this.model.update((model) => MoleculeEditorModel.addFormulaSymbol(model, symbolId, state.symbol, position));
    return { symbolId, symbol: state.symbol } as const;
  }

  private afterFormulaSymbolAdded(symbolId: FormulaSymbolId, symbol: FormulaSymbol, position: Vector2) {
    const toolMode = this.toolMode();
    switch (toolMode.mode) {
      case 'pointer': {
        this.editorState.set(EditorState.select(symbolId));
        break;
      }
      case 'duplicate': {
        this.editorState.set(EditorState.addFormulaSymbol(symbol, position));
        break;
      }
    }
  }

  private handleCanvasMove(position: Vector2) {
    const state = this.editorState();

    switch (state.state) {
      case 'idle':
      case 'selected': {
        break; // Do nothing
      }
      case 'addingAtom': {
        this.editorState.set(this.searchSnap(EditorState.addAtom(state.elementNr, position)));
        break;
      }
      case 'addingFormulaSymbol': {
        this.editorState.set({ ...state, hoverPos: position });
        break;
      }
      case 'addingPartialCharge': {
        const targetAtomId = this.searchNearestAtomForPartialCharge(position, undefined);
        this.editorState.set({ ...state, hoverPos: position, targetAtomId });
        break;
      }
      case 'preMoveAtom':
      case 'movingAtom': {
        this.editorState.set(this.searchSnap(EditorState.moveAtom(state.atomId, position)));
        break;
      }
      case 'preMoveFormulaSymbol':
      case 'movingFormulaSymbol': {
        this.editorState.set(EditorState.moveFormulaSymbol(state, position));
        break;
      }
      case 'movingPartialCharge': {
        const { partialId, targetAtomId: prevTargetAtomId } = state;
        const targetAtomId = this.searchNearestAtomForPartialCharge(position, partialId) ?? prevTargetAtomId;
        this.editorState.set(EditorState.movePartialCharge(partialId, position, targetAtomId));
        break;
      }
      case 'addingBond': {
        this.editorState.set({ ...state, hoverPos: position });
        break;
      }
      case 'movingGroup': {
        this.editorState.set({ ...state, targetPos: position });
        break;
      }
      default: {
        const unknownState = state satisfies never;
        console.error('canvas move unknown state:', unknownState);
      }
    }
  }

  private handleCanvasUp(position: Vector2) {
    const state = this.editorState();
    switch (state.state) {
      case 'idle':
      case 'selected':
      case 'addingAtom':
      case 'addingPartialCharge':
      case 'addingFormulaSymbol':
      case 'addingBond':
        break; // Do nothing
      case 'preMoveAtom':
      case 'preMoveFormulaSymbol': {
        // Cancel pre-movement if up-event occurred before move started
        this.editorState.set(EditorState.idle);
        break;
      }
      case 'movingAtom': {
        const { atomId, snap } = state;
        const finalPosition = snap ? snap.snapPos : position;
        if (snap) {
          const bondId = ItemId.generate<'Bond'>();
          this.model.update((modelBefore) => {
            const modelAfter = MoleculeEditorModel.moveItem(modelBefore, atomId, finalPosition);
            return MoleculeEditorModel.addBond(modelAfter, bondId, atomId, snap.targetId, 1);
          });
        } else {
          this.model.update((model) => MoleculeEditorModel.moveItem(model, atomId, position), true);
        }
        this.editorState.set(EditorState.idle);
        break;
      }
      case 'movingFormulaSymbol': {
        const { symbolId } = state;
        this.model.update((model) => MoleculeEditorModel.moveItem(model, symbolId, position));
        this.editorState.set(EditorState.idle);
        break;
      }
      case 'movingPartialCharge': {
        const { partialId, targetAtomId: prevTargetAtomId, moved } = state;
        this.editorState.set(EditorState.select(partialId));
        if (moved) {
          const targetAtomId = this.searchNearestAtomForPartialCharge(position, partialId) ?? prevTargetAtomId;
          this.model.update((model) => MoleculeEditorModel.movePartialCharge(model, partialId, position, targetAtomId));
        }
        break;
      }
      case 'movingGroup': {
        const moveDelta = Vector2.sub(state.targetPos, state.startPos);
        this.model.update((model) => MoleculeEditorModel.moveGroup(model, moveDelta, state.groupItemIds), true);
        this.editorState.set(EditorState.idle);
        break;
      }
      default: {
        const unknownState = state satisfies never;
        console.error('canvas up unknown state:', unknownState);
      }
    }
  }

  //endregion
  //region Atom pointer events

  handleAtomEvent(atomId: AtomId, pointerEvent: PointerEvent) {
    // stop implicit bubbling
    pointerEvent.stopPropagation();

    // immediately bubble up to canvas for temporary atoms (itemId is not present in model)
    if (this.isTemporaryItem(atomId)) {
      this.handleCanvasEvent(pointerEvent);
      return;
    }

    const { event, position } = this._canvasTransform(pointerEvent);
    switch (event) {
      case 'move':
        this.handleCanvasMove(position); // bubble up to canvas for movement
        break;
      case 'up':
        this.handleAtomUp(atomId, position);
        break;
      case 'down':
        this.handleAtomDown(atomId, position);
        break;
      case 'click':
        this.handleAtomClick(atomId, position);
        break;
      default:
        console.warn(`Unknown atom "${atomId}" event:`, event satisfies never);
    }
  }

  private handleAtomClick(atomId: AtomId, position: Vector2) {
    const state = this.editorState();
    const toolMode = this.toolMode();

    // Special case: Clicking on a second atom while adding a bond will always complete adding the bond
    if (state.state === 'addingBond' && state.startId !== atomId) {
      this.completeAddBond(state.startId, atomId, state.multiplicity);
      return;
    }

    switch (toolMode.mode) {
      case 'pointer': {
        this.toggleAtomSelected(atomId);
        break;
      }
      case 'duplicate': {
        const { atoms } = this.model();
        const atom = atoms[atomId];
        if (atom) this.editorState.set(EditorState.addAtom(atom.elementNr, position));
        break;
      }
    }
  }

  private toggleAtomSelected(id: AtomId) {
    const state = this.editorState();
    if (state.state === 'selected' && state.itemId === id) {
      this.editorState.set(EditorState.idle);
    } else if (state.state === 'preMoveAtom' && state.atomId === id) {
      this.editorState.set(EditorState.idle);
    } else {
      this.editorState.set(EditorState.select(id));
    }
  }

  private beginGroupMove(pivotItemId: ItemId, startPos: Vector2) {
    const graph = this.graph();
    const groupItemIds = MoleculeEditorGraph.findGroup(graph, pivotItemId);
    if (groupItemIds.length > 0) {
      this.editorState.set(EditorState.groupMove(startPos, groupItemIds));
    }
  }

  private handleAtomUp(atomId: AtomId, position: Vector2) {
    const state = this.editorState();
    switch (state.state) {
      case 'addingBond': {
        if (state.startId !== atomId) {
          this.completeAddBond(state.startId, atomId, state.multiplicity);
        }
        break;
      }
      default:
        this.handleCanvasUp(position); // bubble up to canvas for pointer-up
    }
  }

  private handleAtomDown(atomId: AtomId, position: Vector2) {
    const state = this.editorState();
    const toolMode = this.toolMode();
    switch (toolMode.mode) {
      case 'pointer': {
        this.editorState.set(EditorState.prepareMoveAtom(atomId));
        break;
      }
      case 'duplicate': {
        // Do nothing ("click" is used for duplicating)
        break;
      }
      case 'bonding': {
        // In bonding tool-mode, go to add-bond state if not already bonding or on the already bonding atom
        // (See handleAtomClick for add-bond state completion)
        if (state.state !== 'addingBond' || state.startId === atomId) {
          this.editorState.set(EditorState.addBond(atomId, toolMode.multiplicity, position));
        }
        break;
      }
      case 'groupMove': {
        this.beginGroupMove(atomId, position);
        break;
      }
    }
  }

  private completeAddBond(startId: AtomId, endId: AtomId, mul: BondMultiplicity) {
    const bondId = ItemId.generate<'Bond'>();
    this.model.update((model) => MoleculeEditorModel.addBond(model, bondId, startId, endId, mul));
    this.editorState.set(EditorState.idle);
  }

  //endregion
  //region Bond pointer events

  handleBondEvent(bondId: ItemId, pointerEvent: PointerEvent) {
    // stop implicit bubbling
    pointerEvent.stopPropagation();

    // bubble up to canvas for temporary bonds (itemId not present in model)
    if (this.isTemporaryItem(bondId)) {
      this.handleCanvasEvent(pointerEvent);
      return;
    }

    const { event, position } = this._canvasTransform(pointerEvent);
    switch (event) {
      case 'up':
      case 'move':
      case 'down':
        this.handleCanvasEvent(pointerEvent); // bubble up to canvas
        break;
      case 'click':
        this.handleBondClick(bondId, position);
        break;
    }
  }

  private handleBondClick(bondId: ItemId, position: Vector2) {
    const mode = this.toolMode();
    switch (mode.mode) {
      case 'pointer':
        this.toggleBondSelected(bondId);
        break;
      case 'bonding':
        this.model.update((model) => MoleculeEditorModel.setBondMultiplicity(model, bondId, mode.multiplicity));
        break;
    }
  }

  private toggleBondSelected(bondId: ItemId) {
    // Toggle bond selected
    const state = this.editorState();
    if (state.state === 'selected' && state.itemId === bondId) {
      this.editorState.set(EditorState.idle);
    } else {
      this.editorState.set(EditorState.select(bondId));
    }
  }

  //endregion
  //region Formula-symbol events

  addFormulaSymbolToCanvas(symbol: FormulaSymbol, pointerEvent: PointerEvent) {
    const { position } = this._canvasTransform(pointerEvent);
    this.editorState.set(EditorState.addFormulaSymbol(symbol, position));
  }

  handleFormulaSymbolEvent(symbolId: FormulaSymbolId, pointerEvent: PointerEvent) {
    // stop implicit bubbling
    pointerEvent.stopPropagation();

    // immediately bubble up to canvas for temporary atoms (itemId is not present in model)
    if (this.isTemporaryItem(symbolId)) {
      this.handleCanvasEvent(pointerEvent);
      return;
    }

    // transform and handle event
    const toolMode = this.toolMode();
    const { event, position } = this._canvasTransform(pointerEvent);
    switch (event) {
      case 'move':
        this.handleCanvasMove(position); // bubble up to canvas for movement
        break;
      case 'up': {
        this.handleCanvasUp(position); // bubble up to canvas for mouse-up
        break;
      }
      case 'down': {
        switch (toolMode.mode) {
          case 'pointer':
            this.editorState.set(EditorState.prepareMoveFormulaSymbol(symbolId));
            break;
          case 'duplicate':
            break; // duplication handled in click
          case 'groupMove':
            this.beginGroupMove(symbolId, position);
            break;
          case 'bonding':
            break; // do nothing
        }
        break;
      }
      case 'click': {
        switch (toolMode.mode) {
          case 'pointer': {
            this.editorState.set(EditorState.select(symbolId));
            break;
          }
          case 'duplicate': {
            const model = this.model();
            const symbol = model.symbols[symbolId]?.symbol ?? FormulaSymbol.ReactionPlus;
            this.editorState.set(EditorState.addFormulaSymbol(symbol, position));
            break;
          }
          case 'groupMove':
          case 'bonding':
            break; // not applicable
        }
        break;
      }
      default:
        console.warn(`Unknown formula-symbol "${symbolId}" event:`, event satisfies never);
    }
  }

  //endregion
  //region Partial-charge events

  addPartialCharge(charge: PartialCharge, pointerEvent: PointerEvent) {
    const { position } = this._canvasTransform(pointerEvent);
    const targetAtomId = this.searchNearestAtomForPartialCharge(position, undefined);
    this.editorState.set(EditorState.addPartialCharge(charge, position, targetAtomId));
  }

  handlePartialChargeEvent(partialId: PartialChargeId, pointerEvent: PointerEvent) {
    // stop implicit bubbling
    pointerEvent.stopPropagation();

    // immediately bubble up to canvas for temporary partial-charges (itemId is not present in model)
    if (this.isTemporaryItem(partialId)) {
      this.handleCanvasEvent(pointerEvent);
      return;
    }

    const model = this.model();
    const toolMode = this.toolMode();
    const { event, position } = this._canvasTransform(pointerEvent);
    switch (event) {
      case 'move': {
        this.handleCanvasMove(position);
        break;
      }
      case 'up': {
        this.handleCanvasUp(position);
        break;
      }
      case 'down': {
        switch (toolMode.mode) {
          case 'pointer': {
            const partial = model.partials[partialId];
            if (partial) {
              const atom = model.atoms[partial.targetAtomId];
              if (atom) {
                const startPos = Vector2.add(atom.position, partial.relativePosition);
                this.editorState.set(EditorState.preMovePartialCharge(partialId, startPos));
              }
            }
            break;
          }
          case 'duplicate': {
            const partial = model.partials[partialId];
            if (partial) {
              const targetAtomId = this.searchNearestAtomForPartialCharge(position, undefined);
              this.editorState.set(EditorState.addPartialCharge(partial.charge, position, targetAtomId));
            }
            break;
          }
          case 'groupMove': {
            this.beginGroupMove(partialId, position);
            break;
          }
          case 'bonding':
            break; // not applicable
        }
        break;
      }
      case 'click': {
        this.editorState.set(EditorState.select(partialId));
        break;
      }
    }
  }

  private searchNearestAtomForPartialCharge(
    searchPosition: Vector2,
    existingId: undefined | PartialChargeId,
  ): undefined | AtomId {
    const { atomIdsWithoutPartialCharge } = this.graph();
    const { atoms, partials } = this.model();

    const existing = existingId ? partials[existingId] : undefined;
    const prevTargetAtomId = existing?.targetAtomId;

    let minDist = Number.POSITIVE_INFINITY;
    let nearestAtomId: undefined | AtomId;
    for (const atomKey in atoms) {
      const atomId = atomKey as AtomId;
      if (atomId === prevTargetAtomId || atomIdsWithoutPartialCharge.has(atomId)) {
        const atom = atoms[atomId];
        const dist = Vector2.distance(atom.position, searchPosition);
        if (dist > 100) continue;
        if (dist < minDist) {
          minDist = dist;
          nearestAtomId = atomId;
        }
      }
    }
    return nearestAtomId;
  }

  //endregion

  private isTemporaryItem(itemId: ItemId) {
    const model = this.model();
    return (
      !(itemId in model.atoms) && !(itemId in model.bonds) && !(itemId in model.symbols) && !(itemId in model.partials)
    );
  }

  private searchSnap<S extends EditorState.Substate<'addingAtom' | 'movingAtom'>>(state: S): S {
    const graph = this.graph();
    return EditorState.searchSnap(state, graph);
  }
}

function computeMoleculeEditorAppearance(widgetService: VeronaWidgetService): Signal<MoleculeEditorAppearance> {
  return computed((): MoleculeEditorAppearance => {
    const config = widgetService.configuration();

    const { [MoleculeEditorSharedParam.bondingType]: bondingType = defaultBondingType } = config.sharedParameters;

    return {
      bondingType: parseBondingType(bondingType),
    };
  });
}

function parseBondingType(value: string): MoleculeEditorBondingType {
  if (!value) {
    return defaultBondingType;
  }
  switch (value.toUpperCase()) {
    case 'VALENCE':
      return 'VALENCE';
    case 'ELECTRONS':
      return 'ELECTRONS';
    default:
      console.warn(`Received unknown ${MoleculeEditorSharedParam.bondingType} parameter:`, value);
      return defaultBondingType;
  }
}

function parseSerializedEditorModel(initialStateData: string): MoleculeEditorModel {
  if (!initialStateData) {
    return MoleculeEditorModel.empty;
  }
  try {
    const data = JSON.parse(initialStateData);
    if (data === null || typeof data !== 'object') {
      return MoleculeEditorModel.empty;
    }
    console.log('Parsing JSON editor-model state data:', data);
    const atoms = data.atoms ?? {};
    const bonds = data.bonds ?? {};
    const partials = data.partials ?? {};
    const symbols = data.symbols ?? {};
    return { atoms, bonds, symbols, partials };
  } catch (e) {
    console.warn('Received invalid JSON editor-model state data:', initialStateData);
    return MoleculeEditorModel.empty;
  }
}
