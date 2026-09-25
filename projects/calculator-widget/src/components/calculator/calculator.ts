import { Component, HostListener, inject, signal } from '@angular/core';
import { historySignal, HistorySignal, VeronaWidgetService } from 'verona-widget';
import { FocusContext } from '../display-edit-sequence/focus-context';
import { ConstantSymbol, dispatchEditCommand, EditCommand, EditSequence, EditTokenId, sequence } from '../../models';
import { MatFabButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuContent, MatMenuTrigger } from '@angular/material/menu';
import { DisplayEditSequence } from '../display-edit-sequence/display-edit-sequence';

type EditCommandDetails<N extends EditCommand.Name> = Omit<EditCommand.OfName<N>, 'name' | 'targetId'>;

@Component({
  selector: 'app-calculator',
  templateUrl: './calculator.html',
  styleUrl: './calculator.scss',
  providers: [FocusContext],
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
export class Calculator {
  readonly widgetService = inject(VeronaWidgetService);
  readonly focusContext = inject(FocusContext);

  readonly editSequence: HistorySignal<EditSequence>;
  readonly isNavExpanded = signal<boolean>(false);

  protected readonly CONSTANT_PI = ConstantSymbol.Pi;
  protected readonly DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

  constructor() {
    const empty = sequence();
    this.editSequence = historySignal<EditSequence>(empty, { capacity: 100 });
    this.focusContext.focusOn(empty);
  }

  @HostListener('window:keyup', ['$event'])
  handleKeypress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.executeEvaluation('exact');
      return;
    }

    const keyCommand = this.commandOfKeypress(event);
    if (keyCommand) {
      event.preventDefault();
      this.executeCommand(keyCommand);
      return;
    }
  }

  handleClose() {
    const finalState = 'TODO: Serialize state as LaTeX';
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
    //TODO()
  }

  private currentFocusId(): EditTokenId {
    return this.focusContext.focusId() ?? this.editSequence().id;
  }

  private editCommand<N extends EditCommand.Name>(name: N, details: EditCommandDetails<N>): EditCommand.OfName<N> {
    const targetId = this.currentFocusId();
    return { name, targetId, ...details } as EditCommand.OfName<N>;
  }

  private executeCommand(command: EditCommand) {
    const { tree, focusId, changed } = dispatchEditCommand(this.editSequence(), command);
    this.editSequence.set(tree, changed); // set formula, only commit to history if something was changed
    this.focusContext.focus(focusId); // move focus after edit
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
      case 'ArrowDown':
        return this.editCommand('move', { direction: 'down' });
      case 'ArrowUp':
        return this.editCommand('move', { direction: 'up' });
      case 'ArrowLeft':
        return this.editCommand('move', { direction: 'left' });
      case 'ArrowRight':
        return this.editCommand('move', { direction: 'right' });
      default:
        return null;
    }
  }
}
