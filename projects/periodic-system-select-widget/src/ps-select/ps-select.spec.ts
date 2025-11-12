import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PsSelect } from './ps-select';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideDummyVeronaWidgetService } from 'verona-widget';

describe('PsSelect', () => {
  let component: PsSelect;
  let fixture: ComponentFixture<PsSelect>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PsSelect],
      providers: [
        provideZonelessChangeDetection(),
        provideDummyVeronaWidgetService({
          testMetadata: {
            type: 'WIDGET_PERIODIC_TABLE',
            id: 'test-periodic-table',
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

    fixture = TestBed.createComponent(PsSelect);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
