import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PeriodicSystemSelect } from './periodic-system-select';

describe('PeriodicSystemSelect', () => {
  let component: PeriodicSystemSelect;
  let fixture: ComponentFixture<PeriodicSystemSelect>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PeriodicSystemSelect]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PeriodicSystemSelect);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
