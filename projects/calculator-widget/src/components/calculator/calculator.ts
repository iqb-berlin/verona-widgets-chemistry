import { Component, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatFabButton, MatIconButton } from '@angular/material/button';
import { MatMenu, MatMenuContent, MatMenuTrigger } from '@angular/material/menu';
import { DisplayEditSequence } from '../display-edit-sequence/display-edit-sequence';
import { CalculatorService, JournalImageConfig, JournalImageSource } from '../../services/calculator-service';
import { ConstantSymbol } from '../../models';
import { mathToPng } from '../../services/math-to-png';

@Component({
  selector: 'app-calculator',
  templateUrl: './calculator.html',
  styleUrl: './calculator.scss',
  providers: [CalculatorService],
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
export class Calculator implements OnInit, JournalImageSource {
  readonly service = inject(CalculatorService);
  readonly isNavExpanded = signal<boolean>(false);
  readonly mathView = viewChild<ElementRef<HTMLElement>>('mathView', { debugName: 'mathView' });

  protected readonly CONSTANT_PI = ConstantSymbol.Pi;
  protected readonly DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

  ngOnInit() {
    this.service.registerJournalImageSource(this);
  }

  toggleNavExpanded() {
    this.isNavExpanded.update((value) => !value);
  }

  async snapshotJournalImage(config: JournalImageConfig): Promise<null | string> {
    const mathElement = this.mathView()?.nativeElement;
    return mathElement
      ? await mathToPng(mathElement, { imageWidth: config.imageWidthPx, background: '#ffffff' })
      : null;
  }
}
