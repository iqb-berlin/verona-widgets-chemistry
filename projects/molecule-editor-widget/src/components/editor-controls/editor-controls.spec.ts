import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideDummyVeronaWidgetService } from 'verona-widget';
import { MoleculeEditorService } from '../../services/molecule-editor.service';
import { EditorControls } from './editor-controls';
import { CustomIconsService, registerCustomIcons } from '../../services/custom-icons.service';
import IqbIcons from '../../assets/iqb-icons.svg';

describe('EditorControls', () => {
  let component: EditorControls;
  let fixture: ComponentFixture<EditorControls>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorControls],
      providers: [
        provideZonelessChangeDetection(),
        registerCustomIcons([{ namespace: 'iqb', svg: IqbIcons }]),
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
      ],
    }).compileComponents();

    TestBed.inject(CustomIconsService).registerIcons();

    fixture = TestBed.createComponent(EditorControls);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
