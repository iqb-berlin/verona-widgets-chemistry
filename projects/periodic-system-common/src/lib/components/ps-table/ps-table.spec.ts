import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PsTable } from './ps-table';
import { Provider, provideZonelessChangeDetection, signal } from '@angular/core';
import { PsAppearance, PsService } from '../../services/ps-service';
import { PsElement, PsElementBlock, PsElementNumber, PsLocale } from '../../data/PsData';

describe('PsTable', () => {
  let component: PsTable;
  let fixture: ComponentFixture<PsTable>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PsTable],
      providers: [provideZonelessChangeDetection(), provideTestPsService()],
    }).compileComponents();

    fixture = TestBed.createComponent(PsTable);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

export function provideTestPsService() {
  return {
    provide: PsService,
    useClass: TestPsService,
  } satisfies Provider;
}

export class TestPsService implements PsService {
  readonly appearance = signal<PsAppearance>({
    locale: PsLocale.English,
    showMass: false,
    showName: true,
    showSymbol: true,
    showENeg: false,
    showNumber: true,
    showLabels: true,
    enableBlockColors: false,
    defaultBaseColor: '',
    defaultTextColor: '',
    blockColors: {
      [PsElementBlock.S]: '',
      [PsElementBlock.P]: '',
      [PsElementBlock.D]: '',
      [PsElementBlock.F]: '',
      [PsElementBlock.G]: '',
    },
  });
  readonly interaction = {
    selectedElements: signal<ReadonlySet<PsElementNumber>>(new Set()),
    highlightedElement: signal<undefined | PsElementNumber>(undefined),
    elementClickBlocked: signal(false),
    clickElement(element: PsElement): void {},
    highlightElement() {},
  };
}
