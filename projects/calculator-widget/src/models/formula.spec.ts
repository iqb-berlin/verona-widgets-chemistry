import { FormulaNode } from './formula.ast';
import {
  add,
  compositeFraction,
  decimal,
  exponential,
  fraction,
  int,
  multiply,
  negate,
  pi,
  root,
  sqrt,
  square,
  subtract,
} from './formula.factory';
import { evaluateFormula } from './formula.eval';
import { NumericValue } from './numeric.model';
import { tokenizeFormula } from './editing.tokenize';
import { compileToFormula } from './editing.compile';

describe('Formula', () => {
  function doEval(
    formula: FormulaNode,
    expectedResult: string,
    extractDescription: string,
    extractResult: (value: NumericValue) => string,
  ) {
    const result = evaluateFormula(formula);
    const actualResult = result.ok ? extractResult(result.value) : `error:${result.issue.code}`;
    const lisp = FormulaNode.asLispString(formula);
    console.log(`Eval formula ${lisp} => ${extractDescription}: ${actualResult}, expected: ${expectedResult}`);
    expect(actualResult).toBe(expectedResult);
  }

  // An exact result is a rational number, written as a fraction
  function isExact(formula: FormulaNode, expectedExact: string) {
    return () => doEval(formula, expectedExact, 'exact', (value) => value.toString());
  }

  // An approximate result is an irrational number, which only has a decimal form
  function isApproximately(formula: FormulaNode, expectedDecimal: string, digits = 12) {
    return () => {
      const result = evaluateFormula(formula);
      expect(result.ok && result.value.isIrrational())
        .withContext(`${FormulaNode.asLispString(formula)} must evaluate to an irrational number`)
        .toBeTrue();
      doEval(formula, expectedDecimal, 'decimal', (value) => value.toDecimalString(digits, true));
    };
  }

  function isDecimal(formula: FormulaNode, expectedDecimal: string, digits = 12) {
    return () => doEval(formula, expectedDecimal, 'decimal', (value) => value.toDecimalString(digits, true));
  }

  // Tokenize the formula for editing and compile it back, which must not change its value
  function isStableWhenEdited(formula: FormulaNode) {
    return () => {
      const compiled = compileToFormula(tokenizeFormula(formula));
      if (!compiled.ok) {
        fail(`Editing ${FormulaNode.asLispString(formula)} does not compile back: ${compiled.issue.code}`);
        return;
      }

      const describe = (result: ReturnType<typeof evaluateFormula>) =>
        result.ok ? `${result.value.kind}: ${result.value.toString()}` : `error:${result.issue.code}`;
      const before = describe(evaluateFormula(formula));
      const after = describe(evaluateFormula(compiled.value));

      console.log(`Edit formula ${FormulaNode.asLispString(formula)} => ${after}, before editing: ${before}`);
      expect(after).toBe(before); // same kind of number, and the same value
    };
  }

  /* ---- exact rational arithmetic ---- */

  it('0.1 + 0.2 is exactly 3/10', isExact(add(decimal('0.1'), decimal('0.2')), '3/10'));
  it('0.1 + 0.2 decimal', isDecimal(add(decimal('0.1'), decimal('0.2')), '0.3'));
  it('1/3 + 1/6', isExact(add(fraction(int(1), int(3)), fraction(int(1), int(6))), '1/2'));
  it('(1/3) * 3', isExact(multiply(fraction(int(1), int(3)), int(3)), '1'));
  it('1/3 to 20 digits', isDecimal(fraction(int(1), int(3)), '0.33333333333333333333', 20));
  it('7 - 9', isExact(subtract(int(7), int(9)), '-2'));

  /* ---- radicals ---- */

  it('sqrt(8) is irrational', isApproximately(sqrt(int(8)), '2.828427124746'));
  it('sqrt(2) * sqrt(8) lands on 4', isApproximately(multiply(sqrt(int(2)), sqrt(int(8))), '4'));
  it('1/sqrt(2)', isApproximately(fraction(int(1), sqrt(int(2))), '0.707106781187'));
  it('sqrt(2)^2 lands on 2', isApproximately(square(sqrt(int(2))), '2'));
  it('cube root of 27', isExact(root(int(27), int(3)), '3'));
  it('cube root of -8', isExact(root(negate(int(8)), int(3)), '-2'));
  it('nested: sqrt(4/9)', isExact(sqrt(fraction(int(4), int(9))), '2/3'));
  it('sqrt(2) to 30 digits', isApproximately(sqrt(int(2)), '1.41421356237309504880168872421', 30));
  it('(1+sqrt(2))^2', isApproximately(square(add(int(1), sqrt(int(2)))), '5.828427124746'));

  /* ---- irrational constants ---- */

  it('pi/2 * 2 = pi', isApproximately(multiply(fraction(pi(), int(2)), int(2)), '3.14159265359'));
  it('pi - pi is zero', isApproximately(subtract(pi(), pi()), '0'));
  it('pi to 30 digits', isApproximately(pi(), '3.14159265358979323846264338328', 30));
  it('2 + pi', isApproximately(add(int(2), pi()), '5.14159265359'));
  it('pi^2', isApproximately(exponential(pi(), int(2)), '9.869604401089'));
  it('1/pi', isApproximately(fraction(int(1), pi()), '0.318309886183791', 15));
  it('sqrt(pi)', isApproximately(sqrt(pi()), '1.772453850906'));
  it('mixed sum of constants', isApproximately(add(multiply(int(2), pi()), sqrt(int(3))), '8.015236115', 9));

  /* ---- powers ---- */

  it('2^10', isExact(exponential(int(2), int(10)), '1024'));
  it('2^-2', isExact(exponential(int(2), negate(int(2))), '1/4'));
  it('2^(1/2)', isApproximately(exponential(int(2), fraction(int(1), int(2))), '1.414213562373'));
  it('(-8)^(1/3)', isExact(exponential(negate(int(8)), fraction(int(1), int(3))), '-2'));
  it('8^(2/3)', isExact(exponential(int(8), fraction(int(2), int(3))), '4'));
  it('0^0 is rejected', isExact(exponential(int(0), int(0)), 'error:indeterminate'));

  /* ---- fractions, true and composite ---- */

  const twoAndAHalf = compositeFraction(int(2), int(1), int(2));
  it('2 1/2', isExact(twoAndAHalf, '5/2'));
  it('1 + 2 1/2', isExact(add(int(1), twoAndAHalf), '7/2'));

  /* ---- errors ---- */

  it('division by zero', isExact(fraction(int(1), int(0)), 'error:divisionByZero'));
  it('sqrt of negative', isExact(sqrt(subtract(int(1), int(5))), 'error:complexResult'));
  it('irrational exponent', isExact(exponential(int(2), pi()), 'error:unsupported'));

  /* ---- the two kinds of number ---- */

  function isKind(formula: FormulaNode, expectedKind: 'rational' | 'irrational') {
    return () => doEval(formula, expectedKind, 'kind', (value) => value.kind);
  }

  it('a fraction of whole numbers is rational', isKind(fraction(int(1), int(3)), 'rational'));
  it('a root which comes out whole stays rational', isKind(root(int(27), int(3)), 'rational'));
  it('a root which does not is irrational', isKind(sqrt(int(2)), 'irrational'));
  it('a constant is irrational', isKind(pi(), 'irrational'));
  it('a rational number next to an irrational one gives in', isKind(add(int(1), pi()), 'irrational'));
  it('even a product with zero gives in', isKind(multiply(int(0), pi()), 'irrational'));

  // A rounded decimal cannot tell a whole result from a rounded one, so it stays irrational
  it('an irrational result is never turned back into a fraction', isKind(square(sqrt(int(2))), 'irrational'));

  /* ---- round trip through the edit model ---- */

  it('0.1 + 0.2 survives editing', isStableWhenEdited(add(decimal('0.1'), decimal('0.2'))));
  it('1/3 + 1/6 survives editing', isStableWhenEdited(add(fraction(int(1), int(3)), fraction(int(1), int(6)))));
  it('7 - 9 survives editing', isStableWhenEdited(subtract(int(7), int(9))));
  it('sqrt(8) survives editing', isStableWhenEdited(sqrt(int(8))));
  it('cube root of 27 survives editing', isStableWhenEdited(root(int(27), int(3))));
  it('cube root of -8 survives editing', isStableWhenEdited(root(negate(int(8)), int(3))));
  it('2^-2 survives editing', isStableWhenEdited(exponential(int(2), negate(int(2)))));
  it('(1+sqrt(2))^2 survives editing', isStableWhenEdited(square(add(int(1), sqrt(int(2))))));
  it('pi/2 * 2 survives editing', isStableWhenEdited(multiply(fraction(pi(), int(2)), int(2))));
  it('mixed symbolic sum survives editing', isStableWhenEdited(add(multiply(int(2), pi()), sqrt(int(3)))));
  it('2 1/2 survives editing', isStableWhenEdited(twoAndAHalf));
});
