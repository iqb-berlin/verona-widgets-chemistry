export type VeronaWidgetSendEvent = VowReadyNotification | VowStateChangedNotification | VowReturnRequested;

export type VeronaWidgetReceiveEvent = VowStartCommand;

export interface VowReadyNotification {
  readonly type: 'vowReadyNotification';
  readonly metadata: string; // JSON string of VeronaModuleMetadata
}

export interface VowStartCommand {
  readonly type: 'vowStartCommand';
  readonly sessionId: string;
  readonly parameters?: VowParameterCollection;
  readonly sharedParameters?: VowParameterCollection;
  readonly state: string; // serialized initial state of the widget, received from host
}

export interface VowStateChangedNotification {
  readonly type: 'vowStateChangedNotification';
  readonly sessionId: string;
  readonly timeStamp: string;
  readonly sharedParameters?: ReadonlyArray<VowParameter>;
  readonly state?: string; // serialized changed state of the widget, send to host
}

export interface VowParameter {
  readonly key: string;
  readonly value?: string;
}

export interface VowReturnRequested {
  readonly type: 'vowReturnRequested';
  readonly sessionId: string;
  readonly timeStamp: string;
  readonly saveState?: boolean;
}

export type VowParameterCollection =
  | ReadonlyArray<VowParameter>
  | Readonly<Record<string, undefined | string>>
  ;
