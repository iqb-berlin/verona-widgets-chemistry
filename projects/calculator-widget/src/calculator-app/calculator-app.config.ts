import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideVeronaWidgetIFrame } from 'verona-widget';

export const calculatorAppConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideVeronaWidgetIFrame(window),
  ],
};
