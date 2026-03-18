import { Component, computed, ElementRef, inject } from '@angular/core';
import { SvgCanvasDirective } from '../../directives/svg-canvas.directive';
import { SvgCustomIconDirective } from '../../directives/svg-custom-icon.directive';
import { MoleculeEditorService } from '../../services/molecule-editor.service';
import { MoleculeEditorRenderer } from '../../services/molecule-editor.renderer';
import { SvgAtomView } from './svg-atom-view/svg-atom-view';
import { SvgBondView } from './svg-bond-view/svg-bond-view';
import { SvgFormulaSymbolView } from './svg-formula-symbol-view/svg-formula-symbol-view';

@Component({
  selector: 'app-editor-canvas',
  templateUrl: './editor-canvas.html',
  styleUrl: './editor-canvas.scss',
  imports: [SvgCanvasDirective, SvgCustomIconDirective, SvgAtomView, SvgBondView, SvgFormulaSymbolView],
})
export class EditorCanvas {
  readonly service = inject(MoleculeEditorService);
  readonly renderer = inject(MoleculeEditorRenderer);
  readonly hostRef: ElementRef<HTMLElement> = inject(ElementRef);

  readonly canvasCursor = computed(() => {
    const state = this.service.editorState();

    // state specific cursor
    switch (state.state) {
      case 'addingAtom':
      case 'movingAtom':
        return 'pointer';
      case 'addingBond':
        return 'no-drop';
    }

    // default cursor
    return undefined;
  });

  readonly atomHandleCursor = computed(() => {
    const state = this.service.editorState();
    const toolMode = this.service.toolMode();

    // state cursors
    switch (state.state) {
      case 'addingAtom':
      case 'addingFormulaSymbol':
        return 'pointer';
      case 'preMoveAtom':
      case 'preMoveOther':
        return 'pointer';
      case 'movingAtom':
      case 'movingOther':
        return 'grabbing';
      case 'movingGroup':
        return 'move';
      case 'idle':
      case 'selected':
      case 'addingBond':
        break; // use tool cursor below
      default:
        void (state satisfies never);
    }

    // tool cursors
    switch (toolMode.mode) {
      case 'pointer':
        return 'pointer';
      case 'groupMove':
        return 'move';
      case 'duplicate':
        return 'copy';
      case 'bonding':
        return 'crosshair';
      default:
        void (toolMode satisfies never);
    }

    return undefined;
  });

  readonly formulaSymbolCursor = computed(() => {
    const tool = this.service.toolMode();
    const atomCursor = this.atomHandleCursor();

    // tool cursor override
    switch (tool.mode) {
      case 'bonding':
        return 'not-allowed';
    }

    // fallback to atom cursor
    return atomCursor;
  });

  readonly bondHandleCursor = computed(() => {
    const toolMode = this.service.toolMode();

    switch (toolMode.mode) {
      case 'pointer':
      case 'bonding':
        return 'pointer';
      case 'duplicate':
      case 'groupMove':
        return 'not-allowed';
      default:
        void (toolMode satisfies never);
    }

    return undefined;
  });
}
