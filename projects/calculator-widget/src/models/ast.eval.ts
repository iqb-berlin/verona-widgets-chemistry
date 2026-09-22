import * as E from './exact.model';
import * as R from './rational.model';
import * as AST from './ast.model';
import * as F from './ast.factory';
import * as U from './utils';

//#region Types

export type FormulaEvalIssueCode = `${E.ExactErrorType}` | `${R.RationalErrorType}` | 'incomplete';

export interface FormulaEvalIssue {
  readonly code: FormulaEvalIssueCode;
  readonly nodeId: AST.NodeId;
  readonly message: string;
}

export type FormulaEvalResult =
  | {
      readonly ok: true;
      readonly value: E.ExactValue;
    }
  | {
      readonly ok: false;
      readonly issue: FormulaEvalIssue;
    };

export class FormulaEvalError extends Error {
  constructor(readonly issue: FormulaEvalIssue) {
    super(`FormulaEval: ${issue.message}`);
    this.name = 'EvalError';
  }
}

export interface FormattedResult {
  /** The formatted value */
  readonly value: E.ExactValue;
  /** The exact result as a tree, ready for MathML or LaTeX. */
  readonly exact: AST.FormulaNode;
  /** A rounded decimal, for the secondary display line. */
  readonly decimal: string;
  /** True when the exact form is just a decimal already. */
  readonly isExactlyDecimal: boolean;
}

//#endregion
//#region Evaluation public API

export function evaluateFormula(node: AST.FormulaNode): FormulaEvalResult {
  try {
    const result = evaluateNode(node);
    return { ok: true, value: result };
  } catch (error: unknown) {
    if (error instanceof FormulaEvalError) return { ok: false, issue: error.issue };
    if (error instanceof R.RationalError) return { ok: false, issue: errorIssue(error, node) };
    if (error instanceof E.ExactError) return { ok: false, issue: errorIssue(error, node) };
    console.error('Unexpected evaluate formula', node, 'error:', error);
    throw error;
  }
}

export function lispFormula(node: AST.FormulaNode): string {
  switch (node.type) {
    case 'number':
      return node.hasDecimalPoint ? node.integerDigits + '.' + node.fractionDigits : node.integerDigits;
    case 'hole':
      return `_`;
    case 'constant':
      return node.symbol;
    case 'group':
      return `(eval ${lispFormula(node.expression)})`;
    case 'negate':
      return `(- ${lispFormula(node.operand)})`;
    case 'add':
      return `(+ ${lispFormula(node.left)} ${lispFormula(node.right)})`;
    case 'subtract':
      return `(- ${lispFormula(node.left)} ${lispFormula(node.right)})`;
    case 'multiply':
      return `(* ${lispFormula(node.left)} ${lispFormula(node.right)})`;
    case 'divide':
      return `(/ ${lispFormula(node.divisor)} ${lispFormula(node.dividend)})`;
    case 'composite':
      return `(+ ${lispFormula(node.integerPart)} (/ ${lispFormula(node.numerator)} ${node.denominator}))`;
    case 'pow':
      return `(** ${lispFormula(node.base)} ${lispFormula(node.exponent)})`;
    case 'root':
      return `(root ${node.degree ? lispFormula(node.degree) : 2} ${lispFormula(node.radicand)})`;
  }
}

export function evaluateToNumber(node: AST.FormulaNode): null | number {
  const result = evaluateFormula(node);
  return result.ok ? result.value.valueOf() : null;
}

export function evaluateToDecimalString(node: AST.FormulaNode, digits = 12): null | string {
  const result = evaluateFormula(node);
  return result.ok ? result.value.toDecimalString(digits, true) : null;
}

export interface ExactToFormulaOptions {
  readonly preferMixedFractions?: boolean;
  readonly divisionNotation?: AST.DivisionNotation;
}

export function exactToFormula(value: E.ExactValue, options: ExactToFormulaOptions = {}): AST.FormulaNode {
  const rational = value.asRational();
  if (rational !== null) return reverseRationalToFormula(rational, options);

  const numerator = reversePolynomialToFormula(value.numerator, options);
  if (E.ExactValue.isOnePolynomial(value.denominator)) return numerator;

  const denominator = reversePolynomialToFormula(value.denominator, options);
  return F.divide(numerator, denominator, options.divisionNotation ?? 'fraction');
}

export interface ExactToFormulaResultOptions extends ExactToFormulaOptions {
  readonly digits?: number;
}

/**
 * Packages a value the way a calculator display wants it:
 * An exact line and an approximate line, with a flag for whether showing both is redundant.
 */
export function exactToFormulaResult(value: E.ExactValue, options: ExactToFormulaResultOptions = {}): FormattedResult {
  const digits = options.digits ?? 12;
  const rational = value.asRational();
  const isExactlyDecimal = rational !== null && onlyTwosAndFives(rational.denominator);

  return {
    value,
    exact: exactToFormula(value, options),
    decimal: value.toDecimalString(digits, true),
    isExactlyDecimal,
  };
}

//#endregion
//#region Evaluate formula node to exact value

function fail(code: FormulaEvalIssueCode, nodeId: AST.NodeId, message: string): never {
  throw new FormulaEvalError({ code, nodeId, message });
}

function errorIssue(error: R.RationalError | E.ExactError, node: AST.FormulaNode): FormulaEvalIssue {
  return { code: error.type, message: error.message, nodeId: node.id };
}

function scope<T>(nodeId: AST.NodeId, block: () => T): T {
  try {
    return block();
  } catch (error: unknown) {
    if (error instanceof R.RationalError) return fail(error.type, nodeId, error.message);
    if (error instanceof E.ExactError) return fail(error.type, nodeId, error.message);
    throw error;
  }
}

function evaluateNode(node: AST.FormulaNode): E.ExactValue {
  switch (node.type) {
    case 'hole':
      return fail('incomplete', node.id, 'Input required');

    case 'number':
      return scope(node.id, () => {
        if (node.integerDigits.length === 0 && node.fractionDigits.length === 0) {
          return fail('incomplete', node.id, 'Empty number');
        } else {
          const { integerDigits, fractionDigits } = node;
          return E.ExactValue.fromRational(R.Rational.fromDigits(integerDigits, fractionDigits, false));
        }
      });

    case 'constant':
      return E.ExactValue.fromConstant(node.symbol);

    case 'group':
      return evaluateNode(node.expression);

    case 'negate':
      return evaluateNode(node.operand).negate();

    case 'add':
      return scope(node.id, () => {
        const left = evaluateNode(node.left);
        const right = evaluateNode(node.right);
        return left.add(right);
      });

    case 'subtract':
      return scope(node.id, () => {
        const left = evaluateNode(node.left);
        const right = evaluateNode(node.right);
        return left.subtract(right);
      });

    case 'multiply':
      return scope(node.id, () => {
        const left = evaluateNode(node.left);
        const right = evaluateNode(node.right);
        return left.multiply(right);
      });

    case 'divide': {
      const dividend = evaluateNode(node.dividend);
      const divisor = evaluateNode(node.divisor);
      if (divisor.isZero) return fail('divisionByZero', node.divisor.id, 'Division by zero');
      return scope(node.id, () => dividend.divide(divisor));
    }

    case 'composite': {
      const integerPart = evaluateNode(node.integerPart);
      const numerator = evaluateNode(node.numerator);
      const denominator = evaluateNode(node.denominator);
      if (denominator.isZero) return fail('divisionByZero', node.denominator.id, 'Division by zero');
      const fractionalPart = scope(node.id, () => numerator.divide(denominator));
      return scope(node.id, () => {
        return integerPart.isNegative ? integerPart.subtract(fractionalPart) : integerPart.add(fractionalPart);
      });
    }

    case 'pow': {
      const base = evaluateNode(node.base);
      const exponent = evaluateNode(node.exponent);
      const rationalExponent = exponent.asRational();
      if (rationalExponent === null) return fail('unsupported', node.exponent.id, 'Exponent must be a rational number');
      if (base.isZero && rationalExponent.sign() <= 0) {
        const zeroExponent = rationalExponent.isZero;
        if (zeroExponent) return fail('indeterminate', node.id, 'Zero to the power of zero');
        return fail('divisionByZero', node.id, 'Zero raised to a negative power');
      }
      return scope(node.id, () => base.rationalPow(rationalExponent));
    }

    case 'root': {
      const radicant = evaluateNode(node.radicand);
      const degree = node.degree === null ? R.Rational.TWO : evaluateNode(node.degree).asRational();
      if (degree === null) return fail('unsupported', node.degree!.id, 'Root degree must be a rational number');
      if (radicant.isNegative && degree.isInteger && U.bigIsEven(degree.numerator)) {
        return fail('complexResult', node.radicand.id, 'Even root of a negative number');
      }
      return scope(node.id, () => radicant.rationalRoot(degree));
    }

    default:
      console.error(`Invalid node type:`, node satisfies never);
      throw new Error(`Invalid node: ${JSON.stringify(node)}`);
  }
}

//#endregion
//#region Evaluate exact value back to formula node

function reverseRationalToFormula(value: R.Rational, options: ExactToFormulaOptions): AST.FormulaNode {
  const magnitude = value.absolute();
  let node: AST.FormulaNode;

  if (magnitude.isInteger) {
    node = F.int(magnitude.numerator);
  } else if (options.preferMixedFractions && magnitude.compareTo(R.Rational.ONE) > 0) {
    const whole = magnitude.floor();
    const remainder = magnitude.subtract(R.Rational.of(whole));
    node = F.compositeFraction(F.int(whole), F.int(remainder.numerator), F.int(remainder.denominator));
  } else {
    const { divisionNotation = 'fraction' } = options;
    node = F.divide(F.int(magnitude.numerator), F.int(magnitude.denominator), divisionNotation);
  }

  return value.isNegative ? F.negate(node) : node;
}

function reversePolynomialToFormula(poly: E.Polynomial, options: ExactToFormulaOptions): AST.FormulaNode {
  if (poly.length === 0) {
    return F.int(0);
  }

  let result: AST.FormulaNode | null = null;
  for (const term of poly) {
    const negative = term.coefficient.isNegative;
    const monomial: E.Monomial = { coefficient: term.coefficient.absolute(), factors: term.factors };
    const magnitude = reverseMonomialToFormula(monomial, options);
    if (result === null) {
      result = negative ? F.negate(magnitude) : magnitude;
    } else {
      result = negative ? F.subtract(result, magnitude) : F.add(result, magnitude);
    }
  }
  return result!;
}

function reverseMonomialToFormula(term: E.Monomial, options: ExactToFormulaOptions): AST.FormulaNode {
  if (term.factors.length === 0) {
    return reverseRationalToFormula(term.coefficient, options);
  }

  const factors = term.factors.map((factor) => reverseFactorToFormula(factor, options));
  let product = factors.reduce((left, right) => F.multiply(left, right, 'dot'));
  if (term.coefficient.isOne) {
    return product;
  }

  // A rational coefficient in front of symbols reads best as a fraction of the whole product: `(2/3)*pi` becomes `2*pi / 3`
  const numerator = term.coefficient.numerator;
  const denominator = term.coefficient.denominator;
  if (numerator !== 1n) product = F.multiply(F.int(numerator), product, 'dot');
  if (denominator !== 1n) product = F.fraction(product, F.int(denominator));
  return product;
}

function reverseFactorToFormula(factor: E.Factor, options: ExactToFormulaOptions): AST.FormulaNode {
  const base =
    factor.base.kind === 'constant' ? F.constant(factor.base.symbol) : exactToFormula(factor.base.radicand, options);

  const exponent = factor.exponent;
  if (exponent.isOne) return base;
  if (exponent.isInteger) return F.pow(base, F.int(exponent.numerator));

  const degree = exponent.denominator;
  const radical = degree === 2n ? F.sqrt(base) : F.root(base, F.int(degree));
  return exponent.numerator === 1n ? radical : F.pow(radical, F.int(exponent.numerator));
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
