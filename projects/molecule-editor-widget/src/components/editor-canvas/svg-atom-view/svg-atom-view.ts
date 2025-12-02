import { Component, computed, inject, input } from '@angular/core';
import { Vector2 } from '../../../services/molecule-editor.model';
import { AtomView } from '../../../services/molecule-editor.view';
import { MoleculeEditorService } from '../../../services/molecule-editor.service';
import { MoleculeEditorRenderer } from '../../../services/molecule-editor.renderer';
import { AngleMath } from '../../../util/angle-math';

@Component({
  selector: 'g[atomView]',
  templateUrl: './svg-atom-view.html',
  styleUrl: './svg-atom-view.scss',
})
export class SvgAtomView {
  readonly atomView = input.required<AtomView>({ alias: 'atomView' });

  readonly service = inject(MoleculeEditorService);
  readonly renderer = inject(MoleculeEditorRenderer);

  readonly outerElectronAngles = computed((): ReadonlyArray<number> => {
    const atomView = this.atomView();
    const { atomElectronAnimations } = this.renderer.animatedView();
    const atomElectronAnimation = atomElectronAnimations[atomView.itemId];
    if (!atomElectronAnimation) return [1, 2, 3, 4, 5, 6, 7, 8, 9]; // SOMETHING WENT HORRIBLY WRONG
    return atomElectronAnimation.electronAngles;
  });

  readonly outerElectronsPositive = computed(() => {
    const atomView = this.atomView();
    return atomView.outerElectrons < 0; // negative number of electrons -> positive
  });

  anglePosition(angle: number): Vector2 {
    const deg90 = AngleMath.deg(90);
    return AngleMath.anglePosition(angle - deg90);
  }

  protected readonly Vector2 = Vector2;
}
