import { computed, EventEmitter, inject, Injectable, OnDestroy, Signal, signal, WritableSignal } from '@angular/core';
import { castDraft, produce } from 'immer';
import { historySignal, HistorySignal, VeronaWidgetService } from 'verona-widget';
import * as M from '../models';
import { CalculatorImageRenderer } from './calculator-image-renderer.service';

//#region Service data structures

export interface HistoryEntry {
  readonly id: number;
  readonly mode: EvaluationMode;
  readonly input: M.EditSequence;
  readonly output: M.EditSequence;
  readonly isApproximation: boolean;
  readonly journalEntryPromise: Promise<JournalEntry>;
}

export interface JournalEntry {
  readonly asLatex: string;
  readonly asImage?: null | string;
}

export type EvaluationMode = 'decimal' | 'fraction';

export interface EvaluationOutput {
  readonly mode: EvaluationMode;
  readonly isApproximation: boolean;
  readonly inputSequence: M.EditSequence;
  readonly outputSequence: M.EditSequence;
}

export interface EvaluationIssue {
  readonly message: string;
  readonly tokenId: null | M.EditTokenId;
}

export type EvaluationResult = M.Result<EvaluationOutput, EvaluationIssue>;

// An edit command, along with the input it applies to
interface EditInvocation {
  readonly input: M.EditSequence;
  readonly command: M.EditCommand;
}

export type EditCommandDetails<N extends M.EditCommand.Name> = Omit<M.EditCommand.OfName<N>, 'name' | 'targetId'>;

//#endregion
//#region Helpers

const ISSUE_MESSAGES = {
  empty: 'Leere Eingabe',
  incomplete: 'Unvollständige Eingabe',
  unexpectedToken: 'Unerwartete Eingabe',
  unexpectedEnd: 'Unerwartetes Ende der Eingabe',
  invalidNumber: 'Ungültige Zahl',
  syntaxError: 'Syntaxfehler',
  divisionByZero: 'Teilung durch Null',
  indeterminate: 'Ergebnis nicht bestimmt',
  nonFinite: 'Ergebnis ist keine endliche Zahl',
  complexResult: 'Komplexe Zahl nicht berechenbar',
  unsupported: 'Berechnung wird nicht unterstützt',
} as const satisfies Record<M.CompileToFormulaIssueCode | M.FormulaEvalIssueCode, string>;

const DEFAULT_JOURNAL_LINES = 3;
const DEFAULT_IMAGE_WIDTH_PX = 200;

function toIntOrDefault(value: string, defaultInt: number, minInt: number): number {
  const int = Number.parseInt(value);
  return Number.isNaN(int) ? defaultInt : Math.max(minInt, int);
}

// Splits a journal-entry LaTeX string into input, separator ('=', '≡' or '≈') and output
const LATEX_INPUT_SEPARATOR_OUTPUT = /^(.*?)(=|\\equiv|\\approx)(.*)$/s;

// Keyboard events from these elements are left to them, e.g. Enter on a focused button
const KEYBOARD_EXEMPT_SELECTOR = '.cdk-overlay-container, input, textarea, select, [contenteditable]';
const KEYBOARD_PRESSABLE_SELECTOR = 'button, a[href]';

// A result worked out as a fraction is written as one; as a decimal it never is
function evaluationModeOf(output: M.EditSequence): EvaluationMode {
  return output.items.some((item) => item.kind === 'fraction' || item.kind === 'composite') ? 'fraction' : 'decimal';
}

function lastTokenIdOf(sequence: M.EditSequence): M.EditTokenId {
  const lastToken = sequence.items.at(-1) ?? sequence;
  return lastToken.id;
}

//#endregion

@Injectable()
export class CalculatorService implements OnDestroy {
  readonly widgetService = inject(VeronaWidgetService);
  readonly svgRenderer = inject(CalculatorImageRenderer);
  readonly journalLineCount = this.computeParameter('JOURNAL_LINES', DEFAULT_JOURNAL_LINES, (value, defaultInt) =>
    toIntOrDefault(value, defaultInt, 0),
  );
  readonly imageWidthPx = this.computeParameter('MAX_IMAGE_WIDTH_PX', DEFAULT_IMAGE_WIDTH_PX, (value, defaultInt) =>
    toIntOrDefault(value, defaultInt, 1),
  );

  readonly editSequence: HistorySignal<M.EditSequence>;
  readonly caretTokenId = signal<null | M.EditTokenId>(null);
  readonly evaluationResult = signal<null | EvaluationResult>(null);
  readonly problemTokenId = computed(() => {
    const result = this.evaluationResult();
    return result === null || result.ok ? null : result.issue.tokenId;
  });

  readonly caretMoved = new EventEmitter<void>();

  readonly historyEntries: WritableSignal<ReadonlyArray<HistoryEntry>>;
  private historyEntryIdCounter = 1;

  // Bound to service lifecycle
  private readonly abortController = new AbortController();

  constructor() {
    // Setup lifecycle abort signal
    const abortSignal = this.abortController.signal;

    // Initialize edit-sequence and history
    const [initSequence, initHistoryEntries] = this.restoreInitialState() ?? [M.sequence(), []];
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

  // Caret either sits behind given token, or in front of token if token is an EditSequence
  isCaretOn(token: M.EditToken): boolean {
    return this.caretTokenId() === token.id;
  }

  placeCaret(tokenId: M.EditTokenId): void {
    this.caretTokenId.set(tokenId);
    this.evaluationResult.set(null);
    this.caretMoved.emit();
  }

  handleButton<N extends M.EditCommand.Name>(name: N, details: EditCommandDetails<N>): void {
    const invocation = this.editCommand(name, details);
    this.executeCommand(invocation);
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
    const inputSequence = this.editSequence();
    const previousResult = this.evaluationResult();
    if (previousResult !== null && previousResult.ok) {
      const { inputSequence: previousInput, mode: previousMode } = previousResult.value;
      if (previousMode === mode && M.EditTraversal.structurallyEqual(previousInput, inputSequence)) {
        return; // nothing changed -> skip evaluation
      }
    }

    // Execute evaluation, display result (either value or issue)
    const result = this.executeEvaluation(inputSequence, mode);
    this.evaluationResult.set(result);
    this.caretTokenId.set(null);
    this.caretMoved.emit();

    // If evaluation was successful, render an image and add entry to journal
    const journalLineCount = this.journalLineCount();
    if (result.ok && journalLineCount > 0) {
      // Convert input/output to LaTeX syntax, delimited by '=' or '≈'
      const inputLatex = M.formatToLatex(inputSequence);
      const outputLatex = M.formatToLatex(result.value.outputSequence);
      const splitInputOutputLatex = result.value.isApproximation ? '\\approx' : '=';
      const asLatex = inputLatex + splitInputOutputLatex + outputLatex;

      // Initiate rendering of the formula image; when finished, send state-data to widget host
      const journalEntryPromise = this.snapshotJournalImage(result.value)
        .catch((error: unknown) => {
          console.warn('Rendering journal image failed:', error);
          return null; // keep the journal-entry, without an image
        })
        .then((asImage) => ({ asLatex, asImage }))
        .finally(() => this.sendStateData());

      // Immediately append entry in history, including the pending promise of the journal-entry
      this.amendHistory(result.value, journalEntryPromise);
    }
  }

  undo(): void {
    this.editSequence.undo();
    this.recoverCaret();
  }

  redo(): void {
    this.editSequence.redo();
    this.recoverCaret();
  }

  // Show an entry of the history again the way it was worked out: its input along with its result
  restoreFromHistory(entry: HistoryEntry) {
    const { mode, input: inputSequence, output: outputSequence, isApproximation } = entry;
    this.editSequence.set(inputSequence);
    this.evaluationResult.set(M.Result.ok({ mode, isApproximation, inputSequence, outputSequence }));
    this.caretTokenId.set(null);
    this.caretMoved.emit();
  }

  /**
   * Put the caret back where it can be seen after the input was exchanged: the token it sat
   * on may be gone with the input it belonged to, and so is any result of that input.
   */
  private recoverCaret(): void {
    const input = this.editSequence();
    const caretTokenId = this.caretTokenId();
    const stillThere = caretTokenId !== null && M.EditTraversal.containsToken(input, caretTokenId);
    this.caretTokenId.set(stillThere ? caretTokenId : lastTokenIdOf(input));
    this.evaluationResult.set(null);
    this.caretMoved.emit();
  }

  private async snapshotJournalImage(evaluation: EvaluationOutput): Promise<null | string> {
    const imageWidth = this.imageWidthPx();
    return await this.svgRenderer.renderSequenceImage(evaluation, {
      imageWidth,
      background: '#ffffff',
      foreground: '#000000',
    });
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
    function consumeEvent() {
      event.preventDefault();
      event.stopPropagation();
    }

    if (this.isKeyboardExempt(event)) {
      return; // leave keys to open menus and focused form controls
    }
    if (event.ctrlKey || event.metaKey) {
      const shortcut = this.shortcutOfKeypress(event);
      if (shortcut !== null) {
        consumeEvent();
        shortcut();
      }
      return; // leave every other key with a modifier to the browser
    }
    if (event.altKey) {
      return; // ignore keys with modifiers
    }
    if (event.key === 'Enter' || event.key === '=') {
      consumeEvent();
      this.handleEvaluation('decimal');
    } else if (event.key === '#') {
      consumeEvent();
      this.handleEvaluation('fraction');
    } else {
      const invocation = this.commandOfKeypress(event);
      if (invocation !== null) {
        consumeEvent();
        this.executeCommand(invocation);
      }
    }
  }

  // Undo and redo, with the Ctrl key or, on a Mac, the Command key
  private shortcutOfKeypress(event: KeyboardEvent): null | (() => void) {
    if (event.altKey) return null;
    switch (event.key.toLowerCase()) {
      case 'z':
        return event.shiftKey ? () => this.redo() : () => this.undo();
      case 'y':
        return event.shiftKey ? null : () => this.redo();
      default:
        return null;
    }
  }

  private commandOfKeypress(event: KeyboardEvent): null | EditInvocation {
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
      case '(':
      case ')':
      case '+':
      case '-':
      case '*':
      case '/':
        return this.editCommand('typeInput', { input });
      case '.':
      case ',':
        return this.editCommand('typeInput', { input: '.' });
      case '^':
        return this.editCommand('applyExponent', { square: false });
      case 'Dead': // Circumflex may be a "dead key", but so are accents: only accept the circumflex key
        return this.isCircumflexKey(event) ? this.editCommand('applyExponent', { square: false }) : null;
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
      case 'Home':
        return this.editCommand('move', { direction: 'start' });
      case 'End':
        return this.editCommand('move', { direction: 'end' });
      case 'Backspace':
        return this.editCommand('backspace', {});
      case 'Escape':
        return this.editCommand('clearAll', {});
      default:
        return null;
    }
  }

  private isKeyboardExempt(event: KeyboardEvent): boolean {
    const target = event.target;
    if (!(target instanceof Element)) return false;
    if (target.closest(KEYBOARD_EXEMPT_SELECTOR) !== null) return true;

    // Enter and Space on a keyboard-focused button press that button; a mouse-clicked button shows no focus
    const isPressKey = event.key === 'Enter' || event.key === ' ';
    return isPressKey && target.matches(KEYBOARD_PRESSABLE_SELECTOR) && target.matches(':focus-visible');
  }

  private isCircumflexKey(event: KeyboardEvent): boolean {
    // German layout: key left of '1'; US-international layout: Shift+6
    return (event.code === 'Backquote' && !event.shiftKey) || (event.code === 'Digit6' && event.shiftKey);
  }

  private editCommand<N extends M.EditCommand.Name>(name: N, details: EditCommandDetails<N>): EditInvocation {
    const input = this.editSequence();

    // Edit input if caret is placed
    const caretTokenId = this.caretTokenId();
    if (caretTokenId !== null) {
      return { input, command: { targetId: caretTokenId, name, ...details } as M.EditCommand.OfName<N> };
    }

    // Check if an evaluation result exists, and continue editing with result as input unless a navigation-command is issued;
    // what starts an operand of its own, e.g. a digit, starts a new input instead, as on a pocket calculator
    const evaluationResult = this.evaluationResult();
    if (evaluationResult !== null && evaluationResult.ok && !this.isNavigationCommand(name)) {
      const nextInput = this.startsNewInput(name, details) ? M.sequence() : evaluationResult.value.outputSequence;
      const targetId = lastTokenIdOf(nextInput);
      return { input: nextInput, command: { targetId, name, ...details } as M.EditCommand.OfName<N> };
    }

    // Continue editing at end of input
    const targetId = lastTokenIdOf(input);
    return { input, command: { targetId, name, ...details } as M.EditCommand.OfName<N> };
  }

  private startsNewInput(name: M.EditCommand.Name, details: object): boolean {
    if (name !== 'typeInput' || !('input' in details)) return false;
    switch (details.input) {
      case '+':
      case '-':
      case '*':
      case '/':
      case ')':
        return false; // these go on from the result
      default:
        return true; // a digit, the decimal point, a constant or an opening fence
    }
  }

  private isNavigationCommand(name: M.EditCommand.Name): boolean {
    switch (name) {
      case 'backspace':
      case 'focus':
      case 'move':
        return true;
      default:
        return false;
    }
  }

  // Apply a command to its input; taking up another input, e.g. the result, is one step to undo along with the command
  private executeCommand({ input, command }: EditInvocation) {
    const { tree, focusId, changed } = M.dispatchEditCommand(input, command);
    if (changed || input !== this.editSequence()) this.editSequence.set(tree, true);
    this.caretTokenId.set(focusId);
    this.evaluationResult.set(null);
    this.caretMoved.emit();
  }

  private executeEvaluation(inputSequence: M.EditSequence, mode: EvaluationMode): EvaluationResult {
    const compileResult = M.compileToFormula(inputSequence);
    if (!compileResult.ok) {
      console.warn('Compile to formula issue:', compileResult.issue);
      const { code, tokenId, sequenceId } = compileResult.issue;
      const message = ISSUE_MESSAGES[code] || 'Unbekannter Eingabefehler?';
      return M.Result.issue({ message, tokenId: tokenId ?? sequenceId });
    }

    const evaluationResult = M.evaluateFormula(compileResult.value);
    if (!evaluationResult.ok) {
      console.warn('Evaluate formula issue:', evaluationResult.issue);
      const { code, sourceTokenId } = evaluationResult.issue;
      const message = ISSUE_MESSAGES[code] || 'Unbekannter Mathefehler?';
      return M.Result.issue({ message, tokenId: sourceTokenId });
    }

    const requireFraction = mode === 'fraction';
    const { formula, isApproximation } = M.formatNumericToFormula(evaluationResult.value, { requireFraction });
    const outputSequence = M.tokenizeFormula(formula);

    return M.Result.ok({
      mode,
      isApproximation,
      inputSequence,
      outputSequence,
    });
  }

  private amendHistory(
    { mode, inputSequence, outputSequence, isApproximation }: EvaluationOutput,
    journalEntryPromise: Promise<JournalEntry>,
  ): void {
    const historyEntry: HistoryEntry = {
      id: this.nextHistoryEntryId(),
      mode,
      input: inputSequence,
      output: outputSequence,
      isApproximation,
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

  private restoreInitialState(): null | readonly [M.EditSequence, HistoryEntry[]] {
    // Restore journal-entries from state-data, keeping no more than the journal shows
    const storedJournalEntries = this.readStateDataArray();
    if (storedJournalEntries === null) return null;
    const journalEntries = storedJournalEntries.slice(
      Math.max(0, storedJournalEntries.length - this.journalLineCount()),
    );

    // Map journal-entries back into history-entries; skip those which cannot be restored
    const historyEntries = journalEntries.flatMap((journalEntry): HistoryEntry[] => {
      try {
        const match = journalEntry.asLatex.match(LATEX_INPUT_SEPARATOR_OUTPUT);
        if (match === null) throw new Error(`No separator in journal-entry: ${journalEntry.asLatex}`);

        const [, inputLatex, separatorLatex, outputLatex] = match;
        const input = M.parseFromLatex(inputLatex);
        const output = M.parseFromLatex(outputLatex);
        const isApproximation = separatorLatex === '\\approx';
        const journalEntryPromise = Promise.resolve(journalEntry);
        const mode = evaluationModeOf(output);
        return [{ id: this.nextHistoryEntryId(), mode, input, output, isApproximation, journalEntryPromise }];
      } catch (error: unknown) {
        console.warn('Restoring journal-entry failed:', error);
        return [];
      }
    });

    // Restore input edit-sequence from latest entry
    const latestHistoryEntry = historyEntries.at(-1);
    const editSequence = latestHistoryEntry?.input ?? M.sequence();
    return [editSequence, historyEntries];
  }

  private nextHistoryEntryId(): number {
    return this.historyEntryIdCounter++;
  }
}
