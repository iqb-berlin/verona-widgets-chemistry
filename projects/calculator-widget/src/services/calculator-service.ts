import {
  computed,
  effect,
  inject,
  Injectable,
  linkedSignal,
  OnDestroy,
  Signal,
  signal,
  WritableSignal,
} from '@angular/core';
import { castDraft, produce } from 'immer';
import { historySignal, HistorySignal, VeronaWidgetService } from 'verona-widget';
import {
  compileToFormula,
  CompileToFormulaIssueCode,
  dispatchEditCommand,
  EditCommand,
  EditSequence,
  EditToken,
  EditTokenId,
  EditTraversal,
  evaluateFormula,
  exactToFormulaOutput,
  formatToLatex,
  FormulaEvalIssueCode,
  FormulaNode,
  parseFromLatex,
  Result,
  sequence,
  tokenizeFormula,
} from '../models';

//#region Service data structures

export interface HistoryEntry {
  readonly input: EditSequence;
  readonly journalEntryPromise: Promise<JournalEntry>;
}

export interface JournalEntry {
  readonly asLatex: string;
  readonly asImage: null | string;
}

export interface EvaluationOutput {
  readonly inputSequence: EditSequence;
  readonly outputSequence: EditSequence;
}

export interface EvaluationIssue {
  readonly message: string;
  readonly tokenId: null | EditTokenId;
}

export type EditCommandDetails<N extends EditCommand.Name> = Omit<EditCommand.OfName<N>, 'name' | 'targetId'>;

export interface JournalImageSource {
  snapshotJournalImage(config: JournalImageConfig): Promise<null | string>;
}

export interface JournalImageConfig {
  readonly imageWidthPx: number;
}

//#endregion
//#region Constants

const ISSUE_MESSAGES = {
  empty: 'Leere Eingabe',
  incomplete: 'Unvollständige Eingabe',
  unexpectedToken: 'Unerwartete Eingabe',
  unexpectedEnd: 'Unerwartetes Ende der Eingabe',
  syntaxError: 'Syntaxfehler',
  divisionByZero: 'Teilung durch Null',
  indeterminate: 'Ergebnis nicht bestimmt',
  nonFinite: 'Ergebnis ist keine endliche Zahl',
  complexResult: 'Komplexe Zahl nicht berechenbar',
  unsupported: 'Berechnung wird nicht unterstützt',
} as const satisfies Record<CompileToFormulaIssueCode | FormulaEvalIssueCode, string>;

const DEFAULT_JOURNAL_LINES = 3;
const DEFAULT_IMAGE_WIDTH_PX = 200;

function toIntOrDefault(value: string, defaultInt: number): number {
  const int = Number.parseInt(value);
  return Number.isNaN(int) ? defaultInt : int;
}

//#endregion

@Injectable()
export class CalculatorService implements OnDestroy {
  readonly widgetService = inject(VeronaWidgetService);
  readonly journalLineCount = this.computeParameter('JOURNAL_LINES', DEFAULT_JOURNAL_LINES, toIntOrDefault);
  readonly imageWidthPx = this.computeParameter('MAX_IMAGE_WIDTH_PX', DEFAULT_IMAGE_WIDTH_PX, toIntOrDefault);

  readonly editSequence: HistorySignal<EditSequence>;
  readonly caretTokenId = signal<null | EditTokenId>(null);

  readonly evaluationResult: WritableSignal<null | Result<EvaluationOutput, EvaluationIssue>>;
  readonly problemTokenId = computed(() => {
    const result = this.evaluationResult();
    return result === null || result.ok ? null : result.issue.tokenId;
  });

  readonly historyEntries = signal<ReadonlyArray<HistoryEntry>>([]);
  private journalImageSource: null | JournalImageSource = null;

  // Bound to service lifecycle
  private readonly abortController = new AbortController();

  constructor() {
    // Setup lifecycle abort signal
    const signal = this.abortController.signal;

    // Initialize edit-sequence
    const initSequence = this.restoreInitialSequence() ?? sequence();
    this.editSequence = historySignal(initSequence, { capacity: 100, debugName: 'editSequence' });
    this.evaluationResult = linkedSignal<null | Result<EvaluationOutput, EvaluationIssue>>(() => {
      this.editSequence(); // reset when input changes
      return null; // initial result is null
    });

    // Place caret at end of initial edit-sequence
    this.caretTokenId.set(this.lastTokenId());

    // Capture keyboard events in window
    window.addEventListener('keydown', (event) => this.handleKey(event), { signal, capture: true });

    // Clear result when input changes
    effect(() => {
      this.editSequence(); // <- trigger effect
      this.evaluationResult.set(null);
    });
  }

  ngOnDestroy() {
    // Trigger abort signal at end of lifecycle
    this.abortController.abort('ngOnDestroy');
  }

  registerJournalImageSource(source: JournalImageSource) {
    this.journalImageSource = source;
  }

  // Caret either sits behind given token, or in front of token if token is an EditSequence
  isCaretOn(token: EditToken): boolean {
    return this.caretTokenId() === token.id;
  }

  placeCaret(tokenId: EditTokenId): void {
    this.caretTokenId.set(tokenId);
  }

  handleButton<N extends EditCommand.Name>(name: N, details: EditCommandDetails<N>): void {
    const command = this.editCommand(name, details);
    this.executeCommand(command);
  }

  async handleClose(): Promise<void> {
    try {
      const finalState = await this.serializeStateData();
      this.widgetService.sendReturn({ finalState, saveState: true });
    } catch (error: unknown) {
      console.warn('Error serializing final state-data:', error);
      this.widgetService.sendReturn({ saveState: true }); // use last sent state-data
    }
  }

  handleEvaluation(mode: 'exact' | 'decimal'): void {
    // Check that input has not already been evaluated
    const input = this.editSequence();
    const previousResult = this.evaluationResult();
    const previousInput = previousResult === null || !previousResult.ok ? null : previousResult.value.inputSequence;
    if (previousInput !== null && EditTraversal.structurallyEqual(previousInput, input)) {
      return;
    }

    // Execute evaluation, display result (either value or issue)
    const result = this.executeEvaluation(input, mode);
    this.evaluationResult.set(result);
    this.caretTokenId.set(null);

    // If evaluation was successful, snapshot an image and add entry to journal *after* next render update
    const journalLineCount = this.journalLineCount();
    if (result.ok && journalLineCount > 0) {
      // Convert input/output to LaTeX syntax, delimited by "="
      const inputLatex = formatToLatex(input);
      const outputLatex = formatToLatex(result.value.outputSequence);
      const asLatex = `${inputLatex}=${outputLatex}`;

      // Initiate process of creating a snapshot of the rendered formula; when finished, send state-data to widget host
      const journalEntryPromise = this.snapshotJournalImage()
        .then((asImage) => ({ asLatex, asImage }))
        .finally(() => this.sendStateData());

      // Immediately append entry in history, including the pending promise of the journal-entry
      const historyEntry: HistoryEntry = { input, journalEntryPromise };
      this.historyEntries.update((entries) => {
        return produce(entries, (draft) => {
          draft.push(castDraft(historyEntry));
          while (draft.length > journalLineCount) {
            draft.shift();
          }
        });
      });
    }
  }

  private async snapshotJournalImage(): Promise<null | string> {
    // Wait until immediate page-rendering finished
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Create snapshot of math-element
    const imageWidthPx = this.imageWidthPx();
    const imagePromise = this.journalImageSource?.snapshotJournalImage({ imageWidthPx });
    return (await imagePromise) ?? null;
  }

  private sendStateData() {
    this.serializeStateData().then((stateData) => {
      this.widgetService.stateData.set(stateData);
    });
  }

  private async serializeStateData(): Promise<string> {
    const historyEntries = this.historyEntries();
    const journalEntryPromises = historyEntries.map((e) => e.journalEntryPromise);
    const settledJournalEntries = await Promise.allSettled(journalEntryPromises);
    const journalEntries = settledJournalEntries.flatMap((x) => (x.status === 'fulfilled' ? [x.value] : []));
    return JSON.stringify(journalEntries);
  }

  handleKey(event: KeyboardEvent): void {
    if (event.ctrlKey || event.altKey) {
      return; // ignore keypresses with modifiers
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      this.handleEvaluation('exact');
    } else if (event.key === '#') {
      event.preventDefault();
      event.stopPropagation();
      this.handleEvaluation('decimal');
    } else {
      const command = this.commandOfKeypress(event);
      if (command !== null) {
        event.preventDefault();
        event.stopPropagation();
        this.executeCommand(command);
      }
    }
  }

  private commandOfKeypress(event: KeyboardEvent): null | EditCommand {
    const input = event.key;
    switch (input) {
      case '0':
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9':
      case '.':
      case '(':
      case ')':
      case '+':
      case '-':
      case '*':
      case '/':
        return this.editCommand('typeInput', { input });
      case ',':
        return this.editCommand('typeInput', { input: '.' });
      case '^':
      case 'Dead': // Circumflex is a "dead key" on Linux
        return this.editCommand('applyExponent', { square: false });
      case 'q':
      case 'Q':
        return this.editCommand('applyRoot', { sqrt: true });
      case 'w':
      case 'W':
        return this.editCommand('applyRoot', { sqrt: false });
      case 'ArrowDown':
        return this.editCommand('move', { direction: 'down' });
      case 'ArrowUp':
        return this.editCommand('move', { direction: 'up' });
      case 'ArrowLeft':
        return this.editCommand('move', { direction: 'left' });
      case 'ArrowRight':
        return this.editCommand('move', { direction: 'right' });
      case 'Backspace':
        return this.editCommand('backspace', {});
      case 'Escape':
        return this.editCommand('clearAll', {});
      default:
        return null;
    }
  }

  private editCommand<N extends EditCommand.Name>(name: N, details: EditCommandDetails<N>): EditCommand.OfName<N> {
    const targetId = this.caretTokenId() ?? this.lastTokenId();
    return { name, targetId, ...details } as EditCommand.OfName<N>;
  }

  private lastTokenId(): EditTokenId {
    const sequence = this.editSequence();
    const lastToken = sequence.items.at(-1) ?? sequence;
    return lastToken.id;
  }

  private executeCommand(command: EditCommand) {
    const input = this.editSequence();
    const { tree, focusId, changed } = dispatchEditCommand(input, command);
    if (changed) this.editSequence.set(tree, true);
    this.caretTokenId.set(focusId);
  }

  private executeEvaluation(
    inputSequence: EditSequence,
    mode: 'decimal' | 'exact',
  ): Result<EvaluationOutput, EvaluationIssue> {
    const compileResult = compileToFormula(inputSequence);
    if (!compileResult.ok) {
      console.warn('Compile to formula issue:', compileResult.issue);
      const { code, tokenId, sequenceId } = compileResult.issue;
      const message = ISSUE_MESSAGES[code] || 'Unbekannter Eingabefehler?';
      return Result.issue({ message, tokenId: tokenId ?? sequenceId });
    }

    const evaluationResult = evaluateFormula(compileResult.value);
    if (!evaluationResult.ok) {
      console.warn('Evaluate formula issue:', evaluationResult.issue);
      const { code, sourceTokenId } = evaluationResult.issue;
      const message = ISSUE_MESSAGES[code] || 'Unbekannter Mathefehler?';
      return Result.issue({ message, tokenId: sourceTokenId });
    }

    const outputFormula = exactToFormulaOutput(evaluationResult.value, { digits: 12 });
    console.log(
      FormulaNode.asLispString(compileResult.value),
      '=>',
      outputFormula.value.toString(),
      '~>',
      outputFormula.decimal,
    );

    const outputSequence = tokenizeFormula(outputFormula.exact);
    return Result.ok({ inputSequence, outputSequence });
  }

  private computeParameter<T>(
    key: string,
    defaultValue: T,
    transform: (parameter: string, defaultValue: T) => null | T,
  ): Signal<T> {
    return computed(
      () => {
        const config = this.widgetService.configuration();
        const parameter = config.parameters[key];
        return parameter === undefined ? defaultValue : (transform(parameter, defaultValue) ?? defaultValue);
      },
      { debugName: `parameter:${key}` },
    );
  }

  private restoreInitialSequence(): null | EditSequence {
    try {
      const stateDataJson = this.widgetService.stateData();
      const stateData = JSON.parse(stateDataJson);
      if (!Array.isArray(stateData)) return null; // State-data must encode an array
      const latestEntry = stateData.at(-1); // Latest entry at end of array
      if (latestEntry === null || typeof latestEntry !== 'object') return null; // Latest entry must be an object
      const inputAndOutputLatex = latestEntry['asLatex']; // Get LaTeX representation of last entry
      if (typeof inputAndOutputLatex !== 'string') return null;
      const [inputLatex] = inputAndOutputLatex.split('=', 2); // Discard output LaTeX after "="
      if (inputLatex.length === 0) return null;
      return parseFromLatex(inputLatex); // Parse sequence from input LaTeX
    } catch (error: unknown) {
      console.warn('Restoring initial edit-sequence failed:', error);
      return null;
    }
  }
}
