import { Component, computed, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { PsElement, PsElements, PsElementSymbol } from 'periodic-system-common';
import { MoleculeEditorService } from '../../services/molecule-editor.service';
import { BondMultiplicity, MoleculeEditorModel } from '../../services/molecule-editor.model';

@Component({
  selector: 'app-editor-controls',
  templateUrl: './editor-controls.html',
  styleUrl: './editor-controls.scss',
  imports: [
    MatIconButton,
    MatIcon,
    NgTemplateOutlet,
  ],
})
export class EditorControls {
  readonly service = inject(MoleculeEditorService);

  readonly quickPickElements1 = [
    lookupElement('H'),
    lookupElement('C'),
    lookupElement('N'),
    lookupElement('O'),
    lookupElement('P'),
    lookupElement('S'),
  ];
  readonly quickPickElements2 = [
    lookupElement('F'),
    lookupElement('Cl'),
    lookupElement('Br'),
    lookupElement('I'),
  ];

  readonly pointerModeActive = this.computeToolModeActive('pointer');
  readonly duplicateModeActive = this.computeToolModeActive('duplicate');
  readonly bondingSingleModeActive = this.computeBondingModeActive(1);
  readonly bondingDoubleModeActive = this.computeBondingModeActive(2);
  readonly bondingTripleModeActive = this.computeBondingModeActive(3);

  readonly isItemSelected = computed(() => {
    const state = this.service.state();
    return state.state === 'selected';
  });

  readonly selectedAtom = computed(() => {
    const { atoms } = this.service.model();
    const state = this.service.state();
    if (state.state !== 'selected') return undefined;
    return atoms[state.id] ?? undefined;
  });

  readonly selectedAtomElectronsIcon = computed(() => {
    const { electrons } = this.selectedAtom() ?? {};
    return (electrons === undefined) ? 'atr' : `counter_${electrons}`;
  });

  readonly incrementElectronDisabled = computed(() => {
    const atom = this.selectedAtom();
    return !atom || atom.electrons >= MoleculeEditorModel.ATOM_MAX_ELECTRONS;
  });
  readonly decrementElectronDisabled = computed(() => {
    const atom = this.selectedAtom();
    return !atom || atom.electrons <= MoleculeEditorModel.ATOM_MIN_ELECTRONS;
  });

  setToolMode(mode: 'pointer' | 'duplicate') {
    this.service.toolMode.set({ mode });
  }

  setBondingModeActive(multiplicity: BondMultiplicity) {
    this.service.toolMode.set({ mode: 'bonding', multiplicity });
  }

  private computeToolModeActive(mode: 'pointer' | 'duplicate') {
    return computed(() => {
      const toolMode = this.service.toolMode();
      return toolMode.mode === mode;
    });
  }

  private computeBondingModeActive(multiplicity: BondMultiplicity) {
    return computed(() => {
      const toolMode = this.service.toolMode();
      return toolMode.mode === 'bonding' && toolMode.multiplicity === multiplicity;
    });
  }

  handlePickElement(event: PointerEvent) {
    this.service.pickElementFromTable()
      .then(element => this.handleAddElement(element, event))
      .catch(() => undefined);
  }

  handleAddElement(element: PsElement, event: PointerEvent) {
    this.service.addElementToCanvas(element, event);
  }
}

const elementBySymbol = new Map(PsElements.map(e => [e.symbol, e] as const));

function lookupElement(symbol: string): PsElement {
  const element = elementBySymbol.get(symbol as PsElementSymbol);
  if (!element) throw new Error(`Element symbol ${symbol} not found`);
  return element;
}
