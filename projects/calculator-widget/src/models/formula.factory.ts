import { FormulaNode } from './formula.ast';
import { ConstantSymbol } from './constants.model';
import { BinaryOperator, UnaryOperator } from './types';
import { EditToken, EditTokenId } from './editing.ast';

//#region Formula source EditTokenId assignment

let sourceTokenId: null | EditTokenId = null;

export function tokenScope<T>(token: EditToken, block: () => T): T {
  const previousTokenId = sourceTokenId;
  sourceTokenId = token.id;
  try {
    return block();
  } finally {
    sourceTokenId = previousTokenId;
  }
}

//#endregion
//#region Formula factory functions

const DECIMAL_PATTERN = /^\d*[,.]?\d*$/;
const DECIMAL_POINT = /[,.]/;

export function decimal(value: string | number | bigint): FormulaNode.Literal {
  const literal = typeof value === 'string' ? value.trim() : value.toString(10);
  if (!DECIMAL_PATTERN.test(literal)) throw new SyntaxError(`Not a decimal number: ${literal}`);
  return {
    kind: 'literal',
    literal: literal.replace(DECIMAL_POINT, '.'), // normalize decimal point character to '.'
    sourceTokenId,
  };
}

export function int(value: string | number | bigint): FormulaNode.Literal {
  const node = decimal(value);
  if (FormulaNode.hasDecimalPoint(node)) throw new SyntaxError(`Not an integer number: ${value}`);
  return node;
}

export function constant(symbol: ConstantSymbol): FormulaNode.Constant {
  return { kind: 'constant', symbol, sourceTokenId };
}

export function pi(): FormulaNode.Constant {
  return constant(ConstantSymbol.Pi);
}

export function unary(operator: UnaryOperator, operand: FormulaNode): FormulaNode.Unary {
  return { kind: 'unary', operator, operand, sourceTokenId };
}

export function negate(operand: FormulaNode): FormulaNode.Unary {
  return unary('negate', operand);
}

export function binary(operator: BinaryOperator, left: FormulaNode, right: FormulaNode): FormulaNode.Binary {
  return { kind: 'binary', operator, left, right, sourceTokenId };
}

export function add(left: FormulaNode, right: FormulaNode): FormulaNode.Binary {
  return binary('add', left, right);
}

export function subtract(left: FormulaNode, right: FormulaNode): FormulaNode.Binary {
  return binary('subtract', left, right);
}

export function multiply(left: FormulaNode, right: FormulaNode): FormulaNode.Binary {
  return binary('multiply', left, right);
}

export function divide(left: FormulaNode, right: FormulaNode): FormulaNode.Binary {
  return binary('divide', left, right);
}

export function fraction(dividend: FormulaNode, divisor: FormulaNode): FormulaNode.TrueFraction {
  return { kind: 'fraction', dividend, divisor, sourceTokenId };
}

export function compositeFraction(
  integerPart: FormulaNode,
  numerator: FormulaNode,
  denominator: FormulaNode,
): FormulaNode.CompositeFraction {
  return { kind: 'composite', integerPart, numerator, denominator, sourceTokenId };
}

export function exponential(base: FormulaNode, exponent: FormulaNode): FormulaNode.Exponent {
  return { kind: 'exponential', base, exponent, sourceTokenId };
}

export function square(base: FormulaNode): FormulaNode.Exponent {
  return exponential(base, int(2));
}

export function root(radicand: FormulaNode, degree: FormulaNode): FormulaNode.Root {
  return { kind: 'root', radicand, degree, sourceTokenId };
}

export function sqrt(radicand: FormulaNode): FormulaNode.Root {
  return root(radicand, int(2));
}
