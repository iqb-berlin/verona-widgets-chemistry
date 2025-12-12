import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideDummyVeronaWidgetService } from 'verona-widget';
import { MoleculeEditorService } from '../../services/molecule-editor.service';
import { MoleculeEditorRenderer } from '../../services/molecule-editor.renderer';
import { MoleculeEditorImageService } from '../../services/molecule-editor-image.service';
import { EditorCanvas } from './editor-canvas';

describe('EditorCanvas', () => {
  let component: EditorCanvas;
  let fixture: ComponentFixture<EditorCanvas>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorCanvas],
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
        MoleculeEditorService,
        MoleculeEditorRenderer,
        MoleculeEditorImageService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EditorCanvas);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
