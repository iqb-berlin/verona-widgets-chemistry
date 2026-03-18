import { Component, computed, inject, input } from '@angular/core';
import { FormulaSymbolView } from '../../../services/molecule-editor.view';
import { FormulaSymbol } from '../../../services/molecule-editor.shared';
import { MoleculeEditorService } from '../../../services/molecule-editor.service';

@Component({
  selector: 'g[formulaSymbol]',
  templateUrl: './svg-formula-symbol-view.html',
  styleUrl: './svg-formula-symbol-view.scss',
})
export class SvgFormulaSymbolView {
  readonly formulaSymbolView = input.required<FormulaSymbolView>({ alias: 'formulaSymbol' });

  protected readonly service = inject(MoleculeEditorService);

  protected readonly symbolSize = 50;

  protected readonly symbolHref = computed(() => {
    const { symbol } = this.formulaSymbolView();
    switch (symbol) {
      case FormulaSymbol.ReactionPlus:
        return '#REACT_PLUS';
      case FormulaSymbol.ReactionArrow:
        return '#REACT_ARROW';
      case FormulaSymbol.EquilibriumArrow:
        return '#EQUI_ARROW';
    }
  });
}
