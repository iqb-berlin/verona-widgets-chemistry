import { Component, computed, inject, input } from '@angular/core';
import { PartialChargeView } from '../../../services/molecule-editor.view';
import { MoleculeEditorService } from '../../../services/molecule-editor.service';
import { PartialCharge } from '../../../services/molecule-editor.shared';
import * as C from '../../../services/molecule-editor.constants';

@Component({
  selector: 'g[partialCharge]',
  templateUrl: './svg-partial-charge-view.html',
  styleUrl: './svg-partial-charge-view.scss',
})
export class SvgPartialChargeView {
  readonly partialView = input.required<PartialChargeView>({ alias: 'partialCharge' });

  readonly service = inject(MoleculeEditorService);

  protected readonly atomHandleRadius = C.atomHandleRadius;
  protected readonly partialChargeSize = C.partialChargeSize;

  protected readonly partialChargeHref = computed(() => {
    const { charge } = this.partialView();
    switch (charge) {
      case PartialCharge.Positive:
        return '#DELTA_PLUS';
      case PartialCharge.Negative:
        return '#DELTA_MINUS';
    }
  });
}
