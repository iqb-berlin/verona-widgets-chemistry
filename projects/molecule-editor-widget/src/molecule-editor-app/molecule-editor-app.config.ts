import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideVeronaWidgetIFrame } from 'verona-widget';

export const moleculeEditorAppConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideVeronaWidgetIFrame(window),
  ],
};
