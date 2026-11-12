import { DECIMAL_PATTERN, MAX_RESULT_DIGITS, NumericError, NumericValue, Sign } from './numeric.model';
import type { Rational } from './rational.model';
import { bigDigits, bigDivideRounded, bigPow10, compareSign, decimalText } from './utils';
import { CONSTANTS, ConstantSymbol } from './constants.model';

/** Significant digits an irrational number is kept at */
export const IRRATIONAL_PRECISION = 30;

/** Digits computed beyond the precision, so that rounding errors do not reach the result */
const GUARD_DIGITS = 5;

/** Largest whole exponent a power is worked out for */
const MAX_INTEGER_POWER = 10_000n;

/** Steps of Newton's method a root may take; it needs a handful, as it starts out close by */
const MAX_ROOT_STEPS = 50;

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

    // rounding first, so that only a few digits are left to strip
    let [digits, scale] = roundDecimal([mantissa, exponent], IRRATIONAL_PRECISION);
    while (digits % 10n === 0n) {
      digits /= 10n; // trailing zeros belong in the exponent, so that the form is unique
      scale++;
    }

    // the exponent is bounded, as each digit it stands for costs memory once the value is written out
    const magnitude = bigDigits(digits) + scale;
    if (magnitude > MAX_RESULT_DIGITS) throw NumericError.unsupported('Ergebnis ist zu groß');
    if (magnitude < -MAX_RESULT_DIGITS) return Irrational.ZERO; // too small to ever show up

    return new Irrational(digits, scale);
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

  /**
   * The n-th root, which a negative number only has for an odd degree.
   *
   * Newton's method on decimals of a few more digits than kept, rather than on whole numbers:
   * a whole root with all digits wanted would need a radicand of that many digits times the
   * degree, which a root like the 10000th, i.e. a power of 0.0001, cannot afford.
   */
  nthRoot(degree: number): Irrational {
    if (degree < 1 || !Number.isSafeInteger(degree)) {
      throw NumericError.unsupported(`Wurzelgrad wird nicht unterstützt: ${degree}`);
    }
    if (this.isZero || degree === 1) return this;
    if (this.isNegative) {
      if (degree % 2 === 0) throw NumericError.complexResult();
      return this.negate().nthRoot(degree).negate();
    }

    // the power within each step multiplies rounding errors by up to the degree
    const precision = IRRATIONAL_PRECISION + GUARD_DIGITS + String(degree).length;
    const n = BigInt(degree);
    const radicand: Decimal = [this.mantissa, this.exponent];

    let root = estimateRoot(radicand, degree);
    for (let step = 0; step < MAX_ROOT_STEPS; step++) {
      // x' = x + (a / x^(n-1) - x) / n
      const quotient = divideDecimal(radicand, powerDecimal(root, n - 1n, precision), precision);
      const correction = divideDecimal(addDecimal(quotient, negateDecimal(root)), [n, 0], precision);
      root = roundDecimal(addDecimal(root, correction), precision);
      if (isNegligible(correction, root)) break;
    }
    return Irrational.of(...root);
  }

  integerPower(power: bigint): Irrational {
    if (power === 0n) return Irrational.ONE;
    if (power > MAX_INTEGER_POWER || -power > MAX_INTEGER_POWER) {
      throw NumericError.unsupported(`Exponent ist zu groß: ${power}`);
    }

    // each multiplication adds its rounding error, so a few more digits are kept along the way
    const magnitude = power < 0n ? -power : power;
    const precision = IRRATIONAL_PRECISION + GUARD_DIGITS + String(magnitude).length;
    const result = powerDecimal([this.mantissa, this.exponent], magnitude, precision);
    return Irrational.of(...(power < 0n ? divideDecimal([1n, 0], result, precision) : result));
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
function quotientShift(
  numerator: bigint,
  denominator: bigint,
  precision = IRRATIONAL_PRECISION + GUARD_DIGITS,
): number {
  const missing = bigDigits(denominator) - bigDigits(numerator);
  return precision + Math.max(0, missing);
}

/**
 * A decimal `mantissa * 10^exponent` of any precision, without the unique form of an
 * {@link Irrational}, for working out a result with more digits than it is kept at.
 */
type Decimal = readonly [mantissa: bigint, exponent: number];

function roundDecimal([mantissa, exponent]: Decimal, precision: number): Decimal {
  const excess = bigDigits(mantissa) - precision;
  if (excess <= 0) return [mantissa, exponent];
  return [bigDivideRounded(mantissa, bigPow10(excess)), exponent + excess];
}

function negateDecimal([mantissa, exponent]: Decimal): Decimal {
  return [-mantissa, exponent];
}

// Exact, which is affordable as long as both are of a similar magnitude
function addDecimal(left: Decimal, right: Decimal): Decimal {
  if (left[0] === 0n) return right;
  if (right[0] === 0n) return left;

  const exponent = Math.min(left[1], right[1]);
  const mantissa = left[0] * bigPow10(left[1] - exponent) + right[0] * bigPow10(right[1] - exponent);
  return [mantissa, exponent];
}

function multiplyDecimal(left: Decimal, right: Decimal, precision: number): Decimal {
  return roundDecimal([left[0] * right[0], left[1] + right[1]], precision);
}

function divideDecimal(dividend: Decimal, divisor: Decimal, precision: number): Decimal {
  if (dividend[0] === 0n) return dividend;
  const shift = quotientShift(dividend[0], divisor[0], precision);
  const mantissa = bigDivideRounded(dividend[0] * bigPow10(shift), divisor[0]);
  return roundDecimal([mantissa, dividend[1] - divisor[1] - shift], precision);
}

// By squaring, rounding each product, so it takes about two multiplications per bit of the power
function powerDecimal(base: Decimal, power: bigint, precision: number): Decimal {
  let result: Decimal = [1n, 0];
  let factor = base;
  for (let remaining = power; remaining > 0n; remaining >>= 1n) {
    if (remaining % 2n === 1n) result = multiplyDecimal(result, factor, precision);
    if (remaining > 1n) factor = multiplyDecimal(factor, factor, precision);
  }
  return result;
}

// Whether a change to the value is below the digits kept
function isNegligible(change: Decimal, value: Decimal): boolean {
  if (change[0] === 0n) return true;
  const magnitude = ([mantissa, exponent]: Decimal) => bigDigits(mantissa) + exponent;
  return magnitude(change) < magnitude(value) - IRRATIONAL_PRECISION - GUARD_DIGITS;
}

/**
 * The n-th root of a positive decimal to the precision of floating point, as a start for
 * Newton's method. A root of a high degree lies close to one, so the distance from one is
 * what has to be precise, as each step of the method multiplies its error by the degree.
 */
function estimateRoot([mantissa, exponent]: Decimal, degree: number): Decimal {
  const dropped = Math.max(0, bigDigits(mantissa) - 17);
  const log10 = (Math.log10(Number(mantissa / bigPow10(dropped))) + dropped + exponent) / degree;
  const whole = Math.round(log10);

  const offset = Math.expm1((log10 - whole) * Math.LN10); // from one, within (-0.7, 2.2)
  if (offset === 0) return [1n, whole];

  const scale = 16 - Math.floor(Math.log10(Math.abs(offset))); // to 17 significant digits
  const [sum, sumExponent] = addDecimal([1n, 0], [BigInt(Math.round(offset * 10 ** scale)), -scale]);
  return [sum, sumExponent + whole];
}

//#endregion
