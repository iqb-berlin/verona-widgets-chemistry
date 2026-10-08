import { NumericError, NumericValue } from './numeric.model';
import { Rational } from './rational.model';
import { Irrational, IRRATIONAL_PRECISION } from './irrational.model';
import { ConstantSymbol } from './constants.model';

/**
 * The calculator holds two kinds of number: a rational one, which is a fraction and exact,
 * and an irrational one, which is a decimal of limited precision and lossy.
 */
describe('Numeric', () => {
  //#region Test helpers

  // A value written as `<kind>: <value>`, so that a failure shows which kind it came out as
  function shows(value: NumericValue): string {
    return `${value.kind}: ${value.toString()}`;
  }

  function issueOf(compute: () => NumericValue): string {
    try {
      return shows(compute());
    } catch (error: unknown) {
      if (error instanceof NumericError) return `error:${error.code}`;
      throw error;
    }
  }

  const rational = (numerator: number, denominator = 1) => Rational.of(numerator, denominator);
  const irrational = (text: string) => Irrational.parse(text);

  //#endregion
  //#region Rational numbers

  it('reads a fraction, a decimal and a whole number', () => {
    expect(shows(Rational.parse('1.5'))).toBe('rational: 3/2');
    expect(shows(Rational.parse('3/6'))).toBe('rational: 1/2');
    expect(shows(Rational.parse('-7'))).toBe('rational: -7');
    expect(shows(rational(-3, -6))).toBe('rational: 1/2'); // the sign belongs in the numerator
  });

  it('adds, subtracts, multiplies and divides exactly', () => {
    expect(shows(rational(1, 3).add(rational(1, 6)))).toBe('rational: 1/2');
    expect(shows(Rational.parse('0.1').add(Rational.parse('0.2')))).toBe('rational: 3/10');
    expect(shows(rational(7).subtract(rational(9)))).toBe('rational: -2');
    expect(shows(rational(1, 3).multiply(rational(3)))).toBe('rational: 1');
    expect(shows(rational(1, 3).divide(rational(1, 6)))).toBe('rational: 2');
  });

  it('stays rational for a power whose root comes out whole', () => {
    expect(shows(rational(2).power(rational(10)))).toBe('rational: 1024');
    expect(shows(rational(2).power(rational(-2)))).toBe('rational: 1/4');
    expect(shows(rational(8).power(rational(2, 3)))).toBe('rational: 4');
    expect(shows(rational(4).root(rational(2)))).toBe('rational: 2');
    expect(shows(rational(1, 4).root(rational(2)))).toBe('rational: 1/2');
    expect(shows(rational(-8).root(rational(3)))).toBe('rational: -2');
  });

  it('leaves the rationals for a root which does not come out whole', () => {
    expect(shows(rational(2).power(rational(1, 2)))).toBe(`irrational: ${SQRT_2}`);
    expect(shows(rational(2).root(rational(2)))).toBe(`irrational: ${SQRT_2}`);
  });

  it('writes a decimal of as many places as asked for', () => {
    expect(rational(1, 3).toDecimalString(12)).toBe('0.333333333333');
    expect(rational(1, 2).toDecimalString(12)).toBe('0.5'); // trailing zeros are dropped
    expect(rational(1, 2).toDecimalString(3, false)).toBe('0.500');
    expect(rational(2, 3).toDecimalString(2)).toBe('0.67'); // rounded, not cut off
    expect(rational(-1, 3).toDecimalString(4)).toBe('-0.3333');
    expect(rational(-1, 3).toDecimalString(0)).toBe('0'); // a rounded zero carries no sign
  });

  //#endregion
  //#region Irrational numbers

  const SQRT_2 = '1.41421356237309504880168872421';
  const SQRT_PI = '1.77245385090551602729816748334';

  it('keeps a fixed number of significant digits', () => {
    expect(IRRATIONAL_PRECISION).toBe(30);
    expect(Irrational.fromFraction(1n, 3n).toString()).toBe('0.333333333333333333333333333333');
    expect(Irrational.fromConstant(ConstantSymbol.Pi).toString()).toBe('3.14159265358979323846264338328');
  });

  it('holds the same number in one shape only', () => {
    expect(shows(Irrational.of(1230n, -2))).toBe('irrational: 12.3'); // trailing zeros move into the exponent
    expect(shows(irrational('2.0'))).toBe('irrational: 2');
    expect(irrational('2.0').isInteger).toBeTrue();
    expect(irrational('0').isZero).toBeTrue();
    expect(irrational('-0').isZero).toBeTrue();
  });

  it('calculates in decimal, not in binary', () => {
    expect(shows(irrational('0.1').add(irrational('0.2')))).toBe('irrational: 0.3');
    expect(shows(irrational('2').multiply(irrational('0.5')))).toBe('irrational: 1');
    expect(shows(irrational('1').divide(irrational('8')))).toBe('irrational: 0.125');
  });

  it('takes roots and whole powers', () => {
    expect(shows(irrational('2').nthRoot(2))).toBe(`irrational: ${SQRT_2}`);
    expect(shows(irrational('1000').nthRoot(3))).toBe('irrational: 10');
    expect(shows(irrational('-8').nthRoot(3))).toBe('irrational: -2');
    expect(shows(irrational('2').integerPower(10n))).toBe('irrational: 1024');
    expect(shows(irrational('2').integerPower(-3n))).toBe('irrational: 0.125');
    expect(shows(Irrational.fromConstant(ConstantSymbol.Pi).nthRoot(2))).toBe(`irrational: ${SQRT_PI}`);
  });

  it('drops what is too small to show up at its precision', () => {
    expect(shows(irrational('1').add(Irrational.of(1n, -40)))).toBe('irrational: 1');
    expect(shows(Irrational.of(1n, -40).add(irrational('1')))).toBe('irrational: 1');
    expect(shows(Irrational.of(1n, 40))).toBe(`irrational: 1${'0'.repeat(40)}`);
  });

  it('writes a decimal of as many places as asked for', () => {
    expect(Irrational.fromFraction(1n, 7n).toDecimalString(6)).toBe('0.142857');
    expect(irrational('2').nthRoot(2).toDecimalString(12)).toBe('1.414213562373');
    expect(Irrational.of(1n, 40).toDecimalString(0)).toBe(`1${'0'.repeat(40)}`);
    expect(irrational('1.5').valueOf()).toBe(1.5);
  });

  //#endregion
  //#region Where the two kinds meet

  it('gives in to the irrational side', () => {
    expect(shows(rational(1, 2).add(irrational('0.25')))).toBe('irrational: 0.75');
    expect(shows(irrational('0.25').add(rational(1, 2)))).toBe('irrational: 0.75');
    expect(shows(rational(2).multiply(irrational('0.5')))).toBe('irrational: 1');
    expect(shows(rational(0).multiply(irrational('0.5')))).toBe('irrational: 0'); // even a product with zero
  });

  // A rounded decimal cannot tell a whole result from a rounded one
  it('never turns an irrational result back into a fraction', () => {
    const two = irrational('2').nthRoot(2).integerPower(2n);

    expect(shows(two)).toBe('irrational: 2');
    expect(two.isRational()).toBeFalse();
    expect(two.asRational()).toBeNull(); // there is no fraction to hand out
    expect(two.isInteger).toBeTrue(); // it may well look whole
  });

  it('hands out the other kind on request', () => {
    const half = rational(1, 2);
    const quarter = irrational('0.25');

    expect(half.isRational()).toBeTrue();
    expect(half.isIrrational()).toBeFalse();
    expect(shows(half.asRational())).toBe('rational: 1/2'); // itself
    expect(shows(half.asIrrational())).toBe('irrational: 0.5'); // rounded to a decimal

    expect(quarter.isIrrational()).toBeTrue();
    expect(quarter.asIrrational()).toBe(quarter); // itself
    expect(quarter.asRational()).toBeNull();
  });

  it('compares and equates across the two kinds', () => {
    expect(rational(1, 2).equalTo(irrational('0.5'))).toBeTrue();
    expect(irrational('0.5').equalTo(rational(1, 2))).toBeTrue();
    expect(rational(1, 3).compareTo(irrational('0.333'))).toBe(1);
    expect(irrational('0.333').compareTo(rational(1, 3))).toBe(-1);
    expect(rational(2).compareTo(irrational('2'))).toBe(0);
  });

  //#endregion
  //#region What cannot be worked out

  it('reports what it cannot compute', () => {
    expect(issueOf(() => rational(1).divide(Rational.ZERO))).toBe('error:divisionByZero');
    expect(issueOf(() => irrational('1').divide(irrational('0')))).toBe('error:divisionByZero');
    expect(issueOf(() => rational(-1).power(rational(1, 2)))).toBe('error:complexResult');
    expect(issueOf(() => irrational('-1').nthRoot(2))).toBe('error:complexResult');
    expect(issueOf(() => Rational.ZERO.power(Rational.ZERO))).toBe('error:indeterminate');
    expect(issueOf(() => Rational.ZERO.power(rational(-1)))).toBe('error:divisionByZero');
    expect(issueOf(() => rational(2).power(Irrational.fromConstant(ConstantSymbol.Pi)))).toBe('error:unsupported');
    expect(issueOf(() => rational(2).power(rational(100_000)))).toBe('error:unsupported');
    expect(issueOf(() => Rational.parse('zwei'))).toBe('error:syntaxError');
  });

  //#endregion
});
