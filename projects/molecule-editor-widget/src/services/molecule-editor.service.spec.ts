import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideDummyVeronaWidgetService } from 'verona-widget';
import { PsElementNumber } from 'periodic-system-common';
import { MoleculeEditorService } from './molecule-editor.service';
import { moleculeCanvasTransformPosition } from './molecule-editor.event';
import { AtomId, MoleculeEditorModel, ToolMode } from './molecule-editor.model';
import { FormulaSymbol, PartialCharge, Vector2 } from './molecule-editor.shared';

const hydrogen = 1 as PsElementNumber;
const carbon = 6 as PsElementNumber;
const oxygen = 8 as PsElementNumber;

describe('MoleculeEditorService', () => {
  let service: MoleculeEditorService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideDummyVeronaWidgetService({
          testMetadata: {
            type: 'WIDGET_MOLECULE_EDITOR',
            id: 'test-molecule-editor',
            name: [],
            version: '0.0',
            specVersion: '0.0',
            metadataVersion: '0.0',
          },
          testConfig: {
            sessionId: 'test-session',
            parameters: {},
            sharedParameters: {},
          },
        }),
        MoleculeEditorService,
      ],
    });
    service = TestBed.inject(MoleculeEditorService);
    // Canvas coordinates are the client coordinates of the pointer-event
    service.registerCanvasTransform(moleculeCanvasTransformPosition((event) => [event.clientX, event.clientY]));
    TestBed.tick();
  });

  function pointerEvent(type: string, [x, y]: Vector2) {
    return new PointerEvent(type, { clientX: x, clientY: y });
  }

  // Sequence of events a browser sends when the pointer moves to a position and clicks there
  const clickSequence = ['pointermove', 'pointerdown', 'pointerup', 'click'];

  function clickCanvas(position: Vector2) {
    clickSequence.forEach((type) => service.handleCanvasEvent(pointerEvent(type, position)));
  }

  function clickAtom(atomId: AtomId, position: Vector2) {
    clickSequence.forEach((type) => service.handleAtomEvent(atomId, pointerEvent(type, position)));
  }

  function setToolMode(toolMode: ToolMode) {
    service.toolMode.set(toolMode);
    TestBed.tick();
  }

  async function placeAtom(elementNr: PsElementNumber, position: Vector2): Promise<AtomId> {
    const before = Object.keys(service.model().atoms);
    service.addElementToCanvas(elementNr, pointerEvent('click', position));
    clickCanvas(position);
    await new Promise((resolve) => setTimeout(resolve));
    return Object.keys(service.model().atoms).find((id) => !before.includes(id)) as AtomId;
  }

  function atoms() {
    return Object.values(service.model().atoms);
  }

  function bonds() {
    return Object.values(service.model().bonds);
  }

  describe('placing an atom with a click on an existing atom', () => {
    it('places the new atom where the preview shows it, bonded to the existing atom', async () => {
      const existingId = await placeAtom(hydrogen, [0, 0]);

      service.addElementToCanvas(hydrogen, pointerEvent('click', [200, 200]));
      clickAtom(existingId, [5, 2]);

      expect(atoms().length).toBe(2);
      const newAtom = atoms().find((atom) => atom.id !== existingId)!;
      expect(newAtom.position).toEqual([80, 0]);
      expect(bonds().length).toBe(1);
      expect([bonds()[0].leftAtomId, bonds()[0].rightAtomId].sort()).toEqual([existingId, newAtom.id].sort());
    });

    it('places the new atom below the existing atom when clicking exactly on its centre', async () => {
      const existingId = await placeAtom(hydrogen, [0, 0]);

      service.addElementToCanvas(hydrogen, pointerEvent('click', [200, 200]));
      clickAtom(existingId, [0, 0]);

      expect(atoms().length).toBe(2);
      const newAtom = atoms().find((atom) => atom.id !== existingId)!;
      expect(newAtom.position).toEqual([0, 80]);
      expect(bonds().length).toBe(1);
      expect(bonds()[0].leftAtomId).not.toBe(bonds()[0].rightAtomId);
    });

    it('also places the new atom in group-move mode', async () => {
      const existingId = await placeAtom(hydrogen, [0, 0]);
      setToolMode(ToolMode.groupMove);

      service.addElementToCanvas(hydrogen, pointerEvent('click', [200, 200]));
      clickAtom(existingId, [5, 2]);

      expect(atoms().length).toBe(2);
      expect(bonds().length).toBe(1);
    });

    it('in duplicate mode, still picks the clicked atom for duplication', async () => {
      await placeAtom(hydrogen, [0, 0]);
      const carbonId = await placeAtom(carbon, [300, 0]);
      setToolMode(ToolMode.duplicate);

      service.addElementToCanvas(hydrogen, pointerEvent('click', [200, 200]));
      clickAtom(carbonId, [302, 1]);

      expect(atoms().length).toBe(2);
      const state = service.editorState();
      expect(state.state).toBe('addingAtom');
      expect(state.state === 'addingAtom' && state.elementNr).toBe(carbon);
    });

    it('in bonding mode, still starts a bond from the clicked atom', async () => {
      const existingId = await placeAtom(hydrogen, [0, 0]);
      setToolMode(ToolMode.bonding(2));

      service.addElementToCanvas(hydrogen, pointerEvent('click', [200, 200]));
      service.handleAtomEvent(existingId, pointerEvent('pointerdown', [5, 2]));

      expect(atoms().length).toBe(1);
      expect(service.editorState().state).toBe('addingBond');
    });
  });

  describe('placing an atom onto an atom that is already bonded to the snap target', () => {
    // C at [0,0], O at [80,0], connected by a double bond
    async function setupCarbonylGroup() {
      const carbonId = await placeAtom(carbon, [0, 0]);
      service.addElementToCanvas(oxygen, pointerEvent('click', [200, 200]));
      clickCanvas([30, 0]);
      await new Promise((resolve) => setTimeout(resolve));
      const bondId = bonds()[0].id;
      service.model.update((model) => MoleculeEditorModel.setBondMultiplicity(model, bondId, 2));
      return { carbonId, bondId };
    }

    it('keeps the existing bond when clicking the atom', async () => {
      const { carbonId, bondId } = await setupCarbonylGroup();

      service.addElementToCanvas(hydrogen, pointerEvent('click', [200, 200]));
      clickAtom(carbonId, [3, 1]); // snaps to [80,0], where O already is

      expect(atoms().length).toBe(2);
      expect(bonds().length).toBe(1);
      expect(service.model().bonds[bondId].multiplicity).toBe(2);
    });

    it('leaves the undo history unchanged', async () => {
      const { carbonId, bondId } = await setupCarbonylGroup();

      service.addElementToCanvas(hydrogen, pointerEvent('click', [200, 200]));
      clickAtom(carbonId, [3, 1]);
      service.model.undo(); // undoes the double bond of the setup, not an empty step

      expect(service.model().bonds[bondId].multiplicity).toBe(1);
    });

    it('keeps the existing bond when clicking the bond', async () => {
      const { bondId } = await setupCarbonylGroup();

      service.addElementToCanvas(hydrogen, pointerEvent('click', [200, 200]));
      clickSequence.forEach((type) => service.handleBondEvent(bondId, pointerEvent(type, [30, 1])));

      expect(atoms().length).toBe(2);
      expect(bonds().length).toBe(1);
      expect(service.model().bonds[bondId].multiplicity).toBe(2);
    });

    it('in bonding mode, still sets the chosen multiplicity', async () => {
      await setupCarbonylGroup();
      setToolMode(ToolMode.bonding(3));

      service.addElementToCanvas(hydrogen, pointerEvent('click', [200, 200]));
      clickCanvas([30, 5]);

      expect(atoms().length).toBe(2);
      expect(bonds().length).toBe(1);
      expect(bonds()[0].multiplicity).toBe(3);
    });
  });

  describe('placing a partial charge with a click on an existing item', () => {
    it('adds the partial charge to the clicked atom', async () => {
      const carbonId = await placeAtom(carbon, [0, 0]);

      service.addPartialCharge(PartialCharge.Positive, pointerEvent('click', [200, 200]));
      clickAtom(carbonId, [5, 2]);

      const partials = Object.values(service.model().partials);
      expect(partials.length).toBe(1);
      expect(partials[0].targetAtomId).toBe(carbonId);
    });

    it('adds the partial charge when the click lands on a bond', async () => {
      const carbonId = await placeAtom(carbon, [0, 0]);
      service.addElementToCanvas(hydrogen, pointerEvent('click', [200, 200]));
      clickCanvas([30, 0]); // H at [80,0], bonded to C
      await new Promise((resolve) => setTimeout(resolve));
      const bondId = bonds()[0].id;

      service.addPartialCharge(PartialCharge.Negative, pointerEvent('click', [200, 200]));
      clickSequence.forEach((type) => service.handleBondEvent(bondId, pointerEvent(type, [20, 1])));

      const partials = Object.values(service.model().partials);
      expect(partials.length).toBe(1);
      expect(partials[0].targetAtomId).toBe(carbonId);
    });
  });

  describe('placing a formula symbol with a click on an existing atom', () => {
    it('adds the formula symbol where the preview shows it', async () => {
      const carbonId = await placeAtom(carbon, [0, 0]);

      service.addFormulaSymbolToCanvas(FormulaSymbol.ReactionArrow, pointerEvent('click', [200, 200]));
      clickAtom(carbonId, [5, 2]);

      const symbols = Object.values(service.model().symbols);
      expect(symbols.length).toBe(1);
      expect(symbols[0].position).toEqual([5, 2]);
      expect(atoms().length).toBe(1);
    });
  });

  describe('clicking an existing atom without placing anything', () => {
    it('selects the atom', async () => {
      const existingId = await placeAtom(hydrogen, [0, 0]);
      clickCanvas([200, 200]); // deselect the placed atom

      clickAtom(existingId, [5, 2]);

      expect(service.editorState()).toEqual({ state: 'selected', itemId: existingId });
    });
  });

  describe('moving an atom exactly onto another atom', () => {
    it('snaps the moved atom below the other atom instead of on top of it', async () => {
      const targetId = await placeAtom(hydrogen, [0, 0]);
      const movedId = await placeAtom(hydrogen, [300, 0]);
      clickCanvas([200, 200]); // deselect the placed atom

      service.handleAtomEvent(movedId, pointerEvent('pointerdown', [300, 0]));
      service.handleCanvasEvent(pointerEvent('pointermove', [0, 0]));
      service.handleAtomEvent(targetId, pointerEvent('pointerup', [0, 0]));

      expect(service.model().atoms[movedId].position).toEqual([0, 80]);
    });
  });
});
