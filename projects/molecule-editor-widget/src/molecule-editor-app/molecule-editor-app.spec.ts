import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MoleculeEditorApp } from './molecule-editor-app';
import { provideVeronaWidgetIFrame } from 'verona-widget';

describe('MoleculeEditorApp', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MoleculeEditorApp],
      providers: [provideZonelessChangeDetection(), provideVeronaWidgetIFrame(window)],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(MoleculeEditorApp);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
