import * as AST from './ast.model';
import { hasDecimalPoint } from './ast.model';
import * as C from './constants.model';

//#region NodeId Generator

export type NodeIdGenerator = () => AST.FormulaNodeId;

let nodeIdCounter = 1;
let nodeIdGenerator: NodeIdGenerator = () => {
  const id = nodeIdCounter++;
  return ('N:' + id.toString(36)) as AST.FormulaNodeId;
};

export function resetNodeIdGenerator(counter: number = 0) {
  nodeIdCounter = counter;
}

export function replaceNodeIdGenerator(replacement: NodeIdGenerator) {
  nodeIdGenerator = replacement;
}

export function generateNodeId(): AST.FormulaNodeId {
  return nodeIdGenerator();
}

//#endregion
//#region Node factory functions

const DECIMAL_PATTERN = /^\d*[,.]?\d*$/;
const DECIMAL_POINT = /[,.]/;

export function decimal(value: string | number | bigint, id = generateNodeId()): AST.NumberNode {
  const literal = typeof value === 'string' ? value.trim() : value.toString(10);
  if (!DECIMAL_PATTERN.test(literal)) throw new SyntaxError(`Not a decimal number: ${literal}`);
  return {
    id,
    kind: 'number',
    literal: literal.replace(DECIMAL_POINT, '.'), // normalize decimal point character to '.'
  };
}

export function int(value: string | number | bigint, id = generateNodeId()): AST.NumberNode {
  const node = decimal(value, id);
  if (hasDecimalPoint(node)) throw new SyntaxError(`Not an integer number: ${value}`);
  return node;
}

export function constant(symbol: C.ConstantSymbol, id = generateNodeId()): AST.ConstantNode {
  return { id, kind: 'constant', symbol };
}

export const pi = (id = generateNodeId()) => constant(C.ConstantSymbol.Pi, id);

export function hole(label?: undefined | string, id = generateNodeId()): AST.HoleNode {
  return label ? { id, kind: 'hole', label } : { id, kind: 'hole' };
}

export function group(
  expression: AST.FormulaNode,
  fence: AST.GroupFence = 'parentheses',
  id = generateNodeId(),
): AST.GroupNode {
  return { id, kind: 'group', expression, fence };
}

export function negate(operand: AST.FormulaNode, id = generateNodeId()): AST.NegateNode {
  return { id, kind: 'negate', operand };
}

export function add(left: AST.FormulaNode, right: AST.FormulaNode, id = generateNodeId()): AST.AddNode {
  return { id, kind: 'add', left, right };
}

export function subtract(left: AST.FormulaNode, right: AST.FormulaNode, id = generateNodeId()): AST.SubtractNode {
  return { id, kind: 'subtract', left, right };
}

export function multiply(
  left: AST.FormulaNode,
  right: AST.FormulaNode,
  notation: AST.MultiplyNotation = 'dot',
  id = generateNodeId(),
): AST.MultiplyNode {
  return { id, kind: 'multiply', left, right, notation };
}

export function divide(
  dividend: AST.FormulaNode,
  divisor: AST.FormulaNode,
  notation: AST.DivisionNotation = 'fraction',
  id = generateNodeId(),
): AST.DivideNode {
  return { id, kind: 'divide', dividend, divisor, notation };
}

export function fraction(dividend: AST.FormulaNode, divisor: AST.FormulaNode, id = generateNodeId()): AST.DivideNode {
  return divide(dividend, divisor, 'fraction', id);
}

export function compositeFraction(
  integerPart: AST.FormulaNode,
  numerator: AST.FormulaNode,
  denominator: AST.FormulaNode,
  id = generateNodeId(),
): AST.CompositeFractionNode {
  return { id, kind: 'composite', integerPart, numerator, denominator };
}

export function pow(base: AST.FormulaNode, exponent: AST.FormulaNode, id = generateNodeId()): AST.PowNode {
  return { id, kind: 'pow', base, exponent };
}

export function square(base: AST.FormulaNode, id = generateNodeId(), exponentId = generateNodeId()): AST.PowNode {
  return pow(base, int(2, exponentId), id);
}

export function root(
  radicand: AST.FormulaNode,
  degree: null | AST.FormulaNode = null,
  id = generateNodeId(),
): AST.RootNode {
  return { id, kind: 'root', radicand, degree };
}

export function sqrt(radicant: AST.FormulaNode, id = generateNodeId()): AST.RootNode {
  return root(radicant, null, id);
}

export function blank(id = generateNodeId()) {
  return hole(undefined, id);
}

//#endregion
