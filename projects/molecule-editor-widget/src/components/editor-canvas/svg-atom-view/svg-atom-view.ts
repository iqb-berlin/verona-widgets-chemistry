import { Component, inject, input } from '@angular/core';
import { AtomView, ElectronView } from '../../../services/molecule-editor.view';
import { MoleculeEditorService } from '../../../services/molecule-editor.service';
import * as C from '../../../services/molecule-editor.constants';

@Component({
  selector: 'g[atomView]',
  templateUrl: './svg-atom-view.html',
  styleUrl: './svg-atom-view.scss',
})
export class SvgAtomView {
  readonly atomView = input.required<AtomView>({ alias: 'atomView' });

  readonly service = inject(MoleculeEditorService);

  protected readonly atomHandleRadius = C.atomHandleRadius;

  protected readonly singleElectron = 1;
  protected readonly singleElectronDist = C.singleElectronDist;
  protected readonly singleElectronRadius = C.singleElectronRadius;

  protected readonly doubleElectron = 2;
  protected readonly doubleElectronDist = C.doubleElectronDist;
  protected readonly doubleElectronWidth = C.doubleElectronWidth;
  protected readonly doubleElectronRadius = C.doubleElectronRadius;

  protected readonly formalChargeHandleRadius = C.formalChargeHandleRadius;

  singleElectronCoordinates(electron: ElectronView, d: number) {
    const { position } = this.atomView();
    return ElectronView.singleCoordinates(electron, position, d);
  }

  doubleElectronCoordinates(electron: ElectronView, d: number, w: number) {
    const { position } = this.atomView();
    return ElectronView.doubleCoordinates(electron, position, d, w);
  }
}
