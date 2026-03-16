import { DOCUMENT, inject, Injectable, untracked } from '@angular/core';
import { MoleculeEditorBondingType, MoleculeEditorService } from './molecule-editor.service';
import { AtomView, BondView, ElectronView, FormalChargeView, MoleculeEditorView } from './molecule-editor.view';
import { Vector2 } from './molecule-editor.shared';
import { ItemId } from './molecule-editor.model';
import * as C from './molecule-editor.constants';

@Injectable()
export class MoleculeEditorImageRenderer {
  private readonly document = inject(DOCUMENT);
  private readonly service = inject(MoleculeEditorService);

  renderSvgTree(view: MoleculeEditorView): SVGSVGElement {
    const svg = this.createViewRoot(view);
    svg.appendChild(this.drawView(view));
    return svg;
  }

  private createSvgElement<N extends keyof SVGElementTagNameMap>(name: N): SVGElementTagNameMap[N] {
    return this.document.createElementNS('http://www.w3.org/2000/svg', name);
  }

  private createViewRoot(view: MoleculeEditorView): SVGSVGElement {
    // Create SVG root element
    const svg = this.createSvgElement('svg');

    // Compute viewBox from positioning range of atoms
    const [viewBoxMin, viewBoxMax] = calculateViewBox(view, [40, 40]);
    const viewBoxSize = Vector2.sub(viewBoxMax, viewBoxMin);
    svg.setAttribute('viewBox', viewBoxAttributeValue(viewBoxMin, viewBoxSize));

    return svg;
  }

  private drawView(view: MoleculeEditorView): SVGElement {
    // Create group containing view elements
    const group = this.createSvgElement('g');
    group.style.backgroundColor = '#ffffff';

    // Draw bonds
    const { bondingType } = untracked(this.service.appearance);
    for (const bond of view.bonds) {
      if (!ItemId.isTemporaryId(bond.itemId)) {
        for (const item of this.drawBond(bond, bondingType)) {
          group.appendChild(item);
        }
      }
    }

    // Draw atoms and local electrons
    for (const atom of view.atoms) {
      if (!ItemId.isTemporaryId(atom.itemId)) {
        group.appendChild(this.drawAtom(atom));
      }
    }

    return group;
  }

  private drawBond(bond: BondView, bondingType: MoleculeEditorBondingType): ReadonlyArray<SVGElement> {
    switch (bondingType) {
      case 'VALENCE': {
        const lines = BondView.valenceBondLines(bond, C.bondSeparation);
        return lines.map((line) => this.drawBondLine(line));
      }
      case 'ELECTRONS': {
        const dots = BondView.electronBondDots(bond, C.bondSeparation);
        return dots.map((center) => this.drawBondDot(center));
      }
    }
  }

  private drawBondLine([[x1, y1], [x2, y2]]: BondView.LineDef) {
    const line = this.createSvgElement('line');
    line.setAttribute('x1', String(x1));
    line.setAttribute('y1', String(y1));
    line.setAttribute('x2', String(x2));
    line.setAttribute('y2', String(y2));
    line.setAttribute('stroke', '#000000');
    line.setAttribute('stroke-width', String(C.singleElectronRadius));
    return line;
  }

  private drawBondDot([cx, cy]: Vector2) {
    const dot = this.createSvgElement('circle');
    dot.setAttribute('cx', String(cx));
    dot.setAttribute('cy', String(cy));
    dot.setAttribute('r', String(C.electronBondRadius));
    dot.setAttribute('fill', '#000000');
    return dot;
  }

  private drawAtom(atom: AtomView): SVGElement {
    const group = this.createSvgElement('g');

    // Atom circle covering nearby bonds
    const circle = this.createSvgElement('circle');
    const [centerX, centerY] = atom.position;
    circle.setAttribute('cx', String(centerX));
    circle.setAttribute('cy', String(centerY));
    circle.setAttribute('r', String(C.atomHandleRadius));
    circle.setAttribute('fill', '#ffffff'); // background color covering bonds
    circle.setAttribute('stroke', '#000000');
    circle.setAttribute('stroke-width', '1');
    circle.setAttribute('stroke-opacity', '50%');
    group.appendChild(circle);

    // Atom element text
    const text = this.createSvgElement('text');
    text.textContent = atom.element.symbol;
    text.setAttribute('x', String(centerX));
    text.setAttribute('y', String(centerY));
    text.setAttribute('font-size', '24px');
    text.setAttribute('font-family', 'sans-serif');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('fill', '#000000');
    group.appendChild(text);

    // Atom electrons
    for (const e of atom.electrons) {
      group.appendChild(this.drawAtomElectron(e, atom));
    }

    // Atom formal charge
    if (atom.formalCharge) {
      for (const item of this.drawAtomFormalCharge(atom.formalCharge)) {
        group.appendChild(item);
      }
    }

    return group;
  }

  private drawAtomElectron(electron: ElectronView, atom: AtomView): SVGElement {
    switch (electron.type) {
      case 1: {
        const { singleElectronDist: d } = C;
        const coords = ElectronView.singleCoordinates(electron, atom.position, d);
        return this.drawElectronDot(coords);
      }
      case 2: {
        const { doubleElectronDist: d, doubleElectronWidth: w } = C;
        const coords = ElectronView.doubleCoordinates(electron, atom.position, d, w);
        return this.drawElectronTick(coords);
      }
    }
  }

  private drawElectronDot(coords: { x: number; y: number }) {
    const dot = this.createSvgElement('circle');
    dot.setAttribute('cx', String(coords.x));
    dot.setAttribute('cy', String(coords.y));
    dot.setAttribute('r', String(C.singleElectronRadius));
    dot.setAttribute('fill', '#000000');
    return dot;
  }

  private drawElectronTick(coords: { x1: number; y1: number; x2: number; y2: number }) {
    const tick = this.createSvgElement('line');
    tick.setAttribute('x1', String(coords.x1));
    tick.setAttribute('y1', String(coords.y1));
    tick.setAttribute('x2', String(coords.x2));
    tick.setAttribute('y2', String(coords.y2));
    tick.setAttribute('stroke', '#000000');
    tick.setAttribute('stroke-width', String(C.doubleElectronRadius));
    tick.setAttribute('stroke-linecap', 'round');
    return tick;
  }

  private drawAtomFormalCharge({ position, color, label, labelLarge }: FormalChargeView): ReadonlyArray<SVGElement> {
    // Charge handle circle
    const [x, y] = position;
    const circle = this.createSvgElement('circle');
    circle.setAttribute('cx', String(x));
    circle.setAttribute('cy', String(y));
    circle.setAttribute('r', String(C.formalChargeHandleRadius));
    circle.setAttribute('fill', '#ffffff'); // background color covering bonds
    circle.setAttribute('stroke', color);
    circle.setAttribute('stroke-width', '2');

    // Charge label text
    const fontSize = labelLarge ? '16px' : '12px';
    const text = this.createSvgElement('text');
    text.textContent = label;
    text.setAttribute('x', String(x));
    text.setAttribute('y', String(y));
    text.setAttribute('font-size', fontSize);
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('font-family', 'sans-serif');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('fill', color);

    return [circle, text];
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
