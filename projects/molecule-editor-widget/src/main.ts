import { bootstrapApplication } from '@angular/platform-browser';
import { moleculeEditorAppConfig } from './molecule-editor-app/molecule-editor-app.config';
import { MoleculeEditorApp } from './molecule-editor-app/molecule-editor-app';

bootstrapApplication(MoleculeEditorApp, moleculeEditorAppConfig).catch((err) => console.error(err));
