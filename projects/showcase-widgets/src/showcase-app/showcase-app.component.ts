import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { MatTabLink, MatTabNav, MatTabNavPanel } from '@angular/material/tabs';
import { ShowcasePath } from './showcase-app.routes';

@Component({
  selector: 'app-showcase-root',
  imports: [RouterOutlet, RouterLink, MatTabNavPanel, MatTabNav, MatTabLink],
  templateUrl: './showcase-app.component.html',
  styleUrl: './showcase-app.component.scss',
})
export class ShowcaseApp {
  protected readonly PeriodicSystemSelectPath = ShowcasePath.PeriodicSystemSelect;
  protected readonly MoleculeEditorPath = ShowcasePath.MoleculeEditor;
  protected readonly CalculatorPath = ShowcasePath.Calculator;
}
