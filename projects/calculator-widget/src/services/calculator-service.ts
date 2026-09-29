import { computed, inject, Injectable, OnDestroy, Signal, signal, WritableSignal } from '@angular/core';
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
  formatToLatex,
  FormulaEvalIssueCode,
  numericToFormulaOutput,
  NumericValue,
  parseFromLatex,
  Result,
  sequence,
  tokenizeFormula,
} from '../models';

//#region Service data structures

export interface HistoryEntry {
  readonly id: number;
  readonly input: EditSequence;
  readonly output: EditSequence;
  readonly journalEntryPromise: Promise<JournalEntry>;
}

export interface JournalEntry {
  readonly asLatex: string;
  readonly asImage?: null | string;
}

export type EvaluationMode = 'rational' | 'decimal';

export interface EvaluationOutput {
  readonly mode: EvaluationMode;
  readonly numericValue: NumericValue;
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
//#region Helpers

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

function formatEvaluationOutput(
  inputSequence: EditSequence,
  numericValue: NumericValue,
  mode: EvaluationMode,
): EvaluationOutput {
  // A rational-number evaluation shows the result as a fraction if possible, a decimal one always as a decimal
  const preferDecimal = mode === 'decimal';
  const output = numericToFormulaOutput(numericValue, { digits: 12, preferDecimal });
  const outputSequence = tokenizeFormula(output.formula);
  return { mode, numericValue, inputSequence, outputSequence } as const;
}

function lastTokenIdOf(sequence: EditSequence): EditTokenId {
  const lastToken = sequence.items.at(-1) ?? sequence;
  return lastToken.id;
}

let historyEntryIdCounter = 1;

function nextHistoryEntryId(): number {
  return historyEntryIdCounter++;
}

//#endregion

@Injectable()
export class CalculatorService implements OnDestroy {
  readonly widgetService = inject(VeronaWidgetService);
  readonly journalLineCount = this.computeParameter('JOURNAL_LINES', DEFAULT_JOURNAL_LINES, toIntOrDefault);
  readonly imageWidthPx = this.computeParameter('MAX_IMAGE_WIDTH_PX', DEFAULT_IMAGE_WIDTH_PX, toIntOrDefault);

  readonly editSequence: HistorySignal<EditSequence>;
  readonly caretTokenId = signal<null | EditTokenId>(null);
  readonly evaluationResult = signal<null | Result<EvaluationOutput, EvaluationIssue>>(null);
  readonly problemTokenId = computed(() => {
    const result = this.evaluationResult();
    return result === null || result.ok ? null : result.issue.tokenId;
  });

  readonly historyEntries: WritableSignal<ReadonlyArray<HistoryEntry>>;
  private journalImageSource: null | JournalImageSource = null;

  // Bound to service lifecycle
  private readonly abortController = new AbortController();

  constructor() {
    // Setup lifecycle abort signal
    const abortSignal = this.abortController.signal;

    // Initialize edit-sequence and history
    const [initSequence, initHistoryEntries] = this.restoreInitialState() ?? [sequence(), []];
    this.editSequence = historySignal(initSequence, { capacity: 100, debugName: 'editSequence' });
    this.historyEntries = signal<ReadonlyArray<HistoryEntry>>(initHistoryEntries);

    // Place caret at end of initial edit-sequence
    this.caretTokenId.set(lastTokenIdOf(initSequence));

    // Capture keyboard events in window
    window.addEventListener('keydown', (event) => this.handleKey(event), { capture: true, signal: abortSignal });
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
    this.evaluationResult.set(null);
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

  handleEvaluation(mode: EvaluationMode): void {
    // Check that input has not already been evaluated
    const input = this.editSequence();
    const previousResult = this.evaluationResult();
    if (previousResult !== null && previousResult.ok) {
      const { inputSequence: previousInput, mode: previousMode } = previousResult.value;
      if (previousInput !== null && previousMode === mode && EditTraversal.structurallyEqual(previousInput, input)) {
        return; // nothing changed -> skip evaluation
      }
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
      this.amendHistory(result.value, journalEntryPromise);
    }
  }

  toggleEvaluationMode(): void {
    // Evaluation must already be completed without issue
    const previousResult = this.evaluationResult();
    if (previousResult === null || !previousResult.ok) {
      return;
    }

    // Toggle and re-interpret previous result with opposite mode
    const { inputSequence, numericValue, mode: previousMode } = previousResult.value;
    const oppositeMode: EvaluationMode = previousMode === 'rational' ? 'decimal' : 'rational';
    const output = formatEvaluationOutput(inputSequence, numericValue, oppositeMode);
    this.evaluationResult.set(Result.ok(output));
  }

  undo(): void {
    this.editSequence.undo();
    this.recoverCaret();
  }

  redo(): void {
    this.editSequence.redo();
    this.recoverCaret();
  }

  restoreFromHistory(entry: HistoryEntry) {
    this.editSequence.set(entry.input);
    this.caretTokenId.set(lastTokenIdOf(entry.input));
    this.evaluationResult.set(null);
  }

  /**
   * Put the caret back where it can be seen after the input was exchanged: the token it sat
   * on may be gone with the input it belonged to, and so is any result of that input.
   */
  private recoverCaret(): void {
    const input = this.editSequence();
    const caretTokenId = this.caretTokenId();
    const stillThere = caretTokenId !== null && EditTraversal.containsToken(input, caretTokenId);
    this.caretTokenId.set(stillThere ? caretTokenId : lastTokenIdOf(input));
    this.evaluationResult.set(null);
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
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return; // ignore keys with modifiers
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      this.handleEvaluation('rational');
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
    // Edit input if caret is placed
    const caretTokenId = this.caretTokenId();
    if (caretTokenId !== null) {
      return { targetId: caretTokenId, name, ...details } as EditCommand.OfName<N>;
    }

    // Check if an evaluation result exists, and continue editing with result as input
    const evaluationResult = this.evaluationResult();
    if (evaluationResult !== null && evaluationResult.ok) {
      const { outputSequence } = evaluationResult.value;
      this.editSequence.set(outputSequence, true);
      const targetId = lastTokenIdOf(outputSequence);
      return { targetId, name, ...details } as EditCommand.OfName<N>;
    }

    // Continue editing at end of input
    const targetId = lastTokenIdOf(this.editSequence());
    return { targetId, name, ...details } as EditCommand.OfName<N>;
  }

  private executeCommand(command: EditCommand) {
    const input = this.editSequence();
    const { tree, focusId, changed } = dispatchEditCommand(input, command);
    if (changed) this.editSequence.set(tree, true);
    this.caretTokenId.set(focusId);
    this.evaluationResult.set(null);
  }

  private executeEvaluation(
    inputSequence: EditSequence,
    mode: EvaluationMode,
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

    return Result.ok(formatEvaluationOutput(inputSequence, evaluationResult.value, mode));
  }

  private amendHistory(
    { inputSequence, outputSequence }: EvaluationOutput,
    journalEntryPromise: Promise<JournalEntry>,
  ): void {
    const historyEntry: HistoryEntry = {
      id: nextHistoryEntryId(),
      input: inputSequence,
      output: outputSequence,
      journalEntryPromise,
    };
    const journalLineCount = this.journalLineCount();
    this.historyEntries.update((entries) => {
      return produce(entries, (draft) => {
        draft.push(castDraft(historyEntry));
        while (draft.length > journalLineCount) {
          draft.shift();
        }
      });
    });
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

  private readStateDataArray(): null | Array<JournalEntry> {
    try {
      // State-data must not be empty
      const stateDataJson = this.widgetService.stateData();
      if (!stateDataJson) return null;

      // State-data must encode an array
      const stateData: unknown = JSON.parse(stateDataJson);
      if (!Array.isArray(stateData)) return null;

      // State-data entries must contain journal-entry objects
      return stateData.filter((entry: unknown): entry is JournalEntry => {
        return (
          entry !== null &&
          typeof entry === 'object' && // entry must be an object
          'asLatex' in entry &&
          typeof entry.asLatex === 'string' && // "asLatex" string must be in object
          (!('asImage' in entry) || entry.asImage === null || typeof entry.asImage === 'string')
        ); // "asImage" must be absent, null, or a string
      });
    } catch (error: unknown) {
      console.warn('Reading initial state-data failed:', error);
      return null;
    }
  }

  private restoreInitialState(): null | readonly [EditSequence, HistoryEntry[]] {
    try {
      // Restore journal-entries from state-data
      const journalEntries = this.readStateDataArray();
      if (journalEntries === null) return null;

      // Map journal-entries back into history-entries
      const historyEntries = journalEntries.map((journalEntry): HistoryEntry => {
        const [inputLatex, outputLatex] = journalEntry.asLatex.split('=', 2);
        const input = parseFromLatex(inputLatex);
        const output = parseFromLatex(outputLatex);
        const journalEntryPromise = Promise.resolve(journalEntry);
        return { id: nextHistoryEntryId(), input, output, journalEntryPromise };
      });

      // Restore input edit-sequence from latest entry
      const latestHistoryEntry = historyEntries.at(-1);
      const editSequence = latestHistoryEntry?.input ?? sequence();
      return [editSequence, historyEntries];
    } catch (error: unknown) {
      console.warn('Restoring initial edit-sequence failed:', error);
      return null;
    }
  }
}
