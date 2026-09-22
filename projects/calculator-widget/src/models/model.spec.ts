import { FormulaNode } from './ast.model';
import { add, decimal, fraction, int, multiply, negate, pi, pow, root, sqrt, square, subtract } from './ast.factory';
import { evaluateFormula, lispFormula } from './ast.eval';
import { ExactValue } from './exact.model';

describe('Model', () => {
  function doTest(
    formula: FormulaNode,
    expectedResult: string,
    extractDescription: string,
    extractResult: (value: ExactValue) => string,
  ) {
    const result = evaluateFormula(formula);
    const actualResult = result.ok ? extractResult(result.value) : `error:${result.issue.code}`;
    const lisp = lispFormula(formula);
    console.log(`Eval formula ${lisp} => ${extractDescription}: ${actualResult}, expected: ${expectedResult}`);
    expect(actualResult).toBe(expectedResult);
  }

  function checkExact(formula: FormulaNode, expectedExact: string) {
    return () => doTest(formula, expectedExact, 'exact', (value) => value.toString());
  }

  function checkDecimal(formula: FormulaNode, expectedDecimal: string, digits = 12) {
    return () => doTest(formula, expectedDecimal, 'decimal', (value) => value.toDecimalString(digits, true));
  }

  /* ---- exact rational arithmetic ---- */

  it('0.1 + 0.2 is exactly 3/10', checkExact(add(decimal('0.1'), decimal('0.2')), '3/10'));
  it('0.1 + 0.2 decimal', checkDecimal(add(decimal('0.1'), decimal('0.2')), '0.3'));
  it('1/3 + 1/6', checkExact(add(fraction(int(1), int(3)), fraction(int(1), int(6))), '1/2'));
  it('(1/3) * 3', checkExact(multiply(fraction(int(1), int(3)), int(3)), '1'));
  it('1/3 to 20 digits', checkDecimal(fraction(int(1), int(3)), '0.33333333333333333333', 20));
  it('7 - 9', checkExact(subtract(int(7), int(9)), '-2'));

  /* ---- radicals ---- */

  it('sqrt(8) simplifies', checkExact(sqrt(int(8)), '2*sqrt(2)'));
  it('sqrt(2) * sqrt(8)', checkExact(multiply(sqrt(int(2)), sqrt(int(8))), '4'));
  it('1/sqrt(2) rationalised', checkExact(fraction(int(1), sqrt(int(2))), '1/2*sqrt(2)'));
  it('sqrt(2)^2', checkExact(square(sqrt(int(2))), '2'));
  it('cube root of 27', checkExact(root(int(27), int(3)), '3'));
  it('cube root of -8', checkExact(root(negate(int(8)), int(3)), '-2'));
  it('nested: sqrt(4/9)', checkExact(sqrt(fraction(int(4), int(9))), '2/3'));
  it('sqrt(2) to 30 digits', checkDecimal(sqrt(int(2)), '1.41421356237309504880168872421', 30));
  it('(1+sqrt(2))^2', checkExact(square(add(int(1), sqrt(int(2)))), '3+2*sqrt(2)'));

  /* ---- irrational constants ---- */

  it('pi/2 * 2 = pi', checkExact(multiply(fraction(pi(), int(2)), int(2)), 'pi'));
  it('pi - pi', checkExact(subtract(pi(), pi()), '0'));
  it('pi to 30 digits', checkDecimal(pi(), '3.14159265358979323846264338328', 30));
  it('2 + pi', checkDecimal(add(int(2), pi()), '5.14159265359', 12));
  it('pi^2', checkExact(pow(pi(), int(2)), 'pi^2'));
  it('1/pi stays symbolic', checkExact(fraction(int(1), pi()), '(1)/(pi)'));
  it('1/pi decimal', checkDecimal(fraction(int(1), pi()), '0.318309886183791', 15));
  it('mixed symbolic sum', checkExact(add(multiply(int(2), pi()), sqrt(int(3))), '2*pi+sqrt(3)'));
  it('mixed symbolic sum decimal', checkDecimal(add(multiply(int(2), pi()), sqrt(int(3))), '8.015236115', 9));

});
