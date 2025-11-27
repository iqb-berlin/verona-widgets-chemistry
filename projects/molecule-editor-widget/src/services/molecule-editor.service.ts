import { computed, effect, inject, Injectable, Signal, signal, untracked } from '@angular/core';
import { VeronaWidgetService } from 'verona-widget';
import { PsElement } from 'periodic-system-common';
import { MoleculeCanvasTransform } from './molecule-editor.event';
import {
  BondMultiplicity,
  EditorState,
  ItemId,
  MoleculeEditorModel,
  ToolMode,
  uniqueItemId,
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
  readonly toolMode = signal<ToolMode>({ mode: 'pointer' });
  readonly state = signal<EditorState>(EditorState.idle);
  readonly openPicker = signal(false);

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
      const state = untracked(this.state);
      const toolMode = this.toolMode(); // reset editor-state when tool-mode changes
      if (toolMode.mode === 'bonding' && state.state === 'addingBond') {
        // special case: while bonding, set new bonding multiplicity
        const { multiplicity } = toolMode;
        this.state.set({ ...state, multiplicity });
      } else {
        // default case: reset to idle
        this.state.set(EditorState.idle);
      }
    });

    effect(() => console.log('tool mode =', this.toolMode()));
    effect(() => console.log('editor state =', this.state()));
    effect(() => console.log('editor model =', this.model()));
  }

  registerCanvasTransform(transform: MoleculeCanvasTransform) {
    this._canvasTransform = transform;
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

  addElementToCanvas(element: PsElement, pointerEvent: PointerEvent) {
    const { position } = this._canvasTransform(pointerEvent);
    this.state.set(EditorState.addAtom(element, position));
  }

  //endregion
  //region Modify element electrons

  changeSelectedElementAtoms(delta: -1 | 1) {
    const minElectrons = 0;
    const maxElectrons = 8;

    const state = this.state();
    if (state.state !== 'selected') return;

    this.model.update(model => {
      const { itemId } = state;
      const item = model.items[itemId];
      if (item.type !== 'Atom') return model;

      const { element } = item;
      const electrons = model.elementElectrons[element.number] ?? 0;
      const newElectrons = Math.max(minElectrons, Math.min(maxElectrons, electrons + delta));
      return MoleculeEditorModel.setElementElectrons(model, element, newElectrons);
    });
  }

  //endregion
  //region Delete atom/bond

  deleteSelectedItem() {
    const state = this.state();
    if (state.state === 'selected') {
      const { itemId } = state;
      this.model.update(model => MoleculeEditorModel.deleteItem(model, itemId));
    }
  }

  //endregion
  //region Canvas pointer events

  handleCanvasEvent(pointerEvent: PointerEvent | TouchEvent) {
    const { event, position } = this._canvasTransform(pointerEvent);
    switch (event) {
      case 'move':
        this.handleCanvasMove(position);
        break;
      case 'up':
        this.handleCanvasUp(position);
        break;
      case 'down':
        this.handleCanvasDown(position);
        break;
      case 'click':
        this.handleCanvasClick(position);
        break;
      default:
        console.warn('Unknown canvas event:', event satisfies never);
    }
  }

  private handleCanvasClick(position: Vector2) {
    const state = this.state();
    switch (state.state) {
      case 'selected':
        this.state.set(EditorState.idle);
        break;
      case 'addingAtom': {
        const { element } = state;
        const itemId = uniqueItemId();
        this.model.update(model => MoleculeEditorModel.addAtom(model, itemId, element, position), true);
        this.state.set(EditorState.idle);
        setTimeout(() => this.afterAtomAdded(itemId, element, position), 0);
        break;
      }
      case 'addingBond': {
        this.state.set(EditorState.idle);
        break;
      }
    }
  }

  private afterAtomAdded(itemId: ItemId, element: PsElement, position: Vector2) {
    const toolMode = this.toolMode();
    switch (toolMode.mode) {
      case 'pointer':
        // In pointer-mode, select newly created atom
        this.state.set(EditorState.select(itemId));
        break;
      case 'duplicate':
        // In duplicate-mode, add another atom of the same element
        this.state.set(EditorState.addAtom(element, position));
        break;
      case 'bonding':
        this.state.set(EditorState.addBond(itemId, toolMode.multiplicity, position));
        break;
    }
  }

  private handleCanvasMove(position: Vector2) {
    const state = this.state();
    switch (state.state) {
      case 'addingAtom':
        this.state.set(EditorState.addAtom(state.element, position));
        break;
      case 'preMoveAtom':
      case 'movingAtom':
        this.state.set(EditorState.moveAtom(state.itemId, position));
        break;
      case 'addingBond':
        this.state.set({ ...state, hoverPosition: position });
        break;
    }
  }

  private handleCanvasUp(position: Vector2) {
    const state = this.state();
    switch (state.state) {
      case 'preMoveAtom':
        this.state.set(EditorState.idle);
        break;
      case 'movingAtom':
        const { itemId } = state;
        this.model.update(model => MoleculeEditorModel.moveAtom(model, itemId, position), true);
        this.state.set(EditorState.idle);
        break;
    }
  }

  private handleCanvasDown(position: Vector2) {

  }

  //endregion
  //region Atom pointer events

  handleAtomEvent(atomId: ItemId, pointerEvent: PointerEvent | TouchEvent) {
    // bubble up to canvas for temporary atoms (id not present in model)
    if (this.isTemporaryItem(atomId)) {
      this.handleCanvasEvent(pointerEvent);
      return;
    }

    // stop implicit bubbling
    pointerEvent.stopPropagation();

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

  private handleAtomClick(atomId: ItemId, position: Vector2) {
    const state = this.state();
    const toolMode = this.toolMode();

    if (state.state === 'addingBond' && state.startId !== atomId) {
      this.completeAddBond(state.startId, atomId, state.multiplicity);
      return;
    }

    switch (toolMode.mode) {
      case 'pointer':
        this.state.set(EditorState.select(atomId));
        break;
      case 'duplicate': {
        const { items } = this.model();
        const item = items[atomId];
        if (item && item.type === 'Atom') {
          this.state.set(EditorState.addAtom(item.element, position));
        }
        break;
      }
    }
  }

  private handleAtomUp(atomId: ItemId, position: Vector2) {
    const state = this.state();
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

  private handleAtomDown(atomId: ItemId, position: Vector2) {
    const state = this.state();
    const toolMode = this.toolMode();
    switch (toolMode.mode) {
      case 'pointer':
        this.state.set(EditorState.prepareMoveAtom(atomId));
        break;
      case 'duplicate':
        // Do nothing
        break;
      case 'bonding': {
        if (state.state !== 'addingBond' || state.startId === atomId) {
          const { multiplicity } = toolMode;
          this.state.set(EditorState.addBond(atomId, multiplicity, position));
        }
        break;
      }
    }
  }

  private completeAddBond(startId: ItemId, endId: ItemId, multiplicity: BondMultiplicity) {
    const bondId = uniqueItemId();
    this.model.update(model => MoleculeEditorModel.addBond(model, bondId, startId, endId, multiplicity));
    this.state.set(EditorState.idle);
  }

  //endregion
  //region Bond pointer events

  handleBondEvent(bondId: ItemId, pointerEvent: PointerEvent | TouchEvent) {
    // bubble up to canvas for temporary atoms (id not present in model)
    if (this.isTemporaryItem(bondId)) {
      this.handleCanvasEvent(pointerEvent);
      return;
    }

    // stop implicit bubbling
    pointerEvent.stopPropagation();

    const { event, position } = this._canvasTransform(pointerEvent);
    switch (event) {
      case 'move':
      case 'up':
      case 'down':
        this.handleCanvasEvent(pointerEvent); // bubble up to canvas
        break;
      case 'click':
        this.handleBondClick(bondId, position);
        break;
    }
  }

  private handleBondClick(bondId: ItemId, position: Vector2) {
    this.state.set(EditorState.select(bondId));
  }

  //endregion

  private isTemporaryItem(itemId: ItemId) {
    const model = this.model();
    return !(itemId in model.items);
  }
}

const defaultBondingType = MoleculeEditorBondingType.electrons;

function computeMoleculeEditorAppearance(widgetService: VeronaWidgetService): Signal<MoleculeEditorAppearance> {
  return computed((): MoleculeEditorAppearance => {
    const config = widgetService.configuration();

    const {
      [MoleculeEditorSharedParam.bondingType]: bondingType = defaultBondingType,
    } = config.sharedParameters;

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
