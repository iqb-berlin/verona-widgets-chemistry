import { NumericValue } from './numeric.model';
import { Rational } from './rational.model';
import { Irrational } from './irrational.model';
import { FormulaNode } from './formula.ast';
import { compositeFraction, decimal, exponential, fraction, int, multiply, negate } from './formula.factory';
import { bigDigits, bigPow10 } from './utils';

export interface FormulaFormatOutput {
  /** The value which was formatted */
  readonly value: NumericValue;
  /** The result as a tree: an integer, a decimal or a fraction, depending on the options */
  readonly formula: FormulaNode;
  /** True when the result is a rounded decimal, i.e. always for an irrational number */
  readonly isApproximation: boolean;
}

export interface FormatToFormulaOptions {
  /** Write the number as a fraction, instead of an integer or decimal */
  readonly requireFraction?: boolean;
  /** Write a rational number greater than one as a composite fraction */
  readonly preferCompositeFraction?: boolean;
  /** Decimal places a decimal number is rounded to; significant digits in scientific notation */
  readonly digits?: number;
}

const DEFAULT_DIGITS = 12;

/** Decimal magnitudes from 10^12 on, and below 10^-6, are written in scientific notation */
const SCIENTIFIC_MIN_POWER = -6;
const SCIENTIFIC_MAX_POWER = 12;

/**
 * The value as a formula tree. A rational number is written exactly as an integer, a decimal
 * or a fraction, unless its decimal needs more places than given. An irrational number is
 * always written as the decimal it is rounded to, as it has no exact form to write.
 *
 * A very large or very small decimal is written in scientific notation, as `mantissa × 10^power`,
 * which consists of plain multiplication and exponentiation, so it can be edited as input.
 */
export function formatNumericToFormula(value: NumericValue, options: FormatToFormulaOptions = {}): FormulaFormatOutput {
  const { requireFraction = false, preferCompositeFraction = false, digits = DEFAULT_DIGITS } = options;

  // If value is irrational, always return an approximation, even if it looks whole
  if (!value.isRational()) {
    const irrational = value.asIrrational();
    const formula = requireFraction
      ? irrationalToFractionalFormula(irrational, digits)
      : irrationalToDecimalFormula(irrational, digits);

    return { value, formula, isApproximation: true };
  }

  // If a fraction is requested, always return a fractional representation
  if (requireFraction) {
    const formula = rationalToFractionalFormula(value, preferCompositeFraction);
    return { value, formula, isApproximation: false };
  }

  // If a decimal number is requested, check if the rational is integral, or exactly decimal
  const [formula, isApproximation] = rationalToDecimalFormula(value, digits);
  return { value, formula, isApproximation };
}

type FormulaAndIsApproximation = readonly [FormulaNode, isApproximation: boolean];

function irrationalToDecimalFormula(value: Irrational, digits: number): FormulaNode {
  const magnitude = value.absolute();
  const scientific = magnitudeToScientificFormula(magnitude, digits);
  if (scientific !== null) {
    const [formula] = scientific;
    return magnitudeToFormula(value, formula);
  }

  const decimalMagnitude = magnitude.toDecimalString(digits, true);
  return magnitudeToFormula(value, decimal(decimalMagnitude));
}

function irrationalToFractionalFormula(value: Irrational, digits: number): FormulaNode {
  return fraction(irrationalToDecimalFormula(value, digits), int(1));
}

function rationalToDecimalFormula(value: Rational, digits: number): FormulaAndIsApproximation {
  const magnitude = value.absolute();
  const scientific = magnitudeToScientificFormula(magnitude, digits);
  if (scientific !== null) {
    const [formula, isApproximation] = scientific;
    return [magnitudeToFormula(value, formula), isApproximation];
  }

  if (magnitude.isInteger) {
    const formula = magnitudeToFormula(value, int(magnitude.numerator));
    return [formula, false];
  } else {
    const [literal, exact] = magnitude.toDecimalStringExact(digits);
    const formula = magnitudeToFormula(value, decimal(literal));
    return [formula, !exact];
  }
}

function rationalToFractionalFormula(value: Rational, preferComposite: boolean): FormulaNode {
  const magnitude = value.absolute();
  if (preferComposite && !magnitude.isInteger && magnitude.compareTo(Rational.ONE) > 0) {
    const integerPart = magnitude.floor();
    const fractionalPart = magnitude.numerator - integerPart * magnitude.denominator;
    const formula = compositeFraction(int(integerPart), int(fractionalPart), int(magnitude.denominator));
    return magnitudeToFormula(value, formula);
  } else {
    const formula = fraction(int(magnitude.numerator), int(magnitude.denominator));
    return magnitudeToFormula(value, formula);
  }
}

/**
 * The positive magnitude as `mantissa × 10^power`, with the mantissa rounded to the given significant
 * digits, if the magnitude is too large or too small to be written as a plain decimal; otherwise null.
 */
function magnitudeToScientificFormula(magnitude: NumericValue, digits: number): null | FormulaAndIsApproximation {
  if (magnitude.isZero) return null;

  // Decimal power of the leading digit
  const { mantissa, exponent } = magnitude.asIrrational();
  let power = bigDigits(mantissa) - 1 + exponent;
  if (power >= SCIENTIFIC_MIN_POWER && power < SCIENTIFIC_MAX_POWER) return null;

  // Scale the magnitude into [1, 10), and round it to significant digits
  const scale = Rational.of(bigPow10(Math.abs(power)));
  const scaled = power >= 0 ? magnitude.divide(scale) : magnitude.multiply(scale);
  let mantissaText = scaled.toDecimalString(Math.max(0, digits - 1), true);
  const isApproximation = !scaled.isRational() || !Rational.parse(mantissaText).equalTo(scaled);
  if (mantissaText === '10') {
    mantissaText = '1'; // rounding reached the next power
    power += 1;
  }

  const powerFormula = power >= 0 ? int(power) : negate(int(-power));
  return [multiply(decimal(mantissaText), exponential(int(10), powerFormula)), isApproximation];
}

function magnitudeToFormula(value: NumericValue, magnitude: FormulaNode): FormulaNode {
  // A value rounded to zero carries no sign
  const isRoundedZero = magnitude.kind === 'literal' && !/[1-9]/.test(magnitude.literal);
  return value.isNegative && !isRoundedZero ? negate(magnitude) : magnitude;
}
