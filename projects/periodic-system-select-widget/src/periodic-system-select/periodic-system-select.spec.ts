import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PeriodicSystemSelect } from './periodic-system-select';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideTestVeronaWidgetService } from 'verona-widget';

describe('PeriodicSystemSelect', () => {
  let component: PeriodicSystemSelect;
  let fixture: ComponentFixture<PeriodicSystemSelect>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PeriodicSystemSelect],
      providers: [
        provideZonelessChangeDetection(),
        provideTestVeronaWidgetService({
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

    fixture = TestBed.createComponent(PeriodicSystemSelect);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
