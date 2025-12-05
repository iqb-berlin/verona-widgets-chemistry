import { MoleculeEditorModel } from './molecule-editor.model';
import { Nominal } from 'periodic-system-common';
import { Injectable, signal } from '@angular/core';
import { BondView,ElectronView,MoleculeEditorView } from './molecule-editor.view';

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

    // ------------------------------
    // Magic Numbers
    // ------------------------------
    const PAD = 20; // padding around the viewBox edges
    const LINE_STROKE_WIDTH = 1.2; // line stroke width - also used for electron dot radius as they need to be the same size - don't ask...
    const BOND_SEPARATION_DISTANCE = 5; // bond line separation distance
    const BOND_ELECTRON_RADIUS = 1.2; // bond line stroke width
    const ATOM_RADIUS = 12; // atom circle radius
    const ATOM_SYMBOL_FONT_SIZE = 18; // atom symbol font size
    const ELECTRON_SINGLE_D = 16;
    const ELECTRON_DOUBLE_D = 16;
    const ELECTRON_DOUBLE_W = 5;

    // ------------------------------
    // Compute viewBox from atoms
    // ------------------------------

    const { minX, maxX, minY, maxY } = view.atoms.reduce(
      (acc, atom) => {
        const [x, y] = atom.position;
        return {
          minX: Math.min(acc.minX, x),
          maxX: Math.max(acc.maxX, x),
          minY: Math.min(acc.minY, y),
          maxY: Math.max(acc.maxY, y),
        };
      },
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity }
    );

    const width = maxX - minX;
    const height = maxY - minY;
    console.log('Computed viewBoxParameters:', { minX, minY, maxX, maxY, width, height });

    root.setAttribute('viewBox', `${minX - PAD} ${minY - PAD} ${width + PAD * 2} ${height + PAD * 2}`);
    console.log('resulting viewBox:', root.viewBox.baseVal);

    // ------------------------------
    // Draw bonds
    // ------------------------------
    for (const bond of view.bonds) {
      // TODO: Different styles for selected/temporary bonds

      const lines = BondView.valenceBondLines(bond, BOND_SEPARATION_DISTANCE);
      for (const [a, b] of lines) {
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', String(a[0]));
        line.setAttribute('y1', String(a[1]));
        line.setAttribute('x2', String(b[0]));
        line.setAttribute('y2', String(b[1]));
        line.setAttribute('stroke', 'black');
        line.setAttribute('stroke-width', String(LINE_STROKE_WIDTH));
        root.appendChild(line);
      }

      const dots = BondView.electronBondDots(bond, BOND_SEPARATION_DISTANCE);
      for (const pos of dots) {
        const dot = document.createElementNS(ns, 'circle');
        dot.setAttribute('cx', String(pos[0]));
        dot.setAttribute('cy', String(pos[1]));
        dot.setAttribute('r', String(BOND_ELECTRON_RADIUS));
        dot.setAttribute('fill', 'black');
        root.appendChild(dot);
      }
    }

    // ------------------------------
    // Draw atoms and local electrons
    // ------------------------------
    for (const atom of view.atoms) {
      const g = document.createElementNS(ns, 'g');
      g.setAttribute('transform', `translate(${atom.position[0]}, ${atom.position[1]})`);

      // --- Atom circle covering nearby bonds ---      
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('cx', '0');
      circle.setAttribute('cy', '0');
      circle.setAttribute('r', String(ATOM_RADIUS));
      circle.setAttribute('fill', 'white'); // background color covering bonds
      circle.setAttribute('stroke', 'black'); // outline
      circle.setAttribute('stroke-width', String(LINE_STROKE_WIDTH));
      g.appendChild(circle);

      // atom element text
      const text = document.createElementNS(ns, 'text');
      text.textContent = atom.element.symbol;
      text.setAttribute('x', '0');
      text.setAttribute('y', '0');
      text.setAttribute('font-size', String(ATOM_SYMBOL_FONT_SIZE));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('fill', 'black');
      g.appendChild(text);

      for (const e of atom.electrons) {
        if (e.type === 1) {
          const pos = ElectronView.singleCoordinates(e, [0, 0], ELECTRON_SINGLE_D);
          const dot = document.createElementNS(ns, 'circle');
          dot.setAttribute('cx', String(pos.x));
          dot.setAttribute('cy', String(pos.y));
          dot.setAttribute('r', String(LINE_STROKE_WIDTH));
          dot.setAttribute('fill', 'black');
          g.appendChild(dot);
        } else {
          const coords = ElectronView.doubleCoordinates(e, [0, 0], ELECTRON_DOUBLE_D, ELECTRON_DOUBLE_W);
          const tick = document.createElementNS(ns, 'line');
          tick.setAttribute('x1', String(coords.x1));
          tick.setAttribute('y1', String(coords.y1));
          tick.setAttribute('x2', String(coords.x2));
          tick.setAttribute('y2', String(coords.y2));
          tick.setAttribute('stroke', 'black');
          tick.setAttribute('stroke-width', String(LINE_STROKE_WIDTH));
          tick.setAttribute('stroke-linecap', 'round');
          g.appendChild(tick);
        }
      }

      root.appendChild(g);
    }

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
