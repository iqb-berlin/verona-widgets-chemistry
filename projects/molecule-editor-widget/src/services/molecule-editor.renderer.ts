import { computed, inject, Injectable } from '@angular/core';
import { PsElementNumber } from 'periodic-system-common';
import { MoleculeEditorService } from './molecule-editor.service';
import type { AtomId, AtomModel, MoleculeEditorGraph, MoleculeEditorModel } from './molecule-editor.model';
import { EditorState, ItemId, Vector2 } from './molecule-editor.model';
import type { AtomView, BondView, ElectronView, MoleculeEditorView } from './molecule-editor.view';
import { lookupElement } from './molecule-editor.helper';

@Injectable()
export class MoleculeEditorRenderer {
  readonly service = inject(MoleculeEditorService);

  readonly view = computed((): MoleculeEditorView => {
    const model = this.service.model();
    const graph = this.service.graph();
    const editorState = this.service.editorState();

    const atoms: Array<AtomView> = [];
    const bonds: Array<BondView> = [];
    renderModelAtoms(model, graph, editorState, atoms);
    renderModelBonds(model, editorState, bonds);
    renderTemporaryAtoms(model, editorState, atoms);
    renderTemporaryBonds(model, editorState, bonds);

    return { atoms, bonds };
  });
}

//region Render model to view

function renderModelAtoms(
  model: MoleculeEditorModel,
  graph: MoleculeEditorGraph,
  state: EditorState,
  atomViews: Array<AtomView>,
) {
  // Render atoms
  for (const atom of Object.values(model.atoms)) {
    if (EditorState.isMovingAtom(state, atom.itemId)) {
      continue; // Skip rendering atom that is currently being moved
    }
    atomViews.push(modelAtomView(atom, graph, state));
  }
}

function modelAtomView(atom: AtomModel, graph: MoleculeEditorGraph, state: EditorState): AtomView {
  const { itemId, elementNr, position } = atom;

  const element = lookupElement(elementNr);
  const selected = EditorState.isItemSelected(state, itemId);
  const targeted = EditorState.isItemTargeted(state, itemId);

  const electronViews = renderAtomElectronViews(atom, graph);

  return {
    itemId,
    element,
    position,
    selected,
    targeted,
    temporary: false,
    electrons: electronViews,
  };
}

function renderAtomElectronViews(atom: AtomModel, graph: MoleculeEditorGraph): Array<ElectronView> {
  const singles = atom.electrons % 2;
  const doubles = Math.floor(atom.electrons / 2);

  //TODO: Algorithm for deciding direction
  const enumerateOrientations = ['N', 'E', 'S', 'W'] as const;
  let orientationIndex = 0;

  const result: Array<ElectronView> = [];
  for (let i = 0; i < doubles; i++) {
    const orientation = enumerateOrientations[orientationIndex++];
    result.push({ type: 2, orientation });
  }
  for (let i = 0; i < singles; i++) {
    const orientation = enumerateOrientations[orientationIndex++];
    result.push({ type: 1, orientation });
  }
  return result;
}

function renderModelBonds(model: MoleculeEditorModel, state: EditorState, bondViews: Array<BondView>) {
  const bondList = Object.values(model.bonds);
  for (const { itemId, leftAtomId, rightAtomId, multiplicity } of bondList) {
    const { [leftAtomId]: leftAtom, [rightAtomId]: rightAtom } = model.atoms;
    if (!leftAtom || !rightAtom) continue; // Skip bonds referencing missing atoms

    const [leftPosition, leftTemporary] = visualAtomPosition(state, leftAtom);
    const [rightPosition, rightTemporary] = visualAtomPosition(state, rightAtom);

    const selected = EditorState.isItemSelected(state, itemId);
    const temporary = leftTemporary || rightTemporary;

    bondViews.push({
      itemId,
      multiplicity,
      leftPosition,
      rightPosition,
      selected,
      temporary,
    });
  }
}

function visualAtomPosition(state: EditorState, atom: AtomModel): [position: Vector2, temporary: boolean] {
  if (!EditorState.isMovingAtom(state, atom.itemId)) {
    return [atom.position, false];
  }
  switch (state.state) {
    case 'movingAtom':
      return [state.targetPos, true];
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
    case 'preMoveAtom':
    case 'addingBond':
      break; // No temporary atoms
    case 'addingAtom': {
      const { elementNr, hoverPos: position } = editorState;
      atomViews.push(temporaryAtomView(ItemId.tmpAddAtom, elementNr, position));
      break;
    }
    case 'movingAtom': {
      const { atomId, targetPos: position } = editorState;
      const item = model.atoms[atomId];
      if (item) atomViews.push(temporaryAtomView(ItemId.tmpMoveAtom(atomId), item.elementNr, position));
      else console.warn(`Invalid item "${atomId}" referenced for move:`, item);
      break;
    }
    case 'movingGroup': {
      const moveDelta = Vector2.sub(editorState.targetPos, editorState.startPos);
      for (const groupItemId of editorState.groupItemIds) {
        const groupAtom = model.atoms[groupItemId];
        if (groupAtom) {
          const position = Vector2.add(groupAtom.position, moveDelta);
          atomViews.push(temporaryAtomView(ItemId.tmpMoveAtom(groupAtom.itemId), groupAtom.elementNr, position));
        }
      }
      break;
    }
    default:
      console.warn('Rendering unknown state atom:', editorState satisfies never);
  }
}

function temporaryAtomView(itemId: AtomId, elementNr: PsElementNumber, position: Vector2): AtomView {
  const element = lookupElement(elementNr);
  return {
    itemId,
    element,
    position,
    selected: false,
    targeted: false,
    temporary: true,
    electrons: [],
  };
}

function renderTemporaryBonds(model: MoleculeEditorModel, editorState: EditorState, bonds: Array<BondView>) {
  switch (editorState.state) {
    case 'idle':
    case 'selected':
    case 'addingAtom':
    case 'preMoveAtom':
    case 'movingAtom':
    case 'movingGroup':
      break; // No temporary bond (Rendered in renderModelItems for better performance)
    case 'addingBond': {
      const { startId, multiplicity, hoverPos } = editorState;
      const startItem = model.atoms[startId];
      if (!startItem || startItem.type !== 'Atom') {
        console.warn(`EditorState references invalid atom "${startId}":`, startItem);
        break;
      }
      bonds.push({
        itemId: ItemId.tmpAddBond,
        multiplicity: multiplicity,
        leftPosition: startItem.position,
        rightPosition: hoverPos,
        selected: false,
        temporary: true,
      });
      break;
    }
    default:
      console.warn('Rendering unknown state bond:', editorState satisfies never);
  }
}
