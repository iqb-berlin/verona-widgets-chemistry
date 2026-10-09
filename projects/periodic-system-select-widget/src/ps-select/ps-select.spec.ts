import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PsSelect } from './ps-select';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideDummyVeronaWidgetService, VeronaWidgetService } from 'verona-widget';
import { PsElement, PsElements } from 'periodic-system-common';

describe('PsSelect', () => {
  let component: PsSelect;
  let fixture: ComponentFixture<PsSelect>;
  let widgetService: VeronaWidgetService;

  async function setup(parameters: Record<string, string>, initialState = '') {
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
            parameters,
            sharedParameters: {},
          },
        }),
      ],
    }).compileComponents();

    widgetService = TestBed.inject(VeronaWidgetService);
    widgetService.stateData.set(initialState);

    fixture = TestBed.createComponent(PsSelect);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function element(symbol: string): PsElement {
    return PsElements.find((e) => e.symbol === symbol)!;
  }

  function click(symbol: string) {
    component.psService.interaction.clickElement(element(symbol));
    TestBed.tick();
  }

  function selectedSymbols(): string {
    return widgetService.stateData();
  }

  it('should create', async () => {
    await setup({});
    expect(component).toBeTruthy();
  });

  describe('MAX_NUMBER_OF_SELECTIONS = "0"', () => {
    beforeEach(() => setup({ MAX_NUMBER_OF_SELECTIONS: '0' }));

    it('allows no selection', () => {
      click('Na');
      expect(component.psService.interaction.selectedElements().size).toBe(0);
      expect(selectedSymbols()).toBe('');
      expect(component.psService.interaction.elementClickBlocked()).toBeTrue();
    });

    it('still shows information on the clicked element', () => {
      click('Na');
      expect(component.psService.interaction.highlightedElement()).toBe(element('Na').number);
    });

    it('shows no save button', () => {
      expect(component.showSubmitButton()).toBeFalse();
    });
  });

  describe('MAX_NUMBER_OF_SELECTIONS > 1', () => {
    beforeEach(() => setup({ MAX_NUMBER_OF_SELECTIONS: '2' }));

    it('stops at the configured number of selections', () => {
      click('Na');
      click('Cl');
      click('K');
      expect(selectedSymbols()).toBe('Na Cl');
      expect(component.psService.interaction.showMaxSelectionAlert()).toBeTrue();
      expect(component.showSubmitButton()).toBeTrue();
    });
  });

  it('treats a negative MAX_NUMBER_OF_SELECTIONS as the default "1"', async () => {
    await setup({ MAX_NUMBER_OF_SELECTIONS: '-1' });
    click('Na');
    click('Cl');
    expect(selectedSymbols()).toBe('Cl');
  });
});
