import { MoleculeEditorModel, Vector2 } from './molecule-editor.model';
import { Nominal } from 'periodic-system-common';
import { Injectable, signal } from '@angular/core';

/** Base64-encoded PNG image snapshot of a molecule-editor model */
export type MoleculeEditorImage = Nominal<string, 'MoleculeEditorImage'>;

export interface MoleculeEditorModelWithImage extends MoleculeEditorModel {
  asImage: MoleculeEditorImage;
}

@Injectable()
export class MoleculeEditorImageService {
  private readonly loadingFlag = signal(false);

  readonly isLoading = this.loadingFlag.asReadonly();

  async createModelWithImage(model: MoleculeEditorModel): Promise<MoleculeEditorModelWithImage> {
    if (this.loadingFlag()) {
      console.warn('MoleculeEditorModel image conversion was triggered more than once');
      return Promise.reject();
    } else
      try {
        this.loadingFlag.set(true);
        const asImage = await this.renderAsImage();
        return { ...model, asImage };
      } finally {
        this.loadingFlag.set(false);
      }
  }

  private async renderAsImage(): Promise<MoleculeEditorImage> {
    console.trace('Not implemented yet');
    return ('data:image/png;base64,\n' +
      'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAXUlEQVQY073M\n' +
      'vQ2CUADE8R90tOzgFkzgMg7gLs7BCDYmhD0sTV7F2Vi8EF5nuOpyH3/+rW4f\n' +
      'hMvPDh3r4Stcwxxe4dbEh3co4ROedddXowmlyrYwtoj3sIRHc3S+vgySGhd7\n' +
      'StmKAAAAAElFTkSuQmCC') as MoleculeEditorImage;
  }

  private calculateCroppedViewBox(svg: SVGSVGElement): [minX: number, minY: number, width: number, height: number] {
    const atomElements = svg.querySelectorAll<SVGCircleElement>('circle.atom-handle');
    const atomInBoundCoordinates = Array.from(atomElements).flatMap((atomElement): Vector2[] => {
      const r = atomElement.r.baseVal.value;
      const cx = atomElement.cx.baseVal.value;
      const cy = atomElement.cy.baseVal.value;
      return [
        [cx + r, cy + r],
        [cx - r, cy + r],
        [cx + r, cy - r],
        [cx - r, cy - r],
      ];
    });

    const minX = atomInBoundCoordinates.reduce((x, c) => Math.min(x, c[0]), Number.POSITIVE_INFINITY);
    const minY = atomInBoundCoordinates.reduce((y, c) => Math.min(y, c[1]), Number.POSITIVE_INFINITY);
    const maxX = atomInBoundCoordinates.reduce((x, c) => Math.max(x, c[0]), Number.NEGATIVE_INFINITY);
    const maxY = atomInBoundCoordinates.reduce((y, c) => Math.max(y, c[1]), Number.NEGATIVE_INFINITY);
    const width = maxX - minX;
    const height = maxY - minY;

    return [minX, minY, width, height];
  }

  // private loadSvgDataImage<T>(svgData: string, action: (image: HTMLImageElement) => T | Promise<T>): Promise<T> {
  //   const svgBlob = new Blob([svgData], { type: 'image/svg+xml' });
  //   const svgObjectUrl = URL.createObjectURL(svgBlob);
  //   return new Promise<T>((resolve, reject) => {
  //     const image = document.createElement('img');
  //     image.addEventListener('error', (e) => reject(e.error));
  //     image.addEventListener('load', () => resolve(action(image)));
  //     image.src = svgObjectUrl;
  //   }).finally(() => {
  //     URL.revokeObjectURL(svgObjectUrl);
  //   });
  // }
}
