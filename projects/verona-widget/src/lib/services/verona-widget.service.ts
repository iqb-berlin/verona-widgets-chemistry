import {
  computed,
  effect,
  inject,
  InjectionToken,
  Provider,
  signal,
  Signal,
  untracked,
  WritableSignal,
} from '@angular/core';
import { VeronaModuleMetadata } from './verona-metadata.model';
import {
  VeronaWidgetReceiveEvent,
  VowParameter,
  VowReadyNotification,
  VowReturnRequested,
  VowStartCommand,
  VowStateChangedNotification,
} from './verona-widget.events';

export const VeronaWidgetService = new InjectionToken<VeronaWidgetService>('verona-widget.service');

export interface VeronaWidgetService {
  readonly state: Signal<VeronaWidgetState>;
  readonly stateData: WritableSignal<string>;
  readonly configuration: Signal<VeronaWidgetConfiguration>;

  sendReady(metadata: VeronaModuleMetadata): void;

  sendReturn(saveState?: boolean): void;
}

export type VeronaWidgetState =
  | VeronaWidgetInitializing
  | VeronaWidgetReady
  | VeronaWidgetRunning
  ;

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
  readonly parameters: Record<string, string>;
  readonly sharedParameters: Record<string, string>;
}

export const VeronaWidgetIFrame = new InjectionToken<VeronaWidgetIFrame>('verona-widget.iframe');

export interface VeronaWidgetIFrame {
  readonly messageSource: Window;
  readonly messageTarget: Window;
}

export function provideVeronaWidgetIFrame(iFrameWindow: Window, parentWindow?: Window): Provider {
  return {
    provide: VeronaWidgetIFrame,
    useValue: {
      messageSource: iFrameWindow,
      messageTarget: parentWindow ?? iFrameWindow.top ?? iFrameWindow.parent,
    } satisfies VeronaWidgetIFrame,
  };
}

export class IFrameVeronaWidgetService implements VeronaWidgetService {
  readonly widgetIFrame = inject(VeronaWidgetIFrame);
  readonly messageSource = this.widgetIFrame.messageSource;
  readonly messageTarget = this.widgetIFrame.messageTarget;

  readonly state = signal<VeronaWidgetState>({ state: 'initializing' });
  readonly stateData = signal<string>('');

  readonly configuration = computed(() => {
    const state = this.state();
    if (state.state !== 'running') {
      throw new Error('Attempted to access widget configuration before widget was running');
    }
    return state.config;
  });

  constructor() {
    // Setup effect to send state-changed notification events when stateData changes
    effect(() => {
      const stateData = this.stateData(); // trigger effect
      const state = untracked(this.state);

      if (state.state === 'running') {
        this.messageTarget.postMessage({
          type: 'vowStateChangedNotification',
          sessionId: state.config.sessionId,
          timeStamp: currentTimestamp(),
          state: stateData,
        } satisfies VowStateChangedNotification);
      }
    });

    // Listen to incoming message events
    this.messageSource.addEventListener('message', (message: MessageEvent<VeronaWidgetReceiveEvent>) => {
      const event = message.data;
      switch (event.type) {
        case 'vowStartCommand':
          this.handleStartCommand(event);
          break;
        default:
          console.error('Received unknown message event:', event);
          break;
      }
    });
  }

  sendReady(metadata: VeronaModuleMetadata) {
    // Send ready-event message
    this.messageTarget.postMessage({
      type: 'vowReadyNotification',
      metadata: JSON.stringify(metadata),
    } satisfies VowReadyNotification);

    // Update internal state
    this.state.set({
      state: 'ready',
      metadata,
    });
  }

  sendReturn(saveState: boolean = true) {
    // Requires widget to be in "running" state
    const state = untracked(this.state);
    if (state.state !== 'running') {
      console.warn('Attempted to send vowReturnRequested while widget was not running');
      return;
    }

    // Send return-event message
    this.messageTarget.postMessage({
      type: 'vowReturnRequested',
      sessionId: state.config.sessionId,
      timeStamp: currentTimestamp(),
      saveState: saveState,
    } satisfies VowReturnRequested);

    // Update internal state, reverting to "ready" state and destroying child components
    this.state.set({
      state: 'ready',
      metadata: state.metadata,
    });
  }

  private handleStartCommand(command: VowStartCommand) {
    // Requires widget to be in "running" state
    const state = untracked(this.state);
    if (state.state !== 'ready' && state.state !== 'running') {
      console.warn('vowStartCommand received before widget was ready:', command);
      return;
    }

    // Set initial state-data BEFORE updating internal state (don't send a state-changed notification)
    this.stateData.set(command.state);

    // Update internal state, triggering child components to be rendered
    this.state.set({
      state: 'running',
      metadata: state.metadata,
      config: createWidgetConfig(command),
    });
  }
}

function currentTimestamp(): string {
  const now = new Date();
  return now.toISOString();
}

function createWidgetConfig(command: VowStartCommand): VeronaWidgetConfiguration {
  return {
    sessionId: command.sessionId,
    parameters: parametersToRecord(command.parameters ?? []),
    sharedParameters: parametersToRecord(command.sharedParameters ?? []),
  };
}

function parametersToRecord(parameters: ReadonlyArray<VowParameter>): Record<string, string> {
  return Object.fromEntries(parameters.map(({ key, value }) => {
    return [key, value ?? ''] as const;
  }));
}
