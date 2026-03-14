import { DOCUMENT, inject, Injectable, signal, untracked } from '@angular/core';
import { Nominal } from 'periodic-system-common';
import { MoleculeEditorModel } from './molecule-editor.model';
import { MoleculeEditorView } from './molecule-editor.view';
import { MoleculeEditorImageRenderer } from './molecule-editor-image.renderer';

/** Base64-encoded PNG image snapshot of a molecule-editor model */
export type MoleculeEditorImage = Nominal<string, 'MoleculeEditorImage'>;

export interface MoleculeEditorModelWithImage extends MoleculeEditorModel {
  asImage: MoleculeEditorImage;
}

@Injectable()
export class MoleculeEditorImageService {
  private readonly document = inject(DOCUMENT);
  private readonly renderer = inject(MoleculeEditorImageRenderer);
  private readonly xmlSerializer = new XMLSerializer();

  private readonly loadingFlag = signal(false);
  readonly isLoading = this.loadingFlag.asReadonly();

  async createModelWithImage(
    model: MoleculeEditorModel,
    view: MoleculeEditorView,
  ): Promise<MoleculeEditorModelWithImage> {
    if (untracked(this.loadingFlag)) {
      console.warn('MoleculeEditorModel image conversion was triggered more than once');
      return Promise.reject();
    }
    try {
      this.loadingFlag.set(true);
      const asImage = await this.renderAsImage(view);
      return { ...model, asImage };
    } finally {
      this.loadingFlag.set(false);
    }
  }

  private async renderAsImage(view: MoleculeEditorView): Promise<MoleculeEditorImage> {
    const svgRoot = this.renderer.renderSvgTree(view);
    const svgContent = this.xmlSerializer.serializeToString(svgRoot);

    const { width, height } = svgRoot.viewBox.baseVal;
    const canvas = await this.renderSvgToCanvas(svgContent, Math.ceil(width), Math.ceil(height));
    return canvas.toDataURL('image/png') as MoleculeEditorImage;
  }

  private async renderSvgToCanvas(svgContent: string, width: number, height: number): Promise<HTMLCanvasElement> {
    const canvas = this.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    await this.loadSvgDataImage(svgContent, width, height, (image) => {
      const context = canvas.getContext('2d')!;
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
    });

    return canvas;
  }

  private loadSvgDataImage<T>(
    svgContent: string,
    width: number,
    height: number,
    action: (image: HTMLImageElement) => T | Promise<T>,
  ): Promise<T> {
    const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' });
    const svgObjectUrl = URL.createObjectURL(svgBlob);
    return new Promise<T>((resolve, reject) => {
      const image = this.document.createElement('img');
      image.addEventListener('error', (e) => reject(e.error));
      image.addEventListener('load', () => resolve(action(image)));
      image.width = width;
      image.height = height;
      image.src = svgObjectUrl;
    }).finally(() => {
      URL.revokeObjectURL(svgObjectUrl);
    });
  }
}
