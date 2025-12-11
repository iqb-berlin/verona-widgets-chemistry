import { DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { Nominal } from 'periodic-system-common';
import { ItemId, MoleculeEditorModel, Vector2 } from './molecule-editor.model';
import { BondView, ElectronView, MoleculeEditorView } from './molecule-editor.view';
import { MoleculeEditorBondingType, MoleculeEditorService } from './molecule-editor.service';
import * as C from './molecule-editor.constants';

/** Base64-encoded PNG image snapshot of a molecule-editor model */
export type MoleculeEditorImage = Nominal<string, 'MoleculeEditorImage'>;

export interface MoleculeEditorModelWithImage extends MoleculeEditorModel {
  asImage: MoleculeEditorImage;
}

@Injectable()
export class MoleculeEditorImageService {
  private readonly service = inject(MoleculeEditorService);
  private readonly document = inject(DOCUMENT);

  private readonly loadingFlag = signal(false);
  private readonly xmlSerializer = new XMLSerializer();
  private readonly canvas = this.document.createElement('canvas');

  readonly isLoading = this.loadingFlag.asReadonly();

  async createModelWithImage(
    model: MoleculeEditorModel,
    view: MoleculeEditorView,
  ): Promise<MoleculeEditorModelWithImage> {
    if (this.loadingFlag()) {
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
    const svgRoot = this.renderSvgTree(view);
    const svgContent = this.xmlSerializer.serializeToString(svgRoot);

    const { width, height } = svgRoot.viewBox.baseVal;
    const canvas = await this.renderSvgToImage(svgContent, Math.ceil(width), Math.ceil(height));
    return canvas.toDataURL('image/png') as MoleculeEditorImage;
  }

  private renderSvgTree(view: MoleculeEditorView): SVGSVGElement {
    const { bondingType } = this.service.appearance();

    const ns = 'http://www.w3.org/2000/svg';
    const svg = this.document.createElementNS(ns, 'svg');

    // Compute viewBox from atoms
    const [viewBoxMin, viewBoxMax] = calculateViewBox(view, [40, 40]);
    const viewBoxSize = Vector2.sub(viewBoxMax, viewBoxMin);
    svg.setAttribute('viewBox', viewBoxAttributeValue(viewBoxMin, viewBoxSize));

    const root = this.document.createElementNS(ns, 'g');
    root.style.backgroundColor = '#ffffff';
    svg.appendChild(root);

    // ------------------------------
    // Draw bonds
    // ------------------------------
    for (const bond of view.bonds) {
      if (bondingType === MoleculeEditorBondingType.valence) {
        const lines = BondView.valenceBondLines(bond, C.bondSeparation);
        for (const [a, b] of lines) {
          const [x1, y1] = a;
          const [x2, y2] = b;
          const line = this.document.createElementNS(ns, 'line');
          line.setAttribute('x1', String(x1));
          line.setAttribute('y1', String(y1));
          line.setAttribute('x2', String(x2));
          line.setAttribute('y2', String(y2));
          line.setAttribute('stroke', '#000000');
          line.setAttribute('stroke-width', String(C.singleElectronRadius));
          root.appendChild(line);
        }
      } else if (bondingType === MoleculeEditorBondingType.electrons) {
        const dots = BondView.electronBondDots(bond, C.bondSeparation);
        for (const pos of dots) {
          const [cx, cy] = pos;
          const dot = this.document.createElementNS(ns, 'circle');
          dot.setAttribute('cx', String(cx));
          dot.setAttribute('cy', String(cy));
          dot.setAttribute('r', String(C.electronBondRadius));
          dot.setAttribute('fill', '#000000');
          root.appendChild(dot);
        }
      }
    }

    // ------------------------------
    // Draw atoms and local electrons
    // ------------------------------
    for (const atom of view.atoms) {
      if (ItemId.isTemporaryId(atom.itemId)) continue;

      const g = this.document.createElementNS(ns, 'g');

      // --- Atom circle covering nearby bonds ---
      const circle = this.document.createElementNS(ns, 'circle');
      const [centerX, centerY] = atom.position;
      circle.setAttribute('cx', String(centerX));
      circle.setAttribute('cy', String(centerY));
      circle.setAttribute('r', String(C.atomHandleRadius));
      circle.setAttribute('fill', '#ffffff'); // background color covering bonds
      circle.setAttribute('stroke', '#000000');
      circle.setAttribute('stroke-width', '1');
      circle.setAttribute('stroke-opacity', '50%');
      g.appendChild(circle);

      // atom element text
      const text = this.document.createElementNS(ns, 'text');
      text.textContent = atom.element.symbol;
      text.setAttribute('x', String(centerX));
      text.setAttribute('y', String(centerY));
      text.setAttribute('font-size', '24px');
      text.setAttribute('font-family', 'sans-serif');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('fill', '#000000');
      g.appendChild(text);

      for (const e of atom.electrons) {
        if (e.type === 1) {
          const pos = ElectronView.singleCoordinates(e, atom.position, C.singleElectronDist);
          const dot = this.document.createElementNS(ns, 'circle');
          dot.setAttribute('cx', String(pos.x));
          dot.setAttribute('cy', String(pos.y));
          dot.setAttribute('r', String(C.singleElectronRadius));
          dot.setAttribute('fill', '#000000');
          g.appendChild(dot);
        } else {
          const coords = ElectronView.doubleCoordinates(e, atom.position, C.doubleElectronDist, C.doubleElectronWidth);
          const tick = this.document.createElementNS(ns, 'line');
          tick.setAttribute('x1', String(coords.x1));
          tick.setAttribute('y1', String(coords.y1));
          tick.setAttribute('x2', String(coords.x2));
          tick.setAttribute('y2', String(coords.y2));
          tick.setAttribute('stroke', '#000000');
          tick.setAttribute('stroke-width', String(C.doubleElectronRadius));
          tick.setAttribute('stroke-linecap', 'round');
          g.appendChild(tick);
        }
      }

      root.appendChild(g);
    }

    return svg;
  }

  private async renderSvgToImage(svgContent: string, width: number, height: number): Promise<HTMLCanvasElement> {
    this.canvas.width = width;
    this.canvas.height = height;

    await this.loadSvgDataImage(svgContent, width, height, (image) => {
      const context = this.canvas.getContext('2d')!;
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
    });

    return this.canvas;
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

function calculateViewBox(view: MoleculeEditorView, padding: Vector2): [min: Vector2, max: Vector2] {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const atom of view.atoms) {
    if (ItemId.isTemporaryId(atom.itemId)) continue;
    const [x, y] = atom.position;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  const min = Vector2.sub([minX, minY], padding);
  const max = Vector2.add([maxX, maxY], padding);
  return [min, max] as const;
}

function viewBoxAttributeValue([minX, minY]: Vector2, [sizeX, sizeY]: Vector2): string {
  return [minX, minY, sizeX, sizeY].join(' ');
}
