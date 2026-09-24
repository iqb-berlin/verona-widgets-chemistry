import { FormulaNode } from './ast.model';
import {
  add,
  compositeFraction,
  constant,
  decimal,
  divide,
  fraction,
  hole,
  int,
  multiply,
  negate,
  pi,
  pow,
  root,
  sqrt,
  square,
  subtract,
} from './ast.factory';
import { evaluateFormula, lispFormula } from './ast.eval';
import { latexFormat, latexParse } from './latex.codec';
import { ExactValue } from './exact.model';
import { ConstantSymbol } from './constants.model';

describe('Math', () => {
  function doEval(
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

  function isExact(formula: FormulaNode, expectedExact: string) {
    return () => doEval(formula, expectedExact, 'exact', (value) => value.toString());
  }

  function isDecimal(formula: FormulaNode, expectedDecimal: string, digits = 12) {
    return () => doEval(formula, expectedDecimal, 'decimal', (value) => value.toDecimalString(digits, true));
  }

  function doFormat(formula: FormulaNode, expectedFormat: string, formatDescription: string, resultFormat: string) {
    const lisp = lispFormula(formula);
    console.log(`Format formula ${lisp} => ${formatDescription}: "${resultFormat}", expected "${expectedFormat}"`);
    expect(resultFormat).toBe(expectedFormat);
  }

  function isLatex(formula: FormulaNode, expectedLatex: string) {
    return () => doFormat(formula, expectedLatex, 'latex', latexFormat(formula));
  }

  function isLatexRoundTrip(formula: FormulaNode) {
    return () => {
      const lisp = lispFormula(formula);
      const latex = latexFormat(formula);
      const result = latexParse(latex);
      const parsed = result.ok ? latexFormat(result.formula) : `error:${result.issue.cause}:${result.issue.detail}`;

      console.log(`Round trip formula ${lisp} latex => ${latex} => ${parsed}`);
      if (result.ok) expect(latex).toEqual(parsed);
      else fail(parsed);
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

  it('sqrt(8) simplifies', isExact(sqrt(int(8)), '2*sqrt(2)'));
  it('sqrt(2) * sqrt(8)', isExact(multiply(sqrt(int(2)), sqrt(int(8))), '4'));
  it('1/sqrt(2) rationalised', isExact(fraction(int(1), sqrt(int(2))), '1/2*sqrt(2)'));
  it('sqrt(2)^2', isExact(square(sqrt(int(2))), '2'));
  it('cube root of 27', isExact(root(int(27), int(3)), '3'));
  it('cube root of -8', isExact(root(negate(int(8)), int(3)), '-2'));
  it('nested: sqrt(4/9)', isExact(sqrt(fraction(int(4), int(9))), '2/3'));
  it('sqrt(2) to 30 digits', isDecimal(sqrt(int(2)), '1.41421356237309504880168872421', 30));
  it('(1+sqrt(2))^2', isExact(square(add(int(1), sqrt(int(2)))), '3+2*sqrt(2)'));

  /* ---- irrational constants ---- */

  it('pi/2 * 2 = pi', isExact(multiply(fraction(pi(), int(2)), int(2)), 'pi'));
  it('pi - pi', isExact(subtract(pi(), pi()), '0'));
  it('pi to 30 digits', isDecimal(pi(), '3.14159265358979323846264338328', 30));
  it('2 + pi', isDecimal(add(int(2), pi()), '5.14159265359', 12));
  it('pi^2', isExact(pow(pi(), int(2)), 'pi^2'));
  it('1/pi stays symbolic', isExact(fraction(int(1), pi()), '(1)/(pi)'));
  it('1/pi decimal', isDecimal(fraction(int(1), pi()), '0.318309886183791', 15));
  it('mixed symbolic sum', isExact(add(multiply(int(2), pi()), sqrt(int(3))), '2*pi+sqrt(3)'));
  it('mixed symbolic sum decimal', isDecimal(add(multiply(int(2), pi()), sqrt(int(3))), '8.015236115', 9));

  /* ---- powers ---- */

  it('2^10', isExact(pow(int(2), int(10)), '1024'));
  it('2^-2', isExact(pow(int(2), negate(int(2))), '1/4'));
  it('2^(1/2)', isExact(pow(int(2), fraction(int(1), int(2))), 'sqrt(2)'));
  it('(-8)^(1/3)', isExact(pow(negate(int(8)), fraction(int(1), int(3))), '-2'));
  it('8^(2/3)', isExact(pow(int(8), fraction(int(2), int(3))), '4'));
  it('0^0 is rejected', isExact(pow(int(0), int(0)), 'error:indeterminate'));

  /* ---- fractions, true and composite ---- */

  const twoAndAHalf = compositeFraction(int(2), int(1), int(2));
  it('2 1/2', isExact(twoAndAHalf, '5/2'));
  it('2 1/2 latex', isLatex(twoAndAHalf, '2\\frac{1}{2}'));
  it('1 + 2 1/2', isExact(add(int(1), twoAndAHalf), '7/2'));

  //const sevenHalves = fraction(int(7), int(2));
  //const compositeSevenHalves = toCompositeFraction(sevenHalves, sevenHalves.id);
  //it('7/2 -> composite', isLatex(compositeSevenHalves, '3\\frac{1}{2}'));
  //const trueSevenHalves = toTrueFraction(composite.root, composite.root.id);
  //it('3 1/2 -> true', isLatex(trueSevenHalves.root, '\\frac{7}{2}'));

  /* ---- open values ---- */

  const withHole = add(int(1), hole());
  it('hole blocks evaluation', isExact(withHole, 'error:incomplete'));
  it('hole latex', isLatex(withHole, '1 + \\square'));

  /* ---- errors ---- */

  it('division by zero', isExact(fraction(int(1), int(0)), 'error:divisionByZero'));
  it('sqrt of negative', isExact(sqrt(subtract(int(1), int(5))), 'error:complexResult'));

  /* ---- precedence and parentheses ---- */

  it(
    'inline division needs parens',
    isLatex(divide(int(1), add(int(2), int(3)), 'solidus'), '1 / \\left(2 + 3\\right)'),
  );
  it('stacked division does not', isLatex(fraction(int(1), add(int(2), int(3))), '\\frac{1}{2 + 3}'));
  it('subtraction right operand', isLatex(subtract(int(1), add(int(2), int(3))), '1 - \\left(2 + 3\\right)'));
  it('power base', isLatex(pow(add(int(1), int(2)), int(2)), '\\left(1 + 2\\right)^{2}'));
  it('exponent parens', isLatex(pow(int(2), add(int(1), int(2))), '2^{1 + 2}'));

  /* ---- LaTeX round trips ---- */

  const latexSampleFormulas: FormulaNode[] = [
    add(int(1), fraction(int(1), int(2))),
    compositeFraction(int(2), int(1), int(2)),
    pow(sqrt(add(constant(ConstantSymbol.Pi), int(1))), int(3)),
    root(fraction(int(1), int(8)), int(3)),
    divide(int(1), int(2), 'solidus'),
    multiply(int(2), pi(), 'implicit'),
    subtract(int(1), hole()),
  ];
  for (const sample of latexSampleFormulas) {
    it(`round trip latex ${lispFormula(sample)}`, isLatexRoundTrip(sample));
  }

  /*
  it('latex parse error position', isParseLatex('1 + \\unknown', 'error:unexpected:4'));

  const parsed = parseLatex('\\frac{1}{2} + 2\\frac{3}{4} \\cdot \\sqrt[3]{27} - \\pi');
  check('parse succeeds', parsed.ok, 'true');
  if (parsed.ok) {
    check('parsed latex', toLatex(parsed.node), '\\frac{1}{2} + 2\\frac{3}{4} \\cdot \\sqrt[3]{27} - \\pi');
    check('parsed value', exact(parsed.node), '35/4 - pi');
  }
  */
});
