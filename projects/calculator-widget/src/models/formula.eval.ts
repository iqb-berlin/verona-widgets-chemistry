import { FormulaNode } from './formula.ast';
import { NumericError, NumericErrorCode, NumericValue } from './numeric.model';
import { Rational } from './rational.model';
import { Irrational } from './irrational.model';
import { EnumLiteral, Result } from './types';
import { bigIsEven } from './utils';
import { EditTokenId } from './editing.ast';

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
