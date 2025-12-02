import { computed, effect, EffectCleanupFn, inject, Injectable, signal } from '@angular/core';
import { MoleculeEditorService } from './molecule-editor.service';
import type { AtomId, AtomModel, MoleculeEditorModel } from './molecule-editor.model';
import { EditorState, ItemId } from './molecule-editor.model';
import type { AtomView, BondView, MoleculeEditorAnimatedView, MoleculeEditorView } from './molecule-editor.view';
import { AngleMath } from '../util/angle-math';
import { produce } from 'immer';

type AnimFrameHandle = ReturnType<typeof requestAnimationFrame>

const relaxElectronsIterationCount = 30;

@Injectable()
export class MoleculeEditorRenderer {
  readonly service = inject(MoleculeEditorService);

  readonly view = computed((): MoleculeEditorView => {
    const model = this.service.model();
    const editorState = this.service.state();

    const atoms: Array<AtomView> = [];
    const bonds: Array<BondView> = [];
    renderModelAtoms(model, editorState, atoms);
    renderModelBonds(model, editorState, bonds);
    renderTemporaryAtom(model, editorState, atoms);
    renderTemporaryBonds(model, editorState, bonds);

    return { atoms, bonds };
  });

  readonly animatedView = signal<MoleculeEditorAnimatedView>({
    atomElectronAnimations: {},
  });

  constructor() {
    effect((onCleanup) => {
      // Trigger view -> Update+animate animated-view
      const nextView = this.view();

      // Synchronously: Add/update/remove atoms in view to animated-view
      this.animatedView.update(animatedView => reconcileAnimatedView(animatedView, nextView));

      //TODO: Fix this algorithm, currently not working properly yet.
      // Animated: Relax angles of electrons in animated-view
      /*const cleanupAnim = iterativeAnimationEffect(relaxElectronsIterationCount, () => {
        this.animatedView.update(animatedView => relaxAnimatedViewIteration(animatedView));
      });

      onCleanup(cleanupAnim);*/
    });
  }
}

//region Render model to view

function renderModelAtoms(model: MoleculeEditorModel, state: EditorState, atomViews: Array<AtomView>) {
  const atomList = Object.values(model.atoms);
  const bondList = Object.values(model.bonds);

  // Aggregate number of connected bonds per atom
  const bondCountByAtomId = new Map<AtomId, number>();
  for (const { multiplicity, leftAtomId, rightAtomId } of bondList) {
    bondCountByAtomId.set(leftAtomId, multiplicity + (bondCountByAtomId.get(leftAtomId) ?? 0));
    bondCountByAtomId.set(rightAtomId, multiplicity + (bondCountByAtomId.get(rightAtomId) ?? 0));
  }

  // Render atoms
  for (const atom of atomList) {
    if (EditorState.isMovingAtom(state, atom.itemId)) {
      continue; // Skip rendering atom that is currently being moved
    }
    atomViews.push(modelAtomView(atom, state, model, bondCountByAtomId));
  }
}

function modelAtomView(
  atom: AtomModel,
  state: EditorState,
  model: MoleculeEditorModel,
  bondCountByAtomId: ReadonlyMap<ItemId, number>,
): AtomView {
  const { itemId, element, position, electrons } = atom;
  const selected = EditorState.isItemSelected(state, itemId);
  return {
    itemId,
    element,
    position,
    selected,
    temporary: false,
    outerElectrons: electrons,
    bondAngles: [0, 0, 0], //TODO: Implement this for a proper force-directed layout; requires bond/atom indexing
  };
}

function renderModelBonds(model: MoleculeEditorModel, state: EditorState, bondViews: Array<BondView>) {
  const bondList = Object.values(model.bonds);
  for (const { itemId, leftAtomId, rightAtomId, multiplicity } of bondList) {
    const { [leftAtomId]: leftAtom, [rightAtomId]: rightAtom } = model.atoms;
    if (!leftAtom || !rightAtom) continue; // Skip bonds referencing missing atoms

    const isMovingLeft = EditorState.isMovingAtom(state, leftAtomId);
    const isMovingRight = EditorState.isMovingAtom(state, rightAtomId);
    const leftPosition = isMovingLeft ? state.targetPos : leftAtom.position;
    const rightPosition = isMovingRight ? state.targetPos : rightAtom.position;

    const selected = EditorState.isItemSelected(state, itemId);
    const temporary = isMovingLeft || isMovingRight;

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
      const { element, hoverPos: position } = editorState;
      atomViews.push({
        itemId: ItemId.tmpAddAtom,
        element,
        position,
        selected: false,
        temporary: true,
        outerElectrons: 0,
        bondAngles: [],
      });
      break;
    }
    case 'movingAtom': {
      const { id, targetPos: position } = editorState;
      const item = model.atoms[id];
      if (!item) {
        console.warn(`Invalid item "${id}" referenced for move:`, item);
        break;
      }
      const { element } = item;
      atomViews.push({
        itemId: ItemId.tmpMoveAtom,
        element,
        position,
        selected: false,
        temporary: true,
        outerElectrons: 0,
        bondAngles: [],
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
      const { startId, multi, hoverPos } = editorState;
      const startItem = model.atoms[startId];
      if (!startItem || startItem.type !== 'Atom') {
        console.warn(`EditorState references invalid atom "${startId}":`, startItem);
        break;
      }
      bonds.push({
        itemId: ItemId.tmpAddBond,
        multiplicity: multi,
        leftPosition: startItem.position,
        rightPosition: hoverPos,
        selected: false,
        temporary: true,
      });
      break;
    default:
      console.warn('Rendering unknown state bond:', editorState satisfies never);
  }
}

//endregion
//region Update animated view

const reconcileAnimatedView = produce<MoleculeEditorAnimatedView, [MoleculeEditorView]>((draft, view) => {
  const jitter = AngleMath.deg(5); // Apply small jitter to avoid extreme forces
  const viewAtomIds = new Set(view.atoms.map(atom => atom.itemId));

  // Add/update atoms in animation
  for (const viewAtom of view.atoms) {
    const atomId = viewAtom.itemId;
    if (atomId in draft.atomElectronAnimations) {
      const animatedAtom = draft.atomElectronAnimations[atomId];
      // Update existing atom-electrons if atom electron count changed in view
      // => Recreate electrons with new angles (will be animated later)
      if (animatedAtom.electronAngles.length !== viewAtom.outerElectrons) {
        animatedAtom.electronAngles = AngleMath.distributeAngles(viewAtom.outerElectrons, jitter);
      }
    } else {
      // Create new atom-electrons
      const electronAngles = AngleMath.distributeAngles(viewAtom.outerElectrons, jitter);
      draft.atomElectronAnimations[atomId] = {
        itemId: atomId,
        bondAngles: viewAtom.bondAngles.slice(),
        electronAngles,
      };
    }
  }

  // Remove missing atoms from animation
  for (const animatedAtomKey in draft.atomElectronAnimations) {
    const animatedAtomId = animatedAtomKey as AtomId;
    if (!viewAtomIds.has(animatedAtomId)) {
      delete draft.atomElectronAnimations[animatedAtomId];
    }
  }
});

function iterativeAnimationEffect(frameCount: number, animation: () => void): EffectCleanupFn {
  let animFrameHandle: undefined | AnimFrameHandle;

  const nextAnimationFrame = (remaining: number) => {
    animation();

    animFrameHandle = (remaining > 0)
      ? requestAnimationFrame(() => nextAnimationFrame(remaining - 1))
      : undefined;
  };

  requestAnimationFrame(() => nextAnimationFrame(frameCount));

  return () => {
    if (animFrameHandle !== undefined) {
      cancelAnimationFrame(animFrameHandle);
    }
  };
}

//OPTIMIZATION: Introduce either dirty tracking or view-state hashing to avoid relaxing all atoms on every frame
const relaxAnimatedViewIteration = produce<MoleculeEditorAnimatedView>((draft) => {
  const step = 0.05;
  const wEdge = 1.00;
  const wSelf = 0.40;
  const epsilon = AngleMath.deg(1);

  for (const atomKey in draft.atomElectronAnimations) {
    const atomId = atomKey as AtomId;
    const atomAnim = draft.atomElectronAnimations[atomId];
    const angles = atomAnim.electronAngles;
    const k = angles.length;

    for (let i = 0; i < k; i++) {
      let force = 0;

      // Repulsion from bonds
      for (let p of atomAnim.bondAngles) {
        const d = AngleMath.angleDiff(angles[i], p);
        const dd = (d * d) + epsilon;
        force += wEdge + (d / dd);
      }

      // Repulsion from other electrons
      for (let j = 0; j < k; j++) {
        if (i === j) continue;
        const d = AngleMath.angleDiff(angles[i], angles[j]);
        const dd = (d * d) + epsilon;
        force += wSelf * (d / dd);
      }

      // Apply negative gradient descent to angle
      const gradientDescend = -step * force;
      angles[i] = AngleMath.normalize(angles[i] + gradientDescend);
    }
    angles.sort((a, b) => a - b);
  }
});

//endregion
