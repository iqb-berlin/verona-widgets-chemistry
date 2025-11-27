import { Component, computed, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatIcon } from '@angular/material/icon';
import { MatIconButton } from '@angular/material/button';
import { PsElement, PsElements, PsElementSymbol } from 'periodic-system-common';
import { MoleculeEditorService } from '../../services/molecule-editor.service';
import { BondMultiplicity } from '../../services/molecule-editor.model';

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
    const { items } = this.service.model();
    const state = this.service.state();
    if (state.state !== 'selected') return undefined;
    const item = items[state.itemId];
    return (item && item.type === 'Atom') ? item : undefined;
  });

  readonly selectedAtomElectrons = computed(() => {
    const { elementElectrons } = this.service.model();
    const selectedAtom = this.selectedAtom();
    if (!selectedAtom) return Number.NaN;
    const selectedAtomElectrons = elementElectrons[selectedAtom.element.number];
    return selectedAtomElectrons ?? 0;
  });

  readonly selectedAtomElectronsIcon = computed(() => {
    const electrons = this.selectedAtomElectrons();
    return Number.isNaN(electrons) ? 'atr' : `counter_${electrons}`;
  });

  readonly incrementElectronDisabled = computed(() => this.selectedAtomElectrons() >= 8);
  readonly decrementElectronDisabled = computed(() => this.selectedAtomElectrons() <= 0);

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
