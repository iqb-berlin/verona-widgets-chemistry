declare const nominal: unique symbol;

export type Nominal<T, N extends string> = T & { [nominal]: N };

export type EnumLiteral<E extends string | number> = `${E}`;

export type NumericEnumLiteral<E extends number> = EnumLiteral<E> extends `${infer R extends number}` ? R : never;
