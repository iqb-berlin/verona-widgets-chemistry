import { DOCUMENT, inject, Injectable, untracked } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { firstValueFrom } from 'rxjs';
import { MoleculeEditorBondingType, MoleculeEditorService } from './molecule-editor.service';
import {
  AtomView,
  BondView,
  ElectronView,
  FormalChargeView,
  FormulaSymbolView,
  MoleculeEditorView,
  PartialChargeView,
} from './molecule-editor.view';
import { FormulaSymbol, PartialCharge, Vector2 } from './molecule-editor.shared';
import { ItemId } from './molecule-editor.model';
import * as C from './molecule-editor.constants';
import { copySvgIconToSymbol } from '../util/svg-icon-symbol';

const formulaSymbolIcons = {
  [FormulaSymbol.ReactionPlus]: 'reaction_plus',
  [FormulaSymbol.ReactionArrow]: 'reaction_arrow',
  [FormulaSymbol.EquilibriumArrow]: 'equilibrium_arrow',
} as const satisfies Record<FormulaSymbol, string>;

const partialChargeIcons = {
  [PartialCharge.Positive]: 'delta_plus',
  [PartialCharge.Negative]: 'delta_minus',
} as const satisfies Record<PartialCharge, string>;

@Injectable()
export class MoleculeEditorImageRenderer {
  private readonly document = inject(DOCUMENT);
  private readonly service = inject(MoleculeEditorService);
  private readonly iconRegistry = inject(MatIconRegistry);

  async renderSvgTree(view: MoleculeEditorView): Promise<SVGSVGElement> {
    const svg = this.createViewRoot(view);
    const iconSymbols = await this.drawIconSymbols();
    svg.append(...iconSymbols);
    svg.append(this.drawView(view));
    return svg;
  }

  private createSvgElement<N extends keyof SVGElementTagNameMap>(name: N): SVGElementTagNameMap[N] {
    return this.document.createElementNS('http://www.w3.org/2000/svg', name);
  }

  private createViewRoot(view: MoleculeEditorView): SVGSVGElement {
    // Compute viewBox from positioning range of items
    const [viewMin, viewMax] = calculateViewBox(view, [40, 40]);
    const viewSize = Vector2.sub(viewMax, viewMin);

    // Create SVG root element
    const [minX, minY]: Vector2 = viewMin;
    const [sizeX, sizeY]: Vector2 = viewSize;
    const viewBox = [minX, minY, sizeX, sizeY].join(' ');
    const svg = this.createSvgElement('svg');
    svg.setAttribute('viewBox', viewBox);
    return svg;
  }

  private async drawIconSymbols(): Promise<ReadonlyArray<SVGSymbolElement>> {
    const iconNames = [...Object.values(formulaSymbolIcons), ...Object.values(partialChargeIcons)] as const;
    const iconsEntries = await Promise.all(iconNames.map((iconName) => this.retrieveIcon(iconName)));
    return iconsEntries.map(([iconName, iconSvg]) => {
      const symbol = this.createSvgElement('symbol');
      symbol.setAttribute('id', iconName);
      copySvgIconToSymbol(iconSvg, symbol);
      return symbol;
    });
  }

  private async retrieveIcon(name: string, namespace = 'iqb') {
    const icon$ = this.iconRegistry.getNamedSvgIcon(name, namespace);
    const icon = await firstValueFrom(icon$);
    return [name, icon] as const;
  }

  private drawView(view: MoleculeEditorView): SVGElement {
    // Create group containing view elements
    const group = this.createSvgElement('g');
    group.style.backgroundColor = '#ffffff';

    // Draw bonds
    const { bondingType } = untracked(this.service.appearance);
    for (const bond of view.bonds) {
      if (!ItemId.isTemporaryId(bond.itemId)) {
        group.append(...this.drawBond(bond, bondingType));
      }
    }

    // Draw atoms and local electrons
    for (const atom of view.atoms) {
      if (!ItemId.isTemporaryId(atom.itemId)) {
        group.append(this.drawAtom(atom, bondingType));
      }
    }

    // Draw partial charges
    for (const partial of view.partials) {
      if (!ItemId.isTemporaryId(partial.itemId)) {
        group.append(this.drawPartialCharge(partial));
      }
    }

    // Draw formula symbols
    for (const symbol of view.symbols) {
      if (!ItemId.isTemporaryId(symbol.itemId)) {
        group.append(this.drawFormulaSymbol(symbol));
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

  private drawAtom(atom: AtomView, bondingType: MoleculeEditorBondingType): SVGElement {
    const group = this.createSvgElement('g');

    // Atom circle covering nearby bonds
    const circle = this.createSvgElement('circle');
    const [cx, cy] = atom.position;
    circle.setAttribute('cx', String(cx));
    circle.setAttribute('cy', String(cy));
    circle.setAttribute('r', String(C.atomHandleRadius));
    circle.setAttribute('fill', '#ffffff'); // background color covering bonds
    circle.setAttribute('stroke', '#000000');
    circle.setAttribute('stroke-width', '1');
    circle.setAttribute('stroke-opacity', '50%');
    group.append(circle);

    // Atom element text
    const text = this.createSvgElement('text');
    text.textContent = atom.element.symbol;
    text.setAttribute('x', String(cx));
    text.setAttribute('y', String(cy));
    text.setAttribute('font-size', '24px');
    text.setAttribute('font-family', 'sans-serif');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('fill', '#000000');
    group.append(text);

    // Atom electrons
    for (const e of atom.electrons) {
      group.append(...this.drawAtomElectron(e, atom, bondingType));
    }

    // Atom formal charge
    if (atom.formalCharge) {
      group.append(...this.drawAtomFormalCharge(atom.formalCharge));
    }

    return group;
  }

  private drawAtomElectron(
    electron: ElectronView,
    atom: AtomView,
    bondingType: MoleculeEditorBondingType,
  ): ReadonlyArray<SVGElement> {
    switch (electron.type) {
      case 1: {
        const { singleElectronDist: d } = C;
        const coords = ElectronView.singleCoordinates(electron, atom.position, d);
        return [this.drawElectronDot(coords)];
      }
      case 2: {
        switch (bondingType) {
          case 'VALENCE': {
            const { doubleElectronDist: d, doubleElectronWidth: w } = C;
            const coords = ElectronView.doubleCoordinates(electron, atom.position, d, w);
            return [this.drawElectronTick(coords)];
          }
          case 'ELECTRONS': {
            const { doubleElectronDist: d, bondSeparation: w } = C;
            const coords = ElectronView.doubleCoordinates(electron, atom.position, d, w);
            return this.drawElectronDoubleDots(coords);
          }
        }
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

  private drawElectronDoubleDots(coords: { x1: number; y1: number; x2: number; y2: number }) {
    const d1 = this.drawElectronDot({ x: coords.x1, y: coords.y1 });
    const d2 = this.drawElectronDot({ x: coords.x2, y: coords.y2 });
    return [d1, d2];
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

  private drawPartialCharge(partial: PartialChargeView): SVGElement {
    const { absolutePosition, charge } = partial;
    const chargeIconName = partialChargeIcons[charge];
    const [x, y] = absolutePosition;

    const use = this.createSvgElement('use');
    use.setAttribute('href', '#' + chargeIconName);
    use.setAttribute('x', String(x - C.partialChargeSize / 2));
    use.setAttribute('y', String(y - C.partialChargeSize / 2));
    use.setAttribute('width', String(C.partialChargeSize));
    use.setAttribute('height', String(C.partialChargeSize));
    return use;
  }

  private drawFormulaSymbol(symbol: FormulaSymbolView): SVGElement {
    const [x, y] = symbol.position;
    const symbolIconName = formulaSymbolIcons[symbol.symbol];
    const use = this.createSvgElement('use');
    use.setAttribute('x', String(x - C.formulaSymbolSize / 2));
    use.setAttribute('y', String(y - C.formulaSymbolSize / 2));
    use.setAttribute('width', String(C.formulaSymbolSize));
    use.setAttribute('height', String(C.formulaSymbolSize));
    use.setAttribute('href', '#' + symbolIconName);
    return use;
  }
}

function calculateViewBox(view: MoleculeEditorView, padding: Vector2): [min: Vector2, max: Vector2] {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const items = [...view.atoms, ...view.symbols, ...view.partials] as const;
  for (const item of items) {
    if (ItemId.isTemporaryId(item.itemId)) continue;
    const [x, y] = 'position' in item ? item.position : item.absolutePosition;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  const min = Vector2.sub([minX, minY], padding);
  const max = Vector2.add([maxX, maxY], padding);
  return [min, max] as const;
}
