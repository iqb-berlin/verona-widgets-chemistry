import { Directive, effect, ElementRef, inject, input, signal } from '@angular/core';
import { moleculeCanvasTransformPosition } from '../services/molecule-editor.event';
import { MoleculeEditorService } from '../services/molecule-editor.service';
import { MoleculeEditorImageService } from '../services/molecule-editor-image.service';
import type { Vector2 } from '../services/molecule-editor.model';

@Directive({ selector: '[appSvgCanvas]' })
export class SvgCanvasDirective {
  readonly parentHost = input.required<HTMLElement>({ alias: 'svgCanvasHost' });
  readonly viewBoxScale = input(1.0, { alias: 'svgCanvasScale' });

  protected readonly viewBoxSize = signal<undefined | Vector2>(undefined);

  protected readonly svgElementRef: ElementRef<SVGSVGElement> = inject(ElementRef);
  protected readonly editorService = inject(MoleculeEditorService);
  protected readonly imageService = inject(MoleculeEditorImageService);

  private readonly resizeObserver = new ResizeObserver((entries) => {
    entries.forEach((entry) => {
      const { width, height } = entry.contentRect;
      this.viewBoxSize.set([width, height]);
    });
  });

  constructor() {
    // Setup resize observer on parent-host element
    effect((onCleanup) => {
      const element = this.parentHost();
      this.resizeObserver.observe(element, { box: 'border-box' });
      onCleanup(() => this.resizeObserver.disconnect());
    });

    // Set viewBox attribute based on size * scale
    effect(() => {
      const scale = this.viewBoxScale();
      const size = this.viewBoxSize();
      const svg = this.svgElementRef.nativeElement;
      if (size) {
        const [baseWidth, baseHeight] = size;
        const width = Math.round(baseWidth / scale);
        const height = Math.round(baseHeight / scale);
        const midX = Math.round(width / -2);
        const midY = Math.round(height / -2);
        svg.setAttribute('viewBox', `${midX} ${midY} ${width} ${height}`);
      }
    });

    this.editorService.registerCanvasTransform(
      moleculeCanvasTransformPosition((event) => {
        const { x, y } = this.pointerToSvgPoint(event);
        return [x, y] as const;
      }),
    );
  }

  private pointerToSvgPoint(event: PointerEvent): SVGPoint {
    const svgElement = this.svgElementRef.nativeElement;
    const clientPoint = svgElement.createSVGPoint();
    clientPoint.x = event.clientX;
    clientPoint.y = event.clientY;

    const svgTransform = svgElement.getScreenCTM()!;
    return clientPoint.matrixTransform(svgTransform.inverse());
  }
}
