import { Nominal } from './typing';
import { ConstantSymbol } from './constants.model';

//#region Nodes

// DESIGN:
// 1. Nodes are immutable plain JSON-serializable data objects
// 2. Nodes contain information about notation (except for the composite fraction)
// 3. GroupNode represents user-typed parentheses; precedence-driven parentheses are inserted by renderers
// 4. NumberNode represents integers *and* decimals, such that half-typed nodes can be represented
// 5. Every node carries a stable node ID, such that MathML interaction events can be traced back to the tree

export type FormulaNodeId = Nominal<string, 'NodeId'>;

interface NodeBase<K extends string> {
  readonly kind: K;
  readonly id: FormulaNodeId;
}

export interface HoleNode extends NodeBase<'hole'> {
  readonly label?: string; // optional hole description, e.g. "numerator"
}

export interface NumberNode extends NodeBase<'number'> {
  readonly literal: string; // integer or decimal number
}

export interface ConstantNode extends NodeBase<'constant'> {
  readonly symbol: ConstantSymbol;
}

export type GroupFence = 'parentheses' | 'brackets' | 'braces'; // () | [] | {}, respectively

export interface GroupNode extends NodeBase<'group'> {
  readonly expression: FormulaNode;
  readonly fence: GroupFence;
}

export interface NegateNode extends NodeBase<'negate'> {
  readonly operand: FormulaNode;
}

export interface AddNode extends NodeBase<'add'> {
  readonly left: FormulaNode;
  readonly right: FormulaNode;
}

export interface SubtractNode extends NodeBase<'subtract'> {
  readonly left: FormulaNode;
  readonly right: FormulaNode;
}

export type MultiplyNotation = 'dot' | 'cross' | 'implicit';

export interface MultiplyNode extends NodeBase<'multiply'> {
  readonly left: FormulaNode;
  readonly right: FormulaNode;
  readonly notation: MultiplyNotation;
}

export type DivisionNotation = 'fraction' | 'solidus';

export interface DivideNode extends NodeBase<'divide'> {
  readonly dividend: FormulaNode;
  readonly divisor: FormulaNode;
  readonly notation: DivisionNotation;
}

export interface CompositeFractionNode extends NodeBase<'composite'> {
  readonly integerPart: FormulaNode;
  readonly numerator: FormulaNode;
  readonly denominator: FormulaNode;
}

export interface PowNode extends NodeBase<'pow'> {
  readonly base: FormulaNode;
  readonly exponent: FormulaNode;
}

export interface RootNode extends NodeBase<'root'> {
  readonly radicand: FormulaNode;
  readonly degree: null | FormulaNode; // null degree -> square root, otherwise n-th root
}

export type FormulaNode =
  | HoleNode
  | NumberNode
  | ConstantNode
  | GroupNode
  | NegateNode
  | AddNode
  | SubtractNode
  | MultiplyNode
  | DivideNode
  | CompositeFractionNode
  | PowNode
  | RootNode;

// Infer node -> node-kind
export type FormulaNodeKind = FormulaNode['kind'];

// Infer node-kind -> node
export type FormulaNodeOfKind<K extends FormulaNodeKind> = Extract<FormulaNode, { readonly kind: K }>;

//#endregion
//#region Slots

type NodeFieldName<K extends FormulaNodeKind> = keyof FormulaNodeOfKind<K>;
type NodeFieldNames<K extends FormulaNodeKind> = ReadonlyArray<NodeFieldName<K>>;

/**
 * Static table of node subtree slots available for each kind of node
 */
export const SLOTS = {
  hole: [],
  number: [],
  constant: [],
  group: ['expression'] satisfies NodeFieldNames<'group'>,
  negate: ['operand'] satisfies NodeFieldNames<'negate'>,
  add: ['left', 'right'] satisfies NodeFieldNames<'add'>,
  subtract: ['left', 'right'] satisfies NodeFieldNames<'subtract'>,
  multiply: ['left', 'right'] satisfies NodeFieldNames<'multiply'>,
  divide: ['dividend', 'divisor'] satisfies NodeFieldNames<'divide'>,
  composite: ['integerPart', 'numerator', 'denominator'] satisfies NodeFieldNames<'composite'>,
  pow: ['base', 'exponent'] satisfies NodeFieldNames<'pow'>,
  root: ['radicand', 'degree'] satisfies NodeFieldNames<'root'>,
} as const satisfies Record<FormulaNodeKind, ReadonlyArray<string>>;

// Infer union of slot-types from declared slots
export type FormulaSlotOf<K extends FormulaNodeKind> = (typeof SLOTS)[K][number];
export type FormulaSlot = FormulaSlotOf<FormulaNodeKind>;

// Position in the tree, derived from a chain of slots leading to it from root
export type FormulaNodePath = ReadonlyArray<FormulaSlot>;

//#endregion
//#region Precedence

// higher precedence -> more tightly binding
export enum Precedence {
  Additive = 1, // lowest precedence, least tightly binding
  Unary = 2,
  Multiplicative = 3,
  Exponential = 4,
  Atom = 5, // highest precedence, most tightly binding
}

// Union of precedence values
export type PrecedenceLevel = `${Precedence}` extends `${infer R extends number}` ? R : never;

/** How tightly a node binds when written inline */
export function precedenceOf(node: FormulaNode): PrecedenceLevel {
  switch (node.kind) {
    case 'number':
    case 'hole':
    case 'constant':
    case 'group':
    case 'root':
    case 'composite':
      return Precedence.Atom;
    case 'negate':
      return Precedence.Unary;
    case 'add':
    case 'subtract':
      return Precedence.Additive;
    case 'multiply':
      return Precedence.Multiplicative;
    case 'divide':
      return node.notation === 'fraction' ? Precedence.Atom : Precedence.Multiplicative;
    case 'pow':
      return Precedence.Exponential;
    default:
      return invalidNode(node);
  }
}

/** True when a slot is already determined by its parents' notation, so no parentheses are required inside of it */
export function isFencedSlot(node: FormulaNode, slot: FormulaSlot): boolean {
  switch (node.kind) {
    case 'group':
    case 'composite':
    case 'root':
      return true;
    case 'pow':
      return slot === ('exponent' satisfies NodeFieldName<'pow'>);
    case 'divide':
      return node.notation === 'fraction';
    case 'number':
    case 'hole':
    case 'constant':
    case 'negate':
    case 'add':
    case 'subtract':
    case 'multiply':
      return false;
    default:
      return invalidNode(node);
  }
}

/** Minimum precedence level a node must have to avoid being wrapped in parentheses */
export function requiredPrecedence(node: FormulaNode, slot: FormulaSlot): PrecedenceLevel {
  // trivial case: already fenced
  if (isFencedSlot(node, slot)) {
    return Precedence.Additive; // lowest precedence
  }

  switch (node.kind) {
    case 'add':
    case 'subtract':
      return slot === 'left' ? Precedence.Additive : Precedence.Unary;
    case 'multiply':
    case 'divide':
      return slot === 'left' || slot === 'dividend' ? Precedence.Multiplicative : Precedence.Exponential;
    case 'negate':
      return Precedence.Multiplicative;
    case 'pow':
      return Precedence.Atom; // right-associate, base *must* bind tighter, e.g. (a^b)^c
    case 'number':
    case 'hole':
    case 'constant':
    case 'group':
    case 'composite':
    case 'root':
      return Precedence.Additive;
    default:
      return invalidNode(node);
  }
}

export function needsParentheses(parent: FormulaNode, slot: FormulaSlot, child: FormulaNode): boolean {
  if (child.kind === 'group') return false; // group has its own parentheses
  return precedenceOf(child) < requiredPrecedence(parent, slot);
}

const DECIMAL = /[,.]/;

export function hasDecimalPoint(node: FormulaNode): boolean {
  return node.kind === 'number' && DECIMAL.test(node.literal);
}

function invalidNode(node: never): never {
  console.error(`Invalid node:`, node);
  throw new Error(`Invalid node: ${JSON.stringify(node)}`);
}

//#endregion
