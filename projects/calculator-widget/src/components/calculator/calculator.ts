import { afterRenderEffect, Component, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import { MatActionList, MatDivider, MatListItem } from '@angular/material/list';
import { MatIcon } from '@angular/material/icon';
import { MatFabButton, MatIconButton } from '@angular/material/button';
import { MatMenu, MatMenuContent, MatMenuTrigger } from '@angular/material/menu';
import { CustomIconsService, registerCustomIcons } from 'verona-widget';
import { DisplayEditSequence } from '../display-edit-sequence/display-edit-sequence';
import CalcIcons from '../../assets/calc-icons.svg';
import { CalculatorService } from '../../services/calculator-service';
import { CalculatorImageRenderer } from '../../services/calculator-image-renderer.service';
import { ConstantSymbol } from '../../models';

@Component({
  selector: 'app-calculator',
  templateUrl: './calculator.html',
  styleUrl: './calculator.scss',
  providers: [
    CalculatorService,
    CalculatorImageRenderer,
    registerCustomIcons([{ namespace: 'calc', svg: CalcIcons }]), // IQB calculator custom icons
  ],
  imports: [
    DisplayEditSequence,
    MatFabButton,
    MatIconButton,
    MatIcon,
    MatMenu,
    MatMenuTrigger,
    MatMenuContent,
    MatListItem,
    MatActionList,
    MatDivider,
  ],
})
export class Calculator {
  readonly service = inject(CalculatorService);
  readonly customIcons = inject(CustomIconsService);
  readonly isNavExpanded = signal<boolean>(false);
  readonly caretMoveTick = signal(0);
  readonly mathView = viewChild<ElementRef<MathMLElement>>('mathView', { debugName: 'mathView' });

  protected readonly CONSTANT_PI = ConstantSymbol.Pi;
  protected readonly DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

  constructor() {
    // Register IQB-Calc SVG icons
    this.customIcons.registerIcons();

    // Listen to caret movement; scroll either caret or result into view when rendering finishes
    this.service.caretMoved.subscribe(() => {
      this.caretMoveTick.update((tick) => tick + 1);
    });
    afterRenderEffect(() => {
      this.caretMoveTick(); // Run effect on tick

      const mathView = untracked(this.mathView);
      const caretTokenId = untracked(this.service.caretTokenId);
      const mathElement = mathView?.nativeElement;
      if (caretTokenId === null) {
        const resultElement = mathElement?.querySelector('[data-result]');
        resultElement?.scrollIntoView({ block: 'center', inline: 'end', behavior: 'smooth' });
      } else {
        const caretElement = mathElement?.querySelector('[data-caret]');
        caretElement?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    });
  }

  toggleNavExpanded() {
    this.isNavExpanded.update((value) => !value);
  }
}
