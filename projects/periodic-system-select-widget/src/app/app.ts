import {Component, computed, inject, signal} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatInput} from '@angular/material/input';
import {MatSlideToggle} from '@angular/material/slide-toggle';
import {MatFormField, MatLabel} from '@angular/material/form-field';
import {
  PeriodicSystemModule,
  PsAppearance,
  PsElement,
  PsElementBlock,
  PsElementNumber,
  PsInteraction,
  PsLocale,
  PsService,
} from 'periodic-system-common';

@Component({
  selector: 'app-root',
  imports: [PeriodicSystemModule, FormsModule, MatSlideToggle, MatFormField, MatLabel, MatInput],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  providers: [
    {
      provide: PsService,
      useFactory(): PsService {
        const app = inject(App)
        return new AppPsService(app)
      },
    }
  ],
})
export class App {
  readonly multiSelect = signal<boolean>(false)
  readonly maxSelectCount = signal<number>(0)

  readonly selectedElements = signal<ReadonlyArray<PsElementNumber>>([])
}

class AppPsService implements PsService {
  readonly interaction: PsInteraction;

  constructor(app: App) {
    this.interaction = new AppPsInteraction(app)
  }

  //TODO: Integrate appearance with widget system
  appearance = signal<PsAppearance>({
    locale: PsLocale.English,
    showSymbol: true,
    showName: true,
    showMass: true,
    enableBlockColors: true,
    defaultTextColor: "#ffffff",
    defaultBaseColor: "#4000ff",
    blockColors: {
      [PsElementBlock.S]: "#cd2f2f",
      [PsElementBlock.P]: "#559955",
      [PsElementBlock.D]: "#6699dd",
      [PsElementBlock.F]: "#ff8822",
      [PsElementBlock.G]: "#000000",
    }
  });
}

//TODO: Integrate interaction with widget system
class AppPsInteraction implements PsInteraction {
  readonly selectedElements = computed(() => {
    return new Set(this.app.selectedElements());
  });

  readonly elementClickBlocked = computed(() => {
    const multiSelect = this.app.multiSelect();
    const maxSelectCount = this.app.maxSelectCount();
    const selectedElements = this.app.selectedElements();
    return multiSelect && maxSelectCount > 0 && selectedElements.length >= maxSelectCount;
  });

  constructor(private readonly app: App) {
  }

  clickElement(element: PsElement): void | Promise<void> {
    const multiSelect = this.app.multiSelect();
    const maxSelectCount = this.app.maxSelectCount();
    this.app.selectedElements.update(state => {
      const alreadyIncluded = state.includes(element.number);
      if (!multiSelect) { // single-select toggle
        return alreadyIncluded ? [] : [element.number];
      } else if (alreadyIncluded) { // multi-select remove click
        return state.filter(x => x !== element.number);
      } else if (maxSelectCount < 1 || state.length < maxSelectCount) { // multi-select add click
        return state.concat(element.number);
      } else { // no change
        return state;
      }
    })
  }
}
