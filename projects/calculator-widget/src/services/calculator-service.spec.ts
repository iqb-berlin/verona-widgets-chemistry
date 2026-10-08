import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  provideDummyVeronaWidgetService,
  VeronaModuleMetadata,
  VeronaWidgetConfiguration,
  VeronaWidgetService,
} from 'verona-widget';
import { CalculatorService, HistoryEntry } from './calculator-service';
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
      case 'literal':
        return node.literal;
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
    expect(service.isCaretOn(service.editSequence().items[2])).toBeTrue(); // behind the last literal
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

  //#endregion
  //#region Evaluating

  it('works out a result as a fraction, and as a decimal on demand', () => {
    calculator();
    type('0.1+0.2');

    service.handleEvaluation('rational');
    expect(output()).toBe('[3/10]');

    service.toggleEvaluationMode();
    expect(output()).toBe('0.3');

    service.toggleEvaluationMode();
    expect(output()).toBe('[3/10]');
  });

  it('works out a decimal straight away when asked for one', () => {
    calculator();
    type('1+2');
    service.handleEvaluation('decimal');

    expect(output()).toBe('3');
    expect(service.historyEntries().length).toBe(1);
  });

  it('has nothing to toggle without a result', () => {
    calculator();
    type('1+2');
    service.toggleEvaluationMode();

    expect(output()).toBe('none');
  });

  it('works out the same input in the same way only once', () => {
    calculator();
    type('1+2');

    service.handleEvaluation('rational');
    service.handleEvaluation('rational');

    expect(service.historyEntries().length).toBe(1);
  });

  // Each way of asking is worked out on its own, so both forms reach the journal
  it('works out the same input again when the other form is asked for', () => {
    calculator();
    type('1+2');

    service.handleEvaluation('rational');
    service.handleEvaluation('decimal');

    expect(service.historyEntries().length).toBe(2);
    expect(service.historyEntries().map((entry) => render(entry.output))).toEqual(['3', '3']);
  });

  it('reports input which does not work out, and journals nothing', () => {
    calculator();
    type('1+');
    service.handleEvaluation('rational');

    expect(output()).toBe('issue: Unerwartetes Ende der Eingabe');
    expect(service.problemTokenId()).not.toBeNull();
    expect(service.historyEntries().length).toBe(0);
  });

  it('carries on with the result as the next input', () => {
    calculator();
    type('1+2');
    service.handleEvaluation('rational');
    expect(service.caretTokenId()).toBeNull(); // the caret steps aside while the result is shown

    type('+4');
    expect(input()).toBe('3+4');
    expect(output()).toBe('none'); // editing puts the result aside
    expect(caretIsInPlace()).toBeTrue();
  });

  it('puts the result aside as soon as the caret is placed', () => {
    calculator();
    type('1+2');
    service.handleEvaluation('rational');

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
    service.handleEvaluation('rational');
    expect(output()).toBe('3');

    service.undo();

    expect(input()).toBe('1+');
    expect(output()).toBe('none'); // it belonged to the input which is no longer there
  });

  it('takes an input back out of the history', () => {
    calculator();
    type('1+2');
    service.handleEvaluation('rational');
    type('7*8'); // carry on with something else
    service.handleEvaluation('rational');

    const [first] = service.historyEntries();
    expect(render(first.input)).toBe('1+2');
    expect(render(first.output)).toBe('3');

    service.restoreFromHistory(first);

    expect(input()).toBe('1+2');
    expect(output()).toBe('none');
    expect(caretIsInPlace()).toBeTrue();
  });

  it('keeps no more history than the journal shows', () => {
    calculator();
    for (const formula of ['1+1', '2+2', '3+3', '4+4']) {
      service.handleButton('clearAll', {});
      type(formula);
      service.handleEvaluation('rational');
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
    expect(output()).toBe('[1/4]');

    press('#');
    expect(output()).toBe('0.25');
  });

  it('writes what was worked out into the state data', async () => {
    calculator();
    type('1');
    service.handleButton('applyFraction', { composite: false });
    type('2');
    service.handleEvaluation('rational');

    await until(() => widgetService.stateData().length > 0);

    const stateData: ReadonlyArray<{ asLatex: string }> = JSON.parse(widgetService.stateData());
    expect(stateData.length).toBe(1);
    expect(stateData[0].asLatex).toBe('\\frac{1}{2}=\\frac{1}{2}');
  });

  it('reads the input back out of the state data', () => {
    widgetService.stateData.set(JSON.stringify([{ asLatex: '1+2=3', asImage: null }]));
    calculator();

    expect(input()).toBe('1+2'); // what was entered, not what came out
    expect(caretIsInPlace()).toBeTrue();
  });

  it('starts empty when the state data holds nothing it understands', () => {
    for (const stateData of ['', 'null', '{}', '[]', '[{"asLatex":42}]', 'not json at all']) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideZonelessChangeDetection(),
          ...provideDummyVeronaWidgetService(DUMMY_WIDGET),
          CalculatorService,
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
