import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideDummyVeronaWidgetService, VeronaModuleMetadata, VeronaWidgetConfiguration } from 'verona-widget';
import { DisplayEditSequence } from './display-edit-sequence';
import { CalculatorService } from '../../services/calculator-service';
import { EditSequence, EditTokenId, sequence, token } from '../../models';

@Component({
  selector: 'app-edit-sequence-host',
  imports: [DisplayEditSequence],
  template: `<math><mrow [appEditSequence]="tree()" [interactive]="interactive()"></mrow></math>`,
})
class EditSequenceHost {
  readonly tree = signal<EditSequence>(sequence());
  readonly interactive = signal<boolean>(true);
}

const DUMMY_WIDGET = {
  testConfig: { sessionId: 'spec', parameters: {}, sharedParameters: {} } satisfies VeronaWidgetConfiguration,
  testMetadata: {
    type: 'WIDGET_CALC',
    id: 'spec',
    name: [],
    version: '0.0.0',
    specVersion: '1.0',
    metadataVersion: '1.0',
  } satisfies VeronaModuleMetadata,
};

/**
 * The rendered MathML is read back as a single line, in the same notation the model specs
 * use: `[a/b]` is a fraction, `[b^e]` an exponent, `[dRr]` a root, `□` an empty
 * sub-sequence — and `|` the caret.
 */
describe('DisplayEditSequence', () => {
  let fixture: ComponentFixture<EditSequenceHost>;
  let host: EditSequenceHost;
  let caret: CaretHandle;

  // The caret lives in the calculator service, which addresses it by token ID
  interface CaretHandle {
    placeInside(part: EditSequence): void;
    placeBehind(item: { readonly id: EditTokenId }): void;
    remove(): void;
    position(): null | EditTokenId;
    isPlaced(): boolean;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditSequenceHost],
      providers: [
        provideZonelessChangeDetection(),
        ...provideDummyVeronaWidgetService(DUMMY_WIDGET),
        CalculatorService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EditSequenceHost);
    host = fixture.componentInstance;
    const service = TestBed.inject(CalculatorService);
    caret = {
      placeInside: (part) => service.placeCaret(part.id),
      placeBehind: (item) => service.placeCaret(item.id),
      remove: () => service.caretTokenId.set(null),
      position: () => service.caretTokenId(),
      isPlaced: () => service.caretTokenId() !== null,
    };
    caret.remove(); // the service places it on the restored sequence, the specs place it themselves
    fixture.detectChanges();
  });

  //#region Test helpers

  function display(): string {
    fixture.detectChanges();
    const root = fixture.nativeElement.querySelector('mrow') as Element;
    return render(root);
  }

  function render(element: Element): string {
    if (element.classList.contains('caret')) return '|';

    const children = Array.from(element.children);
    if (children.length === 0) return (element.textContent ?? '').trim();

    const parts = children.map(render);
    switch (element.tagName.toLowerCase()) {
      case 'mfrac':
        return `[${parts[0]}/${parts[1]}]`;
      case 'msup':
        return `[${parts[0]}^${parts[1]}]`;
      case 'mroot':
        return `[${parts[1]}R${parts[0]}]`;
      case 'msqrt':
        return `[R${parts[0]}]`;
      default:
        return parts.join('').replace('□', '_');
    }
  }

  function clickOn(selector: string, half: 'left' | 'right', nth = 0): void {
    fixture.detectChanges(); // render the current tree before looking for the token to click
    const element = fixture.nativeElement.querySelectorAll(selector)[nth] as Element;
    const bounds = element.getBoundingClientRect();
    const offset = half === 'left' ? bounds.width * 0.25 : bounds.width * 0.75;
    const event = new PointerEvent('click', {
      bubbles: true,
      clientX: bounds.left + offset,
      clientY: bounds.top + bounds.height / 2,
    });
    element.dispatchEvent(event);
    fixture.detectChanges();
  }

  const literal = (value: string) => token('literal', { literal: value });
  const operator = (value: '+' | '-' | '*' | '/') => token('operator', { operator: value });

  //#endregion
  //#region Drawing the caret

  it('shows the blank of an empty sequence, without a caret of its own', () => {
    expect(display()).toBe('_');
    expect(caret.isPlaced()).toBeFalse();
  });

  it('draws the caret inside an empty sequence', () => {
    caret.placeInside(host.tree());

    expect(display()).toBe('|_');
  });

  it('draws the caret behind the token it is placed on', () => {
    const tree = sequence(literal('1'), operator('+'), literal('2'));
    host.tree.set(tree);

    caret.placeBehind(tree.items[1]);
    expect(display()).toBe('1+|2');

    caret.placeBehind(tree.items[2]);
    expect(display()).toBe('1+2|');
  });

  it('draws the caret at the start of a sequence', () => {
    const tree = sequence(literal('1'), operator('+'), literal('2'));
    host.tree.set(tree);
    caret.placeInside(tree);

    expect(display()).toBe('|1+2');
  });

  it('draws exactly one caret, in the sub-sequence being edited', () => {
    const dividend = sequence(literal('1'));
    const divisor = sequence(literal('2'));
    host.tree.set(sequence(token('fraction', { dividend, divisor })));

    caret.placeBehind(dividend.items[0]);
    expect(display()).toBe('[1|/2]');
    expect(fixture.nativeElement.querySelectorAll('.caret').length).toBe(1);

    caret.placeInside(divisor);
    expect(display()).toBe('[1/|2]');
  });

  it('leaves the caret out while the sequence is not interactive', () => {
    const tree = sequence(literal('1'));
    host.tree.set(tree);
    host.interactive.set(false);
    caret.placeBehind(tree.items[0]);

    expect(display()).toBe('1');
    expect(fixture.nativeElement.querySelectorAll('.caret').length).toBe(0);
  });

  it('draws the caret as a box which is actually visible', () => {
    const tree = sequence(literal('1'));
    host.tree.set(tree);
    caret.placeBehind(tree.items[0]);
    fixture.detectChanges();

    const mark = fixture.nativeElement.querySelector('.caret') as Element;
    const bounds = mark.getBoundingClientRect();

    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
  });

  it('removes the caret again', () => {
    const tree = sequence(literal('1'));
    host.tree.set(tree);
    caret.placeBehind(tree.items[0]);
    expect(display()).toBe('1|');

    caret.remove();
    expect(display()).toBe('1');
  });

  //#endregion
  //#region Writing a root

  it('writes a root without a degree as a square root', () => {
    host.tree.set(sequence(token('root', { degree: sequence(), radicand: sequence(literal('9')) })));

    expect(display()).toBe('[R9]');
  });

  it('shows the empty index of a root while it is being edited', () => {
    const degree = sequence();
    host.tree.set(sequence(token('root', { degree, radicand: sequence(literal('9')) })));

    caret.placeInside(degree);
    expect(display()).toBe('[|_R9]');
  });

  //#endregion
  //#region Placing the caret by click

  it('puts the caret behind a token clicked on its right half', () => {
    host.tree.set(sequence(literal('1'), operator('+'), literal('2')));

    clickOn('mn', 'right', 0);

    expect(display()).toBe('1|+2');
  });

  it('puts the caret in front of a token clicked on its left half', () => {
    host.tree.set(sequence(literal('1'), operator('+'), literal('2')));

    clickOn('mn', 'left', 1); // the left half of the second literal

    expect(display()).toBe('1+|2');
  });

  it('reaches the start of a sequence through the first token', () => {
    host.tree.set(sequence(literal('1'), operator('+'), literal('2')));

    clickOn('mn', 'left', 0);

    expect(display()).toBe('|1+2');
  });

  it('puts the caret into an empty sub-sequence clicked on', () => {
    const divisor = sequence();
    host.tree.set(sequence(token('fraction', { dividend: sequence(literal('1')), divisor })));

    clickOn('.placeholder', 'right');

    expect(caret.position()).toBe(divisor.id);
    expect(display()).toBe('[1/|_]');
  });

  it('ignores clicks while the sequence is not interactive', () => {
    host.tree.set(sequence(literal('1')));
    host.interactive.set(false);
    fixture.detectChanges();

    clickOn('mn', 'right');

    expect(caret.isPlaced()).toBeFalse();
  });

  //#endregion
  //#region The caret context

  it('addresses a caret position by token ID', () => {
    const item = literal('1');
    const tree = sequence(item);
    const service = TestBed.inject(CalculatorService);

    service.placeCaret(item.id);
    expect(service.isCaretOn(item)).toBeTrue();
    expect(service.isCaretOn(tree)).toBeFalse();

    service.placeCaret(tree.id);
    expect(service.isCaretOn(tree)).toBeTrue();
    expect(service.isCaretOn(item)).toBeFalse();
  });

  //#endregion
});
