import {
  DivisionNotation,
  FormulaNode,
  FormulaNodeId,
  GroupFence,
  hasDecimalPoint,
  MultiplyNotation,
  NumberNode,
} from './ast.model';
import { FormulaNodeReplacement, Traversal } from './ast.traversal';
import {
  add,
  compositeFraction,
  decimal,
  divide,
  group,
  hole,
  int,
  multiply,
  negate,
  pow,
  root,
  sqrt,
  square,
  subtract,
} from './ast.factory';
import { produce } from 'immer';
import { evaluateFormula } from './ast.eval';
import { Rational } from './rational.model';
import { bigAbs } from './utils';
import lookupNode = Traversal.lookupNode;
import replaceNode = Traversal.replaceNode;
import transform = Traversal.transform;
import containsNode = Traversal.containsNode;
import lookupParentOf = Traversal.lookupParentOf;
import childEntries = Traversal.childEntries;
import walk = Traversal.walk;

export function dispatchEditCommand(tree: FormulaNode, command: EditCommand): EditResult {
  const handler = EDIT_COMMAND_DISPATCH[command.name] as EditCommandHandler<EditCommand>;
  return handler(tree, command);
}

export function simplifyFormula(tree: FormulaNode): FormulaNode {
  return transform(tree, (node) => {
    if (node.kind === 'group') {
      // nested group
      return node.expression.kind === 'group' ? node.expression : node;
    }
    if (node.kind === 'negate') {
      // double negation
      return node.operand.kind === 'negate' ? node.operand : node;
    }
    if (node.kind === 'number' && node.literal.length > 0) {
      const [integerPart = '', fractionPart = ''] = node.literal.split(/[,.]/);
      const literal = fractionPart ? `${integerPart || '0'}.${fractionPart}` : integerPart;
      return literal === node.literal ? node : { ...node, literal };
    }
    return node;
  });
}

export interface EditResult {
  readonly tree: FormulaNode; // edited root node of formula tree
  readonly focusId: FormulaNodeId; // selected node ID after editing operation
  readonly changed: boolean; // false if editing operation didn't change the tree
}

type BinaryOperator = 'add' | 'subtract' | 'multiply' | 'divide';
type UnaryOperator = 'negate' | 'sqrt' | 'square' | 'group' | 'reciprocal';
type MoveDirection = 'previous' | 'next' | 'in' | 'out';

//#region Edit commands

export type EditCommand =
  | EditCommand.Focus
  | EditCommand.Move
  | EditCommand.NextOpen
  | EditCommand.ApplyBinaryOperator
  | EditCommand.ApplyUnaryOperator
  | EditCommand.ApplyExponent
  | EditCommand.ApplyNthRoot
  | EditCommand.Replace
  | EditCommand.ClearAt
  | EditCommand.ClearEverything
  | EditCommand.RemoveAt
  | EditCommand.UnwrapGroup
  | EditCommand.TypeDigit
  | EditCommand.TypeDecimalPoint
  | EditCommand.DeleteDigit
  | EditCommand.ApplyDivisionNotation
  | EditCommand.ApplyMultiplicationNotation
  | EditCommand.ApplyCompositeFraction
  | EditCommand.ApplyTrueFraction;

export namespace EditCommand {
  interface Base<N extends string> {
    readonly name: N;
    readonly targetId: FormulaNodeId;
  }

  export interface Focus extends Base<'focus'> {}

  export interface Move extends Base<'move'> {
    readonly direction: MoveDirection;
  }

  export interface NextOpen extends Base<'nextOpen'> {
    readonly step: -1 | 1;
  }

  export interface ApplyBinaryOperator extends Base<'applyBinaryOperator'> {
    readonly operator: BinaryOperator;
    readonly notation?: MultiplyNotation | DivisionNotation;
  }

  export interface ApplyUnaryOperator extends Base<'applyUnaryOperator'> {
    readonly operator: UnaryOperator;
    readonly fence?: GroupFence;
  }

  export interface ApplyExponent extends Base<'applyExponent'> {}

  export interface ApplyNthRoot extends Base<'applyNthRoot'> {
    readonly sqrt: boolean;
  }

  export interface Replace extends Base<'replaceAt'> {
    readonly replacement: FormulaNode;
  }

  export interface ClearAt extends Base<'clearAt'> {}

  export interface ClearEverything extends Base<'clearEverything'> {}

  export interface RemoveAt extends Base<'removeAt'> {}

  export interface UnwrapGroup extends Base<'unwrapGroup'> {}

  export interface TypeDigit extends Base<'typeDigit'> {
    readonly digit: string;
  }

  export interface TypeDecimalPoint extends Base<'typeDecimalPoint'> {}

  export interface DeleteDigit extends Base<'deleteDigit'> {}

  export interface ApplyDivisionNotation extends Base<'applyDivisionNotation'> {
    readonly notation: DivisionNotation;
  }

  export interface ApplyMultiplicationNotation extends Base<'applyMultiplicationNotation'> {
    readonly notation: MultiplyNotation;
  }

  export interface ApplyCompositeFraction extends Base<'applyCompositeFraction'> {}

  export interface ApplyTrueFraction extends Base<'applyTrueFraction'> {}
}

export type EditCommandName = EditCommand['name'];
export type EditCommandOfName<N extends EditCommandName> = Extract<EditCommand, { readonly name: N }>;

interface EditCommandHandler<C extends EditCommand> {
  (tree: FormulaNode, command: C): EditResult;
}

type EditCommandDispatch = {
  readonly [C in EditCommandName]: EditCommandHandler<EditCommandOfName<C>>;
};

//#endregion
//#region Command handler functions

// Dispatch table of command-handler functions
const EDIT_COMMAND_DISPATCH: EditCommandDispatch = {
  focus: applyFocus,
  move: applyMovement,
  nextOpen: applyMoveToNextOpen,
  applyBinaryOperator,
  applyUnaryOperator,
  applyExponent,
  applyNthRoot,
  replaceAt,
  clearAt,
  clearEverything,
  removeAt,
  unwrapGroup,
  typeDigit,
  typeDecimalPoint,
  deleteDigit,
  applyDivisionNotation,
  applyMultiplicationNotation,
  applyCompositeFraction,
  applyTrueFraction,
} as const;

function unchanged(tree: FormulaNode, focusId: FormulaNodeId): EditResult {
  return { tree, focusId, changed: false };
}

function changed(
  tree: FormulaNode,
  targetId: FormulaNodeId,
  focusId: FormulaNodeId,
  replace: FormulaNodeReplacement,
): EditResult {
  return { tree: replaceNode(tree, targetId, replace), focusId, changed: true };
}

function applyFocus(tree: FormulaNode, { targetId }: EditCommand.Focus): EditResult {
  return unchanged(tree, targetId); // no change, but move focus to target node
}

function applyMovement(tree: FormulaNode, { targetId, direction }: EditCommand.Move): EditResult {
  const focusId = moveStep(tree, targetId, direction) ?? targetId;
  return unchanged(tree, focusId);
}

function applyMoveToNextOpen(tree: FormulaNode, { targetId, step }: EditCommand.NextOpen): EditResult {
  const focusId = moveNextOpen(tree, targetId, step) ?? targetId;
  return unchanged(tree, focusId);
}

function applyBinaryOperator(tree: FormulaNode, command: EditCommand.ApplyBinaryOperator): EditResult {
  return withTargetNode(tree, command.targetId, (left) => {
    const right = hole('right');
    return changed(tree, command.targetId, right.id, () => {
      switch (command.operator) {
        case 'add':
          return add(left, right);
        case 'subtract':
          return subtract(left, right);
        case 'multiply':
          return multiply(left, right, (command.notation as MultiplyNotation) ?? 'dot');
        case 'divide':
          return divide(left, right, (command.notation as DivisionNotation) ?? 'fraction');
      }
    });
  });
}

function applyUnaryOperator(tree: FormulaNode, { targetId, operator }: EditCommand.ApplyUnaryOperator): EditResult {
  return withTargetNode(tree, targetId, (operand) => {
    return changed(tree, targetId, targetId, () => {
      switch (operator) {
        case 'group':
          return group(operand);
        case 'negate':
          return negate(operand);
        case 'sqrt':
          return sqrt(operand);
        case 'square':
          return square(operand);
        case 'reciprocal':
          return divide(int(1), operand, 'fraction');
      }
    });
  });
}

function applyExponent(tree: FormulaNode, { targetId }: EditCommand.ApplyExponent): EditResult {
  return withTargetNode(tree, targetId, (base) => {
    const exponent = hole('exponent');
    return changed(tree, targetId, exponent.id, pow(base, exponent));
  });
}

function applyNthRoot(tree: FormulaNode, { targetId, sqrt: isSquare }: EditCommand.ApplyNthRoot): EditResult {
  return withTargetNode(tree, targetId, (radicant) => {
    if (isSquare) {
      return changed(tree, targetId, radicant.id, sqrt(radicant));
    } else {
      const degree = hole('degree');
      return changed(tree, targetId, degree.id, root(radicant, degree));
    }
  });
}

function replaceAt(tree: FormulaNode, { targetId, replacement }: EditCommand.Replace): EditResult {
  if (!containsNode(tree, targetId)) return unchanged(tree, targetId);
  return changed(tree, targetId, replacement.id, replacement);
}

function clearAt(tree: FormulaNode, { targetId }: EditCommand.ClearAt): EditResult {
  return doClearAt(tree, targetId);
}

function doClearAt(tree: FormulaNode, targetId: FormulaNodeId): EditResult {
  if (!containsNode(tree, targetId)) return unchanged(tree, targetId);
  const clear = hole('clear');
  return changed(tree, targetId, clear.id, clear);
}

function clearEverything(): EditResult {
  const blank = hole('blank');
  return { tree: blank, focusId: blank.id, changed: true };
}

function removeAt(tree: FormulaNode, { targetId }: EditCommand.RemoveAt): EditResult {
  if (tree.id === targetId) return clearEverything();

  const location = lookupParentOf(tree, targetId);
  if (location === null) return unchanged(tree, targetId);

  const siblings = childEntries(location.parent).filter((entry) => entry.child.id !== targetId);
  const isBinary =
    location.parent.kind === 'add' ||
    location.parent.kind === 'subtract' ||
    location.parent.kind === 'multiply' ||
    location.parent.kind == 'divide';

  if (isBinary && siblings.length < 2) {
    const soleSurvivor = siblings[0].child;
    return changed(tree, location.parent.id, soleSurvivor.id, soleSurvivor);
  }
  if (location.parent.kind === 'group' || location.parent.kind === 'negate') {
    const clear = hole('clear');
    return changed(tree, location.parent.id, clear.id, clear);
  }

  const clear = hole('clear');
  return changed(tree, targetId, clear.id, clear);
}

function unwrapGroup(tree: FormulaNode, { targetId }: EditCommand.UnwrapGroup): EditResult {
  return withTargetNode(tree, targetId, (target) => {
    if (target.kind !== 'group') return unchanged(tree, targetId);
    return changed(tree, targetId, target.expression.id, target.expression);
  });
}

const SINGLE_DIGIT = /^\d$/;

function typeDigit(tree: FormulaNode, { targetId, digit }: EditCommand.TypeDigit): EditResult {
  if (!SINGLE_DIGIT.test(digit)) return unchanged(tree, targetId);
  return withTargetNode(tree, targetId, (target) => {
    if (target.kind === 'hole') {
      // replace hole with number
      const literal = decimal(digit);
      return changed(tree, targetId, literal.id, literal);
    }
    if (target.kind === 'number') {
      // append digit to number
      const result: NumberNode = produce(target, (draft) => {
        draft.literal += digit;
      });
      return changed(tree, targetId, result.id, result);
    }
    return unchanged(tree, targetId);
  });
}

function typeDecimalPoint(tree: FormulaNode, { targetId }: EditCommand.TypeDecimalPoint): EditResult {
  return withTargetNode(tree, targetId, (target) => {
    if (target.kind === 'hole') {
      // replace hole with "zero plus decimal point"
      const literal = decimal('0.');
      return changed(tree, targetId, literal.id, literal);
    }
    if (target.kind === 'number' && !hasDecimalPoint(target)) {
      const result: NumberNode = produce(target, (draft) => {
        draft.literal = (draft.literal || '0') + '.';
      });
      return changed(tree, targetId, result.id, result);
    }
    return unchanged(tree, targetId);
  });
}

function deleteDigit(tree: FormulaNode, { targetId }: EditCommand.DeleteDigit): EditResult {
  return withTargetNode(tree, targetId, (target) => {
    if (target.kind !== 'number') return unchanged(tree, targetId);
    const erasedLiteral = target.literal.slice(0, -1);

    const anyDigit = /\d/;
    if (!anyDigit.test(erasedLiteral)) return doClearAt(tree, targetId);

    const result = produce(target, (draft) => {
      draft.literal = erasedLiteral;
    });
    return changed(tree, targetId, result.id, result);
  });
}

function applyDivisionNotation(tree: FormulaNode, command: EditCommand.ApplyDivisionNotation): EditResult {
  return withTargetNode(tree, command.targetId, (target) => {
    if (target.kind !== 'divide' || target.notation === command.notation) return unchanged(tree, command.targetId);
    const result = produce(target, (draft) => {
      draft.notation = command.notation;
    });
    return changed(tree, command.targetId, result.id, result);
  });
}

function applyMultiplicationNotation(tree: FormulaNode, command: EditCommand.ApplyMultiplicationNotation): EditResult {
  return withTargetNode(tree, command.targetId, (target) => {
    if (target.kind !== 'multiply' || target.notation === command.notation) return unchanged(tree, command.targetId);
    const result = produce(target, (draft) => {
      draft.notation = command.notation;
    });
    return changed(tree, command.targetId, result.id, result);
  });
}

// Replace true-fraction division with composite-fraction
function applyCompositeFraction(tree: FormulaNode, { targetId }: EditCommand.ApplyCompositeFraction): EditResult {
  return withTargetNode(tree, targetId, (target) => {
    if (target.kind !== 'divide') return unchanged(tree, targetId); // Only applies to division nodes

    const evaluated = evaluateFormula(target);
    const rational = evaluated.ok ? evaluated.value.asRational() : null;
    if (rational === null || rational.isInteger) return unchanged(tree, targetId); // Must be a rational number

    const magnitude = rational.absolute();
    if (magnitude.compareTo(Rational.ONE) < 0) return unchanged(tree, targetId); // Must be greater than one

    const integerPart = magnitude.floor();
    const remainderPart = magnitude.subtract(Rational.of(integerPart));
    const composed = compositeFraction(int(integerPart), int(remainderPart.numerator), int(remainderPart.denominator));
    const result = rational.isNegative ? negate(composed) : composed;

    return changed(tree, targetId, result.id, result);
  });
}

// Replace composite-fraction division with true-fraction
// Falls back to structural form "(n*b + a) / b" when the parts are not literal integers
function applyTrueFraction(tree: FormulaNode, { targetId }: EditCommand.ApplyTrueFraction): EditResult {
  return withTargetNode(tree, targetId, (target) => {
    if (target.kind !== 'composite') return unchanged(tree, targetId);

    const evaluated = evaluateFormula(target);
    const rational = evaluated.ok ? evaluated.value.asRational() : null;

    // Simple fractional form for rational; Structural form otherwise
    if (rational !== null) {
      const numerator = int(bigAbs(rational.numerator));
      const denominator = int(rational.denominator);
      const trueFraction = divide(numerator, denominator);
      const result = rational.isNegative ? negate(trueFraction) : trueFraction;
      return changed(tree, targetId, result.id, result);
    } else {
      const result = divide(
        add(multiply(target.integerPart, target.denominator), target.numerator),
        target.denominator,
      );
      return changed(tree, targetId, result.id, result);
    }
  });
}

//#endregion
//#region Helper functions

function withTargetNode(
  tree: FormulaNode,
  targetId: FormulaNodeId,
  then: (target: FormulaNode) => EditResult,
): EditResult {
  const target = lookupNode(tree, targetId);
  if (target === null) return unchanged(tree, targetId);
  return then(target);
}

function moveStep(tree: FormulaNode, targetId: FormulaNodeId, direction: MoveDirection): null | FormulaNodeId {
  if (direction === 'out') {
    return lookupParentOf(tree, targetId)?.parent?.id ?? null;
  }
  if (direction === 'in') {
    const node = lookupNode(tree, targetId);
    if (node === null) return null;
    const [firstChildEntry] = childEntries(node);
    return firstChildEntry?.child?.id ?? null;
  }
  const step = direction === 'next' ? +1 : -1;
  const idSequence = nodesInSequence(tree);
  const targetIndex = idSequence.indexOf(targetId);
  const nextIndex = (targetIndex + step) % idSequence.length;
  return idSequence.at(nextIndex) ?? null;
}

function nodesInSequence(tree: FormulaNode): ReadonlyArray<FormulaNodeId> {
  const nodeIds: Array<FormulaNodeId> = [];
  walk(tree, (node) => void nodeIds.push(node.id));
  return nodeIds;
}

function moveNextOpen(tree: FormulaNode, fromId: null | FormulaNodeId, step: -1 | 1): null | FormulaNodeId {
  const ids = openNodeIds(tree);
  if (ids.length === 0) return null; // no open nodes

  // ring selection (out left -> in right, out right -> in left)
  const index = fromId ? ids.indexOf(fromId) : step < 0 ? ids.length - 1 : 0;
  return ids.at((index + step) % ids.length) ?? null;
}

function openNodeIds(tree: FormulaNode): ReadonlyArray<FormulaNodeId> {
  return Traversal.filter(tree, isNodeOpen).map((node) => node.id);
}

function isNodeOpen(node: FormulaNode): boolean {
  return node.kind === 'hole' || (node.kind === 'number' && node.literal.length === 0);
}

//#endregion
