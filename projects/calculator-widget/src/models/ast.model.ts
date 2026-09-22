import { Nominal } from './nominal';
import { ConstantSymbol } from './constants.model';

//#region Nodes

// 1. Nodes are immutable plain JSON-serializable data objects
// 2. Nodes contain information about notation (except for the composite fraction)
// 3. GroupNode represents user-typed parentheses; precedence-driven parentheses are inserted by renderers
// 4. NumberNode represents integers *and* decimals, such that half-typed nodes can be represented
// 5. Every node carries a stable node ID, such that MathML interaction events can be traced back to the tree

export type NodeId = Nominal<string, 'NodeId'>;

export type NodeType =
  | 'hole' // missing input yet to be typed
  | 'number' // integral/decimal number
  | 'constant' // irrational symbol like Pi
  | 'group' // parentheses grouping subtrees
  | 'negate' // unary negation
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'composite' // integral plus fraction
  | 'pow' // exponential
  | 'root'; // square/n-th root

interface NodeBase<N extends NodeType> {
  readonly type: N;
  readonly id: NodeId;
}

export interface HoleNode extends NodeBase<'hole'> {
  readonly label?: string; // optional hole description, e.g. "numerator"
}

export interface NumberNode extends NodeBase<'number'> {
  readonly integerDigits: string;
  readonly fractionDigits: string;
  readonly hasDecimalPoint: boolean;
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

export type NodeOfType<T extends NodeType> = Extract<FormulaNode, { readonly type: T }>;

//#endregion
//#region Slots

type NodeFieldName<T extends NodeType> = keyof NodeOfType<T>;
type NodeFieldNames<T extends NodeType> = ReadonlyArray<NodeFieldName<T>>;

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
} as const satisfies Record<NodeType, ReadonlyArray<string>>;

// infer slot-type from declared slots
export type FormulaSlotOf<T extends NodeType> = (typeof SLOTS)[T][number];
export type FormulaSlot = FormulaSlotOf<NodeType>;

// a position in the tree -> derived from a chain of slots leading to it
export type FormulaNodePath = ReadonlyArray<FormulaSlot>;

//#endregion
//#region Precedence

// higher precedence -> more tightly binding
export enum Precedence {
  Additive = 1,
  Unary = 2,
  Multiplicative = 3,
  Exponential = 4,
  Atom = 5,
}

// union of precedence values
export type PrecedenceLevel = `${Precedence}` extends `${infer R extends number}` ? R : never;

/** How tightly a node binds when written inline */
export function precedenceOf(node: FormulaNode): PrecedenceLevel {
  switch (node.type) {
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
  switch (node.type) {
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

  switch (node.type) {
    case 'add':
    case 'subtract':
      return slot === 'left' ? Precedence.Additive : Precedence.Unary;
    case 'multiply':
      return slot === 'left' ? Precedence.Multiplicative : Precedence.Exponential;
    case 'divide':
      return slot === 'dividend' ? Precedence.Multiplicative : Precedence.Exponential;
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
  if (child.type === 'group') return false; // group has its own parentheses
  return precedenceOf(child) < requiredPrecedence(parent, slot);
}

function invalidNode(node: never): never {
  console.error(`Invalid node type:`, node);
  throw new Error(`Invalid node type: ${JSON.stringify(node)}`);
}

//#endregion
