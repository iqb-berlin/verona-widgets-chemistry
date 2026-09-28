import { bootstrapApplication } from '@angular/platform-browser';
import { calculatorAppConfig } from './calculator-app/calculator-app.config';
import { CalculatorApp } from './calculator-app/calculator-app';

bootstrapApplication(CalculatorApp, calculatorAppConfig).catch((err) => console.error(err));
