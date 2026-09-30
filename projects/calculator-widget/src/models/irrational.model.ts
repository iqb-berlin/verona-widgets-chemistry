import { DECIMAL_PATTERN, NumericError, NumericValue, Sign } from './numeric.model';
import type { Rational } from './rational.model';
import { bigDigits, bigDivideRounded, bigPow10, compareSign, decimalText, floorNthRoot } from './utils';
import { CONSTANTS, ConstantSymbol } from './constants.model';

/** Significant digits an irrational number is kept at */
export const IRRATIONAL_PRECISION = 30;

/** Digits computed beyond the precision, so that rounding errors do not reach the result */
const GUARD_DIGITS = 5;

/** Largest whole exponent a power is worked out for */
const MAX_INTEGER_POWER = 10_000n;

/**
 * An irrational number, held as a decimal number of limited precision: a whole `mantissa`
 * times ten to the power of `exponent`. Every result is rounded back to
 * {@link IRRATIONAL_PRECISION} significant digits, so arithmetic is lossy — which is the
 * point: an irrational number has no exact form this calculator could hold, and one that
 * looks exact after rounding must not be presented as such.
 */
export class Irrational extends NumericValue {
  readonly kind = 'irrational';

  static readonly ZERO = new Irrational(0n, 0);
  static readonly ONE = new Irrational(1n, 0);

  /** Pre-calculated irrationals of constants */
  private static readonly CONSTANT_IRRATIONALS = {
    [ConstantSymbol.E]: Irrational.parse(CONSTANTS[ConstantSymbol.E].decimal),
    [ConstantSymbol.Pi]: Irrational.parse(CONSTANTS[ConstantSymbol.Pi].decimal),
    [ConstantSymbol.Tau]: Irrational.parse(CONSTANTS[ConstantSymbol.Tau].decimal),
    [ConstantSymbol.Phi]: Irrational.parse(CONSTANTS[ConstantSymbol.Phi].decimal),
  } as const satisfies Record<ConstantSymbol, Irrational>;

  private constructor(
    readonly mantissa: bigint,
    readonly exponent: number,
  ) {
    super();
  }

  //#region Static factories

  /** The value `mantissa * 10^exponent`, rounded to the precision kept */
  static of(mantissa: bigint, exponent: number): Irrational {
    if (mantissa === 0n) return Irrational.ZERO;

    let digits = mantissa;
    let scale = exponent;
    while (digits % 10n === 0n) {
      digits /= 10n; // trailing zeros belong in the exponent, so that the form is unique
      scale++;
    }

    const excess = bigDigits(digits) - IRRATIONAL_PRECISION;
    if (excess <= 0) return new Irrational(digits, scale);

    const rounded = bigDivideRounded(digits, bigPow10(excess));
    return Irrational.of(rounded, scale + excess); // rounding can free further trailing zeros
  }

  /** The decimal the fraction `numerator / denominator` rounds to */
  static fromFraction(numerator: bigint, denominator: bigint): Irrational {
    if (denominator === 0n) throw NumericError.divisionByZero();
    if (numerator === 0n) return Irrational.ZERO;

    const shift = quotientShift(numerator, denominator);
    return Irrational.of(bigDivideRounded(numerator * bigPow10(shift), denominator), -shift);
  }

  static fromConstant(symbol: ConstantSymbol): Irrational {
    return this.CONSTANT_IRRATIONALS[symbol];
  }

  static parse(textual: string): Irrational {
    const match = textual.trim().match(DECIMAL_PATTERN);
    if (match === null) throw NumericError.syntaxError(`Keine Dezimalzahl: ${textual}`);

    const { sign = '', integral = '', fraction = '' } = match.groups ?? {};
    const digits = (integral || '0') + fraction;
    if (digits.length === 0) throw NumericError.syntaxError(`Keine Dezimalzahl: ${textual}`);

    const magnitude = Irrational.of(BigInt(digits), -fraction.length);
    return sign === '-' ? magnitude.negate() : magnitude;
  }

  //#endregion
  //#region Numeric value

  get isZero(): boolean {
    return this.mantissa === 0n;
  }

  get isOne(): boolean {
    return this.mantissa === 1n && this.exponent === 0;
  }

  get isNegative(): boolean {
    return this.mantissa < 0n;
  }

  get isInteger(): boolean {
    return this.isZero || this.exponent >= 0; // trailing zeros are held in the exponent
  }

  add(other: NumericValue): Irrational {
    const right = other.asIrrational();
    if (this.isZero) return right;
    if (right.isZero) return this;

    const exponent = Math.min(this.exponent, right.exponent);
    const shift = Math.max(this.exponent, right.exponent) - exponent;
    if (shift > IRRATIONAL_PRECISION + GUARD_DIGITS + Math.max(this.digits, right.digits)) {
      return this.exponent > right.exponent ? this : right; // the lesser one is lost in the rounding anyway
    }

    const mantissa = this.scaledMantissa(exponent) + right.scaledMantissa(exponent);
    return Irrational.of(mantissa, exponent);
  }

  subtract(other: NumericValue): Irrational {
    return this.add(other.negate());
  }

  multiply(other: NumericValue): Irrational {
    const right = other.asIrrational();
    return Irrational.of(this.mantissa * right.mantissa, this.exponent + right.exponent);
  }

  divide(other: NumericValue): Irrational {
    const right = other.asIrrational();
    if (right.isZero) throw NumericError.divisionByZero();
    if (this.isZero) return Irrational.ZERO;

    const shift = quotientShift(this.mantissa, right.mantissa);
    const mantissa = bigDivideRounded(this.mantissa * bigPow10(shift), right.mantissa);
    return Irrational.of(mantissa, this.exponent - right.exponent - shift);
  }

  negate(): Irrational {
    return this.isZero ? this : new Irrational(-this.mantissa, this.exponent);
  }

  absolute(): Irrational {
    return this.isNegative ? this.negate() : this;
  }

  inverse(): Irrational {
    return Irrational.ONE.divide(this);
  }

  sign(): Sign {
    return compareSign(this.mantissa, 0n);
  }

  compareTo(other: NumericValue): Sign {
    return this.subtract(other).sign();
  }

  power(exponent: NumericValue): Irrational {
    const power = exponent.asRational();
    if (power === null) {
      throw NumericError.unsupported('Exponent muss eine rationale Zahl sein');
    }
    if (power.isZero) {
      if (this.isZero) throw NumericError.indeterminate('Null hoch null ist unbestimmt');
      return Irrational.ONE;
    }
    if (this.isZero) {
      if (power.isNegative) throw NumericError.divisionByZero('Null hoch negativer Zahl');
      return Irrational.ZERO;
    }

    // the root first, so that the power works on the smaller number
    const degree = Number(power.denominator);
    const rooted = degree === 1 ? this : this.nthRoot(degree);
    return rooted.integerPower(power.numerator);
  }

  /** The n-th root, which a negative number only has for an odd degree */
  nthRoot(degree: number): Irrational {
    if (degree < 1 || !Number.isSafeInteger(degree)) {
      throw NumericError.unsupported(`Wurzelgrad wird nicht unterstützt: ${degree}`);
    }
    if (this.isZero || degree === 1) return this;
    if (this.isNegative) {
      if (degree % 2 === 0) throw NumericError.complexResult();
      return this.negate().nthRoot(degree).negate();
    }

    // scale up so that the whole root comes out with digits to spare, keeping the
    // exponent divisible by the degree, as the exponent is divided by it as well
    const wanted = (IRRATIONAL_PRECISION + GUARD_DIGITS) * degree - this.digits;
    let shift = Math.max(0, wanted);
    shift += modulo(this.exponent - shift, degree);

    const radicand = this.mantissa * bigPow10(shift);
    return Irrational.of(floorNthRoot(radicand, degree), (this.exponent - shift) / degree);
  }

  integerPower(power: bigint): Irrational {
    if (power === 0n) return Irrational.ONE;
    if (power < 0n) return Irrational.ONE.divide(this.integerPower(-power));
    if (power > MAX_INTEGER_POWER) throw NumericError.unsupported(`Exponent ist zu groß: ${power}`);

    let result = Irrational.ONE;
    let factor: Irrational = this;
    for (let remaining = power; remaining > 0n; remaining >>= 1n) {
      if (remaining % 2n === 1n) result = result.multiply(factor);
      factor = factor.multiply(factor);
    }
    return result;
  }

  isRational(): this is Rational {
    return false;
  }

  isIrrational(): this is Irrational {
    return true;
  }

  asRational(): null {
    return null; // a decimal of limited precision is no fraction, however whole it may look
  }

  asIrrational(): Irrational {
    return this;
  }

  //#endregion
  //#region Display

  toDecimalString(digits: number, dropTrailingZeros: boolean = true): string {
    if (digits < 0) throw new RangeError('toDecimalString: digits must be >= 0');

    const shift = digits + this.exponent;
    const scaled = shift >= 0 ? this.mantissa * bigPow10(shift) : bigDivideRounded(this.mantissa, bigPow10(-shift));
    return decimalText(scaled, digits, dropTrailingZeros);
  }

  toString(): string {
    const digits = Math.max(0, -this.exponent); // every digit held, and no more
    return this.toDecimalString(digits, true);
  }

  valueOf(): number {
    return Number(this.toString());
  }

  //#endregion

  private get digits(): number {
    return bigDigits(this.mantissa);
  }

  private scaledMantissa(exponent: number): bigint {
    return this.mantissa * bigPow10(this.exponent - exponent);
  }
}

//#region Internal

// Digits a quotient has to be scaled by to come out with the precision kept
function quotientShift(numerator: bigint, denominator: bigint): number {
  const missing = bigDigits(denominator) - bigDigits(numerator);
  return IRRATIONAL_PRECISION + GUARD_DIGITS + Math.max(0, missing);
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

//#endregion
