import { InjectionToken, Signal, WritableSignal } from '@angular/core';
import { VeronaModuleMetadata } from './verona-metadata.model';

export const VeronaWidgetService = new InjectionToken<VeronaWidgetService>('verona-widget.service');

export interface VeronaWidgetService {
  readonly state: Signal<VeronaWidgetState>;
  readonly stateData: WritableSignal<string>;
  readonly configuration: Signal<VeronaWidgetConfiguration>;

  sendReady(metadata: VeronaModuleMetadata): void;

  sendReturn(saveState?: boolean): void;
}

export type VeronaWidgetState = VeronaWidgetInitializing | VeronaWidgetReady | VeronaWidgetRunning;

export interface VeronaWidgetInitializing {
  readonly state: 'initializing';
}

export interface VeronaWidgetReady {
  readonly state: 'ready';
  readonly metadata: VeronaModuleMetadata;
}

export interface VeronaWidgetRunning {
  readonly state: 'running';
  readonly metadata: VeronaModuleMetadata;
  readonly config: VeronaWidgetConfiguration;
}

export interface VeronaWidgetConfiguration {
  readonly sessionId: string;
  readonly parameters: Record<string, undefined | string>;
  readonly sharedParameters: Record<string, undefined | string>;
}
