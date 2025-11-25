import { computed, inject, Injectable, Provider, signal, WritableSignal } from '@angular/core';
import { VeronaModuleMetadata, VeronaWidgetConfiguration, VeronaWidgetService, VeronaWidgetState } from 'verona-widget';
import { MatSnackBar } from '@angular/material/snack-bar';

type Params = Record<string, undefined | string>;

export interface ShowcaseVeronaWidgetOptions {
  readonly dummySessionId: string;
  readonly initParameters: Params;
  readonly initSharedParameters: Params;
}

export function provideShowcaseVeronaWidgetService(options: ShowcaseVeronaWidgetOptions): Provider[] {
  return [
    {
      provide: ShowcaseVeronaWidgetConfig,
      useFactory() {
        return new ShowcaseVeronaWidgetConfig(options);
      },
    },
    ShowcaseVeronaWidgetService,
    {
      provide: VeronaWidgetService,
      useExisting: ShowcaseVeronaWidgetService,
    },
  ];
}

export class ShowcaseVeronaWidgetConfig {
  readonly dummySessionId: string;
  readonly parameters: WritableSignal<Params>;
  readonly sharedParameters: WritableSignal<Params>;

  constructor(options: ShowcaseVeronaWidgetOptions) {
    this.dummySessionId = options.dummySessionId;
    this.parameters = signal(options.initParameters);
    this.sharedParameters = signal(options.initSharedParameters);
  }

  readonly configuration = computed((): VeronaWidgetConfiguration => {
    return {
      sessionId: `dummy-${this.dummySessionId}`,
      parameters: this.parameters(),
      sharedParameters: this.sharedParameters(),
    };
  });

  parameterSignal(key: string): WritableSignal<undefined | string>;
  parameterSignal<T>(key: string, conversion: PropertySignalConversion<T>): WritableSignal<undefined | T>;
  parameterSignal<T>(key: string, conversion?: PropertySignalConversion<T>): WritableSignal<undefined | T> {
    return propertySignal(this.parameters, key, conversion);
  }

  sharedParameterSignal(key: string): WritableSignal<undefined | string>;
  sharedParameterSignal<T>(key: string, conversion: PropertySignalConversion<T>): WritableSignal<undefined | T>;
  sharedParameterSignal<T>(key: string, conversion?: PropertySignalConversion<T>): WritableSignal<undefined | T> {
    return propertySignal(this.sharedParameters, key, conversion);
  }
}

@Injectable()
export class ShowcaseVeronaWidgetService implements VeronaWidgetService {
  readonly showcase = inject(ShowcaseVeronaWidgetConfig);
  readonly snackbar = inject(MatSnackBar);

  readonly configuration = this.showcase.configuration;

  readonly internalState = signal<VeronaWidgetState['state']>('initializing');
  readonly internalMetadata = signal<undefined | VeronaModuleMetadata>(undefined);

  readonly stateData = signal<string>('');
  readonly state = computed<VeronaWidgetState>(() => {
    const config = this.configuration();
    const metadata = this.internalMetadata();
    switch (this.internalState()) {
      case 'initializing':
        return { state: 'initializing' };
      case 'ready':
        return metadata ? { state: 'ready', metadata } : { state: 'initializing' };
      case 'running':
        return metadata ? { state: 'running', metadata, config } : { state: 'initializing' };
    }
  });

  sendReady(metadata: VeronaModuleMetadata): void {
    this.snackbar.open(`Widget ready: ${metadata.type}`, 'OK', { duration: 2_000 });
    this.internalMetadata.set(metadata);
    this.internalState.set('running'); // skips "ready" state, immediately go to "running"
  }

  sendReturn(saveState?: boolean): void {
    const stateData = this.stateData();
    const message =
      (saveState ?? true)
        ? `Widget return requested, state = "${stateData}"`
        : `Widget return requested, state not saved"`;

    this.snackbar.open(message, 'OK', { duration: 5_000 });
  }
}

export interface PropertySignalConversion<T> {
  read(value: string): T;

  write(value: T): string;
}

function propertySignal<T>(
  source: WritableSignal<Params>,
  key: string,
  conversion: undefined | PropertySignalConversion<T>,
): WritableSignal<T | undefined> {
  function stringToValue(string: string | undefined): T | undefined {
    if (string === undefined) return undefined;
    if (conversion === undefined) return string as T;
    return conversion.read(string);
  }

  function valueToString(value: T | undefined): string | undefined {
    if (value === undefined) return undefined;
    if (conversion === undefined) return value as string;
    return conversion.write(value);
  }

  function updateProperty(updateValue: (previous: undefined | T) => undefined | T) {
    source.update((orig: Params) => {
      const previousString = orig[key];
      const previousValue = stringToValue(previousString);
      const nextValue = updateValue(previousValue);
      const nextString = valueToString(nextValue);
      if (nextString === undefined) {
        const { [key]: _removed, ...copy } = orig;
        return copy;
      } else {
        return { ...orig, [key]: nextString };
      }
    });
  }

  type WritableParts = Pick<WritableSignal<T | undefined>, 'set' | 'update' | 'asReadonly'>;

  const readProperty = computed(
    () => {
      const params = source();
      return stringToValue(params[key]);
    },
    {
      debugName: `readProperty[${key}]`,
    },
  );

  return Object.assign(readProperty, {
    set: (value) => updateProperty(() => value),
    update: (updateFn) => updateProperty(updateFn),
    asReadonly: () => readProperty,
  } satisfies WritableParts) as unknown as WritableSignal<T | undefined>;
}
