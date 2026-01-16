import { Component, computed, inject, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatCard } from '@angular/material/card';
import { PsElement } from '../../data/PsData';
import { computeElementName, PsService } from '../../services/ps-service';

@Component({
  selector: 'lib-ps-element-focus',
  templateUrl: './ps-element-focus.html',
  styleUrl: './ps-element-focus.scss',
  imports: [MatCard, DecimalPipe],
})
export class PsElementFocusDirective {
  readonly service = inject(PsService);

  readonly element = input.required<PsElement>();

  readonly elementName = computeElementName(this.service, this.element);

  readonly computeBaseColor = computed(() => {
    const element = this.element();
    const { defaultBaseColor, enableBlockColors, blockColors } = this.service.appearance();
    return enableBlockColors ? (element.block_override ? blockColors[element.block_override] : blockColors[element.block]) : defaultBaseColor;
  });
}
