import { bootstrapApplication } from '@angular/platform-browser';
import { psSelectAppConfig } from './ps-select-app/ps-select-app.config';
import { PsSelectApp } from './ps-select-app/ps-select-app';

bootstrapApplication(PsSelectApp, psSelectAppConfig).catch((err) => console.error(err));
