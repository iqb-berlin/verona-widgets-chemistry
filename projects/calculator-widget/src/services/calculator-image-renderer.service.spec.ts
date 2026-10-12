import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CalculatorImageRenderer } from './calculator-image-renderer.service';
import { add, FormulaNode, fraction, int, sqrt, tokenizeFormula } from '../models';

/**
 * The renderer draws an evaluation into a PNG image for the journal; only that a valid image
 * comes out is checked here, not what it looks like.
 */
describe('CalculatorImageRenderer', () => {
  let renderer: CalculatorImageRenderer;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), CalculatorImageRenderer],
    });
    renderer = TestBed.inject(CalculatorImageRenderer);
  });

  it('renders an evaluation into a valid PNG image', async () => {
    const input = {
      inputSequence: tokenizeFormula(add(fraction(int(1), int(3)), sqrt(int(2)))),
      outputSequence: tokenizeFormula(fraction(int(1), int(3))),
      isApproximation: true,
    };

    const dataUrl = await renderer.renderSequenceImage(input, { imageWidth: 200 });

    expect(dataUrl).toMatch(/^data:image\/png;base64,/);
    const pngData = atob(dataUrl.split(',')[1]);

    // PNG signature: https://www.libpng.org/pub/png/spec/1.2/PNG-Rationale.html#R.PNG-file-signature
    expect(pngData.slice(0, 8)).toEqual('\x89PNG\r\n\x1a\n');

    const image = new Image();
    image.src = dataUrl;
    await expectAsync(image.decode()).toBeResolved();
    expect(image.naturalWidth).toBeGreaterThan(0);
    expect(image.naturalHeight).toBeGreaterThan(0);
  });

  it('draws a short formula without, and clips a long formula with an ellipsis', () => {
    const svgOf = (formula: FormulaNode) => {
      const sequence = tokenizeFormula(formula);
      const input = { inputSequence: sequence, outputSequence: sequence, isApproximation: false };
      return renderer.renderSequenceSvg(input, { imageWidth: 200 });
    };

    const short = svgOf(int(1));
    expect(short.width).toBe(200);
    expect(short.svgXml).not.toContain('<circle');

    const long = svgOf(int('1234567890'.repeat(10)));
    expect(long.width).toBe(200);
    expect(long.svgXml).toContain('<circle');
  });
});
