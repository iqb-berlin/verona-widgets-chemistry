import { Routes } from '@angular/router';
import { PsSelectPage } from '../ps-select-page/ps-select-page';
import { MoleculeEditorPage } from '../molecule-editor-page/molecule-editor-page';
import { CalculatorPage } from '../calculator-page/calculator-page';
import { HomePage } from '../home-page/home-page';

export const enum ShowcasePath {
  PeriodicSystemSelect = 'ps-select',
  MoleculeEditor = 'molecule-editor',
  Calculator = 'calculator',
}

export const routes: Routes = [
  {
    path: '',
    component: HomePage,
  },
  {
    path: ShowcasePath.PeriodicSystemSelect,
    component: PsSelectPage,
  },
  {
    path: ShowcasePath.MoleculeEditor,
    component: MoleculeEditorPage,
  },
  {
    path: ShowcasePath.Calculator,
    component: CalculatorPage,
  }
];
