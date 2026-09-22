import * as AST from './ast.model';
import * as C from './constants.model';

//#region NodeId Generator

export type NodeIdGenerator = () => AST.NodeId;

let nodeIdCounter = 1;
let nodeIdGenerator: NodeIdGenerator = () => {
  const id = nodeIdCounter++;
  return ('N:' + id.toString(36)) as AST.NodeId;
};

export function resetNodeIdGenerator(counter: number = 0) {
  nodeIdCounter = counter;
}

export function replaceNodeIdGenerator(replacement: NodeIdGenerator) {
  nodeIdGenerator = replacement;
}

export function generateNodeId(): AST.NodeId {
  return nodeIdGenerator();
}

//#endregion
//#region Node factory functions

const DECIMAL_PATTERN = /^(?<integerDigits>\d*)(?:[.,](?<fractionDigits>\d*))?$/;

export function decimal(literal: string | number | bigint, id = generateNodeId()): AST.NumberNode {
  const text = typeof literal === 'string' ? literal.trim() : literal.toString(10);
  const match = text.match(DECIMAL_PATTERN);
  if (match === null) throw new SyntaxError(`Not a decimal number: ${text}`);
  const { fractionDigits = '', integerDigits = '' } = match.groups ?? {};
  const hasDecimalPoint = text.includes('.') || text.includes(',');
  return {
    id,
    type: 'number',
    integerDigits,
    fractionDigits,
    hasDecimalPoint,
  };
}

export function int(value: string | number | bigint, id = generateNodeId()): AST.NumberNode {
  const node = decimal(value);
  if (!node.hasDecimalPoint && node.fractionDigits.length === 0) return node;
  else throw new SyntaxError(`Not an integer number: ${value}`);
}

export function constant(symbol: C.ConstantSymbol, id = generateNodeId()): AST.ConstantNode {
  return { id, type: 'constant', symbol };
}

export const pi = (id = generateNodeId()) => constant(C.ConstantSymbol.Pi, id);

export function hole(label?: undefined | string, id = generateNodeId()): AST.HoleNode {
  return label ? { id, type: 'hole', label } : { id, type: 'hole' };
}

export function group(
  expression: AST.FormulaNode,
  fence: AST.GroupFence = 'parentheses',
  id = generateNodeId(),
): AST.GroupNode {
  return { id, type: 'group', expression, fence };
}

export function negate(operand: AST.FormulaNode, id = generateNodeId()): AST.NegateNode {
  return { id, type: 'negate', operand };
}

export function add(left: AST.FormulaNode, right: AST.FormulaNode, id = generateNodeId()): AST.AddNode {
  return { id, type: 'add', left, right };
}

export function subtract(left: AST.FormulaNode, right: AST.FormulaNode, id = generateNodeId()): AST.SubtractNode {
  return { id, type: 'subtract', left, right };
}

export function multiply(
  left: AST.FormulaNode,
  right: AST.FormulaNode,
  notation: AST.MultiplyNotation = 'dot',
  id = generateNodeId(),
): AST.MultiplyNode {
  return { id, type: 'multiply', left, right, notation };
}

export function divide(
  dividend: AST.FormulaNode,
  divisor: AST.FormulaNode,
  notation: AST.DivisionNotation = 'fraction',
  id = generateNodeId(),
): AST.DivideNode {
  return { id, type: 'divide', dividend, divisor, notation };
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
  return { id, type: 'composite', integerPart, numerator, denominator };
}

export function pow(base: AST.FormulaNode, exponent: AST.FormulaNode, id = generateNodeId()): AST.PowNode {
  return { id, type: 'pow', base, exponent };
}

export function square(base: AST.FormulaNode, id = generateNodeId(), exponentId = generateNodeId()): AST.PowNode {
  return pow(base, int(2, exponentId), id);
}

export function root(
  radicand: AST.FormulaNode,
  degree: null | AST.FormulaNode = null,
  id = generateNodeId(),
): AST.RootNode {
  return { id, type: 'root', radicand, degree };
}

export function sqrt(radicant: AST.FormulaNode, id = generateNodeId()): AST.RootNode {
  return root(radicant, null, id);
}

export function blank(id = generateNodeId()) {
  return hole(undefined, id);
}

//#endregion
