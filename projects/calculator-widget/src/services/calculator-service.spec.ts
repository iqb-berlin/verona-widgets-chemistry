import { provideZonelessChangeDetection, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  provideDummyVeronaWidgetService,
  VeronaModuleMetadata,
  VeronaWidgetConfiguration,
  VeronaWidgetService,
} from 'verona-widget';
import { CalculatorService, HistoryEntry } from './calculator-service';
import { CalculatorImageRenderer } from './calculator-image-renderer.service';
import { EditToken, EditTraversal } from '../models';

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
 * The service holds what the calculator is: the input being edited, where the caret sits,
 * the result of the last evaluation and the history of what was worked out before.
 */
describe('CalculatorService', () => {
  let service: CalculatorService;
  let widgetService: VeronaWidgetService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        ...provideDummyVeronaWidgetService(DUMMY_WIDGET),
        CalculatorService,
        CalculatorImageRenderer,
      ],
    });
    widgetService = TestBed.inject(VeronaWidgetService);
  });

  // The service reads the state data when it is created, so specs set it up before asking for one
  function calculator(): CalculatorService {
    service = TestBed.inject(CalculatorService);
    return service;
  }

  //#region Test helpers

  function render(node: EditToken): string {
    switch (node.kind) {
      case 'sequence': {
        const content = node.items.map(render).join('');
        return content.length === 0 ? '□' : content;
      }
      case 'digit':
        return node.digit;
      case 'constant':
        return node.symbol;
      case 'operator':
        return node.operator;
      case 'fence':
        return node.fence;
      case 'fraction':
        return `[${render(node.dividend)}/${render(node.divisor)}]`;
      case 'composite':
        return `[${render(node.integerPart)}&${render(node.numerator)}/${render(node.denominator)}]`;
      case 'exponent':
        return `[${render(node.base)}^${render(node.exponent)}]`;
      case 'root':
        return node.degree.items.length === 0
          ? `[R${render(node.radicand)}]`
          : `[${render(node.degree)}R${render(node.radicand)}]`;
    }
  }

  const input = () => render(service.editSequence());

  function output(): string {
    const result = service.evaluationResult();
    if (result === null) return 'none';
    return result.ok ? render(result.value.outputSequence) : `issue: ${result.issue.message}`;
  }

  function isApproximation(): null | boolean {
    const result = service.evaluationResult();
    return result !== null && result.ok ? result.value.isApproximation : null;
  }

  function type(text: string): void {
    for (const character of text) {
      service.handleButton('typeInput', { input: character as '0' });
    }
  }

  function press(key: string, modifiers: Partial<KeyboardEventInit> = {}): void {
    service.handleKey(new KeyboardEvent('keydown', { key, ...modifiers }));
  }

  // Wait for work which runs on its own, without pinning down how many turns it takes
  async function until(isDone: () => boolean, attempts = 20): Promise<void> {
    for (let attempt = 0; attempt < attempts && !isDone(); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  function configure(parameters: Record<string, string>): void {
    const configuration = widgetService.configuration as WritableSignal<VeronaWidgetConfiguration>;
    configuration.set({ ...DUMMY_WIDGET.testConfig, parameters });
  }

  // The caret must always sit on something the current input holds, or it cannot be shown
  function caretIsInPlace(): boolean {
    const caretTokenId = service.caretTokenId();
    return caretTokenId !== null && EditTraversal.containsToken(service.editSequence(), caretTokenId);
  }

  //#endregion
  //#region Editing

  it('starts with an empty input and the caret in it', () => {
    calculator();

    expect(input()).toBe('□');
    expect(caretIsInPlace()).toBeTrue();
    expect(output()).toBe('none');
    expect(service.historyEntries().length).toBe(0);
  });

  it('takes input from the buttons, moving the caret along', () => {
    calculator();
    type('12+3');

    expect(input()).toBe('12+3');
    expect(caretIsInPlace()).toBeTrue();
    expect(service.isCaretOn(service.editSequence().items[3])).toBeTrue(); // behind the last digit
  });

  it('takes input from the keyboard, and leaves keys with a modifier alone', () => {
    calculator();
    press('1');
    press('2');

    expect(input()).toBe('12');

    press('3', { ctrlKey: true });
    press('4', { altKey: true });
    press('5', { metaKey: true }); // the command key on a Mac belongs to the browser

    expect(input()).toBe('12');
  });

  it('moves the caret to the start and the end with Home and End', () => {
    calculator();
    type('12+3');

    press('Home');
    expect(service.isCaretOn(service.editSequence())).toBeTrue(); // in front of the whole input

    press('End');
    expect(service.isCaretOn(service.editSequence().items[3])).toBeTrue();
  });

  it('undoes and redoes with Ctrl+Z and Ctrl+Y, or with the command key on a Mac', () => {
    calculator();
    type('12');

    press('z', { ctrlKey: true });
    expect(input()).toBe('1');
    press('z', { metaKey: true });
    expect(input()).toBe('□');

    press('y', { ctrlKey: true });
    expect(input()).toBe('1');
    press('Z', { metaKey: true, shiftKey: true });
    expect(input()).toBe('12');
    expect(caretIsInPlace()).toBeTrue();
  });

  //#endregion
  //#region Evaluating

  it('works out a result as a decimal, or as a fraction on demand', () => {
    calculator();
    type('0.1+0.2');

    service.handleEvaluation('decimal');
    expect(output()).toBe('0.3');

    service.handleEvaluation('fraction');
    expect(output()).toBe('[3/10]');
  });

  it('marks a rounded decimal as an approximation, but not an exact one', () => {
    calculator();
    type('1/3');
    service.handleEvaluation('decimal');
    expect(output()).toBe('0.333333333333');
    expect(isApproximation()).toBeTrue();
    expect(service.historyEntries().at(-1)?.isApproximation).toBeTrue();

    service.handleEvaluation('fraction');
    expect(output()).toBe('[1/3]');
    expect(isApproximation()).toBeFalse();
  });

  it('writes a large result in scientific notation, which can be edited further', async () => {
    calculator();
    type('10000000*1000000');
    service.handleEvaluation('decimal');
    expect(output()).toBe('1*[10^13]');
    expect(isApproximation()).toBeFalse();

    type('+1'); // carry on with the result
    expect(input()).toBe('1*[10^13]+1');
    service.handleEvaluation('decimal');
    expect(output()).toBe('1*[10^13]');
    expect(isApproximation()).toBeTrue(); // the 1 is lost in the rounded mantissa
  });

  it('reads a result in scientific notation back out of the state data', () => {
    widgetService.stateData.set(JSON.stringify([{ asLatex: '1\\cdot{10}^{13}+1\\approx1\\cdot{10}^{13}' }]));
    calculator();

    expect(input()).toBe('1*[10^13]+1');
    expect(render(service.historyEntries()[0].output)).toBe('1*[10^13]');
  });

  it('writes a whole number as a fraction when one is asked for', () => {
    calculator();
    type('1+2');

    service.handleEvaluation('decimal');
    expect(output()).toBe('3');
    service.handleEvaluation('fraction');
    expect(output()).toBe('[3/1]');
  });

  it('works out the same input in the same way only once', () => {
    calculator();
    type('1+2');

    service.handleEvaluation('decimal');
    service.handleEvaluation('decimal');

    expect(service.historyEntries().length).toBe(1);
  });

  // Each way of asking is worked out on its own, so both forms reach the journal
  it('works out the same input again when the other form is asked for', () => {
    calculator();
    type('1+2');

    service.handleEvaluation('decimal');
    service.handleEvaluation('fraction');

    expect(service.historyEntries().length).toBe(2);
    expect(service.historyEntries().map((entry) => render(entry.output))).toEqual(['3', '[3/1]']);
    expect(service.historyEntries().map((entry) => entry.id)).toEqual([1, 2]);
  });

  it('reports input which does not work out, and journals nothing', () => {
    calculator();
    type('1+');
    service.handleEvaluation('decimal');

    expect(output()).toBe('issue: Unerwartetes Ende der Eingabe');
    expect(service.problemTokenId()).not.toBeNull();
    expect(service.historyEntries().length).toBe(0);
  });

  it('carries on with the result as the next input', () => {
    calculator();
    type('1+2');
    service.handleEvaluation('decimal');
    expect(service.caretTokenId()).toBeNull(); // the caret steps aside while the result is shown

    type('+4');
    expect(input()).toBe('3+4');
    expect(output()).toBe('none'); // editing puts the result aside
    expect(caretIsInPlace()).toBeTrue();

    service.undo();
    service.undo();
    expect(input()).toBe('1+2'); // taking up the result is undone along with the first input
  });

  it('starts a new input with a digit typed after evaluation', () => {
    calculator();
    type('1+2');
    service.handleEvaluation('decimal');

    type('5');
    expect(input()).toBe('5');
    expect(caretIsInPlace()).toBeTrue();

    service.undo();
    expect(input()).toBe('1+2'); // the input is not lost
  });

  it('starts a new input with a constant or a fence typed after evaluation, but goes on from the result with an operator', () => {
    const typedAfterEvaluation = (text: string) => {
      service.handleButton('clearAll', {});
      type('1+2');
      service.handleEvaluation('decimal');
      type(text);
      return input();
    };
    calculator();

    expect(typedAfterEvaluation('(4')).toBe('(4');
    expect(typedAfterEvaluation('.5')).toBe('0.5');
    expect(typedAfterEvaluation('*2')).toBe('3*2');
    expect(typedAfterEvaluation('-2')).toBe('3-2');
  });

  it('goes on editing the input, not the result, when backspace is pressed after evaluation', () => {
    calculator();
    type('1+2');
    service.handleEvaluation('decimal');

    press('Backspace');

    expect(input()).toBe('1+');
    expect(output()).toBe('none');
  });

  it('tells when the caret moved', () => {
    calculator();
    let moves = 0;
    const subscription = service.caretMoved.subscribe(() => moves++);

    type('1+2');
    expect(moves).toBe(3);

    service.handleEvaluation('decimal');
    expect(moves).toBe(4); // the caret steps aside for the result

    service.placeCaret(service.editSequence().items[0].id);
    expect(moves).toBe(5);

    service.undo();
    expect(moves).toBe(6);

    subscription.unsubscribe();
  });

  it('puts the result aside as soon as the caret is placed', () => {
    calculator();
    type('1+2');
    service.handleEvaluation('decimal');

    service.placeCaret(service.editSequence().items[0].id);

    expect(output()).toBe('none');
    expect(caretIsInPlace()).toBeTrue();
  });

  //#endregion
  //#region Undo, redo and history

  it('keeps the caret in place through undo and redo', () => {
    calculator();
    type('1+2');

    service.undo();
    expect(input()).toBe('1+');
    expect(caretIsInPlace()).toBeTrue(); // the token the caret sat on went with the undone input

    service.redo();
    expect(input()).toBe('1+2');
    expect(caretIsInPlace()).toBeTrue();
  });

  it('puts a result aside when its input is undone', () => {
    calculator();
    type('1+2');
    service.handleEvaluation('decimal');
    expect(output()).toBe('3');

    service.undo();

    expect(input()).toBe('1+');
    expect(output()).toBe('none'); // it belonged to the input which is no longer there
  });

  it('takes an input back out of the history', () => {
    calculator();
    type('1+2');
    service.handleEvaluation('decimal');
    type('7*8'); // carry on with something else
    service.handleEvaluation('decimal');

    const [first] = service.historyEntries();
    expect(render(first.input)).toBe('1+2');
    expect(render(first.output)).toBe('3');

    service.restoreFromHistory(first);

    expect(input()).toBe('1+2');
    expect(output()).toBe('3'); // shown along with its result, as after working it out
    expect(service.caretTokenId()).toBeNull();
  });

  it('works out an input taken out of the history only in the other form again', () => {
    calculator();
    type('1');
    service.handleButton('applyFraction', { composite: false });
    type('4');
    service.handleEvaluation('fraction');
    service.handleButton('clearAll', {});
    type('2');
    service.handleEvaluation('decimal');

    service.restoreFromHistory(service.historyEntries()[0]);
    service.handleEvaluation('fraction');
    expect(service.historyEntries().length).toBe(2); // nothing new was worked out

    service.handleEvaluation('decimal');
    expect(output()).toBe('0.25');
    expect(service.historyEntries().length).toBe(3);
  });

  it('goes on editing an input taken out of the history once the caret moves', () => {
    calculator();
    type('1+2');
    service.handleEvaluation('decimal');
    service.restoreFromHistory(service.historyEntries()[0]);

    press('Backspace');
    expect(input()).toBe('1+');
    expect(output()).toBe('none');
  });

  it('keeps no more history than the journal shows', () => {
    calculator();
    for (const formula of ['1+1', '2+2', '3+3', '4+4']) {
      service.handleButton('clearAll', {});
      type(formula);
      service.handleEvaluation('decimal');
    }

    expect(service.journalLineCount()).toBe(3); // the default
    expect(service.historyEntries().map((entry) => render(entry.input))).toEqual(['2+2', '3+3', '4+4']);
  });

  //#endregion
  //#region The state of the widget

  it('answers the keys which work out a result', () => {
    calculator();
    type('1');
    service.handleButton('applyFraction', { composite: false });
    type('4');

    press('Enter');
    expect(output()).toBe('0.25');

    press('#');
    expect(output()).toBe('[1/4]');

    press('=');
    expect(output()).toBe('0.25');
  });

  it('takes the circumflex dead key as exponent, but no other dead key', () => {
    calculator();
    type('2');

    press('Dead', { code: 'Equal' }); // an accent on a German keyboard
    expect(input()).toBe('2');

    press('Dead', { code: 'Backquote' }); // the circumflex on a German keyboard
    expect(input()).toBe('[2^□]');
  });

  it('leaves keys to open menus', () => {
    calculator();
    type('1+2');

    const overlay = document.createElement('div');
    overlay.className = 'cdk-overlay-container';
    const menuItem = overlay.appendChild(document.createElement('button'));
    document.body.appendChild(overlay);
    try {
      menuItem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      menuItem.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    } finally {
      overlay.remove();
    }

    expect(output()).toBe('none');
    expect(input()).toBe('1+2');
  });

  it('takes both a point and a comma as the decimal separator', () => {
    calculator();
    press('1');
    press('.');
    press('5');
    press('+');
    press('2');
    press(',');
    press('5');

    expect(input()).toBe('1.5+2.5');
  });

  it('writes what was worked out into the state data', async () => {
    calculator();
    type('1');
    service.handleButton('applyFraction', { composite: false });
    type('2');
    service.handleEvaluation('fraction');

    await until(() => widgetService.stateData().length > 0);

    const stateData: ReadonlyArray<{ asLatex: string }> = JSON.parse(widgetService.stateData());
    expect(stateData.length).toBe(1);
    expect(stateData[0].asLatex).toBe('\\frac{1}{2}=\\frac{1}{2}');
  });

  it('writes an approximate result into the state data as such', async () => {
    calculator();
    type('1');
    service.handleButton('applyFraction', { composite: false });
    type('3');
    service.handleEvaluation('decimal');

    await until(() => widgetService.stateData().length > 0);

    const stateData: ReadonlyArray<{ asLatex: string }> = JSON.parse(widgetService.stateData());
    expect(stateData.length).toBe(1);
    expect(stateData[0].asLatex).toBe('\\frac{1}{3}\\approx0.333333333333');
  });

  it('reads the input back out of the state data', () => {
    widgetService.stateData.set(JSON.stringify([{ asLatex: '1+2=3', asImage: null }]));
    calculator();

    expect(input()).toBe('1+2'); // what was entered, not what came out
    expect(caretIsInPlace()).toBeTrue();
  });

  it('reads an approximate result back out of the state data', () => {
    widgetService.stateData.set(JSON.stringify([{ asLatex: '\\frac{1}{3}\\approx0.333', asImage: null }]));
    calculator();

    expect(input()).toBe('[1/3]');
    expect(render(service.historyEntries()[0].output)).toBe('0.333');
    expect(service.historyEntries()[0].isApproximation).toBeTrue();
  });

  it('tells from a result in the state data which form it was worked out in', () => {
    const entries = [
      { asLatex: '1\\div4=0.25' },
      { asLatex: '1\\div4=\\frac{1}{4}' },
      { asLatex: '9\\div4={2}\\frac{1}{4}' },
    ];
    widgetService.stateData.set(JSON.stringify(entries));
    calculator();

    expect(service.historyEntries().map((entry) => entry.mode)).toEqual(['decimal', 'fraction', 'fraction']);
  });

  it('skips an entry of the state data it does not understand, and keeps the others', () => {
    widgetService.stateData.set(
      JSON.stringify([
        { asLatex: 'no separator', asImage: null },
        { asLatex: '1+2=3', asImage: null },
      ]),
    );
    calculator();

    expect(service.historyEntries().map((entry) => render(entry.input))).toEqual(['1+2']);
    expect(service.historyEntries()[0].isApproximation).toBeFalse();
    expect(input()).toBe('1+2');
  });

  it('reads no more history out of the state data than the journal shows', () => {
    const stateData = ['1+1=2', '2+2=4', '3+3=6', '4+4=8'].map((asLatex) => ({ asLatex, asImage: null }));
    widgetService.stateData.set(JSON.stringify(stateData));
    calculator();

    expect(service.historyEntries().map((entry) => render(entry.input))).toEqual(['2+2', '3+3', '4+4']);
  });

  it('reads no history out of the state data when the journal shows none', () => {
    configure({ JOURNAL_LINES: '0' });
    widgetService.stateData.set(JSON.stringify([{ asLatex: '1+2=3', asImage: null }]));
    calculator();

    expect(service.historyEntries().length).toBe(0);
  });

  it('keeps the parameters in a sensible range', () => {
    configure({ JOURNAL_LINES: '-1', MAX_IMAGE_WIDTH_PX: '-5' });
    calculator();

    expect(service.journalLineCount()).toBe(0);
    expect(service.imageWidthPx()).toBe(1);
  });

  it('writes what was worked out into the state data, even without an image', async () => {
    calculator();
    spyOn(TestBed.inject(CalculatorImageRenderer), 'renderSequenceImage').and.rejectWith(new Error('spec'));
    type('1+2');
    service.handleEvaluation('decimal');

    await until(() => widgetService.stateData().length > 0);

    expect(JSON.parse(widgetService.stateData())).toEqual([{ asLatex: '1+2=3', asImage: null }]);
  });

  it('starts empty when the state data holds nothing it understands', () => {
    for (const stateData of ['', 'null', '{}', '[]', '[{"asLatex":42}]', 'not json at all']) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          ...provideDummyVeronaWidgetService(DUMMY_WIDGET),
          CalculatorService,
          CalculatorImageRenderer,
        ],
      });
      const dummy = TestBed.inject(VeronaWidgetService);
      dummy.stateData.set(stateData);

      service = TestBed.inject(CalculatorService);
      expect(input()).withContext(`state data ${stateData}`).toBe('□');
    }
  });

  //#endregion
});

// The history entry type is part of what the component binds to
export type { HistoryEntry };
