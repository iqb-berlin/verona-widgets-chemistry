import { Component, inject } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatButton } from '@angular/material/button';
import { MatDrawer, MatDrawerContainer } from '@angular/material/sidenav';
import { PsService, PsTable, PsTableInteractionsDirective } from 'periodic-system-common';
import { MoleculeEditorService } from '../../services/molecule-editor.service';
import { MoleculeEditorPickerService } from '../../services/molecule-editor-picker.service';
import { EditorCanvas } from '../editor-canvas/editor-canvas';
import { EditorControls } from '../editor-controls/editor-controls';

@Component({
  selector: 'app-molecule-editor',
  templateUrl: './molecule-editor.component.html',
  styleUrl: './molecule-editor.component.scss',
  providers: [
    MoleculeEditorService,
    MoleculeEditorPickerService,
    { provide: PsService, useExisting: MoleculeEditorPickerService },
  ],
  imports: [
    MatDrawerContainer,
    MatDrawer,
    MatButton,
    MatIcon,
    PsTable,
    PsTableInteractionsDirective,
    EditorCanvas,
    EditorControls,
  ],
})
export class MoleculeEditor {
  readonly service = inject(MoleculeEditorService);
}
