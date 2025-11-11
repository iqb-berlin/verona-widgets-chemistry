import { Provider, signal, Signal, WritableSignal } from '@angular/core';
import { VeronaWidgetConfiguration, VeronaWidgetService, VeronaWidgetState } from './verona-widget.service';
import { VeronaModuleMetadata } from './verona-metadata.model';

export function provideTestVeronaWidgetService(options: TestVeronaWidgetOptions): Provider[] {
  return [
    {
      provide: VeronaWidgetService,
      useFactory: () => new TestVeronaWidgetService(options),
    },
  ];
}

export interface TestVeronaWidgetOptions {
  readonly testConfig: VeronaWidgetConfiguration;
  readonly testMetadata: VeronaModuleMetadata;
}

export class TestVeronaWidgetService implements VeronaWidgetService {
  readonly state: WritableSignal<VeronaWidgetState>;
  readonly stateData = signal('');
  readonly configuration: Signal<VeronaWidgetConfiguration>;

  constructor(private readonly options: TestVeronaWidgetOptions) {
    this.configuration = signal(options.testConfig);
    this.state = signal({ state: 'running', config: options.testConfig, metadata: options.testMetadata });
  }

  sendReady(metadata: VeronaModuleMetadata): void {
    this.state.set({ state: 'running', config: this.options.testConfig, metadata });
  }

  sendReturn(saveState?: boolean): void {}
}
