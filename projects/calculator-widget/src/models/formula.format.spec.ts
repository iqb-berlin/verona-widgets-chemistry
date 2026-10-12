import { FormulaNode } from './formula.ast';
import { compositeFraction, decimal, fraction, int, negate, sqrt, square } from './formula.factory';
import { evaluateFormula } from './formula.eval';
import { FormatToFormulaOptions, formatNumericToFormula } from './formula.format';
import { NumericValue } from './numeric.model';
import { Rational } from './rational.model';
import { Irrational } from './irrational.model';
import { ConstantSymbol } from './constants.model';

/**
 * A result is written either as a decimal or as a fraction, and flagged as an approximation
 * whenever the written form says less than the value holds.
 */
describe('Formula formatting', () => {
  function formats(
    value: NumericValue,
    options: FormatToFormulaOptions,
    expected: FormulaNode,
    approximation: boolean,
  ) {
    const output = formatNumericToFormula(value, options);
    expect(FormulaNode.asLispString(output.formula)).toBe(FormulaNode.asLispString(expected));
    expect(output.isApproximation).withContext('isApproximation').toBe(approximation);
    expect(output.value).toBe(value);
  }

  const rational = (numerator: number, denominator = 1) => Rational.of(numerator, denominator);
  const pi = Irrational.fromConstant(ConstantSymbol.Pi);

  //#region As a decimal

  it('writes a whole rational number as an exact integer', () => {
    formats(rational(3), {}, int(3), false);
    formats(rational(-3), {}, negate(int(3)), false);
  });

  it('writes a rational number with a finite decimal as an exact decimal', () => {
    formats(rational(3, 10), {}, decimal('0.3'), false);
    formats(rational(-1, 8), {}, negate(decimal('0.125')), false);
  });

  it('writes any other rational number as a rounded decimal', () => {
    formats(rational(1, 3), {}, decimal('0.333333333333'), true);
    formats(rational(2, 3), { digits: 2 }, decimal('0.67'), true);
  });

  it('writes an irrational number as a rounded decimal', () => {
    formats(pi, {}, decimal('3.14159265359'), true);
    formats(pi.negate(), { digits: 2 }, negate(decimal('3.14')), true);
  });

  it('flags an irrational number as an approximation, even when it looks exact', () => {
    formats(Irrational.parse('0.25'), {}, decimal('0.25'), true);
    formats(Irrational.parse('-1000'), {}, negate(int(1000)), true);
  });

  // The rounded decimal of sqrt(2)^2 happens to be whole, which proves nothing about its exact value
  it('writes sqrt(2)^2 as an approximate 2', () => {
    const result = evaluateFormula(square(sqrt(int(2))));
    if (!result.ok) return fail(`sqrt(2)^2 does not evaluate: ${result.issue.code}`);

    formats(result.value, {}, int(2), true);
    formats(result.value, { requireFraction: true }, fraction(int(2), int(1)), true);
  });

  //#endregion
  //#region As a fraction

  it('writes a rational number as an exact fraction when one is required', () => {
    formats(rational(3, 10), { requireFraction: true }, fraction(int(3), int(10)), false);
    formats(rational(3), { requireFraction: true }, fraction(int(3), int(1)), false);
    formats(rational(-1, 3), { requireFraction: true }, negate(fraction(int(1), int(3))), false);
  });

  it('writes a rational number greater than one as a composite fraction when preferred', () => {
    const options = { requireFraction: true, preferCompositeFraction: true };
    formats(rational(7, 2), options, compositeFraction(int(3), int(1), int(2)), false);
    formats(rational(1, 2), options, fraction(int(1), int(2)), false); // nothing whole to split off
    formats(rational(-7, 2), options, negate(compositeFraction(int(3), int(1), int(2))), false);
  });

  it('writes an irrational number as a rounded decimal over one when a fraction is required', () => {
    formats(pi, { requireFraction: true }, fraction(decimal('3.14159265359'), int(1)), true);
  });

  //#endregion
});
