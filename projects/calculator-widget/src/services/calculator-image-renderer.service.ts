import { DOCUMENT, inject, Injectable } from '@angular/core';
import { CONSTANTS, EditSequence, EditToken, OPERATOR_SYMBOLS } from '../models';

export interface CalculatorSvgInput {
  readonly inputSequence: EditSequence;
  readonly outputSequence: EditSequence;
  readonly isApproximation: boolean;
}

export interface CalculatorSvgOutput {
  readonly svgXml: string;
  readonly width: number;
  readonly height: number;
}

export interface CalculatorSvgOptions {
  readonly imageWidth: number;
  readonly scale?: number;
  readonly padding?: number;
  readonly background?: string;
  readonly foreground?: string;
}

const NS_SVG = 'http://www.w3.org/2000/svg';
const NS_XHTML = 'http://www.w3.org/1999/xhtml';
const NS_MATHML = 'http://www.w3.org/1998/Math/MathML';
type ApplyFn<T> = (value: T) => void;

@Injectable()
export class CalculatorImageRenderer {
  private readonly document = inject(DOCUMENT);
  private readonly serializer = new XMLSerializer();

  async renderSequenceImage(input: CalculatorSvgInput, options: CalculatorSvgOptions): Promise<string> {
    const { background } = options;
    const { svgXml, width, height } = this.renderSequenceSvg(input, options);

    // Load SVG as <img> element
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgXml)}`;
    await image.decode();

    // Initialize detached canvas element
    const canvas = this.document.createElement('canvas');
    canvas.width = Math.ceil(width);
    canvas.height = Math.ceil(height);

    // Draw image onto canvas
    const context = canvas.getContext('2d')!;
    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Export canvas as PNG
    return canvas.toDataURL('image/png');
  }

  renderSequenceSvg(input: CalculatorSvgInput, options: CalculatorSvgOptions): CalculatorSvgOutput {
    const defaultScale = window.devicePixelRatio || 1;
    const { imageWidth, scale = defaultScale, padding = 4, foreground = '', background = '' } = options;

    const math = this.renderMath(input);
    math.setAttribute('display', 'inline');
    math.setAttribute('displaystyle', 'true');
    math.style.width = `${imageWidth}px`;
    math.style.height = 'auto';
    math.style.color = foreground;
    math.style.margin = '0';
    math.style.textAlign = 'left';

    const [mathWidth, mathHeight] = this.measureMathElement(math);
    const paddedWidth = Math.ceil(mathWidth + 2 * padding);
    const paddedHeight = Math.ceil(mathHeight + 2 * padding);
    const rootScale = imageWidth / paddedWidth;
    const width = Math.round(imageWidth);
    const height = Math.max(1, Math.round(paddedHeight * rootScale));

    const foreignDiv = this.document.createElementNS(NS_XHTML, 'div');
    foreignDiv.style.padding = `${padding}px`;
    foreignDiv.style.display = 'inline-block';
    foreignDiv.appendChild(math);

    const foreignObject = this.document.createElementNS(NS_SVG, 'foreignObject');
    foreignObject.setAttribute('x', '0');
    foreignObject.setAttribute('y', '0');
    foreignObject.setAttribute('width', paddedWidth.toString());
    foreignObject.setAttribute('height', paddedHeight.toString());
    foreignObject.appendChild(foreignDiv);

    const svg = this.document.createElementNS(NS_SVG, 'svg');
    svg.setAttribute('width', width.toString());
    svg.setAttribute('height', height.toString());
    svg.setAttribute('viewBox', `0 0 ${paddedWidth} ${paddedHeight}`);
    svg.appendChild(foreignObject);

    // Handle overflow: If math element is wider than image, append a "..." box at the end of the SVG view
    if (mathWidth > imageWidth) {
      const middleY = Math.round(height / 2);
      for (const offset of [5, 15, 25]) {
        const dot = this.document.createElementNS(NS_SVG, 'circle');
        dot.setAttribute('cx', (paddedWidth - offset).toString());
        dot.setAttribute('cy', middleY.toString());
        dot.setAttribute('r', '5');
        dot.setAttribute('fill', foreground);
        dot.setAttribute('stroke', background);
        dot.setAttribute('stroke-width', '2.5');
        svg.appendChild(dot);
      }
    }

    const svgXml = this.serializer.serializeToString(svg);
    return { svgXml, width, height };
  }

  private measureMathElement(math: MathMLElement): readonly [width: number, height: number] {
    const previousDisplay = math.style.display;
    try {
      math.style.display = 'block';
      math.style.visibility = 'hidden';
      this.document.body.appendChild(math);
      return [math.scrollWidth, math.scrollHeight] as const;
    } finally {
      this.document.body.removeChild(math);
      math.style.display = previousDisplay;
      math.style.visibility = '';
    }
  }

  // This mirrors "src/components/display-edit-sequence/display-edit-sequence.html"
  private renderMath(input: CalculatorSvgInput): MathMLElement {
    function applyAlignLeft(m: MathMLElement) {
      m.setAttribute('columnalign', 'left');
      m.setAttribute('style', 'text-align: left; text-align: -webkit-left;');
    }
    return this.mathNode(
      'math',
      (math) => {
        math.setAttribute('stretchy', 'true');
        math.setAttribute('displaystyle', 'true'); // non-compact style
        math.setAttribute('linebreakstyle', 'after');
        math.setAttribute('linebreakmultchar', '&times;');
        math.style.fontFamily = 'sans-serif';
        math.style.textAlign = 'left';
      },
      this.mathNode('mtable', null, [
        this.mathNode('mtr', applyAlignLeft, [
          // input row
          this.mathNode('mtd', null, [
            // input sequence
            this.renderMrow(input.inputSequence, null),
          ]),
        ]),
        this.mathNode('mtr', applyAlignLeft, [
          // output row
          this.mathNode('mtd', null, [
            // result separator, output sequence
            this.renderResultSeparator(input.isApproximation),
            this.renderMrow(input.outputSequence, (mrow) => (mrow.style.fontSize = '150%')),
          ]),
        ]),
      ]),
    );
  }

  private renderMrow(sequence: EditToken.Sequence, apply: null | ApplyFn<MathMLElement>): MathMLElement {
    const children = sequence.items.flatMap((token) => {
      switch (token.kind) {
        case 'sequence':
          return []; // illegal nested sequence
        case 'fence':
          return [this.mathNode('mo', (mo) => (mo.textContent = token.fence))];
        case 'literal': {
          const literal = token.literal.replace('.', ',');
          return [this.mathNode('mn', (mn) => (mn.textContent = literal))];
        }
        case 'constant': {
          const constant = CONSTANTS[token.symbol].unicode;
          return [this.mathNode('mi', (mi) => (mi.textContent = constant))];
        }
        case 'operator': {
          const operator = OPERATOR_SYMBOLS[token.operator];
          return [this.mathNode('mo', (mo) => (mo.textContent = operator))];
        }
        case 'fraction':
          return [
            this.mathNode('mfrac', null, [
              // recursive, without top-level apply fn
              this.renderMrow(token.dividend, null),
              this.renderMrow(token.divisor, null),
            ]),
          ];
        case 'composite':
          return [
            // recursive integer part
            this.renderMrow(token.integerPart, null),
            this.mathNode('mfrac', null, [
              // recursive fractional part
              this.renderMrow(token.numerator, null),
              this.renderMrow(token.denominator, null),
            ]),
          ];
        case 'exponent':
          return [
            this.mathNode('msup', null, [
              // recursive, without top-level apply fn
              this.renderMrow(token.base, null),
              this.renderMrow(token.exponent, null),
            ]),
          ];
        case 'root': {
          if (token.degree.items.length === 0) {
            return [this.mathNode('msqrt', null, [this.renderMrow(token.radicand, null)])];
          } else {
            return [
              this.mathNode('mroot', null, [
                this.renderMrow(token.radicand, null),
                this.renderMrow(token.degree, null),
              ]),
            ];
          }
        }
      }
    });

    return this.mathNode('mrow', apply, children);
  }

  private renderResultSeparator(isApproximation: boolean): MathMLElement {
    return this.mathNode('mo', (mo) => {
      mo.textContent = isApproximation ? '\u2248' : '='; // '≈' or '='
    });
  }

  private mathNode<K extends keyof MathMLElementTagNameMap>(
    tag: K,
    apply: null | ApplyFn<MathMLElementTagNameMap[K]> = null,
    children?: Node | ReadonlyArray<Node>,
  ): MathMLElementTagNameMap[K] {
    const element = this.document.createElementNS(NS_MATHML, tag);
    apply?.(element);
    if (children instanceof Node) element.appendChild(children);
    else if (children !== undefined) children.forEach((child) => element.appendChild(child));
    return element;
  }
}
