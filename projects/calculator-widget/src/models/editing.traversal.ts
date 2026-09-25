import { EditSequence, EditSlot, EditToken, EditTokenId } from './editing.ast';
import { sequence } from './editing.factory';
import { castDraft, produce } from 'immer';

export type EditTokenReplacement = EditToken | EditTokenMapper;
export type EditTokenMapper = (token: EditToken, slot: null | EditSlot) => EditToken;
export type EditSequenceVisitor = (token: EditToken, context: EditTraversal.VisitContext) => void | boolean;
export type EditSequenceSeeker<R> = (token: EditToken, context: EditTraversal.VisitContext) => null | R;

//TODO: Maybe this is helpful still?
export type EditTokenPath = ReadonlyArray<EditTokenSegment>;
export type EditTokenSegment = [slot: null | EditSlot, index: number];

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
      if (visitor(sequence, context) === false) return false;
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

  //TODO: --- Further required traversal- query- and update functions should go here ---

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
