import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PsTableElement } from './ps-table-element';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideTestPsService } from '../ps-table/ps-table.spec';
import { PsElements } from '../../data/PsData';

describe('PsTableElement', () => {
  let component: PsTableElement;
  let fixture: ComponentFixture<PsTableElement>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PsTableElement],
      providers: [provideZonelessChangeDetection(), provideTestPsService()],
    }).compileComponents();

    fixture = TestBed.createComponent(PsTableElement);
    fixture.componentRef.setInput('element', PsElements[0]);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
