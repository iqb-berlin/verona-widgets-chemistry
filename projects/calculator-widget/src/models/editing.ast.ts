import { Nominal } from './types';
import { ConstantSymbol } from './constants.model';

// Unique ID of a token
export type EditTokenId = Nominal<string, 'EditTokenId'>;

// One token of a formula being edited, including a token containing a sequence of tokens
export type EditToken =
  | EditToken.Sequence
  | EditToken.Fence
  | EditToken.Literal
  | EditToken.Constant
  | EditToken.Operator
  | EditToken.Fraction
  | EditToken.Composite
  | EditToken.Exponent
  | EditToken.Root;

// One token containing a sequence of tokens
export type EditSequence = EditToken.Sequence;

export namespace EditToken {
  interface Base<K extends string> {
    readonly kind: K;
    readonly id: EditTokenId;
  }

  export interface Sequence extends Base<'sequence'> {
    readonly items: ReadonlyArray<EditToken>;
  }

  export interface Fence extends Base<'fence'> {
    readonly fence: '(' | ')';
  }

  export interface Literal extends Base<'literal'> {
    readonly literal: string;
  }

  export interface Constant extends Base<'constant'> {
    readonly symbol: ConstantSymbol;
  }

  export interface Operator extends Base<'operator'> {
    readonly operator: '+' | '-' | '*' | '/';
  }

  export interface Fraction extends Base<'fraction'> {
    readonly dividend: Sequence;
    readonly divisor: Sequence;
  }

  export interface Composite extends Base<'composite'> {
    readonly integerPart: Sequence;
    readonly numerator: Sequence;
    readonly denominator: Sequence;
  }

  export interface Exponent extends Base<'exponent'> {
    readonly base: Sequence;
    readonly exponent: Sequence;
  }

  export interface Root extends Base<'root'> {
    readonly degree: Sequence;
    readonly radicand: Sequence;
  }

  export type Kind = EditToken['kind'];
  export type OfKind<K> = Extract<EditToken, { readonly kind: K }>;

  export function asLispString(token: EditToken): string {
    switch (token.kind) {
      case 'sequence':
        return `[${token.items.map((item) => asLispString(item)).join(' ')}]`;
      case 'fence':
        return `"${token.fence}"`;
      case 'literal':
        return token.literal;
      case 'constant':
        return token.symbol;
      case 'operator':
        return token.operator;
      case 'fraction':
        return `(frac ${asLispString(token.dividend)} ${asLispString(token.divisor)})`;
      case 'composite':
        return `(comp ${asLispString(token.integerPart)} ${asLispString(token.numerator)} ${asLispString(token.denominator)})`;
      case 'exponent':
        return `(exp ${asLispString(token.base)} ${asLispString(token.exponent)})`;
      case 'root':
        return token.degree.items.length === 0
          ? `(sqrt ${asLispString(token.radicand)})`
          : `(root ${asLispString(token.degree)} ${asLispString(token.radicand)})`;
    }
  }
}

export const OPERATOR_SYMBOLS = {
  '+': '\u002B', // &plus;
  '-': '\u2212', // &minus;
  '/': '\u00F7', // &divide;
  '*': '\u00D7', // &times;
} as const satisfies Record<EditToken.Operator['operator'], string>;

type EditTokenKey<K extends EditToken.Kind> = keyof EditToken.OfKind<K>;
type EditTokenKeys<T extends EditToken.Kind> = ReadonlyArray<EditTokenKey<T>>;
type EditTokenSlotsDictionary = { readonly [K in EditToken.Kind]: EditTokenKeys<K> };

// Declare which token contains which named slots containing sub-sequences
// NOTE: A declared EditToken slot MUST refer to a field of type EditToken.Sequence
const SLOTS = {
  sequence: [],
  fence: [],
  literal: [],
  constant: [],
  operator: [],
  fraction: ['dividend', 'divisor'],
  composite: ['integerPart', 'numerator', 'denominator'],
  exponent: ['base', 'exponent'],
  root: ['degree', 'radicand'],
} as const satisfies EditTokenSlotsDictionary;

// Union of slot names available in EditTokens, which contain sub-sequences of tokens
export type EditSlot = EditSlot.SlotOf<EditToken.Kind>;

export namespace EditSlot {
  // Lookup the declared slots of a given kind of token
  export type SlotOf<T extends EditToken.Kind> = (typeof SLOTS)[T][number];

  // Treat a token as a container of sub-sequences
  export type Container = EditToken & Readonly<Record<EditSlot, EditSequence>>;

  export function get(token: EditToken, slot: EditSlot): null | EditSequence {
    const container = token as Container;
    const sequence = container[slot] ?? null;
    if (sequence === null) return null;
    if (!sequence.items) {
      const message = `Token "${token.id}" (${token.kind}) slot "${slot}" does not contain a sequence: Found ${sequence.kind} instead`;
      throw new Error(message);
    }
    return sequence;
  }

  // Get the assigned slots of a given token
  export function slotsOf(token: EditToken): ReadonlyArray<EditSlot> {
    return SLOTS[token.kind];
  }

  // Check if the given token is a leaf-token, i.e. it contains no sub-sequences
  export function isLeaf(token: EditToken): boolean {
    return slotsOf(token).length === 0;
  }
}

export type EditTokenColumn<K extends EditToken.Kind> = ReadonlyArray<EditSlot.SlotOf<K>>;
type EditTokenColumnsDictionary = { readonly [K in EditToken.Kind]: EditTokenColumn<K> };

// Declare which slots of a token are stacked vertically on screen, ordered top to bottom.
// Slots left out here are not reachable by vertical caret movement, only by horizontal movement.
const COLUMNS = {
  sequence: [],
  fence: [],
  literal: [],
  constant: [],
  operator: [],
  fraction: ['dividend', 'divisor'],
  composite: ['numerator', 'denominator'], // the integer part sits beside the fraction, not above it
  exponent: ['exponent', 'base'],
  root: ['degree', 'radicand'],
} as const satisfies EditTokenColumnsDictionary;

export namespace EditTokenColumn {
  // Slots of a token which are stacked vertically on screen, ordered top to bottom
  export function columnsOf(token: EditToken): ReadonlyArray<EditSlot> {
    return COLUMNS[token.kind];
  }
}
