import { EditSequence, EditSlot, EditToken, EditTokenId } from './editing.ast';
import { sequence } from './editing.factory';
import { castDraft, produce } from 'immer';

export type EditTokenReplacement = EditToken | EditTokenMapper;
export type EditTokenMapper = (token: EditToken, slot: null | EditSlot) => EditToken;
export type EditSequenceVisitor = (token: EditToken, context: EditTraversal.VisitContext) => void | boolean;
export type EditSequenceSeeker<R> = (token: EditToken, context: EditTraversal.VisitContext) => null | R;

// Direction of a caret movement through an edit tree
export type EditDirection = 'left' | 'right' | 'up' | 'down';

/**
 * One level of the descent from the root sequence down to a (possibly nested) sequence.
 *
 * The root frame is the only one without a parent token: every other sequence is held
 * by exactly one slot of exactly one token, which itself sits in an enclosing sequence.
 */
export interface EditFrame {
  // Sequence reached at this level
  readonly sequence: EditSequence;
  // Token owning this sequence, `null` at the root
  readonly parent: null | EditToken;
  // Slot of `parent` holding this sequence, `null` at the root
  readonly slot: null | EditSlot;
  // Index of `parent` within its own enclosing sequence, `null` at the root
  readonly parentIndex: null | number;
}

/**
 * A caret (cursor) position within an edit tree.
 *
 * The caret always sits *between* two tokens of one sequence, so it is addressed by that
 * sequence plus the number of tokens preceding it. An `EditTokenId` used as focus refers
 * to the caret *after* the identified token, or — when it identifies a sequence — to the
 * caret at the *start* of that sequence (which is the only position an empty sequence has).
 */
export interface EditCaret {
  // Root-first chain of frames, never empty; the last frame holds the caret
  readonly frames: ReadonlyArray<EditFrame>;
  // Number of tokens preceding the caret within the caret's sequence
  readonly index: number;
}

// Range of tokens within a single sequence, from `start` (inclusive) to `end` (exclusive)
export interface EditSpan {
  readonly start: number;
  readonly end: number;
}

type EditTokenColumn<K extends EditToken.Kind> = ReadonlyArray<EditSlot.SlotOf<K>>;
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

export namespace EditTraversal {
  //#region Querying functions

  interface EditSlotChild {
    readonly slot: EditSlot;
    readonly childSequence: EditSequence;
  }

  export function* childSequenceEntries(token: EditToken): Generator<EditSlotChild> {
    if (EditSlot.isLeaf(token)) return;
    for (const slot of EditSlot.slotsOf(token)) {
      const childSequence = EditSlot.get(token, slot);
      if (childSequence !== null) yield { slot, childSequence };
    }
  }

  export function* childSequencesOf(token: EditToken): Generator<EditSequence> {
    if (EditSlot.isLeaf(token)) return;
    for (const slot of EditSlot.slotsOf(token)) {
      const childSequence = EditSlot.get(token, slot);
      if (childSequence !== null) yield childSequence;
    }
  }

  // Slots of a token which are stacked vertically on screen, ordered top to bottom
  export function columnsOf(token: EditToken): ReadonlyArray<EditSlot> {
    return COLUMNS[token.kind];
  }

  export interface VisitContext {
    // Parent token of the currently visited sequence
    readonly parent: null | EditToken;
    // Slot of the parent token leading to the currently visited sequence
    readonly slot: null | EditSlot;
    // Currently visited sequence this token is an element of, or the sequence token itself
    readonly sequence: EditSequence;
    // Slot depth level of current token
    readonly depth: number;
    // Current index within sequence
    readonly index: null | number;
  }

  // Tree-walk sequence; return `false` from visitor to cancel the walk
  export function walk(tree: EditSequence, visitor: EditSequenceVisitor) {
    function run(sequence: EditSequence, context: VisitContext): boolean {
      if (visitor(sequence, context) === false) return false;
      for (let index = 0; index < sequence.items.length; index++) {
        const token = sequence.items[index];
        const proceed = step(sequence, token, { ...context, index });
        if (!proceed) return false;
      }
      return true;
    }

    function step(sequence: EditSequence, token: EditToken, context: VisitContext): boolean {
      if (visitor(token, context) === false) return false;
      for (const { slot, childSequence } of childSequenceEntries(token)) {
        const depth = context.depth + 1;
        const proceed = run(childSequence, { parent: token, slot, sequence, depth, index: null });
        if (!proceed) return false;
      }
      return true;
    }

    run(tree, { parent: null, slot: null, sequence: tree, depth: 0, index: null });
  }

  export function searchOne<R>(tree: EditSequence, seek: EditSequenceSeeker<R>): null | R {
    let found: null | R = null;
    walk(tree, (token, context) => {
      if (found !== null) return false; // stop if already found
      found = seek(token, context); // seek in token
      return found === null; // keep searching unless found
    });
    return found;
  }

  // Look up a token (or sequence) by its ID
  export function findToken(tree: EditSequence, id: EditTokenId): null | EditToken {
    if (tree.id === id) return tree;
    for (const token of tree.items) {
      if (token.id === id) return token;
      for (const childSequence of childSequencesOf(token)) {
        const found = findToken(childSequence, id);
        if (found !== null) return found;
      }
    }
    return null;
  }

  export function containsToken(tree: EditSequence, id: EditTokenId): boolean {
    return findToken(tree, id) !== null;
  }

  // Check if a token holds sub-sequences, all of which are empty
  export function isEmptyContainer(token: EditToken): boolean {
    const childSequences = Array.from(childSequencesOf(token));
    return childSequences.length > 0 && childSequences.every((child) => child.items.length === 0);
  }

  // First empty sub-sequence of a token, in slot declaration order; this is where editing continues
  // after a token has been inserted, as it is the first blank the user has to fill in
  export function firstEmptySlot(token: EditToken): null | EditSequence {
    for (const childSequence of childSequencesOf(token)) {
      if (childSequence.items.length === 0) return childSequence;
    }
    return null;
  }

  /**
   * Span of the operand directly left of `index`, which is the operand a postfix editing
   * operation (exponent, root, fraction, sign) applies to. A parenthesized group counts as
   * one operand; an operator (or nothing at all) yields no operand.
   */
  export function operandBefore(sequence: EditSequence, index: number): null | EditSpan {
    if (index <= 0 || index > sequence.items.length) return null;
    const token = sequence.items[index - 1];
    if (token.kind === 'operator') return null;
    if (token.kind === 'fence') {
      if (token.fence === '(') return null; // dangling open fence, there is no operand
      const start = matchingOpenFence(sequence, index - 1);
      return start === null ? null : { start, end: index };
    }
    return { start: index - 1, end: index };
  }

  // Index of the open fence matching the close fence at `closeIndex`
  export function matchingOpenFence(sequence: EditSequence, closeIndex: number): null | number {
    let depth = 0;
    for (let index = closeIndex; index >= 0; index--) {
      const token = sequence.items[index];
      if (token.kind !== 'fence') continue;
      if (token.fence === ')') {
        depth++;
      } else {
        depth--;
        if (depth === 0) return index;
      }
    }
    return null;
  }

  //#endregion
  //#region Caret functions

  export function rootFrame(tree: EditSequence): EditFrame {
    return { sequence: tree, parent: null, slot: null, parentIndex: null };
  }

  // Resolve a focus ID to the caret position it denotes
  export function findCaret(tree: EditSequence, focusId: EditTokenId): null | EditCaret {
    return seekCaret([], rootFrame(tree), focusId);
  }

  // Resolve a focus ID, falling back to the end of the tree for IDs which are gone
  export function caretAt(tree: EditSequence, focusId: EditTokenId): EditCaret {
    return findCaret(tree, focusId) ?? caretAtEnd(tree);
  }

  export function caretAtEnd(tree: EditSequence): EditCaret {
    return { frames: [rootFrame(tree)], index: tree.items.length };
  }

  function seekCaret(outer: ReadonlyArray<EditFrame>, frame: EditFrame, focusId: EditTokenId): null | EditCaret {
    const frames = [...outer, frame];
    if (frame.sequence.id === focusId) return { frames, index: 0 };

    for (let index = 0; index < frame.sequence.items.length; index++) {
      const token = frame.sequence.items[index];
      if (token.id === focusId) return { frames, index: index + 1 }; // caret sits behind the token
      for (const { slot, childSequence } of childSequenceEntries(token)) {
        const child: EditFrame = { sequence: childSequence, parent: token, slot, parentIndex: index };
        const found = seekCaret(frames, child, focusId);
        if (found !== null) return found;
      }
    }
    return null;
  }

  export function caretFrame(caret: EditCaret): EditFrame {
    return caret.frames[caret.frames.length - 1];
  }

  export function caretSequence(caret: EditCaret): EditSequence {
    return caretFrame(caret).sequence;
  }

  // Token directly left of the caret, if any
  export function caretBefore(caret: EditCaret): null | EditToken {
    const { items } = caretSequence(caret);
    return caret.index > 0 ? items[caret.index - 1] : null;
  }

  // Token directly right of the caret, if any
  export function caretAfter(caret: EditCaret): null | EditToken {
    const { items } = caretSequence(caret);
    return caret.index < items.length ? items[caret.index] : null;
  }

  // The focus ID denoting this caret position: the token in front of it, or its sequence at the start
  export function caretFocusId(caret: EditCaret): EditTokenId {
    const before = caretBefore(caret);
    return before !== null ? before.id : caretSequence(caret).id;
  }

  // Innermost token enclosing the caret, i.e. the token owning the caret's sequence
  export function caretParent(caret: EditCaret): null | EditToken {
    return caretFrame(caret).parent;
  }

  // Sequence holding the token which owns the caret's sequence, `null` at the root
  export function caretEnclosingSequence(caret: EditCaret): null | EditSequence {
    const level = caret.frames.length - 2;
    return level < 0 ? null : caret.frames[level].sequence;
  }

  // Enclosing tokens of the caret, innermost first
  export function* caretAncestors(caret: EditCaret): Generator<EditToken> {
    for (let level = caret.frames.length - 1; level > 0; level--) {
      const { parent } = caret.frames[level];
      if (parent !== null) yield parent;
    }
  }

  // Move the caret one position; returns the unchanged caret when the move is not possible
  export function moveCaret(caret: EditCaret, direction: EditDirection): EditCaret {
    switch (direction) {
      case 'left':
        return moveCaretLeft(caret);
      case 'right':
        return moveCaretRight(caret);
      case 'up':
        return moveCaretVertically(caret, -1);
      case 'down':
        return moveCaretVertically(caret, +1);
    }
  }

  // Step into a slot of a token, placing the caret at the start or the end of that sub-sequence
  function enterSlot(caret: EditCaret, token: EditToken, index: number, slot: EditSlot, atEnd: boolean): EditCaret {
    const childSequence = EditSlot.get(token, slot);
    if (childSequence === null) return caret;
    const frame: EditFrame = { sequence: childSequence, parent: token, slot, parentIndex: index };
    return { frames: [...caret.frames, frame], index: atEnd ? childSequence.items.length : 0 };
  }

  function moveCaretLeft(caret: EditCaret): EditCaret {
    const frame = caretFrame(caret);
    if (caret.index === 0) return leaveSlotLeft(caret, frame);

    const token = frame.sequence.items[caret.index - 1];
    const slots = EditSlot.slotsOf(token);
    if (slots.length === 0) return { ...caret, index: caret.index - 1 };
    return enterSlot(caret, token, caret.index - 1, slots[slots.length - 1], true); // descend into last slot
  }

  function moveCaretRight(caret: EditCaret): EditCaret {
    const frame = caretFrame(caret);
    if (caret.index === frame.sequence.items.length) return leaveSlotRight(caret, frame);

    const token = frame.sequence.items[caret.index];
    const slots = EditSlot.slotsOf(token);
    if (slots.length === 0) return { ...caret, index: caret.index + 1 };
    return enterSlot(caret, token, caret.index, slots[0], false); // descend into first slot
  }

  // Leave a sub-sequence to the left: into the preceding slot of the same token, else in front of it
  function leaveSlotLeft(caret: EditCaret, frame: EditFrame): EditCaret {
    const { parent, slot, parentIndex } = frame;
    if (parent === null || slot === null || parentIndex === null) return caret; // start of the tree

    const outer: EditCaret = { frames: caret.frames.slice(0, -1), index: parentIndex };
    const slots = EditSlot.slotsOf(parent);
    const position = slots.indexOf(slot);
    if (position <= 0) return outer;
    return enterSlot(outer, parent, parentIndex, slots[position - 1], true);
  }

  // Leave a sub-sequence to the right: into the following slot of the same token, else behind it
  function leaveSlotRight(caret: EditCaret, frame: EditFrame): EditCaret {
    const { parent, slot, parentIndex } = frame;
    if (parent === null || slot === null || parentIndex === null) return caret; // end of the tree

    const outer: EditCaret = { frames: caret.frames.slice(0, -1), index: parentIndex + 1 };
    const slots = EditSlot.slotsOf(parent);
    const position = slots.indexOf(slot);
    if (position < 0 || position >= slots.length - 1) return outer;
    return enterSlot(outer, parent, parentIndex, slots[position + 1], false);
  }

  // Move to the slot above (`step` -1) or below (`step` +1) the caret, looking outwards
  // through the enclosing tokens until one offers a slot in that direction
  function moveCaretVertically(caret: EditCaret, step: -1 | 1): EditCaret {
    for (let level = caret.frames.length - 1; level > 0; level--) {
      const { parent, slot, parentIndex } = caret.frames[level];
      if (parent === null || slot === null || parentIndex === null) break;

      const columns = columnsOf(parent);
      const position = columns.indexOf(slot);
      if (position < 0) continue; // this slot is not part of a vertical stack

      const target = columns[position + step];
      if (target === undefined) continue; // no slot above/below, try the enclosing token

      const outer: EditCaret = { frames: caret.frames.slice(0, level), index: parentIndex };
      return enterSlot(outer, parent, parentIndex, target, true);
    }
    return caret;
  }

  //#endregion
  //#region Update functions

  export function mapSequence(
    sequence: EditSequence,
    mapper: (item: EditToken, index: number) => EditToken,
  ): EditSequence {
    return produce(sequence, (draft) => {
      for (let i = 0; i < draft.items.length; i++) {
        draft.items[i] = castDraft(mapper(draft.items[i], i));
      }
    });
  }

  export function mapTokenSlots(
    token: EditToken,
    mapper: (childSequence: EditSequence, slot: EditSlot) => EditSequence,
  ): EditToken {
    return produce(token as EditSlot.Container, (draft) => {
      for (const { slot, childSequence } of childSequenceEntries(draft)) {
        draft[slot] = castDraft(mapper(childSequence, slot));
      }
    });
  }

  export function replaceToken(tree: EditSequence, id: EditTokenId, replace: EditTokenReplacement): EditSequence {
    return replaceTokenInSlot(tree, id, null, replace);
  }

  function replaceTokenInSlot(
    tree: EditSequence,
    id: EditTokenId,
    slot: null | EditSlot,
    replace: EditTokenReplacement,
  ): EditSequence {
    if (tree.id === id) return sequence(resolveReplacement(tree, slot, replace));
    return mapSequence(tree, (token) => {
      if (token.id === id) return resolveReplacement(token, slot, replace);
      return mapTokenSlots(token, (childSequence, childSlot) => {
        return replaceTokenInSlot(childSequence, id, childSlot, replace);
      });
    });
  }

  function resolveReplacement(existing: EditToken, slot: null | EditSlot, replace: EditTokenReplacement): EditToken {
    return typeof replace === 'function' ? replace(existing, slot) : replace;
  }

  // Replace the items of the identified sequence, keeping the rest of the tree untouched
  export function updateSequence(
    tree: EditSequence,
    sequenceId: EditTokenId,
    update: (items: ReadonlyArray<EditToken>) => ReadonlyArray<EditToken>,
  ): EditSequence {
    if (tree.id === sequenceId) {
      return produce(tree, (draft) => {
        draft.items = castDraft(update(tree.items));
      });
    }
    return mapSequence(tree, (token) => {
      return mapTokenSlots(token, (childSequence) => updateSequence(childSequence, sequenceId, update));
    });
  }

  // Remove `remove` items at `start` of the identified sequence and insert the given tokens there
  export function spliceSequence(
    tree: EditSequence,
    sequenceId: EditTokenId,
    start: number,
    remove: number,
    insert: ReadonlyArray<EditToken> = [],
  ): EditSequence {
    return updateSequence(tree, sequenceId, (items) => {
      const updated = items.slice();
      updated.splice(start, remove, ...insert);
      return updated;
    });
  }

  //#endregion
  //#region Comparison functions

  export function structurallyEqual(left: EditSequence, right: EditSequence): boolean {
    if (left.items.length !== right.items.length) return false;

    for (let i = 0; i < left.items.length; i++) {
      const lToken = left.items[i];
      const rToken = right.items[i];
      if (lToken.kind !== rToken.kind) return false;

      // check leaf properties
      switch (lToken.kind) {
        case 'fence': {
          const rrToken = rToken as typeof lToken;
          if (lToken.fence !== rrToken.fence) return false;
          break;
        }
        case 'literal': {
          const rrToken = rToken as typeof lToken;
          if (lToken.literal !== rrToken.literal) return false;
          break;
        }
        case 'constant': {
          const rrToken = rToken as typeof lToken;
          if (lToken.symbol !== rrToken.symbol) return false;
          break;
        }
        case 'operator': {
          const rrToken = rToken as typeof lToken;
          if (lToken.operator !== rrToken.operator) return false;
          break;
        }
        case 'fraction':
        case 'composite':
        case 'exponent':
        case 'root': {
          break; // No leaf properties
        }
        case 'sequence': {
          throw new Error('EditToken.Sequence contains an unexpected sub-sequence outside an EditToken slot');
        }
        default: {
          console.error('Unknown edit token:', lToken satisfies never);
          throw new Error(`Unknown edit token: ${JSON.stringify(lToken)}`);
        }
      }

      // check child sequences
      const lSubs = Array.from(childSequenceEntries(lToken));
      const rSubs = Array.from(childSequenceEntries(rToken));
      if (lSubs.length !== rSubs.length) return false;

      const childSequencesEqual = lSubs.every((lSub, j) => {
        const rSub = rSubs[j];
        return lSub.slot === rSub.slot && structurallyEqual(lSub.childSequence, rSub.childSequence);
      });
      if (!childSequencesEqual) return false;
    }

    return true;
  }

  //#endregion
}
