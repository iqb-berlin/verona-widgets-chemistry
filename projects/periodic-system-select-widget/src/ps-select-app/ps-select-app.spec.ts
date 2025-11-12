import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PsSelectApp } from './ps-select-app';
import { provideVeronaWidgetIFrame } from 'verona-widget';

describe('PsSelectApp', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PsSelectApp],
      providers: [provideZonelessChangeDetection(), provideVeronaWidgetIFrame(window)],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(PsSelectApp);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
