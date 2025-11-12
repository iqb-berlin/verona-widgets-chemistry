import { Provider, signal, Signal, WritableSignal } from '@angular/core';
import { VeronaWidgetConfiguration, VeronaWidgetService, VeronaWidgetState } from './verona-widget.service';
import { VeronaModuleMetadata } from './verona-metadata.model';

export function provideDummyVeronaWidgetService(options: VeronaWidgetDummyOptions): Provider[] {
  return [
    {
      provide: VeronaWidgetService,
      useFactory: () => new DummyVeronaWidgetService(options),
    },
  ];
}

export interface VeronaWidgetDummyOptions {
  readonly testConfig: VeronaWidgetConfiguration;
  readonly testMetadata: VeronaModuleMetadata;
}

export class DummyVeronaWidgetService implements VeronaWidgetService {
  readonly state: WritableSignal<VeronaWidgetState>;
  readonly stateData = signal('');
  readonly configuration: Signal<VeronaWidgetConfiguration>;

  constructor(private readonly options: VeronaWidgetDummyOptions) {
    this.configuration = signal(options.testConfig);
    this.state = signal({ state: 'running', config: options.testConfig, metadata: options.testMetadata });
  }

  sendReady(metadata: VeronaModuleMetadata): void {
    this.state.set({ state: 'running', config: this.options.testConfig, metadata });
  }

  sendReturn(saveState?: boolean): void {}
}
