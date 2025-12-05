import { Component, computed, inject, input } from '@angular/core';
import { MoleculeEditorBondingType, MoleculeEditorService } from '../../../services/molecule-editor.service';
import { BondView } from '../../../services/molecule-editor.view';
import { Vector2 } from '../../../services/molecule-editor.model';
import { AngleMath } from '../../../util/angle-math';

type LineDef = readonly [start: Vector2, end: Vector2];

const deg90 = AngleMath.deg(90);

@Component({
  selector: 'g[bondView]',
  templateUrl: './svg-bond-view.html',
  styleUrl: './svg-bond-view.scss',
})
export class SvgBondView {
  readonly bondView = input.required<BondView>({ alias: 'bondView' });

  readonly service = inject(MoleculeEditorService);

  readonly bondingType = computed(() => {
    const { bondingType } = this.service.appearance();
    return bondingType;
  });

  readonly ValenceBondingType = MoleculeEditorBondingType.valence;
  readonly ElectronsBondingType = MoleculeEditorBondingType.electrons;

  //TODO: Move into MoleculeEditorView
  readonly bondLinePositions = computed((): ReadonlyArray<LineDef> => {
    const { leftPosition, rightPosition, multiplicity } = this.bondView();
    const baseLine = [leftPosition, rightPosition] as const;

    const offsetDistance = 6;
    const bondLineAngle = AngleMath.angleBetween(leftPosition, rightPosition);
    const bondLineOffset = Vector2.scale(offsetDistance, AngleMath.anglePosition(bondLineAngle + deg90));

    switch (multiplicity) {
      case 1:
        return [baseLine];
      case 2:
        return [
          offsetLine(baseLine, Vector2.scale(-0.5, bondLineOffset)),
          offsetLine(baseLine, Vector2.scale(+0.5, bondLineOffset)),
        ];
      case 3:
        return [baseLine, offsetLine(baseLine, bondLineOffset), offsetLine(baseLine, Vector2.neg(bondLineOffset))];
      default:
        console.warn('Invalid bond multiplicity:', multiplicity satisfies never);
        return [];
    }
  });

  //TODO: Move into MoleculeEditorView
  readonly bondDotsPositions = computed((): ReadonlyArray<Vector2> => {
    const { leftPosition, rightPosition, multiplicity } = this.bondView();
    const centerPosition = Vector2.middle(leftPosition, rightPosition);

    const separationDistance = 6;
    const bondLineAngle = AngleMath.angleBetween(leftPosition, rightPosition);
    const lineForwardOffset = Vector2.scale(separationDistance, AngleMath.anglePosition(bondLineAngle));
    const separationOffset = Vector2.scale(separationDistance, AngleMath.anglePosition(bondLineAngle + deg90));

    const c1 = Vector2.add(centerPosition, lineForwardOffset);
    const c2 = Vector2.add(centerPosition, Vector2.neg(lineForwardOffset));

    switch (multiplicity) {
      case 1:
        return [c1, c2];
      case 2: {
        const o1 = separationOffset;
        const o2 = Vector2.neg(o1);
        return [Vector2.add(c1, o1), Vector2.add(c2, o1), Vector2.add(c1, o2), Vector2.add(c2, o2)];
      }
      case 3: {
        const o1 = Vector2.scale(1.5, separationOffset);
        const o2 = Vector2.neg(o1);
        return [c1, c2, Vector2.add(c1, o1), Vector2.add(c2, o1), Vector2.add(c1, o2), Vector2.add(c2, o2)];
      }
      default:
        console.warn('Invalid bond multiplicity:', multiplicity satisfies never);
        return [];
    }
  });
}

function offsetLine([a, b]: LineDef, offset: Vector2): LineDef {
  return [Vector2.add(a, offset), Vector2.add(b, offset)] as const;
}
