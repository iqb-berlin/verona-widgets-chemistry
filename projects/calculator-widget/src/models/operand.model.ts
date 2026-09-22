export type Sign = -1 | 0 | 1;

export interface Operand<T extends Operand<T>> {
  readonly isZero: boolean;
  readonly isOne: boolean;
  readonly isNegative: boolean;
  add(other: T): T;
  subtract(other: T): T;
  multiply(other: T): T;
  divide(other: T): T;
  compareTo(other: T): Sign;
  equalTo(other: T): boolean;
  negate(): T;
  inverse(): T;
  absolute(): T;
  sign(): Sign;
  toDecimalString(digits: number, dropTrailingZeros?: boolean): string;
}
