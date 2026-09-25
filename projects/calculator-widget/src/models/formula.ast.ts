import { BinaryOperator, UnaryOperator } from './types';
import { ConstantSymbol } from './constants.model';

//#region Formula Nodes

export type FormulaNode =
  | FormulaNode.Literal
  | FormulaNode.Constant
  | FormulaNode.Unary
  | FormulaNode.Binary
  | FormulaNode.TrueFraction
  | FormulaNode.CompositeFraction
  | FormulaNode.Exponent
  | FormulaNode.Root;

export namespace FormulaNode {
  interface Base<K extends string> {
    readonly kind: K;
  }

  export interface Literal extends Base<'literal'> {
    readonly literal: string; // integer or decimal number
  }

  export interface Constant extends Base<'constant'> {
    readonly symbol: ConstantSymbol;
  }

  export interface Unary extends Base<'unary'> {
    readonly operator: UnaryOperator;
    readonly operand: FormulaNode;
  }

  export interface Binary extends Base<'binary'> {
    readonly operator: BinaryOperator;
    readonly left: FormulaNode;
    readonly right: FormulaNode;
  }

  export interface TrueFraction extends Base<'fraction'> {
    readonly dividend: FormulaNode;
    readonly divisor: FormulaNode;
  }

  export interface CompositeFraction extends Base<'composite'> {
    readonly integerPart: FormulaNode;
    readonly numerator: FormulaNode;
    readonly denominator: FormulaNode;
  }

  export interface Exponent extends Base<'exponential'> {
    readonly base: FormulaNode;
    readonly exponent: FormulaNode;
  }

  export interface Root extends Base<'root'> {
    readonly radicand: FormulaNode;
    readonly degree: FormulaNode;
  }

  // Infer node -> node-kind
  export type Kind = FormulaNode['kind'];

  // Infer node-kind -> node
  export type OfKind<K extends Kind> = Extract<FormulaNode, { readonly kind: K }>;

  export function hasDecimalPoint(node: FormulaNode): boolean {
    return node.kind === 'literal' && node.literal.includes('.');
  }

  export function asLispString(node: FormulaNode): string {
    switch (node.kind) {
      case 'literal':
        return node.literal;
      case 'constant':
        return node.symbol;
      case 'unary':
        return `(${node.operator} ${asLispString(node.operand)})`;
      case 'binary':
        return `(${node.operator} ${asLispString(node.left)} ${asLispString(node.right)})`;
      case 'fraction':
        return `(frac ${asLispString(node.dividend)} ${asLispString(node.divisor)})`;
      case 'composite':
        return `(composite ${asLispString(node.integerPart)} ${asLispString(node.numerator)}) ${asLispString(node.denominator)})`;
      case 'exponential':
        return `(pow ${asLispString(node.base)} ${asLispString(node.exponent)})`;
      case 'root':
        return `(root ${asLispString(node.degree)} ${asLispString(node.radicand)})`;
    }
  }
}
