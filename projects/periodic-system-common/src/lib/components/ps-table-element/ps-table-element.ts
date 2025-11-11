import { Component, computed, inject, input } from '@angular/core';
import { MatFabButton } from '@angular/material/button';
import { MatTooltip } from '@angular/material/tooltip';
import { PsElement } from '../../data/PsData';
import { PsService } from '../../services/ps-service';

@Component({
  selector: 'lib-ps-table-element',
  imports: [MatFabButton, MatTooltip],
  templateUrl: './ps-table-element.html',
  styleUrl: './ps-table-element.scss',
})
export class PsTableElement {
  readonly service = inject(PsService);

  readonly element = input.required<PsElement>();

  readonly elementNumber = computed(() => this.element().number);
  readonly elementSymbol = computed(() => this.element().symbol);
  readonly atomicMass = computed(() => this.element().atomic_mass);
  readonly electroNegativity = computed(() => this.element().negativity?.pauling);

  readonly elementName = computed(() => {
    const element = this.element();
    const locale = this.service.appearance().locale;
    return element.names[locale];
  });

  readonly isSelected = computed(() => {
    const element = this.element();
    const selectedElements = this.service.interaction.selectedElements();
    return selectedElements.has(element.number);
  });
}
