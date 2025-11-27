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
    const { closeOnSelection } = this.psService.interaction.interactionConfig();
    return !closeOnSelection;
  });

  readonly disableSubmitButton = computed(() => {
    const selectedElements = this.psService.interaction.selectedElements();
    return selectedElements.size < 1;
  });

  readonly multiSelectMaxedOut = computed(() => {
    const { multiSelect, maxSelectCount } = this.psService.interaction.interactionConfig();
    const selectedElements = this.psService.interaction.selectedElements();
    return multiSelect && maxSelectCount > 1 && selectedElements.size >= maxSelectCount;
  });

  doSubmit() {
    this.widgetService.sendReturn(true);
  }
}
