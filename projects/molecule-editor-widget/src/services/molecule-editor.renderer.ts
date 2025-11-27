import { computed, inject, Injectable } from '@angular/core';
import { MoleculeEditorService } from './molecule-editor.service';
import { AtomModel, BondModel, EditorState, ItemId, MoleculeEditorModel } from './molecule-editor.model';
import { AtomView, BondView, MoleculeEditorView } from './molecule-editor.view';

@Injectable()
export class MoleculeEditorRenderer {
  readonly service = inject(MoleculeEditorService);

  readonly renderedView = computed((): MoleculeEditorView => {
    const model = this.service.model();
    const editorState = this.service.state();

    const atoms: Array<AtomView> = [];
    const bonds: Array<BondView> = [];
    renderModelItems(model, editorState, atoms, bonds);
    renderTemporaryAtom(model, editorState, atoms);
    renderTemporaryBonds(model, editorState, bonds);

    return { atoms, bonds };
  });
}

function renderModelItems(
  model: MoleculeEditorModel,
  state: EditorState,
  atomViews: Array<AtomView>,
  bondViews: Array<BondView>,
) {
  const bondCountByAtomId = new Map<ItemId, number>();
  for (const item of Object.values(model.items)) {
    if (item.type === 'Bond') {
      const { multiplicity, leftAtomId, rightAtomId } = item;
      bondCountByAtomId.set(leftAtomId, multiplicity + (bondCountByAtomId.get(leftAtomId) ?? 0));
      bondCountByAtomId.set(rightAtomId, multiplicity + (bondCountByAtomId.get(rightAtomId) ?? 0));
    }
  }

  for (const [itemKey, item] of Object.entries(model.items)) {
    const itemId = itemKey as ItemId;
    switch (item.type) {
      case 'Atom':
        if (EditorState.isMovingAtom(state, itemId)) {
          continue; // Skip rendering model-atom that is currently being moved
        }
        atomViews.push(modelAtomView(item, state, model, bondCountByAtomId));
        break;
      case 'Bond':
        // Renders bonds, including temporary bonds connected to atoms currently being moved
        bondViews.push(...modelBondView(item, state, model));
        break;
      default:
        console.warn('Rendering unknown item:', item satisfies never);
    }
  }
}

function modelAtomView(
  item: AtomModel,
  state: EditorState,
  model: MoleculeEditorModel,
  bondCountByAtomId: ReadonlyMap<ItemId, number>,
): AtomView {
  const { itemId, element, position } = item;
  const selected = EditorState.isItemSelected(state, itemId);
  const bondCount = bondCountByAtomId.get(itemId) ?? 0;
  const totalOuterElectrons = model.elementElectrons[element.number] ?? 0;
  const unboundOuterElectrons = totalOuterElectrons - bondCount;
  return {
    itemId,
    element,
    position,
    selected,
    temporary: false,
    outerElectrons: unboundOuterElectrons,
  };
}

function modelBondView(
  item: BondModel,
  state: EditorState,
  model: MoleculeEditorModel,
): BondView[] {
  const { itemId, leftAtomId, rightAtomId, multiplicity } = item;
  const selected = EditorState.isItemSelected(state, itemId);

  const leftAtom = model.items[leftAtomId];
  if (!leftAtom || leftAtom.type !== 'Atom') {
    console.warn(`Bond "${itemId}" references invalid atom "${leftAtomId}":`, leftAtom);
    return [];
  }
  const rightAtom = model.items[rightAtomId];
  if (!rightAtom || rightAtom.type !== 'Atom') {
    console.warn(`Bond "${itemId}" references invalid atom "${rightAtomId}":`, rightAtom);
    return [];
  }

  const leftPosition = EditorState.isMovingAtom(state, leftAtomId) ? state.targetPosition : leftAtom.position;
  const rightPosition = EditorState.isMovingAtom(state, rightAtomId) ? state.targetPosition : rightAtom.position;
  const temporary = EditorState.isMovingAtom(state, leftAtomId) || EditorState.isMovingAtom(state, rightAtomId);

  return [{
    itemId,
    multiplicity,
    leftPosition,
    rightPosition,
    selected,
    temporary,
  }];
}

function renderTemporaryAtom(
  model: MoleculeEditorModel,
  editorState: EditorState,
  atomViews: Array<AtomView>,
) {
  switch (editorState.state) {
    case 'idle':
    case 'selected':
    case 'preMoveAtom':
    case 'addingBond':
      break; // No temporary atom
    case 'addingAtom': {
      const { element, hoverPosition: position } = editorState;
      atomViews.push({
        itemId: ItemId.temporaryAdd,
        element,
        position,
        selected: false,
        temporary: true,
        outerElectrons: 0,
      });
      break;
    }
    case 'movingAtom': {
      const { itemId, targetPosition: position } = editorState;
      const item = model.items[itemId];
      if (!item || item.type !== 'Atom') {
        console.warn(`Invalid item "${itemId}" referenced for move:`, item);
        break;
      }
      const { element } = item;
      atomViews.push({
        itemId: ItemId.temporaryMove,
        element,
        position,
        selected: false,
        temporary: true,
        outerElectrons: 0,
      });
      break;
    }
    default:
      console.warn('Rendering unknown state atom:', editorState satisfies never);
  }
}

function renderTemporaryBonds(
  model: MoleculeEditorModel,
  editorState: EditorState,
  bonds: Array<BondView>,
) {
  switch (editorState.state) {
    case 'idle':
    case 'selected':
    case 'addingAtom':
    case 'preMoveAtom':
    case 'movingAtom':
      break; // No temporary bond (Rendered in renderModelItems for better performance)
    case 'addingBond':
      const { startId, multiplicity, hoverPosition } = editorState;
      const startItem = model.items[startId];
      if (!startItem || startItem.type !== 'Atom') {
        console.warn(`EditorState references invalid atom "${startId}":`, startItem);
        break;
      }
      bonds.push({
        itemId: ItemId.temporaryAdd,
        multiplicity,
        leftPosition: startItem.position,
        rightPosition: hoverPosition,
        selected: false,
        temporary: true,
      });
      break;
    default:
      console.warn('Rendering unknown state bond:', editorState satisfies never);
  }
}
