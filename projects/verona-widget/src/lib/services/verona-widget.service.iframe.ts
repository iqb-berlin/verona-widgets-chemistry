import { computed, effect, inject, Injectable, InjectionToken, Provider, signal, untracked } from '@angular/core';
import {
  VeronaWidgetReceiveEvent,
  VeronaWidgetSendEvent,
  VowParameterCollection,
  VowReadyNotification,
  VowStartCommand,
} from './verona-widget.events';
import { VeronaWidgetConfiguration, VeronaWidgetService, VeronaWidgetState } from './verona-widget.service';
import { VeronaModuleMetadata } from './verona-metadata.model';

export const VeronaWidgetIFrame = new InjectionToken<VeronaWidgetIFrame>('verona-widget.iframe');

export interface VeronaWidgetIFrame {
  readonly messageSource: Window;
  readonly messageTarget: Window;
}

export function provideVeronaWidgetIFrame(iFrameWindow?: Window, parentWindow?: Window): Provider[] {
  const messageSource = iFrameWindow ?? window;
  const messageTarget = parentWindow ?? messageSource.top ?? messageSource.parent;
  return [
    {
      provide: VeronaWidgetIFrame,
      useValue: { messageSource, messageTarget } satisfies VeronaWidgetIFrame,
    },
  ];
}

@Injectable()
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
        this.sendEventMessage({
          type: 'vowStateChangedNotification',
          sessionId: state.config.sessionId,
          timeStamp: currentTimestamp(),
          state: stateData,
        });
      }
    });

    // Listen to incoming message events
    this.messageSource.addEventListener('message', (message: MessageEvent<VeronaWidgetReceiveEvent>) => {
      const event = message.data;
      console.log('Verona-Widget received message:', event);
      switch (event.type) {
        case 'vowStartCommand':
          this.handleStartCommand(event);
          break;
        default:
          // explicitly assign to "never" to provoke a compiler error on unhandled case
          const unknownEventType: never = event.type;
          console.error('Received unknown message event:', unknownEventType, '=>', event);
          break;
      }
    });
  }

  sendReady(metadata: VeronaModuleMetadata) {
    // Send ready-event message
    this.sendEventMessage({
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

    // Create return-event
    // Send return-event message WITH DELAY (to ensure state-change events arrive before requesting to return)
    //FIXME: Once available, add "finalState" field to submit additional information on return
    setTimeout(() => {
      this.sendEventMessage({
        type: 'vowReturnRequested',
        sessionId: state.config.sessionId,
        timeStamp: currentTimestamp(),
        saveState: saveState,
      });
    }, 100);
  }

  private handleStartCommand(command: VowStartCommand) {
    const origState = untracked(this.state);
    // If widget is already in "running" state, revert back to "ready"
    if (origState.state === 'running') {
      this.state.set({ state: 'ready', metadata: origState.metadata });
    }

    // Requires widget to be in "ready" state
    const readyState = untracked(this.state);
    if (readyState.state !== 'ready') {
      console.warn('vowStartCommand received before widget was ready:', command);
      return;
    }

    // Set initial state-data BEFORE updating internal state (don't send a state-changed notification)
    this.stateData.set(command.state);

    // Update internal state, triggering child components to be rendered
    this.state.set({
      state: 'running',
      metadata: readyState.metadata,
      config: createWidgetConfig(command),
    });
  }

  private sendEventMessage(event: VeronaWidgetSendEvent) {
    //TODO: Properly handle target origin, instead of using a wildcard (potential security risk)
    this.messageTarget.postMessage(event, '*');
  }
}

function currentTimestamp(): string {
  const now = new Date();
  return now.toISOString();
}

function createWidgetConfig(command: VowStartCommand): VeronaWidgetConfiguration {
  return {
    sessionId: command.sessionId,
    parameters: parametersToRecord(command.parameters),
    sharedParameters: parametersToRecord(command.sharedParameters),
  };
}

function parametersToRecord(parameters: undefined | VowParameterCollection): Record<string, string> {
  if (!parameters) {
    return {};
  }

  const entries = Array.isArray(parameters)
    ? parameters.map(({ key, value }) => [key, value ?? ''] as const)
    : Object.entries(parameters).map(([key, value]) => [key, value ?? ''] as const);

  return Object.fromEntries(entries);
}
