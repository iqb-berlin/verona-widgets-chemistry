import { Component, computed, inject, input } from '@angular/core';
import { AtomView } from '../../../services/molecule-editor.view';
import { MoleculeEditorService } from '../../../services/molecule-editor.service';
import { Vector2 } from '../../../services/molecule-editor.model';
import { AngleMath } from '../../../util/angular-math';

@Component({
  selector: 'g[atomView]',
  templateUrl: './svg-atom-view.html',
  styleUrl: './svg-atom-view.scss',
})
export class SvgAtomView {
  readonly service = inject(MoleculeEditorService);

  readonly atomView = input.required<AtomView>({ alias: 'atomView' });

  readonly outerElectronAngles = computed((): ReadonlyArray<number> => {
    const atomView = this.atomView();
    return AngleMath.distributeAngles(Math.abs(atomView.outerElectrons));
  });

  readonly outerElectronsPositive = computed(() => {
    const atomView = this.atomView();
    return atomView.outerElectrons < 0; // negative number of electrons -> positive
  });

  anglePosition(angle: number): Vector2 {
    return AngleMath.anglePosition(angle - 90);
  }

  protected readonly Vector2 = Vector2;
}
