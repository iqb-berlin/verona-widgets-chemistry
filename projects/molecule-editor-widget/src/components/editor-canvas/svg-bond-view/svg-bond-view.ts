import { Component, computed, inject, input } from '@angular/core';
import { BondView } from '../../../services/molecule-editor.view';
import { MoleculeEditorService } from '../../../services/molecule-editor.service';
import { AngleMath } from '../../../util/angular-math';
import { Vector2 } from '../../../services/molecule-editor.model';

type LinePosition = readonly [a: Vector2, b: Vector2];

@Component({
  selector: 'g[bondView]',
  templateUrl: './svg-bond-view.html',
  styleUrl: './svg-bond-view.scss',
})
export class SvgBondView {
  readonly service = inject(MoleculeEditorService);

  readonly bondView = input.required<BondView>({ alias: 'bondView' });

  readonly bondLinePositions = computed((): ReadonlyArray<LinePosition> => {
    const { leftPosition, rightPosition, multiplicity } = this.bondView();
    const baseLine = [leftPosition, rightPosition] as const;

    const offsetDistance = 6;
    const bondLineAngle = AngleMath.angleBetween(leftPosition, rightPosition);
    const bondLineOffset = Vector2.mul(AngleMath.anglePosition(bondLineAngle + 90), offsetDistance);

    switch (multiplicity) {
      case 1: {
        return [baseLine];
      }
      case 2: {
        return [
          offsetLine(baseLine, Vector2.mul(bondLineOffset, -0.5)),
          offsetLine(baseLine, Vector2.mul(bondLineOffset, +0.5)),
        ];
      }
      case 3: {
        return [
          baseLine,
          offsetLine(baseLine, bondLineOffset),
          offsetLine(baseLine, Vector2.neg(bondLineOffset)),
        ];
      }
      default:
        console.warn('Invalid bond multiplicity:', multiplicity satisfies never);
        return [];
    }
  });
}

function offsetLine([a, b]: LinePosition, offset: Vector2): LinePosition {
  return [
    Vector2.add(a, offset),
    Vector2.add(b, offset),
  ] as const;
}
