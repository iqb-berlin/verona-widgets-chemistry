import { NumericValue } from './numeric.model';
import { Rational } from './rational.model';
import { Irrational } from './irrational.model';
import { FormulaNode } from './formula.ast';
import { compositeFraction, decimal, fraction, int, negate } from './formula.factory';

export interface FormulaFormatOutput {
  /** The value which was formatted */
  readonly value: NumericValue;
  /** The result as a tree: a fraction for a rational number, a decimal for an irrational one */
  readonly formula: FormulaNode;
  /** True when the result is a decimal approximation of a rational or irrational number */
  readonly isApproximation: boolean;
}

export interface FormatToFormulaOptions {
  /** Write number as decimal or fraction */
  readonly requireFraction?: boolean;
  /** Write a rational number greater than one as a composite fraction */
  readonly preferCompositeFraction?: boolean;
  /** Decimal places a decimal number is rounded to */
  readonly digits?: number;
}

const DEFAULT_DIGITS = 12;

/**
 * The value as a formula tree: a rational number as a fraction (which is exact) and an
 * irrational number as the decimal it is rounded to, as it has no exact form to write.
 */
export function formatNumericToFormula(value: NumericValue, options: FormatToFormulaOptions = {}): FormulaFormatOutput {
  const { requireFraction = false, preferCompositeFraction = false, digits = DEFAULT_DIGITS } = options;

  // If value is irrational, always return an approximation
  const rational = value.asRational();
  if (rational === null) {
    const irrational = value.asIrrational();
    const [formula, isApproximation] = requireFraction
      ? irrationalToFractionalFormula(irrational, digits)
      : irrationalToDecimalFormula(irrational, digits);

    return { value, formula, isApproximation };
  }

  // If a fraction is requested, always return a fractional representation
  if (requireFraction) {
    const formula = rationalToFractionalFormula(rational, preferCompositeFraction);
    return { value, formula, isApproximation: false };
  }

  // If a decimal number is requested, check if the rational is integral, or exactly decimal
  const [formula, isApproximation] = rationalToDecimalFormula(rational, digits);
  return { value, formula, isApproximation };
}

type FormulaAndIsApproximation = readonly [FormulaNode, isApproximation: boolean];

function irrationalToDecimalFormula(value: Irrational, digits: number): FormulaAndIsApproximation {
  const magnitude = value.absolute();

  // Special case: Irrational can be represented as a rational after all
  const rationalAfterAll = magnitude.asRational();
  if (rationalAfterAll !== null) {
    if (rationalAfterAll.isInteger) {
      const formula = magnitudeToFormula(value, int(rationalAfterAll.numerator));
      return [formula, true];
    }
    const [rationalMagnitude, exactRational] = rationalAfterAll.toDecimalStringExact(digits);
    if (exactRational) {
      const formula = magnitudeToFormula(value, decimal(rationalMagnitude));
      return [formula, true];
    }
  }

  // Convert irrational to decimal approximation
  const decimalMagnitude = magnitude.toDecimalString(digits, true);
  return [magnitudeToFormula(value, decimal(decimalMagnitude)), true];
}

function irrationalToFractionalFormula(value: Irrational, digits: number): FormulaAndIsApproximation {
  const [formula, isApproximation] = irrationalToDecimalFormula(value, digits);
  return [fraction(formula, int(1)), isApproximation];
}

function rationalToDecimalFormula(value: Rational, digits: number): FormulaAndIsApproximation {
  const magnitude = value.absolute();
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
  if (preferComposite && magnitude.compareTo(Rational.ONE) > 0) {
    const integerPart = magnitude.floor();
    const fractionalPart = magnitude.numerator - integerPart * magnitude.denominator;
    return compositeFraction(int(integerPart), int(fractionalPart), int(magnitude.denominator));
  } else {
    return fraction(int(magnitude.numerator), int(magnitude.denominator));
  }
}

function magnitudeToFormula(value: NumericValue, magnitude: FormulaNode): FormulaNode {
  return value.isNegative ? negate(magnitude) : magnitude;
}
