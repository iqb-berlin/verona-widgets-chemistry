import { FormulaNode } from './formula.ast';
import { NumericError, NumericErrorCode, NumericValue } from './numeric.model';
import { Rational } from './rational.model';
import { Irrational } from './irrational.model';
import { compositeFraction, decimal, fraction, int, negate } from './formula.factory';
import { EnumLiteral, Result } from './types';
import { bigIsEven } from './utils';
import { EditTokenId } from './editing.ast';

//#region Evaluation public API

export type FormulaEvalIssueCode = EnumLiteral<NumericErrorCode>;

export interface FormulaEvalIssue {
  readonly code: FormulaEvalIssueCode;
  readonly detail: string;
  readonly sourceTokenId: null | EditTokenId;
}

export type FormulaEvalResult = Result<NumericValue, FormulaEvalIssue>;

export class FormulaEvalError extends Error {
  constructor(readonly issue: FormulaEvalIssue) {
    super(`${issue.code}: ${issue.detail}`);
    this.name = 'FormulaEvalError';
  }
}

export interface FormulaFormatOutput {
  /** The value which was formatted */
  readonly value: NumericValue;
  /** The result as a tree: a fraction for a rational number, a decimal for an irrational one */
  readonly formula: FormulaNode;
  /** A rounded decimal, for the display line */
  readonly decimal: string;
  /** True when the result tree says no more than the decimal line, so showing both is redundant */
  readonly isExactlyDecimal: boolean;
}

const DEFAULT_DIGITS = 12;

export function evaluateFormula(node: FormulaNode): FormulaEvalResult {
  try {
    return Result.ok(evaluateNode(node));
  } catch (error: unknown) {
    if (error instanceof FormulaEvalError) return Result.issue(error.issue);
    if (error instanceof NumericError) return Result.issue(numericErrorIssue(error));
    console.error('Unexpected evaluate formula', node, 'error:', error);
    throw error;
  }
}

export function evaluateFormulaToNumber(node: FormulaNode): null | number {
  const result = evaluateFormula(node);
  return result.ok ? result.value.valueOf() : null;
}

export function evaluateFormulaToDecimalString(node: FormulaNode, digits = DEFAULT_DIGITS): null | string {
  const result = evaluateFormula(node);
  return result.ok ? result.value.toDecimalString(digits, true) : null;
}

export interface FormatToFormulaOptions {
  /** Write a rational number greater than one as a mixed fraction */
  readonly preferMixedFractions?: boolean;
  /** Write every number as a decimal, even a rational one */
  readonly preferDecimal?: boolean;
  /** Decimal places a decimal number is rounded to */
  readonly digits?: number;
}

/**
 * The value as a formula tree: a rational number as a fraction — which is exact — and an
 * irrational number as the decimal it is rounded to, as it has no exact form to write.
 */
export function numericToFormula(value: NumericValue, options: FormatToFormulaOptions = {}): FormulaNode {
  const rational = value.asRational();
  if (rational !== null && options.preferDecimal !== true) return rationalToFormula(rational, options);
  return decimalToFormula(value, options.digits ?? DEFAULT_DIGITS);
}

/**
 * Packages a value the way a calculator display wants it:
 * a result line and an approximate line, with a flag for whether showing both is redundant.
 */
export function numericToFormulaOutput(value: NumericValue, options: FormatToFormulaOptions = {}): FormulaFormatOutput {
  const digits = options.digits ?? DEFAULT_DIGITS;
  const decimalText = value.toDecimalString(digits, true);

  return {
    value,
    formula: numericToFormula(value, { ...options, digits }),
    decimal: decimalText,
    isExactlyDecimal: saysTheSame(value, decimalText, options),
  };
}

//#endregion
//#region Evaluation internals

function fail(code: FormulaEvalIssueCode, sourceTokenId: null | EditTokenId, message?: unknown): never {
  const detail =
    message === undefined
      ? ''
      : typeof message === 'string'
        ? message
        : message instanceof Error
          ? message.message
          : JSON.stringify(message);

  throw new FormulaEvalError({ code, detail, sourceTokenId });
}

function numericErrorIssue(error: NumericError): FormulaEvalIssue {
  return { code: error.code, detail: error.message, sourceTokenId: null };
}

function evaluateNode(node: FormulaNode): NumericValue {
  switch (node.kind) {
    case 'literal':
      if (node.literal.length === 0) return fail('syntaxError', node.sourceTokenId, 'Leere Zahl');
      return Rational.parse(node.literal);
    case 'constant':
      return Irrational.fromConstant(node.symbol);
    case 'unary': {
      const operand = evaluateNode(node.operand);
      switch (node.operator) {
        case 'negate':
          return operand.negate();
        default:
          return fail('syntaxError', null, node satisfies never);
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
          if (right.isZero) return fail('divisionByZero', node.right.sourceTokenId);
          return left.divide(right);
        default:
          return fail('syntaxError', null, node satisfies never);
      }
    }
    case 'fraction': {
      const dividend = evaluateNode(node.dividend);
      const divisor = evaluateNode(node.divisor);
      if (divisor.isZero) return fail('divisionByZero', node.divisor.sourceTokenId);
      return dividend.divide(divisor);
    }
    case 'composite': {
      const integerPart = evaluateNode(node.integerPart);
      const numerator = evaluateNode(node.numerator);
      const denominator = evaluateNode(node.denominator);
      if (denominator.isZero) return fail('divisionByZero', node.denominator.sourceTokenId);
      const fractionalPart = numerator.divide(denominator);
      return integerPart.isNegative ? integerPart.subtract(fractionalPart) : integerPart.add(fractionalPart);
    }
    case 'exponential': {
      const base = evaluateNode(node.base);
      const exponent = evaluateNode(node.exponent);
      if (!exponent.isRational()) {
        return fail('unsupported', node.exponent.sourceTokenId, 'Exponent muss eine rationale Zahl sein');
      }
      if (base.isZero && exponent.isZero) {
        return fail('indeterminate', node.sourceTokenId, 'Null hoch null ist unbestimmt');
      }
      if (base.isZero && exponent.isNegative) {
        return fail('divisionByZero', node.exponent.sourceTokenId, 'Null hoch negativer Zahl ist unbestimmt');
      }
      return base.power(exponent);
    }
    case 'root': {
      const degree = evaluateNode(node.degree);
      const radicand = evaluateNode(node.radicand);
      if (!degree.isRational()) {
        return fail('unsupported', node.degree.sourceTokenId, 'Wurzelgrad muss eine rationale Zahl sein');
      }
      if (degree.isZero) return fail('divisionByZero', node.degree.sourceTokenId, 'Wurzel vom Grad Null');
      if (radicand.isNegative && degree.isInteger && bigIsEven(degree.numerator)) {
        return fail('complexResult', node.sourceTokenId, 'Gerade Wurzel einer negativen Zahl ist komplex');
      }
      return radicand.root(degree);
    }
    default:
      console.error(`Invalid node:`, node satisfies never);
      throw new Error(`Invalid node: ${JSON.stringify(node)}`);
  }
}

//#endregion
//#region Formatting internals

function rationalToFormula(value: Rational, options: FormatToFormulaOptions): FormulaNode {
  const magnitude = value.absolute();
  let node: FormulaNode;

  if (magnitude.isInteger) {
    node = int(magnitude.numerator);
  } else if (options.preferMixedFractions && magnitude.compareTo(Rational.ONE) > 0) {
    const whole = magnitude.floor();
    const remainder = magnitude.numerator - whole * magnitude.denominator;
    node = compositeFraction(int(whole), int(remainder), int(magnitude.denominator));
  } else {
    node = fraction(int(magnitude.numerator), int(magnitude.denominator));
  }

  return value.isNegative ? negate(node) : node;
}

function decimalToFormula(value: NumericValue, digits: number): FormulaNode {
  const magnitude = decimal(value.absolute().toDecimalString(digits, true));
  return value.isNegative ? negate(magnitude) : magnitude;
}

// True when the rounded decimal holds the whole value, so that an exact line adds nothing
function saysTheSame(value: NumericValue, decimalText: string, options: FormatToFormulaOptions): boolean {
  if (options.preferDecimal === true) return true;
  const rational = value.asRational();
  if (rational === null) return true; // an irrational number has no exact form to compare against
  return Rational.parse(decimalText).equalTo(rational);
}

//#endregion
