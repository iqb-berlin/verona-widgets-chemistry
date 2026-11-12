declare const nominal: unique symbol;

export type Nominal<T, N extends string> = T & { [nominal]: N };

export type EnumLiteral<E extends string | number> = `${E}`;
export type NumericEnumLiteral<E extends number> = EnumLiteral<E> extends `${infer R extends number}` ? R : never;

export type UnaryOperator = 'negate';
export type BinaryOperator = 'add' | 'subtract' | 'multiply' | 'divide';

export type Result<T, R> =
  | { readonly ok: true; value: T } // Result OK with value
  | { readonly ok: false; issue: R }; // Result not OK with issue

export namespace Result {
  export const ok = <T>(value: T) => ({ ok: true, value }) as const satisfies Result<T, unknown>;
  export const issue = <R>(issue: R) => ({ ok: false, issue }) as const satisfies Result<unknown, R>;
}
