import {ComponentFixture, TestBed} from '@angular/core/testing';

import {PsTable} from './ps-table';
import {Provider, provideZonelessChangeDetection, signal} from '@angular/core';
import {PsAppearance, PsService} from '../../services/ps-service';
import {PsElement, PsElementBlock, PsElementNumber, PsLocale} from "../../data/PsData";

describe('PsTable', () => {
  let component: PsTable;
  let fixture: ComponentFixture<PsTable>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PsTable],
      providers: [provideZonelessChangeDetection(), provideTestPsService()],
    })
      .compileComponents();

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
  } satisfies Provider
}

export class TestPsService implements PsService {
  readonly appearance = signal<PsAppearance>({
    blockColors: {
      [PsElementBlock.S]: "",
      [PsElementBlock.P]: "",
      [PsElementBlock.D]: "",
      [PsElementBlock.F]: "",
      [PsElementBlock.G]: ""
    },
    defaultBaseColor: '',
    defaultTextColor: '',
    enableBlockColors: false,
    locale: PsLocale.English,
    showMass: false,
    showName: false,
    showSymbol: false
  });
  readonly interaction = {
    selectedElements: signal(new Set<PsElementNumber>()),
    elementClickBlocked: signal(false),
    clickElement: function (element: PsElement): void {
    }
  };
}
