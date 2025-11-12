import { Routes } from '@angular/router';
import { PsSelectPage } from '../ps-select-page/ps-select-page';
import { MoleculeEditorPage } from '../molecule-editor-page/molecule-editor-page';

export const enum ShowcasePath {
  PeriodicSystemSelect = 'ps-select',
  MoleculeEditor = 'molecule-editor',
}

export const routes: Routes = [
  {
    path: ShowcasePath.PeriodicSystemSelect,
    component: PsSelectPage,
  },
  {
    path: ShowcasePath.MoleculeEditor,
    component: MoleculeEditorPage,
  },
];
