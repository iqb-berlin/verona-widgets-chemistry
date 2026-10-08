import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MoleculeEditor } from './molecule-editor';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideDummyVeronaWidgetService } from 'verona-widget';

describe('MoleculeBuilder', () => {
  let component: MoleculeEditor;
  let fixture: ComponentFixture<MoleculeEditor>;

  async function setup(parameters: Record<string, string>, sharedParameters: Record<string, string> = {}) {
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
            parameters,
            sharedParameters,
          },
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MoleculeEditor);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', async () => {
    await setup({});
    expect(component).toBeTruthy();
  });

  describe('BONDING_TYPE', () => {
    it('defaults to ELECTRONS', async () => {
      await setup({});
      expect(component.service.appearance().bondingType).toBe('ELECTRONS');
    });

    it('is read from the call parameters', async () => {
      await setup({ BONDING_TYPE: 'VALENCE' });
      expect(component.service.appearance().bondingType).toBe('VALENCE');
    });

    it('is not read from the shared parameters', async () => {
      await setup({}, { BONDING_TYPE: 'VALENCE' });
      expect(component.service.appearance().bondingType).toBe('ELECTRONS');
    });
  });
});
