import { Component, DOCUMENT, effect, inject, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { MatTabLink, MatTabNav, MatTabNavPanel } from '@angular/material/tabs';
import { ShowcasePath } from './showcase-app.routes';
import { MatMiniFabButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';

@Component({
  selector: 'app-showcase-root',
  imports: [RouterOutlet, RouterLink, MatTabNavPanel, MatTabNav, MatTabLink, MatMiniFabButton, MatIcon],
  templateUrl: './showcase-app.component.html',
  styleUrl: './showcase-app.component.scss',
})
export class ShowcaseApp {
  readonly theme = signal<'light' | 'dark'>('light');
  readonly document = inject(DOCUMENT);

  protected readonly PeriodicSystemSelectPath = ShowcasePath.PeriodicSystemSelect;
  protected readonly MoleculeEditorPath = ShowcasePath.MoleculeEditor;
  protected readonly CalculatorPath = ShowcasePath.Calculator;

  constructor() {
    effect(() => {
      document.body.style.colorScheme = this.theme();
    });
  }

  toggleTheme() {
    if (this.theme() === 'dark') {
      this.theme.set('light');
    } else {
      this.theme.set('dark');
    }
  }
}
