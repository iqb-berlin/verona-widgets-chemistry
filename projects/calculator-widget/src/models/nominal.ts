declare const nominal: unique symbol;

export type Nominal<T, N extends string> = T & { [nominal]: N };
