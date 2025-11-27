import { Component } from '@angular/core';
import { MatIcon } from '@angular/material/icon';

@Component({
  selector: 'app-ps-select-alert',
  imports: [MatIcon],
  template: `
    <div class="alert-container">
      <section role="alert" class="alert">
        <div class="alert-sidebar">
          <mat-icon>feedback</mat-icon>
        </div>
        <div class="alert-content">
          <ng-content></ng-content>
        </div>
      </section>
    </div>
  `,
  styles: `
    .alert-container {
      display: flex;
      flex-direction: row;
      flex-wrap: nowrap;
      justify-content: center;
      padding-top: 1rem;
    }

    .alert {
      display: flex;
      flex-direction: row;
      flex-wrap: nowrap;
      background-color: #ffec9d;
    }

    .alert-sidebar {
      padding: 0.5rem;
      background-color: #ffce00;
    }

    .alert-content {
      padding: 0.75rem 1.5rem;
    }
  `,
})
export class PsSelectAlert {}
