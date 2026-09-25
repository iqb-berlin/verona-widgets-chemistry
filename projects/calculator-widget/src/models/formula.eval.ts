import { FormulaNode } from './formula.ast';
import { ExactError, ExactErrorCode, ExactValue, Factor, Monomial, Polynomial } from './exact.model';
import { Rational, RationalError, RationalErrorCode } from './rational.model';
import {
  add,
  compositeFraction,
  constant,
  divide,
  exponential,
  fraction,
  int,
  multiply,
  negate,
  root,
  sqrt,
  subtract,
} from './formula.factory';
import { EnumLiteral, Result } from './types';
import { bigIsEven } from './utils';

//#region Evaluation public API

export type FormulaEvalIssueCode = EnumLiteral<ExactErrorCode> | EnumLiteral<RationalErrorCode>;

export interface FormulaEvalIssue {
  readonly code: FormulaEvalIssueCode;
  readonly detail: string;
}

export type FormulaEvalResult = Result<ExactValue, FormulaEvalIssue>;

export class FormulaEvalError extends Error {
  constructor(readonly issue: FormulaEvalIssue) {
    super(`${issue.code}: ${issue.detail}`);
    this.name = 'FormulaEvalError';
  }
}

export interface FormulaFormatOutput {
  /** The formatted value */
  readonly value: ExactValue;
  /** The exact result as a tree */
  readonly exact: FormulaNode;
  /** A rounded decimal, for the display line */
  readonly decimal: string;
  /** True when the exact form is just a decimal already */
  readonly isExactlyDecimal: boolean;
}

export function evaluateFormula(node: FormulaNode): FormulaEvalResult {
  try {
    const result = evaluateNode(node);
    return Result.ok(result);
  } catch (error: unknown) {
    if (error instanceof FormulaEvalError) return Result.issue(error.issue);
    if (error instanceof RationalError) return Result.issue(errorIssue(error));
    if (error instanceof ExactError) return Result.issue(errorIssue(error));
    console.error('Unexpected evaluate formula', node, 'error:', error);
    throw error;
  }
}

export function evaluateFormulaToNumber(node: FormulaNode): null | number {
  const result = evaluateFormula(node);
  return result.ok ? result.value.valueOf() : null;
}

export function evaluateFormulaToDecimalString(node: FormulaNode, digits = 12): null | string {
  const result = evaluateFormula(node);
  return result.ok ? result.value.toDecimalString(digits, true) : null;
}

export interface FormatToFormulaOptions {
  readonly preferMixedFractions?: boolean;
}

export function exactToFormula(value: ExactValue, options: FormatToFormulaOptions = {}): FormulaNode {
  const rational = value.asRational();
  if (rational !== null) return rationalToFormula(rational, options);

  const numerator = polynomialToFormula(value.numerator, options);
  if (ExactValue.isOnePolynomial(value.denominator)) return numerator;

  const denominator = polynomialToFormula(value.denominator, options);
  return divide(numerator, denominator);
}

export interface ExactToFormulaOutputOptions extends FormatToFormulaOptions {
  readonly digits?: number;
}

/**
 * Packages a value the way a calculator display wants it:
 * An exact line and an approximate line, with a flag for whether showing both is redundant.
 */
export function exactToFormulaOutput(
  exact: ExactValue,
  options: ExactToFormulaOutputOptions = {},
): FormulaFormatOutput {
  const digits = options.digits ?? 12;
  const rational = exact.asRational();
  const isExactlyDecimal = rational !== null && onlyTwosAndFives(rational.denominator);

  return {
    value: exact,
    exact: exactToFormula(exact, options),
    decimal: exact.toDecimalString(digits, true),
    isExactlyDecimal,
  };
}

//#endregion
//#region Evaluation internals
//#region Evaluate formula node to exact value

function fail(code: FormulaEvalIssueCode, message?: unknown): never {
  const detail =
    message === undefined
      ? ''
      : typeof message === 'string'
        ? message
        : message instanceof Error
          ? message.message
          : JSON.stringify(message);

  throw new FormulaEvalError({ code, detail });
}

function errorIssue(error: RationalError | ExactError): FormulaEvalIssue {
  return { code: error.code, detail: error.message };
}

function evaluateNode(node: FormulaNode): ExactValue {
  switch (node.kind) {
    case 'literal':
      if (node.literal.length === 0) {
        return fail('syntaxError', 'Empty number');
      } else {
        return ExactValue.fromRational(Rational.parse(node.literal));
      }
    case 'constant':
      return ExactValue.fromConstant(node.symbol);
    case 'unary': {
      const operand = evaluateNode(node.operand);
      switch (node.operator) {
        case 'negate':
          return operand.negate();
        default:
          return fail('syntaxError', node satisfies never);
      }
    }
    case 'binary': {
      const left = evaluateNode(node.left);
      const right = evaluateNode(node.right);
      switch (node.operator) {
        case 'add':
          return left.add(right);
        case 'subtract':
          return left.subtract(right);
        case 'multiply':
          return left.multiply(right);
        case 'divide':
          if (right.isZero) return fail('divisionByZero');
          return left.divide(right);
        default:
          return fail('syntaxError', node satisfies never);
      }
    }
    case 'fraction': {
      const dividend = evaluateNode(node.dividend);
      const divisor = evaluateNode(node.divisor);
      return dividend.divide(divisor);
    }
    case 'composite': {
      const integerPart = evaluateNode(node.integerPart);
      const numerator = evaluateNode(node.numerator);
      const denominator = evaluateNode(node.denominator);
      if (denominator.isZero) return fail('divisionByZero');
      const fractionalPart = numerator.divide(denominator);
      return integerPart.isNegative ? integerPart.subtract(fractionalPart) : integerPart.add(fractionalPart);
    }
    case 'exponential': {
      const base = evaluateNode(node.base);
      const exponent = evaluateNode(node.exponent);
      const rationalExponent = exponent.asRational();
      if (rationalExponent === null) return fail('unsupported', 'Exponent must be a rational number');
      if (base.isZero && rationalExponent.sign() <= 0) {
        const zeroExponent = rationalExponent.isZero;
        if (zeroExponent) return fail('indeterminate', 'Zero to the power of zero');
        return fail('divisionByZero', 'Zero raised to a negative power');
      }

      return base.rationalPow(rationalExponent);
    }
    case 'root': {
      const degree = evaluateNode(node.degree);
      const radicand = evaluateNode(node.radicand);
      const rationalDegree = degree.asRational();
      if (rationalDegree === null) return fail('unsupported', 'Root degree must be a rational number');
      if (radicand.isNegative && rationalDegree.isInteger && bigIsEven(rationalDegree.numerator))
        return fail('complexResult', 'Even root of a negative number');

      return radicand.rationalRoot(rationalDegree);
    }
    default:
      console.error(`Invalid node:`, node satisfies never);
      throw new Error(`Invalid node: ${JSON.stringify(node)}`);
  }
}

//#endregion
//#region Evaluate exact value back to formula node

function rationalToFormula(value: Rational, options: FormatToFormulaOptions): FormulaNode {
  const magnitude = value.absolute();
  let node: FormulaNode;

  if (magnitude.isInteger) {
    node = int(magnitude.numerator);
  } else if (options.preferMixedFractions && magnitude.compareTo(Rational.ONE) > 0) {
    const whole = magnitude.floor();
    const remainder = magnitude.subtract(Rational.of(whole));
    node = compositeFraction(int(whole), int(remainder.numerator), int(remainder.denominator));
  } else {
    node = divide(int(magnitude.numerator), int(magnitude.denominator));
  }

  return value.isNegative ? negate(node) : node;
}

function polynomialToFormula(poly: Polynomial, options: FormatToFormulaOptions): FormulaNode {
  if (poly.length === 0) {
    return int(0);
  }

  let result: FormulaNode | null = null;
  for (const term of poly) {
    const negative = term.coefficient.isNegative;
    const monomial: Monomial = { coefficient: term.coefficient.absolute(), factors: term.factors };
    const magnitude = monomialToFormula(monomial, options);
    if (result === null) {
      result = negative ? negate(magnitude) : magnitude;
    } else {
      result = negative ? subtract(result, magnitude) : add(result, magnitude);
    }
  }
  return result!;
}

function monomialToFormula(term: Monomial, options: FormatToFormulaOptions): FormulaNode {
  if (term.factors.length === 0) {
    return rationalToFormula(term.coefficient, options);
  }

  const factors = term.factors.map((factor) => factorToFormula(factor, options));
  let product = factors.reduce((left, right) => multiply(left, right));
  if (term.coefficient.isOne) {
    return product;
  }

  // A rational coefficient in front of symbols reads best as a fraction of the whole product: `(2/3)*pi` becomes `2*pi / 3`
  const numerator = term.coefficient.numerator;
  const denominator = term.coefficient.denominator;
  if (numerator !== 1n) product = multiply(int(numerator), product);
  if (denominator !== 1n) product = fraction(product, int(denominator));
  return product;
}

function factorToFormula(factor: Factor, options: FormatToFormulaOptions): FormulaNode {
  const base =
    factor.base.kind === 'constant' ? constant(factor.base.symbol) : exactToFormula(factor.base.radicand, options);

  const exponent = factor.exponent;
  if (exponent.isOne) return base;
  if (exponent.isInteger) return exponential(base, int(exponent.numerator));

  const degree = exponent.denominator;
  const radical = degree === 2n ? sqrt(base) : root(base, int(degree));
  return exponent.numerator === 1n ? radical : exponential(radical, int(exponent.numerator));
}

// A fraction terminates in base 10 exactly when its denominator is 2^i * 5^j
function onlyTwosAndFives(denominator: bigint): boolean {
  let remaining = denominator;
  for (const prime of [2n, 5n]) {
    while (remaining % prime === 0n) remaining /= prime;
  }
  return remaining === 1n;
}

//#endregion
//#endregion
