import { Component, computed, contentChild, effect, inject, signal, TemplateRef } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatTooltip } from '@angular/material/tooltip';
import { MatIcon } from '@angular/material/icon';
import { MatButton, MatIconButton } from '@angular/material/button';
import {
  MatDialog,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { PsElementNumber } from 'periodic-system-common';
import { MoleculeEditorService } from '../../services/molecule-editor.service';
import { AtomModel, MoleculeEditorModel, ToolMode } from '../../services/molecule-editor.model';
import { BondMultiplicity, FormulaSymbol, PartialCharge } from '../../services/molecule-editor.shared';
import { lookupElementSymbol } from '../../services/molecule-editor.helper';

@Component({
  selector: 'app-editor-controls',
  templateUrl: './editor-controls.html',
  styleUrl: './editor-controls.scss',
  imports: [MatIconButton, MatIcon, NgTemplateOutlet, MatTooltip],
})
export class EditorControls {
  readonly service = inject(MoleculeEditorService);
  readonly dialog = inject(MatDialog);

  readonly saveTemplateRef = contentChild('save', { read: TemplateRef });

  readonly quickPickElements1 = [
    lookupElementSymbol('H'),
    lookupElementSymbol('C'),
    lookupElementSymbol('N'),
    lookupElementSymbol('O'),
    lookupElementSymbol('P'),
    lookupElementSymbol('S'),
  ];
  readonly quickPickElements2 = [
    lookupElementSymbol('F'),
    lookupElementSymbol('Cl'),
    lookupElementSymbol('Br'),
    lookupElementSymbol('I'),
  ];

  readonly formulaReactionPlus = FormulaSymbol.ReactionPlus;
  readonly formulaReactionArrow = FormulaSymbol.ReactionArrow;
  readonly formulaEquilibriumArrow = FormulaSymbol.EquilibriumArrow;

  readonly partialChargePositive = PartialCharge.Positive;
  readonly partialChargeNegative = PartialCharge.Negative;

  readonly pointerModeActive = this.computeToolModeActive('pointer');
  readonly duplicateModeActive = this.computeToolModeActive('duplicate');
  readonly groupMoveModeActive = this.computeToolModeActive('groupMove');
  readonly bondingSingleModeActive = this.computeBondingModeActive(1);
  readonly bondingDoubleModeActive = this.computeBondingModeActive(2);
  readonly bondingTripleModeActive = this.computeBondingModeActive(3);
  readonly bondingSingleToolIcon = this.computeBondingToolIcon(1);
  readonly bondingDoubleToolIcon = this.computeBondingToolIcon(2);
  readonly bondingTripleToolIcon = this.computeBondingToolIcon(3);

  readonly zoomLevels = [25, 50, 75, 100, 125, 150, 200] as const;
  readonly zoomLevelIndex = signal(3);

  readonly isModelEmpty = computed(() => {
    const { atoms } = this.service.model();
    return Object.keys(atoms).length > 0;
  });

  readonly isItemSelected = computed(() => {
    const state = this.service.editorState();
    return state.state === 'selected';
  });

  readonly atomCount = computed(() => {
    const { atoms } = this.service.model();
    return Object.keys(atoms).length;
  });

  readonly selectedAtom = computed<AtomModel | undefined>(() => {
    const { atoms } = this.service.model();
    const state = this.service.editorState();
    if (state.state !== 'selected') return undefined;
    return atoms[state.itemId] ?? undefined;
  });

  readonly selectedAtomMaxElectrons = computed<number>(() => {
    const graph = this.service.graph();
    const selectedAtom = this.selectedAtom();
    if (!selectedAtom) return 0;

    const atomBonds = graph.atomBonds.get(selectedAtom.id) ?? [];
    const occupiedByBonds = atomBonds.reduce((sum, bond) => sum + bond.multiplicity, 0);

    return MoleculeEditorModel.ATOM_TOTAL_MAX_ELECTRONS - occupiedByBonds;
  });

  readonly incrementElectronDisabled = computed(() => {
    const atom = this.selectedAtom();
    const maxElectrons = this.selectedAtomMaxElectrons();
    return !atom || atom.electrons >= maxElectrons;
  });
  readonly decrementElectronDisabled = computed(() => {
    const atom = this.selectedAtom();
    return !atom || atom.electrons <= 0;
  });

  readonly formalChargePositiveDisabled = computed(() => {
    const atom = this.selectedAtom();
    return !atom || atom.formalCharge >= MoleculeEditorModel.ATOM_TOTAL_MAX_FORMAL_CHARGE;
  });
  readonly formalChargeNegativeDisabled = computed(() => {
    const atom = this.selectedAtom();
    return !atom || atom.formalCharge <= MoleculeEditorModel.ATOM_TOTAL_MIN_FORMAL_CHARGE;
  });

  readonly partialChargeDisabled = computed(() => {
    const { atomIdsWithoutPartialCharge } = this.service.graph();
    return atomIdsWithoutPartialCharge.size < 1;
  });

  readonly zoomOutDisabled = computed(() => this.zoomLevelIndex() <= 0);
  readonly zoomInDisabled = computed(() => this.zoomLevelIndex() >= this.zoomLevels.length - 1);

  constructor() {
    effect(() => {
      const zoomLevel = this.zoomLevels[this.zoomLevelIndex()];
      const zoomLevelScale = zoomLevel / 100;
      this.service.canvasScale.set(zoomLevelScale);
    });
  }

  setPointerMode() {
    this.service.toolMode.set(ToolMode.pointer);
  }

  setDuplicateMode() {
    this.service.toolMode.set(ToolMode.duplicate);
  }

  setGroupMoveMode() {
    this.service.toolMode.set(ToolMode.groupMove);
  }

  setBondingModeActive(multiplicity: BondMultiplicity) {
    this.service.toolMode.set(ToolMode.bonding(multiplicity));
  }

  private computeToolModeActive(mode: 'pointer' | 'duplicate' | 'groupMove') {
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

  private computeBondingToolIcon(multiplicity: BondMultiplicity) {
    return computed(() => {
      const appearance = this.service.appearance();
      switch (appearance.bondingType) {
        case 'VALENCE':
          return `iqb:bond_line_${multiplicity}`;
        case 'ELECTRONS':
          return `iqb:bond_dots_${multiplicity}`;
      }
    });
  }

  handlePickElement(event: PointerEvent) {
    this.service
      .pickElementFromTable()
      .then((element) => this.handleAddElement(element.number, event))
      .catch(() => undefined); // ignore rejected Promise, i.e. dialog dismissed
  }

  handleAddElement(elementNr: PsElementNumber, event: PointerEvent) {
    this.service.addElementToCanvas(elementNr, event);
  }

  handleAddFormulaSymbol(symbol: FormulaSymbol, event: PointerEvent) {
    this.service.addFormulaSymbolToCanvas(symbol, event);
  }

  handleAddPartialCharge(partialCharge: PartialCharge, pointerEvent: PointerEvent) {
    this.service.addPartialCharge(partialCharge, pointerEvent);
  }

  async handleClearAll() {
    // @ts-ignore
    const dialogRef = this.dialog.open(EditorControlsClearAllDialog, {
      width: 600,
      height: 200,
      role: 'alertdialog',
    });

    const approved = await firstValueFrom(dialogRef.afterClosed());
    if (approved === true) {
      this.service.clearModel();
    }
  }

  handleZoom(delta: -1 | 1) {
    this.zoomLevelIndex.update((index) => {
      const next = index + delta;
      return Math.max(0, Math.min(this.zoomLevels.length - 1, next));
    });
  }
}

@Component({
  selector: 'app-clear-all-dialog',
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatButton, MatDialogClose],
  template: `
    <h2 matDialogTitle>Molekül-Editor zurücksetzen</h2>
    <mat-dialog-content>
      <p>
        <strong>Achtung:</strong>
        Bist du dir sicher, dass du alles im Molekül-Editor löschen möchtest?
      </p>
    </mat-dialog-content>
    <mat-dialog-actions>
      <button matButton [matDialogClose]="false">Nein</button>
      <button matButton [matDialogClose]="true">Ja</button>
    </mat-dialog-actions>
  `,
})
export class EditorControlsClearAllDialog {}
