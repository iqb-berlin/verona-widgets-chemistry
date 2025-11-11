import { bootstrapApplication } from '@angular/platform-browser';
import { showcaseAppConfig } from './showcase-app/showcase-app.config';
import { ShowcaseApp } from './showcase-app/showcase-app.component';

bootstrapApplication(ShowcaseApp, showcaseAppConfig).catch((err) => console.error(err));
