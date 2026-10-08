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
    // Close-on-selection never returns an empty selection by itself, so offer saving when a previous answer was cleared
    return selectable && (!closeOnSelection || this.clearsPreviousAnswer());
  });

  readonly disableSubmitButton = computed(() => {
    // An empty selection is saved only to clear a previous answer; with no previous answer there is nothing to save
    const { interaction } = this.psService;
    return interaction.selectedElements().size < 1 && interaction.initialSelectionEmpty;
  });

  private readonly clearsPreviousAnswer = computed(() => {
    const { interaction } = this.psService;
    return interaction.selectedElements().size < 1 && !interaction.initialSelectionEmpty;
  });

  doSubmit() {
    this.widgetService.sendReturn(true);
  }
}
