import { ConstantSymbol } from './constants.model';
import { EditSequence, EditSlot, EditToken, EditTokenId } from './editing.ast';
import { EditCaret, EditDirection, EditTokenReplacement, EditTraversal } from './editing.traversal';
import { sequence, token } from './editing.factory';

export function dispatchEditCommand(tree: EditSequence, command: EditCommand): EditResult {
  const handler = COMMAND_DISPATCH[command.name] as EditCommandHandler<EditCommand>;
  return handler(tree, command);
}

export interface EditResult {
  readonly tree: EditSequence;
  readonly focusId: EditTokenId;
  readonly changed: boolean;
}

export type EditCommand =
  | EditCommand.Focus
  | EditCommand.Move
  | EditCommand.TypeInput
  | EditCommand.Backspace
  | EditCommand.ClearAll
  | EditCommand.ApplyExponent
  | EditCommand.ApplyRoot
  | EditCommand.ApplyFraction
  | EditCommand.ToggleNegate
  | EditCommand.ToggleComposite;

export namespace EditCommand {
  interface Base<N extends string> {
    readonly name: N;
    readonly targetId: EditTokenId;
  }

  export type MoveDirection = EditDirection;

  export type Input = Digit | Fence | Operator;
  export type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.';
  export type Fence = '(' | ')';
  export type Operator = '+' | '-' | '*' | '/';

  export interface Focus extends Base<'focus'> {}

  export interface Move extends Base<'move'> {
    readonly direction: MoveDirection;
  }

  export interface TypeInput extends Base<'typeInput'> {
    readonly input: Input | ConstantSymbol;
  }

  export interface Backspace extends Base<'backspace'> {}

  export interface ClearAll extends Base<'clearAll'> {}

  export interface ApplyExponent extends Base<'applyExponent'> {
    readonly square: boolean;
  }

  export interface ApplyRoot extends Base<'applyRoot'> {
    readonly sqrt: boolean;
  }

  export interface ApplyFraction extends Base<'applyFraction'> {
    readonly composite: boolean;
  }

  export interface ToggleNegate extends Base<'toggleNegate'> {}

  export interface ToggleComposite extends Base<'toggleComposite'> {}

  export type Name = EditCommand['name'];
  export type OfName<N extends Name> = Extract<EditCommand, { readonly name: N }>;
}

type EditCommandHandler<T extends EditCommand> = (tree: EditSequence, command: T) => EditResult;
type EditCommandDispatch = { readonly [N in EditCommand.Name]: EditCommandHandler<EditCommand.OfName<N>> };

// Dispatch table of edit command-handler functions
const COMMAND_DISPATCH: EditCommandDispatch = {
  focus,
  move,
  typeInput,
  backspace,
  clearAll,
  applyExponent,
  applyRoot,
  applyFraction,
  toggleNegate,
  toggleComposite,
} as const;

// Sequence of digits, optionally with one decimal point, as typed into a literal token
const DIGITS_PATTERN = /^\d+$/;
const ZERO_PATTERN = /^0+(\.0*)?$/;

// Configure if useless fences should be stripped out
const ENABLE_STRIP_FENCES = false

//#region Command handlers

function focus(tree: EditSequence, { targetId }: EditCommand.Focus): EditResult {
  const caret = EditTraversal.caretAt(tree, targetId); // normalizes IDs which are no longer in the tree
  return unchanged(tree, EditTraversal.caretFocusId(caret));
}

function move(tree: EditSequence, { targetId, direction }: EditCommand.Move): EditResult {
  const caret = EditTraversal.caretAt(tree, targetId);
  const moved = EditTraversal.moveCaret(caret, direction);
  return unchanged(tree, EditTraversal.caretFocusId(moved));
}

function typeInput(tree: EditSequence, { targetId, input }: EditCommand.TypeInput): EditResult {
  switch (input) {
    case '0':
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
    case '7':
    case '8':
    case '9':
    case '.':
      return appendDigit(tree, targetId, input);
    case '(':
    case ')':
      return appendToken(tree, targetId, token('fence', { fence: input }));
    case '+':
    case '-':
    case '*':
    case '/':
      return appendToken(tree, targetId, token('operator', { operator: input }));
    case ConstantSymbol.Pi:
    case ConstantSymbol.E:
    case ConstantSymbol.Tau:
    case ConstantSymbol.Phi:
      return appendToken(tree, targetId, token('constant', { symbol: input }));
    default:
      console.error('Unexpected input:', input satisfies never);
      return unchanged(tree, targetId);
  }
}

function backspace(tree: EditSequence, { targetId }: EditCommand.Backspace): EditResult {
  return backspaceAt(tree, EditTraversal.caretAt(tree, targetId));
}

function clearAll(tree: EditSequence): EditResult {
  if (tree.items.length === 0) return unchanged(tree, tree.id);
  const empty = sequence();
  return { tree: empty, focusId: empty.id, changed: true };
}

function applyExponent(tree: EditSequence, { targetId, square }: EditCommand.ApplyExponent): EditResult {
  const exponent = square ? sequence(literalToken(2n)) : sequence();
  return wrapOperand(tree, targetId, (base) => token('exponent', { base, exponent }));
}

function applyRoot(tree: EditSequence, { targetId, sqrt }: EditCommand.ApplyRoot): EditResult {
  const degree = sequence(); // an empty degree denotes the square root, which is written without an index
  return wrapOperand(
    tree,
    targetId,
    (radicand) => token('root', { degree, radicand }),
    (created, radicand) => {
      if (!sqrt) return degree.id; // the degree is the blank to fill in for an nth root
      return radicand.items.length === 0 ? radicand.id : created.id;
    },
  );
}

function applyFraction(tree: EditSequence, { targetId, composite }: EditCommand.ApplyFraction): EditResult {
  if (composite) {
    const numerator = sequence();
    const denominator = sequence();
    return wrapOperand(tree, targetId, (integerPart) => {
      return token('composite', { integerPart, numerator, denominator });
    });
  }
  const divisor = sequence();
  return wrapOperand(tree, targetId, (dividend) => token('fraction', { dividend, divisor }));
}

function toggleNegate(tree: EditSequence, { targetId }: EditCommand.ToggleNegate): EditResult {
  const caret = EditTraversal.caretAt(tree, targetId);
  const host = EditTraversal.caretSequence(caret);
  const operand = EditTraversal.operandBefore(host, caret.index);

  // without an operand the sign is toggled at the caret itself
  const start = operand?.start ?? caret.index;
  const keptFocusId = operand === null ? null : host.items[caret.index - 1].id;

  if (isSignAt(host, start - 1)) {
    if (keptFocusId === null) return removeTokenAt(tree, host, start - 1);
    return edited(EditTraversal.spliceSequence(tree, host.id, start - 1, 1), keptFocusId);
  }

  const sign = token('operator', { operator: '-' });
  const negated = EditTraversal.spliceSequence(tree, host.id, start, 0, [sign]);
  return edited(negated, keptFocusId ?? sign.id);
}

function toggleComposite(tree: EditSequence, { targetId }: EditCommand.ToggleComposite): EditResult {
  const caret = EditTraversal.caretAt(tree, targetId);
  const target = fractionAt(caret);
  if (target === null) return unchanged(tree, targetId);

  const replacement = target.kind === 'fraction' ? asCompositeToken(target) : asFractionToken(target);
  if (replacement === null) return unchanged(tree, targetId); // conversion would drop the integer part
  return changed(tree, target.id, focusInside(replacement), replacement);
}

//#endregion
//#region Editing operations

// Insert a token at the caret and continue editing inside it, if it has a blank slot
function appendToken(tree: EditSequence, targetId: EditTokenId, newToken: EditToken): EditResult {
  const caret = EditTraversal.caretAt(tree, targetId);
  const host = EditTraversal.caretSequence(caret);
  const inserted = EditTraversal.spliceSequence(tree, host.id, caret.index, 0, [newToken]);
  return edited(inserted, focusInside(newToken));
}

// Extend the literal in front of the caret, or start a new one
function appendDigit(tree: EditSequence, targetId: EditTokenId, input: EditCommand.Digit): EditResult {
  const caret = EditTraversal.caretAt(tree, targetId);
  const before = EditTraversal.caretBefore(caret);

  if (before !== null && before.kind === 'literal') {
    if (input === '.' && before.literal.includes('.')) return unchanged(tree, targetId); // only one point
    const literal = before.literal + input;
    return changed(tree, before.id, before.id, (existing) => ({ ...(existing as EditToken.Literal), literal }));
  }

  const literal = input === '.' ? '0.' : input; // a literal never starts with the decimal point
  return appendToken(tree, targetId, token('literal', { literal }));
}

/**
 * Wrap the operand in front of the caret into a newly created token, e.g. turning `1 + 23` into
 * `1 + 23²`. Without a preceding operand the new token is created with an empty operand slot, so
 * that editing continues inside it.
 */
function wrapOperand(
  tree: EditSequence,
  targetId: EditTokenId,
  create: (operand: EditSequence) => EditToken,
  focus: (created: EditToken, operand: EditSequence) => EditTokenId = focusInside,
): EditResult {
  const caret = EditTraversal.caretAt(tree, targetId);
  const host = EditTraversal.caretSequence(caret);
  const span = EditTraversal.operandBefore(host, caret.index);

  const start = span?.start ?? caret.index;
  const items = span === null ? [] : host.items.slice(span.start, span.end);
  const operand = sequence(...stripOuterFences(items)); // slots enclose their content already
  const wrapper = create(operand);

  const wrapped = EditTraversal.spliceSequence(tree, host.id, start, caret.index - start, [wrapper]);
  return edited(wrapped, focus(wrapper, operand));
}

// Remove the token at `index`, leaving the caret where that token was
function removeTokenAt(tree: EditSequence, host: EditSequence, index: number): EditResult {
  if (index < 0 || index >= host.items.length) return unchanged(tree, host.id);
  const focusId = index > 0 ? host.items[index - 1].id : host.id;
  return edited(EditTraversal.spliceSequence(tree, host.id, index, 1), focusId);
}


// A backspace mirrors the input before it: It takes away the last thing that was added,
// wherever that sits. In front of the caret is a literal, whose last character goes;
// a leaf token, which goes as a whole; or a filled token, which keeps its content — the
// backspace then applies to the last position inside it instead.
function backspaceAt(tree: EditSequence, caret: EditCaret): EditResult {
  const before = EditTraversal.caretBefore(caret);
  if (before === null) return backspaceAtStart(tree, caret);

  // shorten a multi-digit literal one character at a time
  if (before.kind === 'literal' && before.literal.length > 1) {
    const literal = before.literal.slice(0, -1);
    return changed(tree, before.id, before.id, (existing) => ({ ...(existing as EditToken.Literal), literal }));
  }

  // a filled token is emptied out from its end, rather than dropped with its content
  if (!EditSlot.isLeaf(before) && !EditTraversal.isEmptyContainer(before)) {
    const inside = EditTraversal.moveCaret(caret, 'left'); // the last position within the token
    if (inside !== caret) return backspaceAt(tree, inside);
  }

  return removeTokenAt(tree, EditTraversal.caretSequence(caret), caret.index - 1);
}

/**
 * Backspace at the start of a sub-sequence. A blank sub-sequence holds nothing to delete,
 * so the token which opened it goes instead — which undoes the command that created the
 * token, e.g. a backspace right after `applyExponent` takes the exponent away again. A
 * sub-sequence with content is left alone and the caret steps out of it to the left.
 */
function backspaceAtStart(tree: EditSequence, caret: EditCaret): EditResult {
  const { parent, parentIndex } = EditTraversal.caretFrame(caret);
  const enclosing = EditTraversal.caretEnclosingSequence(caret);
  if (parent === null || parentIndex === null || enclosing === null) {
    return unchanged(tree, EditTraversal.caretFocusId(caret)); // at the start of the whole tree
  }

  if (EditTraversal.caretSequence(caret).items.length > 0) return moved(tree, caret, 'left');
  return unwrapToken(tree, enclosing, parent, parentIndex);
}

/**
 * Remove a token, but keep what its slots hold: The content moves into the enclosing
 * sequence, where the caret then sits behind it. Content of more than one token is fenced
 * again when it lands next to other tokens, so that it keeps binding the way it did inside
 * the slot — the counterpart of the fences `wrapOperand` strips.
 */
function unwrapToken(tree: EditSequence, enclosing: EditSequence, parent: EditToken, index: number): EditResult {
  const slotContent = Array.from(EditTraversal.childSequencesOf(parent)).flatMap((slot) => [...slot.items]);
  const content = needsFences(enclosing, slotContent) ? fenced(slotContent) : slotContent;

  if (content.length === 0) return removeTokenAt(tree, enclosing, index);
  const focusId = content[content.length - 1].id;
  return edited(EditTraversal.spliceSequence(tree, enclosing.id, index, 1, content), focusId);
}

function needsFences(enclosing: EditSequence, content: ReadonlyArray<EditToken>): boolean {
  return content.length > 1 && enclosing.items.length > 1;
}

function fenced(content: ReadonlyArray<EditToken>): ReadonlyArray<EditToken> {
  return [token('fence', { fence: '(' }), ...content, token('fence', { fence: ')' })];
}

//#endregion
//#region Fraction notation

function fractionAt(caret: EditCaret): null | EditToken.Fraction | EditToken.Composite {
  const before = EditTraversal.caretBefore(caret);
  if (isFractionToken(before)) return before;

  const after = EditTraversal.caretAfter(caret);
  if (isFractionToken(after)) return after;

  for (const ancestor of EditTraversal.caretAncestors(caret)) {
    if (isFractionToken(ancestor)) return ancestor;
  }
  return null;
}

function isFractionToken(item: null | EditToken): item is EditToken.Fraction | EditToken.Composite {
  return item !== null && (item.kind === 'fraction' || item.kind === 'composite');
}

// Write a fraction as a composite (mixed) fraction, e.g. `7/3` as `2 1/3`
function asCompositeToken(fraction: EditToken.Fraction): EditToken.Composite {
  const dividend = integerValueOf(fraction.dividend);
  const divisor = integerValueOf(fraction.divisor);

  if (dividend !== null && divisor !== null && divisor > 0n) {
    return token('composite', {
      integerPart: sequence(literalToken(dividend / divisor)),
      numerator: sequence(literalToken(dividend % divisor)),
      denominator: sequence(literalToken(divisor)),
    });
  }

  // not a plain fraction of integers: switch the notation only, `n/d` becomes `0 n/d`
  return token('composite', {
    integerPart: sequence(literalToken(0n)),
    numerator: fraction.dividend,
    denominator: fraction.divisor,
  });
}

// Write a composite (mixed) fraction as a true fraction, e.g. `2 1/3` as `7/3`;
// `null` when that would require arithmetic this editing model cannot do
function asFractionToken(composite: EditToken.Composite): null | EditToken.Fraction {
  const integerPart = integerValueOf(composite.integerPart);
  const numerator = integerValueOf(composite.numerator);
  const denominator = integerValueOf(composite.denominator);

  if (integerPart !== null && numerator !== null && denominator !== null && denominator > 0n) {
    return token('fraction', {
      dividend: sequence(literalToken(integerPart * denominator + numerator)),
      divisor: sequence(literalToken(denominator)),
    });
  }

  // without an integer part the notation can be switched as it is
  if (isBlankOrZero(composite.integerPart)) {
    return token('fraction', { dividend: composite.numerator, divisor: composite.denominator });
  }
  return null;
}

// Value of a sequence holding nothing but one non-negative integer literal
function integerValueOf(part: EditSequence): null | bigint {
  if (part.items.length !== 1) return null;
  const item = part.items[0];
  if (item.kind !== 'literal' || !DIGITS_PATTERN.test(item.literal)) return null;
  return BigInt(item.literal);
}

function isBlankOrZero(part: EditSequence): boolean {
  if (part.items.length === 0) return true;
  if (part.items.length !== 1) return false;
  const item = part.items[0];
  return item.kind === 'literal' && ZERO_PATTERN.test(item.literal);
}

//#endregion
//#region Helper functions

function unchanged(tree: EditSequence, focusId: EditTokenId): EditResult {
  return { tree, focusId, changed: false } as const;
}

function edited(tree: EditSequence, focusId: EditTokenId): EditResult {
  return { tree, focusId, changed: true } as const;
}

function changed(
  tree: EditSequence,
  targetId: EditTokenId,
  focusId: EditTokenId,
  replace: EditTokenReplacement,
): EditResult {
  const updated = EditTraversal.replaceToken(tree, targetId, replace);
  return { focusId, tree: updated, changed: true };
}

// Move the caret without touching the tree
function moved(tree: EditSequence, caret: EditCaret, direction: EditDirection): EditResult {
  const target = EditTraversal.moveCaret(caret, direction);
  return unchanged(tree, EditTraversal.caretFocusId(target));
}

// Where editing continues after a token was created: its first blank slot, else behind the token
function focusInside(newToken: EditToken): EditTokenId {
  return EditTraversal.firstEmptySlot(newToken)?.id ?? newToken.id;
}

function literalToken(value: bigint): EditToken.Literal {
  return token('literal', { literal: value.toString(10) });
}

// A '-' operator acts as a sign when nothing, another operator or an open fence precedes it
function isSignAt(host: EditSequence, index: number): boolean {
  if (index < 0 || index >= host.items.length) return false;
  const item = host.items[index];
  if (item.kind !== 'operator' || item.operator !== '-') return false;

  const preceding = index > 0 ? host.items[index - 1] : null;
  if (preceding === null) return true;
  if (preceding.kind === 'operator') return true;
  return preceding.kind === 'fence' && preceding.fence === '(';
}

// Parentheses around a whole operand are redundant once it is moved into a slot of its own
function stripOuterFences(items: ReadonlyArray<EditToken>): ReadonlyArray<EditToken> {
  if (!ENABLE_STRIP_FENCES) return items;
  if (items.length < 2) return items;
  const first = items[0];
  const last = items[items.length - 1];
  if (first.kind !== 'fence' || first.fence !== '(') return items;
  if (last.kind !== 'fence' || last.fence !== ')') return items;
  return items.slice(1, -1);
}

//#endregion
