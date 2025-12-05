import { Component, computed, ElementRef, inject, signal } from '@angular/core';
import { SvgCanvasDirective } from '../../directives/svg-canvas.directive';
import { MoleculeEditorService } from '../../services/molecule-editor.service';
import { MoleculeEditorRenderer } from '../../services/molecule-editor.renderer';
import { SvgAtomView } from './svg-atom-view/svg-atom-view';
import { SvgBondView } from './svg-bond-view/svg-bond-view';

@Component({
  selector: 'app-editor-canvas',
  templateUrl: './editor-canvas.html',
  styleUrl: './editor-canvas.scss',
  imports: [SvgCanvasDirective, SvgAtomView, SvgBondView],
})
export class EditorCanvas {
  readonly service = inject(MoleculeEditorService);
  readonly renderer = inject(MoleculeEditorRenderer);
  readonly hostRef: ElementRef<HTMLElement> = inject(ElementRef);

  readonly canvasScale = signal(1.0);

  readonly canvasCursor = computed(() => {
    const state = this.service.editorState();

    if (state.state === 'addingAtom') return 'pointer';
    if (state.state === 'movingAtom') return 'grabbing';
    if (state.state === 'addingBond') return 'no-drop';

    // default cursor
    return undefined;
  });

  readonly atomHandleCursor = computed(() => {
    const state = this.service.editorState();
    const toolMode = this.service.toolMode();

    // state cursors
    switch (state.state) {
      case 'addingAtom':
        return 'pointer';
      case 'preMoveAtom':
        return 'pointer';
      case 'movingAtom':
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
