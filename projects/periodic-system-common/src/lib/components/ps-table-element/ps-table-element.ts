import { Component, inject, input } from '@angular/core';
import { MatFabButton } from '@angular/material/button';
import { MatTooltip } from '@angular/material/tooltip';
import { DecimalPipe } from '@angular/common';
import { PsElement } from '../../data/PsData';
import { computeElementName, computeElementSelected, PsService } from '../../services/ps-service';

@Component({
  selector: 'lib-ps-table-element',
  templateUrl: './ps-table-element.html',
  styleUrl: './ps-table-element.scss',
  imports: [MatFabButton, MatTooltip, DecimalPipe],
})
export class PsTableElement {
  readonly service = inject(PsService);

  readonly element = input.required<PsElement>();

  readonly elementName = computeElementName(this.service, this.element);
  readonly isSelected = computeElementSelected(this.service, this.element);
}
