import { computed, inject, Injectable } from '@angular/core';
import { PsElementNumber } from 'periodic-system-common';
import { MoleculeEditorService } from './molecule-editor.service';
import {
  AtomId,
  AtomModel,
  FormulaSymbolId,
  FormulaSymbolModel,
  ItemId,
  MoleculeEditorModel,
  ToolMode,
} from './molecule-editor.model';
import {
  AtomView,
  BondView,
  ElectronOrientation,
  ElectronView,
  FormalChargeView,
  FormulaSymbolView,
  MoleculeEditorView,
} from './molecule-editor.view';
import { EditorState } from './molecule-editor.state';
import { MoleculeEditorGraph } from './molecule-editor.graph';
import { BondMultiplicity, FormulaSymbol, Vector2 } from './molecule-editor.shared';
import { lookupElementNr } from './molecule-editor.helper';
import * as C from './molecule-editor.constants';
import tmpMoveFormulaSymbol = ItemId.tmpMoveFormulaSymbol;

@Injectable()
export class MoleculeEditorRenderer {
  readonly service = inject(MoleculeEditorService);

  readonly view = computed((): MoleculeEditorView => {
    const model = this.service.model();
    const graph = this.service.graph();
    const toolMode = this.service.toolMode();
    const editorState = this.service.editorState();

    const atoms: Array<AtomView> = [];
    const bonds: Array<BondView> = [];
    const symbols: Array<FormulaSymbolView> = [];
    renderModelAtoms(graph, editorState, atoms);
    renderModelBonds(model, editorState, bonds);
    renderTemporaryAtoms(model, editorState, atoms);
    renderTemporaryBonds(model, editorState, toolMode, bonds);
    renderFormulaSymbols(model, editorState, symbols);

    return { atoms, bonds, symbols };
  });
}

function renderModelAtoms(graph: MoleculeEditorGraph, state: EditorState, atomViews: Array<AtomView>) {
  // Render atoms
  for (const atom of Object.values(graph.model.atoms)) {
    if (EditorState.isMovingAtom(state, atom.id)) {
      continue; // Skip rendering atom that is currently being moved
    }
    atomViews.push(modelAtomView(atom, graph, state));
  }
}

function modelAtomView(atom: AtomModel, graph: MoleculeEditorGraph, state: EditorState): AtomView {
  const { id, elementNr, position, formalCharge } = atom;

  const element = lookupElementNr(elementNr);
  const selected = EditorState.isItemSelected(state, id);
  const targeted = EditorState.isItemBondTargeted(state, id) || EditorState.isItemSnapTargeted(state, id);

  const electronViews = renderAtomElectronViews(atom, graph);
  const formalChargeView = formalCharge === 0 ? null : renderFormalChargeView(atom, formalCharge);

  return {
    itemId: id,
    element,
    position,
    selected,
    targeted,
    temporary: false,
    electrons: electronViews,
    formalCharge: formalChargeView,
  };
}

function renderAtomElectronViews(atom: AtomModel, graph: MoleculeEditorGraph): Array<ElectronView> {
  // Pairs of two electrons are rendered as a line, single electrons as a dot.
  // Total electrons is added from (2 x #doubles + #singles).
  // Consequently, 0-4 total symbols are used for 0-8 electrons:
  // 1 = '.', 2 = '-', 3 = '-.', 4 = '--', 5 = '--.', 6 = '---', 7 = '---.', 8 = '----'
  const singles = atom.electrons % 2;
  const doubles = Math.floor(atom.electrons / 2);

  // To orient the required electron symbols, the orientation of existing bonds is taken into account
  // to avoid (if possible) displaying both a bond and an electron on the same orientation of the atom.
  const bondOrientations = new Set<ElectronOrientation>();
  for (const atomBond of graph.atomBonds.get(atom.id) ?? []) {
    const bondAtoms = graph.bondAtoms.get(atomBond.id);
    if (bondAtoms === undefined) continue;

    const [leftAtom, rightAtom] = bondAtoms;
    const otherAtom = leftAtom === atom ? rightAtom : leftAtom;
    const [deltaX, deltaY] = Vector2.sub(otherAtom.position, atom.position);
    const horizontal = Math.abs(deltaX) > Math.abs(deltaY); // |x| > |y|
    const bondOrientation = horizontal
      ? deltaX > 0
        ? ElectronOrientation.E
        : ElectronOrientation.W
      : deltaY > 0
        ? ElectronOrientation.S
        : ElectronOrientation.N;

    bondOrientations.add(bondOrientation);
  }

  const electronOrientations = ElectronView.prioritizeOrientations(Array.from(bondOrientations));
  let electronIndex = 0;

  const result: Array<ElectronView> = [];
  for (let i = 0; i < doubles; i++) {
    const orientation = electronOrientations[electronIndex++];
    result.push({ type: 2, orientation });
  }
  for (let i = 0; i < singles; i++) {
    const orientation = electronOrientations[electronIndex++];
    result.push({ type: 1, orientation });
  }
  return result;
}

function renderFormalChargeView(atom: AtomModel, formalCharge: number): FormalChargeView {
  return {
    position: Vector2.add(atom.position, C.formalChargePositionOffset),
    color: formalCharge > 0 ? C.formalChargePositiveColor : C.formalChargeNegativeColor,
    label: FormalChargeView.formalChargeLabel(formalCharge),
    labelLarge: FormalChargeView.formalChargeLabelLarge(formalCharge),
  };
}

function renderModelBonds(model: MoleculeEditorModel, state: EditorState, bondViews: Array<BondView>) {
  const bondList = Object.values(model.bonds);
  for (const { id, leftAtomId, rightAtomId, multiplicity } of bondList) {
    const { [leftAtomId]: leftAtom, [rightAtomId]: rightAtom } = model.atoms;
    if (!leftAtom || !rightAtom) continue; // Skip bonds referencing missing atoms

    const [leftPosition, leftTemporary] = visualAtomPositionForBond(state, leftAtom);
    const [rightPosition, rightTemporary] = visualAtomPositionForBond(state, rightAtom);

    const selected = EditorState.isItemSelected(state, id);
    const temporary = leftTemporary || rightTemporary;

    bondViews.push({
      itemId: id,
      multiplicity,
      leftPosition,
      rightPosition,
      selected,
      temporary,
    });
  }
}

function visualAtomPositionForBond(state: EditorState, atom: AtomModel): [position: Vector2, temporary: boolean] {
  if (!EditorState.isMovingAtom(state, atom.id)) {
    return [atom.position, false];
  }
  switch (state.state) {
    case 'movingAtom': {
      return [state.targetPos, true];
    }
    case 'movingGroup': {
      const moveDelta = Vector2.sub(state.targetPos, state.startPos);
      const position = Vector2.add(atom.position, moveDelta);
      return [position, true];
    }
  }
}

function renderTemporaryAtoms(model: MoleculeEditorModel, editorState: EditorState, atomViews: Array<AtomView>) {
  switch (editorState.state) {
    case 'idle':
    case 'selected':
    case 'addingFormulaSymbol':
    case 'preMoveAtom':
    case 'addingBond':
    case 'preMoveOther':
    case 'movingOther':
      break; // No temporary atoms
    case 'addingAtom': {
      const { elementNr, hoverPos, snap } = editorState;
      const visualPosition = snap ? snap.snapPos : hoverPos;
      atomViews.push(temporaryAtomView(ItemId.tmpAddAtom, elementNr, visualPosition));
      break;
    }
    case 'movingAtom': {
      const { atomId, targetPos, snap } = editorState;
      const item = model.atoms[atomId];
      const visualPosition = snap ? snap.snapPos : targetPos;
      if (item) atomViews.push(temporaryAtomView(ItemId.tmpMoveAtom(atomId), item.elementNr, visualPosition));
      else console.warn(`Invalid item "${atomId}" referenced for move:`, item);
      break;
    }
    case 'movingGroup': {
      const moveDelta = Vector2.sub(editorState.targetPos, editorState.startPos);
      for (const groupItemId of editorState.groupItemIds) {
        const groupAtom = model.atoms[groupItemId];
        if (groupAtom) {
          const tmpAtomId = ItemId.tmpMoveAtom(groupAtom.id);
          const position = Vector2.add(groupAtom.position, moveDelta);
          atomViews.push(temporaryAtomView(tmpAtomId, groupAtom.elementNr, position));
        }
      }
      break;
    }
    default:
      console.warn('Rendering unknown state atom:', editorState satisfies never);
  }
}

function temporaryAtomView(itemId: AtomId, elementNr: PsElementNumber, position: Vector2): AtomView {
  const element = lookupElementNr(elementNr);
  return {
    itemId,
    element,
    position,
    selected: false,
    targeted: false,
    temporary: true,
    electrons: [],
    formalCharge: null,
  };
}

function renderTemporaryBonds(model: MoleculeEditorModel, state: EditorState, mode: ToolMode, bonds: Array<BondView>) {
  switch (state.state) {
    case 'idle':
    case 'selected':
    case 'addingFormulaSymbol':
    case 'preMoveAtom':
    case 'preMoveOther':
    case 'movingOther':
    case 'movingGroup': {
      break; // No temporary bond (Rendered in renderModelItems for better performance)
    }
    case 'addingAtom':
    case 'movingAtom': {
      if (state.snap) {
        const targetAtom = model.atoms[state.snap.targetId];
        const multiplicity = mode.mode === 'bonding' ? mode.multiplicity : 1;
        bonds.push(temporaryBondView(state.snap.snapPos, targetAtom.position, multiplicity));
      }
      break;
    }
    case 'addingBond': {
      const { startId, multiplicity, hoverPos } = state;
      const startItem = model.atoms[startId];
      if (!startItem || startItem.type !== 'Atom') {
        console.warn(`EditorState references invalid atom "${startId}":`, startItem);
        break;
      }
      bonds.push(temporaryBondView(startItem.position, hoverPos, multiplicity));
      break;
    }
    default:
      console.warn('Rendering unknown state bond:', state satisfies never);
  }
}

function temporaryBondView(leftPosition: Vector2, rightPosition: Vector2, multiplicity: BondMultiplicity): BondView {
  return {
    itemId: ItemId.tmpAddBond,
    multiplicity,
    leftPosition,
    rightPosition,
    selected: false,
    temporary: true,
  };
}

function renderFormulaSymbols(model: MoleculeEditorModel, editorState: EditorState, symbols: Array<FormulaSymbolView>) {
  let groupDelta: Vector2 = Vector2.zero;
  let groupMoveItemIds: undefined | ReadonlySet<ItemId>;
  if (editorState.state === 'movingGroup') {
    groupDelta = Vector2.sub(editorState.targetPos, editorState.startPos);
    groupMoveItemIds = new Set(editorState.groupItemIds);
  }

  const symbolList = Object.values(model.symbols);
  for (const symbol of symbolList) {
    if (editorState.state === 'movingOther' && editorState.itemId === symbol.id) {
      const tmpId = tmpMoveFormulaSymbol(symbol.id);
      symbols.push(temporaryFormulaSymbol(tmpId, editorState.targetPos, symbol.symbol));
    } else if (editorState.state === 'movingGroup' && groupMoveItemIds?.has(symbol.id)) {
      const tmpId = tmpMoveFormulaSymbol(symbol.id);
      const tmpPos = Vector2.add(symbol.position, groupDelta);
      symbols.push(temporaryFormulaSymbol(tmpId, tmpPos, symbol.symbol));
    } else {
      const selected = EditorState.isItemSelected(editorState, symbol.id);
      symbols.push(modelFormulaSymbol(symbol, selected));
    }
  }

  if (editorState.state === 'addingFormulaSymbol') {
    symbols.push(temporaryFormulaSymbol(ItemId.tmpAddFormulaSymbol, editorState.hoverPos, editorState.symbol));
  }
}

function temporaryFormulaSymbol(tmpId: FormulaSymbolId, position: Vector2, symbol: FormulaSymbol): FormulaSymbolView {
  return {
    itemId: tmpId,
    position,
    symbol,
    selected: false,
    temporary: true,
  } as const;
}

function modelFormulaSymbol(model: FormulaSymbolModel, selected: boolean): FormulaSymbolView {
  return {
    itemId: model.id,
    position: model.position,
    symbol: model.symbol,
    selected,
    temporary: false,
  } as const;
}
