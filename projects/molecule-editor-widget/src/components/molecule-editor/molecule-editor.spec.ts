import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MoleculeEditor } from './molecule-editor';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideDummyVeronaWidgetService } from 'verona-widget';

describe('MoleculeBuilder', () => {
  let component: MoleculeEditor;
  let fixture: ComponentFixture<MoleculeEditor>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MoleculeEditor],
      providers: [
        provideZonelessChangeDetection(),
        provideDummyVeronaWidgetService({
          testMetadata: {
            type: 'WIDGET_MOLECULE_EDITOR',
            id: 'test-molecule-editor',
            name: [],
            version: '0.0',
            specVersion: '0.0',
            metadataVersion: '0.0',
          },
          testConfig: {
            sessionId: 'test-session',
            parameters: {},
            sharedParameters: {},
          },
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MoleculeEditor);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
