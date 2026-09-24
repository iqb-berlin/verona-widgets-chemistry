import { Component, computed, HostListener, inject, signal } from '@angular/core';
import { HistorySignal, historySignal } from 'verona-widget';
import { FormulaContext } from '../display-formula-node/formula-context';
import {
  dispatchEditCommand,
  EditCommand,
  EditCommandName,
  EditCommandOfName,
  evaluateFormula,
  FormulaEvalResult,
  FormulaNode,
  FormulaNodeId,
  hole,
  valueToFormulaResult,
} from '../../models';
import { MatFabButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuContent, MatMenuTrigger } from '@angular/material/menu';
import { DisplayFormulaNode } from '../display-formula-node/display-formula-node';

type EditCommandDetails<N extends EditCommandName> = Omit<EditCommandOfName<N>, 'name' | 'targetId'>;

@Component({
  selector: 'app-calculator',
  templateUrl: './calculator.html',
  styleUrl: './calculator.scss',
  providers: [FormulaContext],
  imports: [
    MatFabButton,
    MatFabButton,
    MatIconButton,
    MatIcon,
    MatMenu,
    MatMenuTrigger,
    MatMenuContent,
    DisplayFormulaNode,
  ],
})
export class Calculator {
  readonly context = inject(FormulaContext);
  readonly formula: HistorySignal<FormulaNode>;

  readonly evaluation = signal<null | FormulaEvalResult>(null);
  readonly evaluationIssue = computed(() => {
    const evaluation = this.evaluation();
    if (evaluation === null || evaluation.ok) return null;
    return evaluation.issue.code;
  });
  readonly evaluatedFormula = computed(() => {
    const evaluation = this.evaluation();
    if (evaluation === null || !evaluation.ok) return null;
    return valueToFormulaResult(evaluation.value);
  });

  constructor() {
    const blank = hole('blank');
    this.formula = historySignal<FormulaNode>(blank, { capacity: 50 });
    this.context.focusOn(blank);
  }

  @HostListener('window:keyup', ['$event'])
  handleKey(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.evaluation.set(evaluateFormula(this.formula()));
      return;
    }

    const keyCommand = this.commandOfKeyEvent(event);
    if (keyCommand) {
      event.preventDefault();
      this.executeCommand(keyCommand);
      return;
    }
  }

  handleButton<N extends EditCommandName>(name: N, details: EditCommandDetails<N>): void {
    const command = this.editCommand(name, details);
    this.executeCommand(command);
  }

  protected currentFocusId(): FormulaNodeId {
    return this.context.focusId() ?? this.formula().id;
  }

  private editCommand<N extends EditCommandName>(name: N, details: EditCommandDetails<N>): EditCommandOfName<N> {
    const targetId = this.currentFocusId();
    return { name, targetId, ...details } as EditCommandOfName<N>;
  }

  private executeCommand(command: EditCommand) {
    const { tree, focusId, changed } = dispatchEditCommand(this.formula(), command);
    //TODO const normalised = changed ? simplifyFormula(tree) : tree
    const normalised = tree;
    this.formula.set(normalised, changed); // set formula, only commit to history if something was changed
    this.context.focus(focusId); // move focus after edit
  }

  private commandOfKeyEvent(event: KeyboardEvent): null | EditCommand {
    if (/\d/.test(event.key)) {
      return this.editCommand('typeDigit', { digit: event.key });
    }
    if (/[,.]/.test(event.key)) {
      return this.editCommand('typeDecimalPoint', {});
    }
    switch (event.key) {
      case '+':
        return this.editCommand('applyBinaryOperator', { operator: 'add' });
      case '-':
        return this.editCommand('applyBinaryOperator', { operator: 'subtract' });
      case '*':
        return this.editCommand('applyBinaryOperator', { operator: 'multiply', notation: 'cross' });
      case '/':
        return this.editCommand('applyBinaryOperator', { operator: 'divide', notation: 'fraction' });
      case 'ArrowDown':
        return this.editCommand('move', { direction: 'in' });
      case 'ArrowUp':
        return this.editCommand('move', { direction: 'out' });
      case 'ArrowLeft':
        return this.editCommand('move', { direction: 'previous' });
      case 'ArrowRight':
        return this.editCommand('move', { direction: 'next' });
      default:
        return null;
    }
  }
}
