import { EditSequence, EditToken, EditTokenId } from './editing.ast';
import { ConstantSymbol } from './constants.model';
import { EditTokenReplacement, EditTraversal } from './editing.traversal';
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

  export type MoveDirection = 'left' | 'right' | 'up' | 'down';

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

//#region Command handlers

function focus(tree: EditSequence, { targetId }: EditCommand.Focus): EditResult {
  return unchanged(tree, targetId);
}

function move(tree: EditSequence, { targetId, direction }: EditCommand.Move): EditResult {
  const focusId = moveFocusId(tree, targetId, direction);
  return unchanged(tree, focusId);
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
  return unchanged(tree, targetId);
}

function clearAll(tree: EditSequence, { targetId }: EditCommand.ClearAll): EditResult {
  const empty = sequence();
  return { tree: empty, focusId: empty.id, changed: true };
}

function applyExponent(tree: EditSequence, { targetId, square }: EditCommand.ApplyExponent): EditResult {
  return unchanged(tree, targetId);
}

function applyRoot(tree: EditSequence, { targetId, sqrt }: EditCommand.ApplyRoot): EditResult {
  return unchanged(tree, targetId);
}

function applyFraction(tree: EditSequence, { targetId, composite }: EditCommand.ApplyFraction): EditResult {
  return unchanged(tree, targetId);
}

function toggleNegate(tree: EditSequence, { targetId }: EditCommand.ToggleNegate): EditResult {
  return unchanged(tree, targetId);
}

function toggleComposite(tree: EditSequence, { targetId }: EditCommand.ToggleComposite): EditResult {
  return unchanged(tree, targetId);
}

//#endregion
//#region Helper functions

function unchanged(tree: EditSequence, focusId: EditTokenId): EditResult {
  return { tree, focusId, changed: false } as const;
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

function moveFocusId(tree: EditSequence, targetId: EditTokenId, direction: EditCommand.MoveDirection): EditTokenId {
  if (direction === 'left' || direction === 'right') {
    return moveFocusSideways(tree, targetId, direction === 'left' ? -1 : +1);
  } else if (direction === 'up') {
    return moveFocusUpwards(tree, targetId);
  } else {
    return moveFocusDownwards(tree, targetId);
  }
}

function moveFocusSideways(tree: EditSequence, targetId: EditTokenId, step: -1 | 1): EditTokenId {
  return targetId; //TODO
}

function moveFocusUpwards(tree: EditSequence, targetId: EditTokenId): EditTokenId {
  return targetId; //TODO
}

function moveFocusDownwards(tree: EditSequence, targetId: EditTokenId): EditTokenId {
  return targetId; //TODO
}

function appendToken(tree: EditSequence, targetId: EditTokenId, token: EditToken): EditResult {
  return unchanged(tree, targetId); //TODO
}

function appendDigit(tree: EditSequence, targetId: EditTokenId, input: EditCommand.Digit): EditResult {
  return unchanged(tree, targetId); //TODO
}

//#endregion
