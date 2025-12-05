import { computed, effect, inject, Injectable, Signal, signal, untracked } from '@angular/core';
import { VeronaWidgetService } from 'verona-widget';
import { PsElement, PsElementNumber } from 'periodic-system-common';
import { MoleculeCanvasTransform } from './molecule-editor.event';
import {
  AtomId,
  BondMultiplicity,
  EditorState,
  ItemId,
  MoleculeEditorGraph,
  MoleculeEditorModel,
  ToolMode,
  Vector2,
} from './molecule-editor.model';
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

export const enum MoleculeEditorBondingType {
  valence = 'VALENCE',
  electrons = 'ELECTRONS',
}

export interface MoleculeEditorAppearance {
  readonly bondingType: MoleculeEditorBondingType;
}

const editorHistoryCapacity = 100;

@Injectable()
export class MoleculeEditorService {
  readonly widgetService = inject(VeronaWidgetService);

  readonly appearance = computeMoleculeEditorAppearance(this.widgetService);

  readonly model = historySignal(MoleculeEditorModel.empty, { capacity: editorHistoryCapacity });
  readonly toolMode = signal<ToolMode>(ToolMode.pointer);
  readonly editorState = signal<EditorState>(EditorState.idle);
  readonly openPicker = signal(false);

  readonly graph = computed(() => MoleculeEditorGraph.createFrom(this.model()));

  private _canvasTransform!: MoleculeCanvasTransform;
  private _currentPickElementPromise?: DeferredPromise<PsElement>;

  constructor() {
    effect(() => {
      // PsTable closed without picking an element
      if (!this.openPicker()) {
        this._currentPickElementPromise?.reject();
      }
    });

    effect(() => {
      // Reset editor-state when tool-mode changes
      const toolMode = this.toolMode(); // reset editor-state when tool-mode changes
      const editorState = untracked(this.editorState); // do NOT trigger on editor-state change!

      // special case: selecting multiplicity while adding a bond, set new multiplicity and keep state
      if (toolMode.mode === 'bonding' && editorState.state === 'addingBond') {
        const { multiplicity } = toolMode;
        this.editorState.set({ ...editorState, multiplicity: multiplicity });
      }
      // special case: selecting multiplicity while a bond is selected, set new multiplicity and keep selection
      else if (toolMode.mode === 'bonding' && editorState.state === 'selected') {
        const { bonds } = untracked(this.model);
        const bond = bonds[editorState.itemId];
        if (bond) {
          this.model.update((model) =>
            MoleculeEditorModel.setBondMultiplicity(model, bond.itemId, toolMode.multiplicity),
          );
        }
      }
      // special case: selecting duplicate while adding an atom, keep state
      else if (toolMode.mode === 'duplicate' && editorState.state === 'addingAtom') {
        // Do nothing
      }
      // default case: reset state to idle
      else {
        this.editorState.set(EditorState.idle);
      }
    });

    //effect(() => console.log('tool mode =', this.toolMode()));
    //effect(() => console.log('editor state =', this.editorState()));
    //effect(() => console.log('editor model =', this.model()));
  }

  registerCanvasTransform(transform: MoleculeCanvasTransform) {
    this._canvasTransform = transform;
  }

  clearModel() {
    this.editorState.set(EditorState.idle);
    this.model.set(MoleculeEditorModel.empty, true);
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
      this.model.update((model) => MoleculeEditorModel.changeAtomElectrons(model, state.itemId, delta));
    }
  }

  //endregion
  //region Delete atom/bond

  deleteSelectedItem() {
    const state = this.editorState();
    if (state.state === 'selected') {
      this.model.update((model) => MoleculeEditorModel.deleteItem(model, state.itemId));
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
    const state = this.editorState();
    switch (state.state) {
      case 'selected':
        this.editorState.set(EditorState.idle);
        break;
      case 'addingAtom': {
        const { elementNr } = state;
        const atomId = ItemId.generate<'Atom'>();
        this.model.update((model) => MoleculeEditorModel.addAtom(model, atomId, elementNr, position), true);
        this.editorState.set(EditorState.idle);
        setTimeout(() => this.afterAtomAdded(atomId, elementNr, position), 0);
        break;
      }
      case 'addingBond': {
        this.editorState.set(EditorState.idle);
        break;
      }
    }
  }

  private afterAtomAdded(id: AtomId, elementNr: PsElementNumber, position: Vector2) {
    const toolMode = this.toolMode();
    switch (toolMode.mode) {
      case 'pointer':
        // In pointer-mode, select newly created atom
        this.editorState.set(EditorState.select(id));
        break;
      case 'duplicate':
        // In duplicate-mode, add another atom of the same element
        this.editorState.set(EditorState.addAtom(elementNr, position));
        break;
      case 'bonding':
        this.editorState.set(EditorState.addBond(id, toolMode.multiplicity, position));
        break;
    }
  }

  private handleCanvasMove(position: Vector2) {
    const state = this.editorState();
    switch (state.state) {
      case 'addingAtom':
        this.editorState.set(EditorState.addAtom(state.elementNr, position));
        break;
      case 'preMoveAtom':
      case 'movingAtom':
        this.editorState.set(EditorState.moveAtom(state.atomId, position));
        break;
      case 'addingBond':
        this.editorState.set({ ...state, hoverPos: position });
        break;
      case 'movingGroup':
        this.editorState.set({ ...state, targetPos: position });
        break;
    }
  }

  private handleCanvasUp(position: Vector2) {
    const state = this.editorState();
    switch (state.state) {
      case 'preMoveAtom':
        this.editorState.set(EditorState.idle);
        break;
      case 'movingAtom':
        this.model.update((model) => MoleculeEditorModel.moveAtom(model, state.atomId, position), true);
        this.editorState.set(EditorState.idle);
        break;
      case 'movingGroup': {
        const moveDelta = Vector2.sub(state.targetPos, state.startPos);
        this.model.update(model => MoleculeEditorModel.moveGroup(model, moveDelta, state.groupItemIds), true);
        this.editorState.set(EditorState.idle);
        break;
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
        if (state.startId !== atomId) this.completeAddBond(state.startId, atomId, state.multiplicity);
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
      case 'pointer':
        this.editorState.set(EditorState.prepareMoveAtom(atomId));
        break;
      case 'duplicate':
        // Do nothing ("click" is used for duplicating)
        break;
      case 'bonding':
        // In bonding tool-mode, go to add-bond state if not already bonding or on the already bonding atom
        // (See handleAtomClick for add-bond state completion)
        if (state.state !== 'addingBond' || state.startId === atomId) {
          this.editorState.set(EditorState.addBond(atomId, toolMode.multiplicity, position));
        }
        break;
      case 'groupMove':
        this.beginGroupMove(atomId, position);
        break;
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
        this.model.update(model => MoleculeEditorModel.setBondMultiplicity(model, bondId, mode.multiplicity));
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

  private isTemporaryItem(itemId: ItemId) {
    const model = this.model();
    return !(itemId in model.atoms) && !(itemId in model.bonds);
  }
}

const defaultBondingType = MoleculeEditorBondingType.electrons;

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
    case MoleculeEditorBondingType.valence:
      return MoleculeEditorBondingType.valence;
    case MoleculeEditorBondingType.electrons:
      return MoleculeEditorBondingType.electrons;
    default:
      console.warn(`Received unknown ${MoleculeEditorSharedParam.bondingType} parameter:`, value);
      return defaultBondingType;
  }
}
