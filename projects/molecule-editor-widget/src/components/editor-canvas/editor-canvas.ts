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
  providers: [
    MoleculeEditorRenderer,
  ],
  imports: [
    SvgCanvasDirective,
    SvgAtomView,
    SvgBondView,
  ],
})
export class EditorCanvas {
  readonly service = inject(MoleculeEditorService);
  readonly renderer = inject(MoleculeEditorRenderer);
  readonly hostRef: ElementRef<HTMLElement> = inject(ElementRef);

  readonly canvasScale = signal(1.0);

  readonly canvasCursor = computed(() => {
    const state = this.service.state();
    if (state.state === 'addingAtom') return 'pointer';
    if (state.state === 'movingAtom') return 'grabbing';
    if (state.state === 'addingBond') return 'no-drop';

    // default cursor
    return undefined;
  });

  readonly atomHandleCursor = computed(() => {
    const state = this.service.state();
    const toolMode = this.service.toolMode();

    // state cursors
    if (state.state === 'addingAtom') return 'pointer';
    if (state.state === 'preMoveAtom') return 'pointer';
    if (state.state === 'movingAtom') return 'grabbing';

    // tool cursors
    switch (toolMode.mode) {
      case 'pointer':
        return 'grab';
      case 'duplicate':
        return 'copy';
      case 'bonding':
        return 'crosshair';
      default:
        void (toolMode satisfies never);
        return undefined;
    }
  });
}
