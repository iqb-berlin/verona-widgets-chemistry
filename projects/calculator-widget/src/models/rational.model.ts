import { bigAbs, bigGcd, bigPow10, compareSign } from './utils';
import type { Operand, Sign } from './operand.model';

const DECIMAL_PATTERN = /^(?<sign>[+-]?)(?<integral>\d*)(?:[.,](?<fraction>\d*))?$/;
const FRACTION_PATTERN = /^(?<numerator>[^/]+)\/(?<denominator>[^/]+)$/;

type Numeric = number | bigint;
type Coercible = Numeric | string;

export class Rational implements Operand<Rational> {
  static readonly ZERO = new this(0n, 1n);
  static readonly ONE = new this(1n, 1n);
  static readonly TWO = new this(2n, 1n);
  static readonly HALF = new this(1n, 2n);
  static readonly MINUS_ONE = new this(-1n, 1n);

  private constructor(
    readonly numerator: bigint,
    readonly denominator: bigint,
  ) {}

  //#region Static factories

  static of(numerator: Coercible, denominator: Coercible = 1n): Rational {
    return Rational.coerce(numerator).divide(Rational.coerce(denominator));
  }

  private static coerce(value: Coercible): Rational {
    if (typeof value === 'bigint') {
      return Rational.create(value, 1n);
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw RationalError.nonFinite(value);
      if (Number.isInteger(value)) return Rational.create(BigInt(value), 1n);
      return Rational.parse(value.toString(10));
    } else {
      return Rational.parse(value);
    }
  }

  static parse(textual: string): Rational {
    const trimmed = textual.trim();
    const matchFraction = trimmed.match(FRACTION_PATTERN);
    if (matchFraction) {
      const { numerator = '0', denominator = '1' } = matchFraction.groups ?? {};
      return Rational.parse(numerator).divide(Rational.parse(denominator));
    }

    const matchDecimal = trimmed.match(DECIMAL_PATTERN);
    if (matchDecimal) {
      const { sign, integral, fraction } = matchDecimal.groups ?? {};
      const negative = sign === '-';
      return Rational.fromDigits(integral ?? '', fraction ?? '', negative);
    }

    throw RationalError.syntaxError(`Could not parse: ${textual}`);
  }

  static fromDigits(integral: string, fraction: string, negative: boolean): Rational {
    const digits = (integral || '0') + fraction;
    if (digits.length === 0 || /\D/.test(digits))
      throw RationalError.syntaxError(`Invalid digits: ${negative ? '-' : ''}${integral}.${fraction}`);

    const magnitude = Rational.create(BigInt(digits), bigPow10(fraction.length));
    return negative ? magnitude.negate() : magnitude;
  }

  private static create(numerator: bigint, denominator: bigint): Rational {
    if (denominator === 0n) throw RationalError.divisionByZero();
    if (denominator < 0n) {
      numerator = -numerator;
      denominator = -denominator;
    }
    if (numerator === 0n) return Rational.ZERO;
    const gcd = bigGcd(numerator, denominator);
    return new Rational(numerator / gcd, denominator / gcd);
  }

  //#endregion
  //#region Rational functions

  get isInteger(): boolean {
    return this.denominator === 1n;
  }

  //#endregion
  //#region Operand functions

  get isNegative(): boolean {
    return this.numerator < 0n;
  }

  get isOne(): boolean {
    return this.numerator === this.denominator;
  }

  get isZero(): boolean {
    return this.numerator === 0n;
  }

  add(other: Rational): Rational {
    const numerator = this.numerator * other.denominator + other.numerator * this.denominator;
    const denominator = this.denominator * other.denominator;
    return Rational.create(numerator, denominator);
  }

  subtract(other: Rational): Rational {
    return this.add(other.negate());
  }

  multiply(other: Rational): Rational {
    const numerator = this.numerator * other.numerator;
    const denominator = this.denominator * other.denominator;
    return Rational.create(numerator, denominator);
  }

  divide(other: Rational): Rational {
    if (other.isZero) throw RationalError.divisionByZero();
    const numerator = this.numerator * other.denominator;
    const denominator = this.denominator * other.numerator;
    return Rational.create(numerator, denominator);
  }

  negate(): Rational {
    return new Rational(-1n * this.numerator, this.denominator);
  }

  absolute(): Rational {
    return this.isNegative ? this.negate() : this;
  }

  sign(): Sign {
    return compareSign(this.numerator, 0n);
  }

  inverse(): Rational {
    return Rational.create(this.denominator, this.numerator);
  }

  compareTo(other: Rational): Sign {
    const left = this.numerator * other.denominator;
    const right = this.denominator * other.numerator;
    return compareSign(left, right);
  }

  equalTo(other: Rational): boolean {
    return this.numerator === other.numerator && this.denominator === other.denominator;
  }

  floor(): bigint {
    const quotient = this.numerator / this.denominator;
    const overflow = this.isNegative && quotient * this.denominator !== this.numerator;
    return overflow ? quotient - 1n : quotient;
  }

  //#endregion

  toString(): string {
    if (this.denominator === 1n) return this.numerator.toString();
    else return `${this.numerator}/${this.denominator}`;
  }

  toDecimalString(digits: number, dropTrailingZeros: boolean = true): string {
    if (digits < 0) throw new RangeError('toDecimalString: digits must be >= 0');
    const scale = bigPow10(digits);
    const negative = this.isNegative;
    const n = bigAbs(this.numerator) * scale;
    const d = this.denominator;

    let scaled = n / d;
    if ((n % d) * 2n >= d) scaled += 1n;

    let text = scaled.toString().padStart(digits + 1, '0');
    let integerPart = digits === 0 ? text : text.slice(0, text.length - digits);
    let fractionPart = digits === 0 ? '' : text.slice(text.length - digits);
    if (dropTrailingZeros && fractionPart.length > 0) {
      fractionPart = fractionPart.replace(/0+$/, '');
    }
    text = fractionPart.length > 0 ? `${integerPart}.${fractionPart}` : integerPart;
    return negative && /[1-9]/.test(text) ? `-${text}` : text;
  }

  valueOf(): number {
    return Number(this.toDecimalString(20, true));
  }
}

export const enum RationalErrorCode {
  SyntaxError = 'syntaxError',
  NonFinite = 'nonFinite',
  DivisionByZero = 'divisionByZero',
}

export class RationalError extends Error {
  readonly code: RationalErrorCode;

  private constructor(code: RationalErrorCode, cause: Error) {
    super(cause.message, { cause });
    this.name = 'RationalError';
    this.code = code;
  }

  static syntaxError(message: string): RationalError {
    return new RationalError(RationalErrorCode.SyntaxError, new SyntaxError(message));
  }

  static nonFinite(offendingValue: number): RationalError {
    return new RationalError(RationalErrorCode.NonFinite, new RangeError(`Non-finite value: ${offendingValue}`));
  }

  static divisionByZero(): RationalError {
    return new RationalError(RationalErrorCode.DivisionByZero, new RangeError('Division by zero'));
  }
}
