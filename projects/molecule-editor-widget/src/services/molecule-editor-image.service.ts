import { MoleculeEditorModel } from './molecule-editor.model';
import { Nominal } from 'periodic-system-common';
import { Injectable, signal } from '@angular/core';
import { MoleculeEditorView } from './molecule-editor.view';

/** Base64-encoded PNG image snapshot of a molecule-editor model */
export type MoleculeEditorImage = Nominal<string, 'MoleculeEditorImage'>;

export interface MoleculeEditorModelWithImage extends MoleculeEditorModel {
  asImage: MoleculeEditorImage;
}

@Injectable()
export class MoleculeEditorImageService {
  private readonly loadingFlag = signal(false);
  private readonly xmlSerializer = new XMLSerializer();

  readonly isLoading = this.loadingFlag.asReadonly();

  async createModelWithImage(
    model: MoleculeEditorModel,
    view: MoleculeEditorView,
  ): Promise<MoleculeEditorModelWithImage> {
    if (this.loadingFlag()) {
      console.warn('MoleculeEditorModel image conversion was triggered more than once');
      return Promise.reject();
    } else
      try {
        this.loadingFlag.set(true);
        const asImage = await this.renderAsImage(view);
        return { ...model, asImage };
      } finally {
        this.loadingFlag.set(false);
      }
  }

  private async renderAsImage(view: MoleculeEditorView): Promise<MoleculeEditorImage> {
    const svgRoot = this.renderSvgTree(view);
    const svgContent = this.xmlSerializer.serializeToString(svgRoot);
    console.log('svgContent', svgContent);

    const { width, height } = svgRoot.viewBox.baseVal; //TODO: Determine final size of image?
    const canvas = await this.renderSvgToImage(svgContent, width, height);
    return canvas.toDataURL('image/png') as MoleculeEditorImage;
  }

  private renderSvgTree(view: MoleculeEditorView): SVGSVGElement {
    const ns = 'http://www.w3.org/2000/svg';
    const root = document.createElementNS(ns, 'svg');

    // ---------------------------------------
    // TODO: IMPLEMENT SVG TREE RENDERING HERE
    // ---------------------------------------
    const helloWorld = document.createElementNS(ns, 'text');
    helloWorld.textContent = 'Hello, World!';
    root.appendChild(helloWorld);
    root.setAttribute('viewBox', '0 -15 100 20');

    return root;
  }

  private async renderSvgToImage(svgContent: string, width: number, height: number): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    await this.loadSvgDataImage(svgContent, (image) => {
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      context.save();
    });

    return canvas;
  }

  private loadSvgDataImage<T>(svgContent: string, action: (image: HTMLImageElement) => T | Promise<T>): Promise<T> {
    const svgBlob = new Blob([svgContent], { type: 'image/svg+xml' });
    const svgObjectUrl = URL.createObjectURL(svgBlob);
    return new Promise<T>((resolve, reject) => {
      const image = document.createElement('img');
      image.addEventListener('error', (e) => reject(e.error));
      image.addEventListener('load', () => resolve(action(image)));
      image.src = svgObjectUrl;
    }).finally(() => {
      URL.revokeObjectURL(svgObjectUrl);
    });
  }
}
