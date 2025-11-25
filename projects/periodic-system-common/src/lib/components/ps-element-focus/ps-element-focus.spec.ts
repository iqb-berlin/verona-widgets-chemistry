import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PsElementFocusDirective } from './ps-element-focus';

describe('PsElementFocus', () => {
  let component: PsElementFocusDirective;
  let fixture: ComponentFixture<PsElementFocusDirective>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PsElementFocusDirective],
    }).compileComponents();

    fixture = TestBed.createComponent(PsElementFocusDirective);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
