import { Component, computed, effect, inject, untracked } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { MatDrawer, MatDrawerContainer } from '@angular/material/sidenav';
import { PsService, PsTable, PsTableInteractionsDirective } from 'periodic-system-common';
import { MoleculeEditorModel } from '../../services/molecule-editor.model';
import { MoleculeEditorService } from '../../services/molecule-editor.service';
import { MoleculeEditorRenderer } from '../../services/molecule-editor.renderer';
import { MoleculeEditorPickerService } from '../../services/molecule-editor-picker.service';
import { MoleculeEditorImageService } from '../../services/molecule-editor-image.service';
import { CustomIconsService, registerCustomIcons } from '../../services/custom-icons.service';
import { EditorCanvas } from '../editor-canvas/editor-canvas';
import { EditorControls } from '../editor-controls/editor-controls';
import { debounceSignal } from '../../util/debounce-signal';
import IqbIcons from '../../assets/iqb-icons.svg';

@Component({
  selector: 'app-molecule-editor',
  templateUrl: './molecule-editor.html',
  styleUrl: './molecule-editor.scss',
  providers: [
    MoleculeEditorService,
    MoleculeEditorRenderer,
    MoleculeEditorImageService,
    MoleculeEditorPickerService,
    { provide: PsService, useExisting: MoleculeEditorPickerService },
    registerCustomIcons([{ namespace: 'iqb', svg: IqbIcons }]),
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
    MatProgressSpinner,
  ],
})
export class MoleculeEditor {
  readonly service = inject(MoleculeEditorService);
  readonly renderer = inject(MoleculeEditorRenderer);
  readonly imageService = inject(MoleculeEditorImageService);
  readonly customIcons = inject(CustomIconsService);

  // Synchronize model with widget state-data after 1 second of inactivity using this debounced signal
  protected readonly debouncedModel = debounceSignal(this.service.model, 1_000);

  constructor() {
    this.customIcons.registerIcons();

    // On (debounced) model update, send state-data to API
    effect(() => {
      const model = this.debouncedModel();
      this.sendStateData(model);
    });
  }

  readonly isLoadingSubmit = this.imageService.isLoading;

  readonly isModelEmpty = computed(() => {
    const model = this.service.model();
    return Object.keys(model.atoms).length === 0;
  });

  async handleSubmitModel() {
    // Cancel any model-sync that may currently be pending,
    // as this would interfere with the state-data being sent on return
    this.debouncedModel.cancelPending();

    // Get current model, and render an image
    const model = untracked(this.service.model);
    const view = untracked(this.renderer.view);
    const modelWithImage = await this.imageService.createModelWithImage(model, view);

    // Send state and return-request to API
    this.sendStateData(modelWithImage); //TODO: Replace with finalState in return-request, once available
    this.service.widgetService.sendReturn(true);
  }

  private sendStateData(model: MoleculeEditorModel): void {
    const modelJson = JSON.stringify(model);
    this.service.widgetService.stateData.set(modelJson);
  }
}
