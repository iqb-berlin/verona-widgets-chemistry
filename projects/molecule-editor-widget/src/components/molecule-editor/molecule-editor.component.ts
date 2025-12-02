import { Component, inject } from '@angular/core';
import { MatIcon, MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import { MatButton } from '@angular/material/button';
import { MatDrawer, MatDrawerContainer } from '@angular/material/sidenav';
import { PsService, PsTable, PsTableInteractionsDirective } from 'periodic-system-common';
import { MoleculeEditorService } from '../../services/molecule-editor.service';
import { MoleculeEditorPickerService } from '../../services/molecule-editor-picker.service';
import { EditorCanvas } from '../editor-canvas/editor-canvas';
import { EditorControls } from '../editor-controls/editor-controls';
import IqbIcons from '../../assets/iqb-icons.svg';

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

  protected readonly iconRegistry = inject(MatIconRegistry);
  protected readonly domSanitizer = inject(DomSanitizer);

  constructor() {
    this.registerCustomSvgIcons();
  }

  private registerCustomSvgIcons() {
    const safeIqbIcons = this.domSanitizer.bypassSecurityTrustHtml(IqbIcons);
    this.iconRegistry.addSvgIconSetLiteralInNamespace('iqb', safeIqbIcons);
  }
}
