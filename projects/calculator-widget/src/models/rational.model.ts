import { bigDigits, bigDivideRounded, bigGcd, bigPow10, compareSign, decimalText, exactNthRoot } from './utils';
import { DECIMAL_PATTERN, FRACTION_PATTERN, NumericError, NumericValue, Sign } from './numeric.model';
import { Irrational } from './irrational.model';

/** Largest whole exponent a power is worked out for, and the digits its result may have */
const MAX_INTEGER_POWER = 10_000n;
const MAX_RESULT_DIGITS = 20_000;

type Numeric = number | bigint;
type Coercible = Numeric | string;

/**
 * A rational number, held as a fraction of two whole numbers in its shortest form, with
 * the sign in the numerator. Arithmetic of two of them is exact; only a root or a
 * fractional power can lead out of the rationals, and then an {@link Irrational} is
 * returned instead.
 */
export class Rational extends NumericValue {
  readonly kind = 'rational';

  static readonly ZERO = new this(0n, 1n);
  static readonly ONE = new this(1n, 1n);
  static readonly TWO = new this(2n, 1n);
  static readonly HALF = new this(1n, 2n);
  static readonly MINUS_ONE = new this(-1n, 1n);

  private constructor(
    readonly numerator: bigint,
    readonly denominator: bigint,
  ) {
    super();
  }

  //#region Static factories

  static of(numerator: Coercible, denominator: Coercible = 1n): Rational {
    return Rational.coerce(numerator).divideExactly(Rational.coerce(denominator));
  }

  private static coerce(value: Coercible): Rational {
    if (typeof value === 'bigint') {
      return Rational.create(value, 1n);
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw NumericError.nonFinite(value);
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
      return Rational.parse(numerator).divideExactly(Rational.parse(denominator));
    }

    const matchDecimal = trimmed.match(DECIMAL_PATTERN);
    if (matchDecimal) {
      const { sign, integral, fraction } = matchDecimal.groups ?? {};
      const negative = sign === '-';
      return Rational.fromDigits(integral ?? '', fraction ?? '', negative);
    }

    throw NumericError.syntaxError(`Keine Zahl: ${textual}`);
  }

  static fromDigits(integral: string, fraction: string, negative: boolean): Rational {
    const digits = (integral || '0') + fraction;
    if (digits.length === 0 || /\D/.test(digits)) {
      throw NumericError.syntaxError(`Ungültige Ziffern: ${negative ? '-' : ''}${integral}.${fraction}`);
    }

    const magnitude = Rational.create(BigInt(digits), bigPow10(fraction.length));
    return negative ? magnitude.negate() : magnitude;
  }

  private static create(numerator: bigint, denominator: bigint): Rational {
    if (denominator === 0n) throw NumericError.divisionByZero();
    if (denominator < 0n) {
      numerator = -numerator;
      denominator = -denominator;
    }
    if (numerator === 0n) return Rational.ZERO;
    const gcd = bigGcd(numerator, denominator);
    return new Rational(numerator / gcd, denominator / gcd);
  }

  //#endregion
  //#region Numeric value

  get isInteger(): boolean {
    return this.denominator === 1n;
  }

  get isNegative(): boolean {
    return this.numerator < 0n;
  }

  get isOne(): boolean {
    return this.numerator === this.denominator;
  }

  get isZero(): boolean {
    return this.numerator === 0n;
  }

  add(other: NumericValue): NumericValue {
    if (!other.isRational()) return this.asIrrational().add(other);
    const numerator = this.numerator * other.denominator + other.numerator * this.denominator;
    return Rational.create(numerator, this.denominator * other.denominator);
  }

  subtract(other: NumericValue): NumericValue {
    return this.add(other.negate());
  }

  multiply(other: NumericValue): NumericValue {
    if (!other.isRational()) return this.asIrrational().multiply(other);
    return Rational.create(this.numerator * other.numerator, this.denominator * other.denominator);
  }

  divide(other: NumericValue): NumericValue {
    if (other.isZero) throw NumericError.divisionByZero();
    if (!other.isRational()) return this.asIrrational().divide(other);
    return this.divideExactly(other);
  }

  negate(): Rational {
    return this.isZero ? this : new Rational(-this.numerator, this.denominator);
  }

  absolute(): Rational {
    return this.isNegative ? this.negate() : this;
  }

  inverse(): Rational {
    return Rational.create(this.denominator, this.numerator);
  }

  sign(): Sign {
    return compareSign(this.numerator, 0n);
  }

  compareTo(other: NumericValue): Sign {
    if (!other.isRational()) return this.asIrrational().compareTo(other);
    return compareSign(this.numerator * other.denominator, this.denominator * other.numerator);
  }

  /**
   * Raise to a rational power. The result stays rational as long as the root of the power
   * comes out whole — `8^(2/3)` is `4`, while `2^(1/2)` has to give up the exact form.
   */
  power(exponent: NumericValue): NumericValue {
    if (!exponent.isRational()) {
      throw NumericError.unsupported('Exponent muss eine rationale Zahl sein');
    }
    if (exponent.isZero) {
      if (this.isZero) throw NumericError.indeterminate('Null hoch null ist unbestimmt');
      return Rational.ONE;
    }
    if (this.isZero) {
      if (exponent.isNegative) throw NumericError.divisionByZero('Null hoch negativer Zahl');
      return Rational.ZERO;
    }

    const rooted = this.exactRoot(exponent.denominator);
    if (rooted !== null) return rooted.integerPower(exponent.numerator);
    return this.asIrrational().power(exponent);
  }

  floor(): bigint {
    const quotient = this.numerator / this.denominator;
    const overflow = this.isNegative && quotient * this.denominator !== this.numerator;
    return overflow ? quotient - 1n : quotient;
  }

  isRational(): this is Rational {
    return true;
  }

  isIrrational(): this is Irrational {
    return false;
  }

  asRational(): Rational {
    return this;
  }

  asIrrational(): Irrational {
    return Irrational.fromFraction(this.numerator, this.denominator);
  }

  //#endregion
  //#region Exact arithmetic

  private divideExactly(other: Rational): Rational {
    if (other.isZero) throw NumericError.divisionByZero();
    return Rational.create(this.numerator * other.denominator, this.denominator * other.numerator);
  }

  /** The n-th root, as long as it is a fraction of whole numbers itself */
  private exactRoot(degree: bigint): null | Rational {
    if (degree === 1n) return this;
    if (degree > BigInt(Number.MAX_SAFE_INTEGER)) return null;

    const numerator = exactNthRoot(this.numerator, Number(degree));
    const denominator = exactNthRoot(this.denominator, Number(degree));
    if (numerator === null || denominator === null) return null;
    return Rational.create(numerator, denominator);
  }

  private integerPower(power: bigint): Rational {
    if (power === 0n) return Rational.ONE;
    if (power < 0n) return this.inverse().integerPower(-power);
    if (power > MAX_INTEGER_POWER) throw NumericError.unsupported(`Exponent ist zu groß: ${power}`);

    const digits = Math.max(bigDigits(this.numerator), bigDigits(this.denominator)) * Number(power);
    if (digits > MAX_RESULT_DIGITS) throw NumericError.unsupported('Ergebnis der Potenz ist zu groß');

    return Rational.create(this.numerator ** power, this.denominator ** power);
  }

  //#endregion
  //#region Display

  toString(): string {
    if (this.denominator === 1n) return this.numerator.toString(10);
    return `${this.numerator}/${this.denominator}`;
  }

  toDecimalString(digits: number, dropTrailingZeros: boolean = true): string {
    if (digits < 0) throw new RangeError('toDecimalString: digits must be >= 0');
    const scaled = bigDivideRounded(this.numerator * bigPow10(digits), this.denominator);
    return decimalText(scaled, digits, dropTrailingZeros);
  }

  valueOf(): number {
    return Number(this.toDecimalString(20, true));
  }

  //#endregion
}
