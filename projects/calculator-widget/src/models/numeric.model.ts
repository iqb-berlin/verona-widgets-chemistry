import type { Rational } from './rational.model';
import type { Irrational } from './irrational.model';

export type Sign = -1 | 0 | 1;

export const DECIMAL_PATTERN = /^(?<sign>[+-]?)(?<integral>\d*)(?:[.,](?<fraction>\d*))?$/;
export const FRACTION_PATTERN = /^(?<numerator>[^/]+)\/(?<denominator>[^/]+)$/;

/**
 * A number the calculator can hold. There are exactly two kinds of them:
 *
 * - {@link Rational}, a fraction of two integers, which is exact
 * - {@link Irrational}, a decimal number of limited precision, which is lossy
 *
 * Arithmetic of two rational numbers stays rational whenever the result can be written as
 * a fraction at all; only a root or a fractional power can lead out of the rationals. As
 * soon as one side is irrational the result is irrational, and it stays irrational: a
 * rounded decimal cannot tell whether a result landed on a whole number by rights or by
 * rounding, so a value is never turned back into a fraction and an irrational number is
 * never shown as an exact one.
 */
export abstract class NumericValue {
  abstract readonly kind: 'rational' | 'irrational';

  abstract get isZero(): boolean;
  abstract get isOne(): boolean;
  abstract get isNegative(): boolean;
  abstract get isInteger(): boolean;

  abstract add(other: NumericValue): NumericValue;
  abstract subtract(other: NumericValue): NumericValue;
  abstract multiply(other: NumericValue): NumericValue;
  abstract divide(other: NumericValue): NumericValue;

  abstract negate(): NumericValue;
  abstract absolute(): NumericValue;
  abstract inverse(): NumericValue;
  abstract sign(): Sign;

  abstract compareTo(other: NumericValue): Sign;

  /** True for a rational number, narrowing it to {@link Rational} */
  abstract isRational(): this is Rational;

  /** True for an irrational number, narrowing it to {@link Irrational} */
  abstract isIrrational(): this is Irrational;

  /** This value as a rational fraction, or `null` when it has none */
  abstract asRational(): null | Rational;

  /** This value as an irrational decimal, which a rational number is rounded to */
  abstract asIrrational(): Irrational;

  /** Raise to a rational power; an irrational exponent is not supported */
  abstract power(exponent: NumericValue): NumericValue;

  /** The value as a decimal, rounded to `digits` places after the decimal point */
  abstract toDecimalString(digits: number, dropTrailingZeros?: boolean): string;

  /** The value as it is held: a fraction, or a decimal of the precision it was computed with */
  abstract toString(): string;

  abstract valueOf(): number;

  /** Two values are equal when neither is greater than the other, whatever kind they are */
  equalTo(other: NumericValue): boolean {
    return this.compareTo(other) === 0;
  }

  /** The nth root is the power of one nth */
  root(degree: NumericValue): NumericValue {
    if (degree.isZero) throw NumericError.divisionByZero('Wurzel vom Grad Null');
    return this.power(degree.inverse());
  }
}

//#region Errors

export const enum NumericErrorCode {
  SyntaxError = 'syntaxError',
  NonFinite = 'nonFinite',
  DivisionByZero = 'divisionByZero',
  ComplexResult = 'complexResult',
  Indeterminate = 'indeterminate',
  Unsupported = 'unsupported',
}

export class NumericError extends Error {
  private constructor(
    readonly code: NumericErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'NumericError';
  }

  static syntaxError(message: string): NumericError {
    return new NumericError(NumericErrorCode.SyntaxError, message);
  }

  static nonFinite(value: unknown): NumericError {
    return new NumericError(NumericErrorCode.NonFinite, `Keine endliche Zahl: ${value}`);
  }

  static divisionByZero(message = 'Teilung durch Null'): NumericError {
    return new NumericError(NumericErrorCode.DivisionByZero, message);
  }

  static complexResult(message = 'Gerade Wurzel einer negativen Zahl'): NumericError {
    return new NumericError(NumericErrorCode.ComplexResult, message);
  }

  static indeterminate(message = 'Unbestimmtes Ergebnis'): NumericError {
    return new NumericError(NumericErrorCode.Indeterminate, message);
  }

  static unsupported(message: string): NumericError {
    return new NumericError(NumericErrorCode.Unsupported, message);
  }
}

//#endregion
