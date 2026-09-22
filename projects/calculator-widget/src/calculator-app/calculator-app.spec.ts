import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CalculatorApp } from './calculator-app';
import { provideVeronaWidgetIFrame } from 'verona-widget';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalculatorApp],
      providers: [provideZonelessChangeDetection(), provideVeronaWidgetIFrame(window)],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(CalculatorApp);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
