import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideVeronaWidgetIFrame } from 'verona-widget';

export const psSelectAppConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideVeronaWidgetIFrame(window),
  ],
};
