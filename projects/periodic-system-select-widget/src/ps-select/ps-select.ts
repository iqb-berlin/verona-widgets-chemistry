import { Component, computed, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { VeronaWidgetService } from 'verona-widget';
import { PeriodicSystemModule, PsService } from 'periodic-system-common';
import { PsSelectService } from './ps-select.service';
import { PsSelectAlert } from '../ps-select-alert/ps-select-alert';

@Component({
  selector: 'app-ps-select',
  templateUrl: './ps-select.html',
  styleUrl: './ps-select.scss',
  imports: [PeriodicSystemModule, MatButton, MatIcon, PsSelectAlert],
  providers: [PsSelectService, { provide: PsService, useExisting: PsSelectService }],
})
export class PsSelect {
  readonly psService = inject(PsSelectService);
  readonly widgetService = inject(VeronaWidgetService);

  readonly showSubmitButton = computed(() => {
    const { interaction } = this.psService;
    const { closeOnSelection, selectable } = interaction.interactionConfig();
    // Close-on-selection returns only on a click that selects, so what is left after deselecting part or all of a
    // previous answer can only be saved with the button
    return selectable && (!closeOnSelection || this.selectionCount() < interaction.initialSelectionCount);
  });

  readonly disableSubmitButton = computed(() => {
    // An empty selection is saved only to clear a previous answer; with no previous answer there is nothing to save
    return this.selectionCount() < 1 && this.psService.interaction.initialSelectionCount < 1;
  });

  private readonly selectionCount = computed(() => this.psService.interaction.selectedElementList().length);

  doSubmit() {
    this.widgetService.sendReturn(true);
  }
}
