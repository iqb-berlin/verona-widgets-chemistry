import { Component, effect, HostListener, inject, OnInit, signal } from '@angular/core';
import { debounceEffect, historySignal, HistorySignal, VeronaWidgetService } from 'verona-widget';
import { CaretContext } from '../display-edit-sequence/caret-context';
import {
  compileToFormula,
  CompileToFormulaIssueCode,
  ConstantSymbol,
  dispatchEditCommand,
  EditCommand,
  EditSequence,
  EditTokenId,
  evaluateFormula,
  exactToFormulaOutput,
  formatToLatex,
  FormulaEvalIssueCode,
  FormulaNode,
  parseFromLatex,
  sequence,
  tokenizeFormula,
} from '../../models';
import { MatFabButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuContent, MatMenuTrigger } from '@angular/material/menu';
import { DisplayEditSequence } from '../display-edit-sequence/display-edit-sequence';

type EditCommandDetails<N extends EditCommand.Name> = Omit<EditCommand.OfName<N>, 'name' | 'targetId'>;

@Component({
  selector: 'app-calculator',
  templateUrl: './calculator.html',
  styleUrl: './calculator.scss',
  providers: [CaretContext],
  imports: [
    MatFabButton,
    MatFabButton,
    MatIconButton,
    MatIcon,
    MatMenu,
    MatMenuTrigger,
    MatMenuContent,
    DisplayEditSequence,
  ],
})
export class Calculator implements OnInit {
  readonly widgetService = inject(VeronaWidgetService);
  readonly caret = inject(CaretContext);

  readonly isNavExpanded = signal<boolean>(false);

  readonly editSequence: HistorySignal<EditSequence>;

  protected readonly CONSTANT_PI = ConstantSymbol.Pi;
  protected readonly DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;
  protected readonly ISSUE_MESSAGES = {
    incomplete: 'Unvollständige Eingabe',
    unexpectedToken: 'Unerwartete Eingabe: $detail',
    unexpectedEnd: 'Unerwartetes Ende der Eingabe',
    syntaxError: 'Syntaxfehler: $detail',
    divisionByZero: 'Teilung durch Null',
    indeterminate: 'Ergebnis nicht bestimmt',
    nonFinite: 'Ergebnis ist keine endliche Zahl',
    complexResult: 'Komplexe Zahl nicht berechenbar',
    unsupported: 'Berechnung wird nicht unterstützt',
  } as const satisfies Record<CompileToFormulaIssueCode | FormulaEvalIssueCode, string>;

  constructor() {
    // Initialize empty edit-sequence
    const empty = sequence();
    this.editSequence = historySignal<EditSequence>(empty, { capacity: 100 });
    this.caret.placeInside(empty);

    // Write (debounced) edit-sequence to LaTeX state data
    debounceEffect(
      this.editSequence,
      (editSequence) => {
        const sendLatex = formatToLatex(editSequence);
        this.widgetService.stateData.set(sendLatex);
      },
      { debounceMs: 1000 },
    );
  }

  ngOnInit() {
    // Read edit-sequence from LaTeX state data
    const receivedLatex = this.widgetService.stateData();
    const restoredSequence = parseFromLatex(receivedLatex);
    console.log(`Received LaTeX $$${receivedLatex}$$ =>`, restoredSequence);
    this.editSequence.reset(restoredSequence);
    this.caret.placeInside(restoredSequence);
  }

  @HostListener('window:keyup', ['$event'])
  handleKeypress(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      this.executeEvaluation('exact');
      return;
    }

    const keyCommand = this.commandOfKeypress(event);
    if (keyCommand) {
      event.preventDefault();
      this.executeCommand(keyCommand);
    }
  }

  handleClose() {
    const finalState = formatToLatex(this.editSequence());
    this.widgetService.sendReturn({ finalState, saveState: true });
  }

  handleButton<N extends EditCommand.Name>(name: N, details: EditCommandDetails<N>): void {
    const command = this.editCommand(name, details);
    this.executeCommand(command);
  }

  toggleNavExpanded() {
    this.isNavExpanded.update((value) => !value);
  }

  executeEvaluation(mode: 'decimal' | 'exact') {
    const inputSequence = this.editSequence();
    if (inputSequence === null) return;

    const compileResult = compileToFormula(inputSequence);
    if (!compileResult.ok) return;

    const evaluated = evaluateFormula(compileResult.value);
    if (!evaluated.ok) return;

    const formulaOutput = exactToFormulaOutput(evaluated.value, { digits: 12 });
    console.log(
      FormulaNode.asLispString(compileResult.value),
      '=>',
      formulaOutput.decimal,
      '<~>',
      formulaOutput.value.toString(),
    );

    const outputSequence = tokenizeFormula(formulaOutput.exact);
    this.editSequence.set(outputSequence, true);
  }

  // The caret position an edit command starts from, defaulting to the start of the tree
  private currentCaretPosition(): EditTokenId {
    return this.caret.position() ?? this.editSequence().id;
  }

  private editCommand<N extends EditCommand.Name>(name: N, details: EditCommandDetails<N>): EditCommand.OfName<N> {
    const targetId = this.currentCaretPosition();
    return { name, targetId, ...details } as EditCommand.OfName<N>;
  }

  private executeCommand(command: EditCommand) {
    const { tree, focusId, changed } = dispatchEditCommand(this.editSequence(), command);
    this.editSequence.set(tree, changed); // set formula, only commit to history if something was changed
    this.caret.placeAt(focusId); // move the caret to where editing continues
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
}
