import { Component, inject, input } from '@angular/core';
import { AtomView, ElectronView } from '../../../services/molecule-editor.view';
import { MoleculeEditorService } from '../../../services/molecule-editor.service';

@Component({
  selector: 'g[atomView]',
  templateUrl: './svg-atom-view.html',
  styleUrl: './svg-atom-view.scss',
})
export class SvgAtomView {
  readonly atomView = input.required<AtomView>({ alias: 'atomView' });

  readonly service = inject(MoleculeEditorService);

  singleElectronCoordinates(electron: ElectronView, d: number) {
    const { position } = this.atomView();
    return ElectronView.singleCoordinates(electron, position, d);
  }

  doubleElectronCoordinates(electron: ElectronView, d: number, w: number) {
    const { position } = this.atomView();
    return ElectronView.doubleCoordinates(electron, position, d, w);
  }
}
