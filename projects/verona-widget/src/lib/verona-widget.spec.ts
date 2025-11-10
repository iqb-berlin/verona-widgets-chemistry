import {ComponentFixture, TestBed} from '@angular/core/testing';

import {VeronaWidget} from './verona-widget';
import {provideZonelessChangeDetection} from '@angular/core';

describe('VeronaWidget', () => {
  let component: VeronaWidget;
  let fixture: ComponentFixture<VeronaWidget>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VeronaWidget],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(VeronaWidget);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
