import { EditSequence, EditSlot, EditToken, EditTokenColumn, EditTokenId } from './editing.ast';
import { resetTokenIdGenerator, sequence, token } from './editing.factory';
import { EditTraversal } from './editing.traversal';
import { dispatchEditCommand, EditCommand } from './editing.command';
import { compileToFormula } from './editing.compile';
import { formatToLatex, parseFromLatex } from './editing.latex';
import { tokenizeFormula } from './editing.tokenize';
import { FormulaNode } from './formula.ast';
import { ConstantSymbol } from './constants.model';

/**
 * Edit trees are written as a single line, so that an expectation shows the whole state:
 * `2+[1/3]` is `2 + ` a fraction, `[i&n/d]` a composite fraction, `[b^e]` an exponent,
 * `[dRr]` a root (`[Rr]` without a degree, which is the square root) and `_` an empty
 * sub-sequence. A `|` marks the caret, i.e. where the focus ID points.
 */
describe('Editing', () => {
  const CARET = '|';

  beforeEach(() => {
    resetTokenIdGenerator(1); // token IDs must not be reused across specs
  });

  //#region Test helpers

  type CommandDetails<N extends EditCommand.Name> = Omit<EditCommand.OfName<N>, 'name' | 'targetId'>;

  interface EditSession {
    readonly tree: EditSequence;
    readonly focusId: null | EditTokenId;
    run<N extends EditCommand.Name>(name: N, details: CommandDetails<N>): this;
    // Type one input character after the other, as the keyboard and the number pad do
    type(text: string): this;
    // Move focus into a specific direction
    move(direction: EditCommand.MoveDirection, steps?: number): this;
    // Move the caret by focus ID, the way clicking a token does
    focusOn(targetId: null | EditTokenId): this;
    // Collect the state after each of `steps` movements
    track(direction: EditCommand.MoveDirection, steps: number): ReadonlyArray<string>;
    // Display string representing the edit sequence
    readonly display: string;
    // The formula the current tree compiles to, as a Lisp string, or `issue:<code>`
    readonly formula: string;
    readonly lastChanged: null | boolean;
  }

  const literal = (value: string) => token('literal', { literal: value });
  const operator = (value: EditCommand.Operator) => token('operator', { operator: value });
  const fence = (value: EditCommand.Fence) => token('fence', { fence: value });
  const fraction = (dividend: EditToken, divisor: EditToken) => {
    return token('fraction', { dividend: sequence(dividend), divisor: sequence(divisor) });
  };

  // An edit session, driving the command dispatch the way the calculator component does
  function edit() {
    let tree: EditSequence = sequence();
    let focusId: EditTokenId = tree.id;
    let changed: null | boolean = null;

    const session: EditSession = {
      get tree() {
        return tree;
      },
      get focusId() {
        return focusId;
      },
      run<N extends EditCommand.Name>(name: N, details: CommandDetails<N>) {
        const command = { name, targetId: focusId, ...details } as EditCommand.OfName<N>;
        const result = dispatchEditCommand(tree, command);
        tree = result.tree;
        focusId = result.focusId;
        changed = result.changed;
        return session;
      },
      type(text: string) {
        for (const input of text) this.run('typeInput', { input: input as EditCommand.Input });
        return session;
      },
      move(direction: EditCommand.MoveDirection, steps = 1) {
        for (let step = 0; step < steps; step++) this.run('move', { direction });
        return session;
      },
      focusOn(targetId: EditTokenId) {
        const result = dispatchEditCommand(tree, { name: 'focus', targetId });
        tree = result.tree;
        focusId = result.focusId;
        changed = result.changed;
        return session;
      },
      track(direction: EditCommand.MoveDirection, steps: number): ReadonlyArray<string> {
        const states: string[] = [];
        for (let step = 0; step < steps; step++) states.push(this.move(direction).display);
        return states;
      },
      get display(): string {
        return renderDisplay(tree, focusId);
      },
      get formula(): string {
        const compiled = compileToFormula(tree);
        return compiled.ok ? FormulaNode.asLispString(compiled.value) : `issue:${compiled.issue.code}`;
      },
      get lastChanged(): null | boolean {
        return changed;
      },
    };

    return session;
  }

  function renderDisplay(tree: EditSequence, focusId: EditTokenId): string {
    const caret = EditTraversal.caretAt(tree, focusId);
    const host = EditTraversal.caretSequence(caret);
    const caretMarkerToken = {
      sourceTokenId: null,
      kind: 'literal',
      id: 'caret' as EditTokenId,
      literal: CARET,
    } as const;
    const marked = EditTraversal.updateSequence(tree, host.id, (items) => {
      const withCaret = items.slice();
      withCaret.splice(caret.index, 0, caretMarkerToken);
      return withCaret;
    });
    return renderToken(marked);
  }

  function renderToken(node: EditToken): string {
    switch (node.kind) {
      case 'sequence': {
        const content = node.items.map(renderToken).join('');
        return content.length === 0 ? '_' : content;
      }
      case 'literal':
        return node.literal;
      case 'constant':
        return node.symbol;
      case 'operator':
        return node.operator;
      case 'fence':
        return node.fence;
      case 'fraction':
        return `[${renderToken(node.dividend)}/${renderToken(node.divisor)}]`;
      case 'composite':
        return `[${renderToken(node.integerPart)}&${renderToken(node.numerator)}/${renderToken(node.denominator)}]`;
      case 'exponent':
        return `[${renderToken(node.base)}^${renderToken(node.exponent)}]`;
      case 'root':
        return node.degree.items.length === 0
          ? `[R${renderToken(node.radicand)}]`
          : `[${renderToken(node.degree)}R${renderToken(node.radicand)}]`;
    }
  }

  //#endregion
  //#region Traversal: looking up tokens

  it('finds tokens and sequences by their ID', () => {
    const inner = literal('2');
    const divisor = sequence(inner);
    const tree = sequence(literal('1'), token('fraction', { dividend: sequence(), divisor }));

    expect(EditTraversal.findToken(tree, inner.id)).toBe(inner);
    expect(EditTraversal.findToken(tree, divisor.id)).toBe(divisor);
    expect(EditTraversal.findToken(tree, tree.id)).toBe(tree);
    expect(EditTraversal.findToken(tree, 'T:nope' as EditTokenId)).toBeNull();
    expect(EditTraversal.containsToken(tree, inner.id)).toBeTrue();
    expect(EditTraversal.containsToken(tree, 'T:nope' as EditTokenId)).toBeFalse();
  });

  it('walks a tree, visiting every sequence and every item token', () => {
    const tree = sequence(literal('1'), operator('+'), fraction(literal('2'), literal('3')));

    const visited: string[] = [];
    EditTraversal.walk(tree, (visitedToken) => {
      visited.push(visitedToken.kind);
    });

    expect(visited).toEqual([
      'sequence', // the tree itself
      'literal',
      'operator',
      'fraction',
      'sequence', // the dividend
      'literal',
      'sequence', // the divisor
      'literal',
    ]);
  });

  it('cancels the walk once the seeker has found something', () => {
    const tree = sequence(literal('1'), operator('+'), literal('2'));
    let visits = 0;

    const found = EditTraversal.searchOne(tree, (visitedToken) => {
      visits++;
      return visitedToken.kind === 'operator' ? visitedToken : null;
    });

    expect(found?.kind).toBe('operator');
    expect(visits).toBe(3); // the tree, the first literal, the operator
  });

  //#endregion
  //#region Traversal: the caret

  it('reads a token ID as the caret behind that token', () => {
    const second = literal('2');
    const tree = sequence(literal('1'), second);
    const caret = EditTraversal.caretAt(tree, second.id);

    expect(caret.index).toBe(2);
    expect(EditTraversal.caretBefore(caret)).toBe(second);
    expect(EditTraversal.caretAfter(caret)).toBeNull();
    expect(EditTraversal.caretFocusId(caret)).toBe(second.id);
  });

  it('reads a sequence ID as the caret at the start of that sequence', () => {
    const first = literal('1');
    const tree = sequence(first, literal('2'));
    const caret = EditTraversal.caretAt(tree, tree.id);

    expect(caret.index).toBe(0);
    expect(EditTraversal.caretBefore(caret)).toBeNull();
    expect(EditTraversal.caretAfter(caret)).toBe(first);
    expect(EditTraversal.caretFocusId(caret)).toBe(tree.id);
  });

  it('falls back to the end of the tree for an ID which is gone', () => {
    const tree = sequence(literal('1'), literal('2'));
    const caret = EditTraversal.caretAt(tree, 'T:gone' as EditTokenId);

    expect(EditTraversal.findCaret(tree, 'T:gone' as EditTokenId)).toBeNull();
    expect(caret.index).toBe(tree.items.length);
  });

  it('knows the sub-sequence the caret sits in and the token holding it', () => {
    const divisor = sequence(literal('3'));
    const fraction = token('fraction', { dividend: sequence(literal('2')), divisor });
    const tree = sequence(literal('1'), fraction);
    const caret = EditTraversal.caretAt(tree, divisor.id);

    expect(EditTraversal.caretSequence(caret)).toBe(divisor);
    expect(EditTraversal.caretParent(caret)).toBe(fraction);
    expect(EditTraversal.caretFrame(caret).slot).toBe('divisor');
    expect(EditTraversal.caretFrame(caret).parentIndex).toBe(1);
    expect(Array.from(EditTraversal.caretAncestors(caret))).toEqual([fraction]);
  });

  //#endregion
  //#region Traversal: operands and slots

  it('reads the operand in front of the caret', () => {
    const tree = sequence(literal('1'), operator('+'), fence('('), literal('2'), fence(')'));

    expect(EditTraversal.operandBefore(tree, 5)).toEqual({ start: 2, end: 5 }); // the whole group
    expect(EditTraversal.operandBefore(tree, 4)).toEqual({ start: 3, end: 4 }); // just the literal
    expect(EditTraversal.operandBefore(tree, 2)).toBeNull(); // an operator is no operand
    expect(EditTraversal.operandBefore(tree, 0)).toBeNull(); // nothing in front of the caret
  });

  it('matches nested fences when reading an operand', () => {
    const tree = sequence(fence('('), literal('1'), fence('('), literal('2'), fence(')'), fence(')'));

    expect(EditTraversal.matchingOpenFence(tree, 5)).toBe(0);
    expect(EditTraversal.matchingOpenFence(tree, 4)).toBe(2);
    expect(EditTraversal.operandBefore(tree, 6)).toEqual({ start: 0, end: 6 });
  });

  it('reports empty containers and their first blank slot', () => {
    const blank = token('fraction', { dividend: sequence(), divisor: sequence() });
    const half = token('fraction', { dividend: sequence(literal('1')), divisor: sequence() });
    const full = token('fraction', { dividend: sequence(literal('1')), divisor: sequence(literal('2')) });

    expect(EditTraversal.isEmptyContainer(blank)).toBeTrue();
    expect(EditTraversal.isEmptyContainer(half)).toBeFalse();
    expect(EditTraversal.isEmptyContainer(literal('1'))).toBeFalse(); // a leaf is no container
    expect(EditTraversal.firstEmptySlot(blank)).toBe(blank.dividend);
    expect(EditTraversal.firstEmptySlot(half)).toBe(half.divisor);
    expect(EditTraversal.firstEmptySlot(full)).toBeNull();
  });

  it('declares the vertically stacked slots of a token', () => {
    const fraction = token('fraction', { dividend: sequence(), divisor: sequence() });
    const exponent = token('exponent', { base: sequence(), exponent: sequence() });

    expect(EditTokenColumn.columnsOf(fraction)).toEqual(['dividend', 'divisor']);
    expect(EditTokenColumn.columnsOf(exponent)).toEqual(['exponent', 'base']); // the exponent sits on top
    expect(EditTokenColumn.columnsOf(literal('1'))).toEqual([]);
    expect(EditSlot.slotsOf(exponent)).toEqual(['base', 'exponent']); // editing order, left to right
  });

  //#endregion
  //#region Traversal: updating

  it('splices a nested sequence without touching the rest of the tree', () => {
    const divisor = sequence(literal('3'));
    const fraction = token('fraction', { dividend: sequence(literal('2')), divisor });
    const untouched = literal('1');
    const tree = sequence(untouched, fraction);

    const updated = EditTraversal.spliceSequence(tree, divisor.id, 0, 1, [literal('4')]);

    expect(renderToken(updated)).toBe('1[2/4]');
    expect(renderToken(tree)).toBe('1[2/3]'); // the original tree is untouched
    expect(updated.id).toBe(tree.id); // IDs are kept, so the focus survives
    expect(updated.items[0]).toBe(untouched); // unchanged branches are shared
  });

  it('keeps the tree identical when an update changes nothing', () => {
    const tree = sequence(literal('1'), literal('2'));
    const updated = EditTraversal.updateSequence(tree, tree.id, (items) => items);

    expect(updated).toBe(tree);
  });

  it('compares trees structurally, ignoring token IDs', () => {
    const left = sequence(literal('1'), token('fraction', { dividend: sequence(literal('2')), divisor: sequence() }));
    const same = sequence(literal('1'), token('fraction', { dividend: sequence(literal('2')), divisor: sequence() }));
    const other = sequence(literal('1'), token('fraction', { dividend: sequence(literal('9')), divisor: sequence() }));

    expect(EditTraversal.structurallyEqual(left, same)).toBeTrue();
    expect(EditTraversal.structurallyEqual(left, other)).toBeFalse();
    expect(EditTraversal.structurallyEqual(left, sequence(literal('1')))).toBeFalse();
  });

  //#endregion
  //#region Moving the caret

  it('walks left through a fraction, position by position', () => {
    const session = edit().type('1+2').run('applyFraction', { composite: false }).type('3');

    expect(session.display).toBe('1+[2/3|]');
    expect(session.focusOn(session.tree.items[2].id).display).toBe('1+[2/3]|');
    expect(session.track('left', 8)).toEqual([
      '1+[2/3|]', // into the divisor, at its end
      '1+[2/|3]',
      '1+[2|/3]', // into the dividend, at its end
      '1+[|2/3]',
      '1+|[2/3]', // out of the fraction
      '1|+[2/3]',
      '|1+[2/3]',
      '|1+[2/3]', // the start of the tree stops the movement
    ]);
  });

  it('walks right through a fraction, position by position', () => {
    const session = edit().type('1+2').run('applyFraction', { composite: false }).type('3');

    expect(session.focusOn(session.tree.id).display).toBe('|1+[2/3]');
    expect(session.track('right', 8)).toEqual([
      '1|+[2/3]',
      '1+|[2/3]',
      '1+[|2/3]', // into the dividend, at its start
      '1+[2|/3]',
      '1+[2/|3]', // into the divisor
      '1+[2/3|]',
      '1+[2/3]|', // out of the fraction
      '1+[2/3]|', // the end of the tree stops the movement
    ]);
  });

  it('moves up and down between stacked slots', () => {
    const session = edit().type('1').run('applyFraction', { composite: false }).type('2');

    expect(session.display).toBe('[1/2|]');
    expect(session.track('up', 2)).toEqual(['[1|/2]', '[1|/2]']); // nothing above the dividend
    expect(session.track('down', 2)).toEqual(['[1/2|]', '[1/2|]']); // nothing below the divisor
  });

  it('moves up out of an exponent base and down out of its exponent', () => {
    const session = edit().type('2').run('applyExponent', { square: false }).type('3');

    expect(session.display).toBe('[2^3|]');
    expect(session.move('down').display).toBe('[2|^3]'); // the base sits below the exponent
    expect(session.move('up').display).toBe('[2^3|]');
  });

  it('looks outwards for a stacked slot when the inner token has none', () => {
    const session = edit().type('1').run('applyFraction', { composite: false });
    session.type('2').run('applyExponent', { square: false }).type('3'); // an exponent in the divisor

    expect(session.display).toBe('[1/[2^3|]]');
    expect(session.move('up').display).toBe('[1|/[2^3]]'); // nothing above the exponent, so the fraction answers
  });

  it('moves up from a radicand into the degree of a root', () => {
    const session = edit().run('applyRoot', { sqrt: true }).type('81'); // the caret waits in the radicand

    expect(session.display).toBe('[R81|]');
    expect(session.move('up').display).toBe('[|R81]'); // the empty degree, ready to be typed into
  });

  //#endregion
  //#region Typing

  it('collects typed digits in a single literal token', () => {
    const session = edit().type('123');

    expect(session.display).toBe('123|');
    expect(session.tree.items.length).toBe(1);
  });

  it('accepts one decimal point per literal', () => {
    const session = edit().type('1.5');

    expect(session.type('.').display).toBe('1.5|');
    expect(session.lastChanged).toBeFalse(); // the second point is rejected, nothing to undo
  });

  it('starts a literal with a leading zero when the decimal point comes first', () => {
    expect(edit().type('.5').display).toBe('0.5|');
  });

  it('starts a new literal after an operator', () => {
    const session = edit().type('12+34');

    expect(session.display).toBe('12+34|');
    expect(session.tree.items.map((item) => item.kind)).toEqual(['literal', 'operator', 'literal']);
  });

  it('inserts fences, operators and constants as tokens of their own', () => {
    const session = edit().type('(1+2)');
    session.run('typeInput', { input: ConstantSymbol.Pi });

    expect(session.display).toBe('(1+2)pi|');
    expect(session.tree.items.map((item) => item.kind)).toEqual([
      'fence',
      'literal',
      'operator',
      'literal',
      'fence',
      'constant',
    ]);
  });

  it('types into the sub-sequence the caret sits in', () => {
    const session = edit().run('applyFraction', { composite: false }).type('7');

    expect(session.display).toBe('[7|/_]'); // the dividend is the first blank to fill in
  });

  it('takes a closing fence only where an open one waits for it', () => {
    const session = edit().type('1+2');

    expect(session.type(')').display).toBe('1+2|'); // nothing to close
    expect(session.lastChanged).toBeFalse();
    expect(session.type('(3)').display).toBe('1+2(3)|'); // one which has its opening fence is taken
    expect(session.type(')').display).toBe('1+2(3)|'); // and it closed the only open one
  });

  /**
   * A fence cannot reach into a slot or out of one, as every slot holds a formula of its own.
   * Taking a closing fence into a slot would draw `4π²` as `(4π)²` while the opening fence
   * sits outside the exponent, where it can never match.
   */
  it('keeps a fence out of a slot its counterpart cannot reach', () => {
    const session = edit().type('4');
    session.run('typeInput', { input: ConstantSymbol.Pi }).run('applyExponent', { square: true });

    expect(session.move('left', 3).display).toBe('4[pi|^2]'); // between the base and the exponent
    expect(session.type(')').display).toBe('4[pi|^2]'); // the open fence would have to sit outside
    expect(session.lastChanged).toBeFalse();

    // the way to that formula is fencing the operand first, so that it is what gets squared
    const fenced = edit().type('(4');
    fenced.run('typeInput', { input: ConstantSymbol.Pi });
    expect(fenced.type(')').display).toBe('(4pi)|');
    expect(fenced.run('applyExponent', { square: true }).display).toBe('[(4pi)^2]|');
    expect(fenced.formula).toBe('(pow (multiply 4 pi) 2)');
  });

  //#endregion
  //#region Applying structure

  it('squares the operand in front of the caret', () => {
    const session = edit().type('1+23').run('applyExponent', { square: true });

    expect(session.display).toBe('1+[23^2]|'); // only the operand, not the whole expression
    expect(session.formula).toBe('(add 1 (pow 23 2))');
  });

  it('takes a whole group as the operand, fences and all', () => {
    const session = edit().type('2*(3+4)').run('applyExponent', { square: false });

    expect(session.display).toBe('2*[(3+4)^|]'); // the caret waits in the exponent
    expect(session.type('2').formula).toBe('(multiply 2 (pow (add 3 4) 2))');
  });

  it('creates an empty base when there is no operand to wrap', () => {
    expect(edit().run('applyExponent', { square: true }).display).toBe('[|^2]');
    expect(edit().type('1+').run('applyExponent', { square: true }).display).toBe('1+[|^2]');
  });

  it('writes a square root without a degree and waits in the radicand', () => {
    expect(edit().run('applyRoot', { sqrt: true }).display).toBe('[R|]');
    expect(edit().type('9').run('applyRoot', { sqrt: true }).display).toBe('[R9]|');
    expect(edit().type('9').run('applyRoot', { sqrt: true }).formula).toBe('(root 2 9)');
  });

  it('waits in the degree of an nth root', () => {
    const session = edit().type('8').run('applyRoot', { sqrt: false });

    expect(session.display).toBe('[|R8]'); // the empty degree shows up because it is focused
    expect(session.focusId).toBe((session.tree.items[0] as EditToken.Root).degree.id);
    expect(session.type('3').formula).toBe('(root 3 8)');
  });

  it('turns the operand into the dividend of a fraction', () => {
    const session = edit().type('1+2').run('applyFraction', { composite: false });

    expect(session.display).toBe('1+[2/|]');
    expect(session.type('3').formula).toBe('(add 1 (divide 2 3))');
  });

  it('turns the operand into the integer part of a composite fraction', () => {
    const session = edit().type('3').run('applyFraction', { composite: true });

    expect(session.display).toBe('[3&|/_]');
    expect(session.type('1').move('down').type('2').display).toBe('[3&1/2|]');
    expect(session.formula).toBe('(add 3 (divide 1 2))');
  });

  //#endregion
  //#region Signs

  it('toggles the sign of the operand in front of the caret', () => {
    const session = edit().type('1+2');

    expect(session.run('toggleNegate', {}).display).toBe('1+-2|');
    expect(session.formula).toBe('(add 1 (negate 2))');
    expect(session.run('toggleNegate', {}).display).toBe('1+2|');
  });

  it('toggles a sign at the caret when there is no operand', () => {
    const session = edit().type('2*');

    expect(session.run('toggleNegate', {}).display).toBe('2*-|');
    expect(session.type('3').formula).toBe('(multiply 2 (negate 3))');
  });

  it('only removes a minus which really is a sign', () => {
    const session = edit().type('5-2'); // here the minus is a subtraction

    expect(session.run('toggleNegate', {}).display).toBe('5--2|');
    expect(session.run('toggleNegate', {}).display).toBe('5-2|');
  });

  it('signs a whole group', () => {
    const session = edit().type('(1+2)');

    expect(session.run('toggleNegate', {}).display).toBe('-(1+2)|');
    expect(session.formula).toBe('(negate (add 1 2))');
  });

  //#endregion
  //#region Fraction notation

  it('writes a fraction of integers as a mixed number and back', () => {
    const session = edit().type('7').run('applyFraction', { composite: false }).type('2');

    expect(session.run('toggleComposite', {}).display).toBe('[3&1/2]|');
    expect(session.formula).toBe('(add 3 (divide 1 2))');
    expect(session.run('toggleComposite', {}).display).toBe('[7/2]|');
    expect(session.formula).toBe('(divide 7 2)');
  });

  it('toggles the fraction the caret sits inside', () => {
    const session = edit().type('9').run('applyFraction', { composite: false }).type('4');

    expect(session.display).toBe('[9/4|]'); // the caret is in the divisor
    expect(session.run('toggleComposite', {}).display).toBe('[2&1/4]|');
  });

  it('switches the notation only when the parts are no plain integers', () => {
    const session = edit().type('1+2').run('applyFraction', { composite: false }).type('3');

    expect(session.display).toBe('1+[2/3|]');
    expect(session.run('toggleComposite', {}).display).toBe('1+[0&2/3]|'); // an integer part of zero
    expect(session.run('toggleComposite', {}).display).toBe('1+[2/3]|');
  });

  it('keeps a composite fraction which cannot be written as a true fraction', () => {
    const session = edit().run('applyFraction', { composite: true });
    session.type('1+1').move('right').type('2').move('down').type('3'); // a sum as the integer part

    expect(session.display).toBe('[1+1&2/3|]');
    expect(session.run('toggleComposite', {}).display).toBe('[1+1&2/3|]');
    expect(session.lastChanged).toBeFalse(); // rather than dropping the integer part
  });

  it('does nothing without a fraction at the caret', () => {
    const session = edit().type('12');

    expect(session.run('toggleComposite', {}).display).toBe('12|');
    expect(session.lastChanged).toBeFalse();
  });

  //#endregion
  //#region Deleting

  it('shortens a literal character by character', () => {
    const session = edit().type('123');

    expect(session.run('backspace', {}).display).toBe('12|');
    expect(session.run('backspace', {}).display).toBe('1|');
    expect(session.run('backspace', {}).display).toBe('|');
  });

  it('removes single tokens, leaving the caret in their place', () => {
    const session = edit().type('1+2');

    expect(session.run('backspace', {}).display).toBe('1+|');
    expect(session.run('backspace', {}).display).toBe('1|');
  });

  it('empties a filled token from its end, rather than dropping it with its content', () => {
    const session = edit().type('12').run('applyFraction', { composite: false }).type('34').move('right');

    expect(session.display).toBe('[12/34]|');
    expect(session.run('backspace', {}).display).toBe('[12/3|]'); // the last thing inside it goes
    expect(session.lastChanged).toBeTrue();
    expect(session.run('backspace', {}).display).toBe('[12/|]');
    expect(session.run('backspace', {}).display).toBe('12|'); // and then the emptied fraction itself
  });

  it('drops the token which opened a blank slot, keeping what its other slots hold', () => {
    const session = edit().type('1').run('applyFraction', { composite: false }).type('2');

    expect(session.run('backspace', {}).display).toBe('[1/|]');
    expect(session.run('backspace', {}).display).toBe('1|'); // the fraction goes, its dividend stays
    expect(session.lastChanged).toBeTrue();
    expect(session.run('backspace', {}).display).toBe('|');
  });

  it('steps out of a slot which still has content', () => {
    const session = edit().type('1').run('applyFraction', { composite: false }).type('2').move('left');

    expect(session.display).toBe('[1/|2]');
    expect(session.run('backspace', {}).display).toBe('[1|/2]'); // nothing is deleted on the way out
    expect(session.lastChanged).toBeFalse();
  });

  it('does nothing at the very start of the tree', () => {
    const session = edit().type('12');
    session.focusOn(session.tree.id);
    const before = session.tree;

    expect(session.run('backspace', {}).display).toBe('|12');
    expect(session.lastChanged).toBeFalse();
    expect(session.tree).toBe(before);
  });

  it('clears everything, but reports an empty tree as unchanged', () => {
    const session = edit().type('42').run('clearAll', {});

    expect(session.display).toBe('|');
    expect(session.lastChanged).toBeTrue();
    expect(session.run('clearAll', {}).lastChanged).toBeFalse();
  });

  //#endregion
  //#region Undoing the last input

  // A backspace mirrors the input before it: whatever that input added, the backspace takes away

  it('takes an exponent away again', () => {
    const session = edit().type('2').run('applyExponent', { square: false });

    expect(session.display).toBe('[2^|]');
    expect(session.run('backspace', {}).display).toBe('2|');
    expect(session.lastChanged).toBeTrue();
  });

  it('takes an nth root away again', () => {
    const session = edit().type('2').run('applyRoot', { sqrt: false });

    expect(session.display).toBe('[|R2]');
    expect(session.run('backspace', {}).display).toBe('2|');
  });

  it('takes a square root without a radicand away again', () => {
    const session = edit().run('applyRoot', { sqrt: true });

    expect(session.display).toBe('[R|]');
    expect(session.run('backspace', {}).display).toBe('|');
  });

  it('takes a fraction away again', () => {
    const session = edit().type('1+2').run('applyFraction', { composite: false });

    expect(session.display).toBe('1+[2/|]');
    expect(session.run('backspace', {}).display).toBe('1+2|');
  });

  it('takes a composite fraction away again', () => {
    const session = edit().type('3').run('applyFraction', { composite: true });

    expect(session.display).toBe('[3&|/_]');
    expect(session.run('backspace', {}).display).toBe('3|');
  });

  it('takes a token inside a sub-sequence away again', () => {
    const session = edit().type('1').run('applyFraction', { composite: false });
    session.type('2').run('applyExponent', { square: false });

    expect(session.display).toBe('[1/[2^|]]');
    expect(session.run('backspace', {}).display).toBe('[1/2|]');
  });

  it('fences unwrapped content again when it lands next to other tokens', () => {
    const session = edit().type('3*(1+2)').run('applyExponent', { square: false });

    expect(session.display).toBe('3*[(1+2)^|]'); // the fences went into the base
    expect(session.run('backspace', {}).display).toBe('3*(1+2)|'); // and come back out with it
    expect(session.formula).toBe('(multiply 3 (add 1 2))');
  });

  it('needs no fences for content standing on its own', () => {
    const session = edit().type('(1+2)').run('applyExponent', { square: false });

    expect(session.display).toBe('[(1+2)^|]');
    expect(session.run('backspace', {}).display).toBe('(1+2)|');
  });

  it('takes a square apart in two steps, because it filled in the exponent', () => {
    const session = edit().type('2').run('applyExponent', { square: true });

    expect(session.display).toBe('[2^2]|');
    expect(session.run('backspace', {}).display).toBe('[2^|]'); // the 2 the command filled in
    expect(session.run('backspace', {}).display).toBe('2|'); // then the exponent itself
  });

  it('empties a square root before removing it', () => {
    const session = edit().type('9').run('applyRoot', { sqrt: true });

    expect(session.display).toBe('[R9]|'); // the caret is behind the root, not inside it
    expect(session.run('backspace', {}).display).toBe('[R|]');
    expect(session.run('backspace', {}).display).toBe('|');
  });

  it('leaves a sign to the toggle which set it', () => {
    const session = edit().type('1+2').run('toggleNegate', {});

    expect(session.display).toBe('1+-2|');
    expect(session.run('backspace', {}).display).toBe('1+-|'); // a backspace deletes at the caret
    expect(session.run('toggleNegate', {}).display).toBe('1+|'); // the sign is the toggle's to remove
  });

  it('deletes something on every single press, until nothing is left', () => {
    const session = edit().type('2*(1+3)');
    session.run('applyFraction', { composite: false }).type('4').run('applyExponent', { square: true });

    let presses = 0;
    while (session.tree.items.length > 0 && presses < 40) {
      session.run('backspace', {});
      presses++;
      expect(session.lastChanged).withContext(`press ${presses}, now ${session.display}`).toBeTrue();
    }

    expect(session.tree.items.length).toBe(0);
  });

  it('keeps content a command filled in by itself', () => {
    const session = edit().run('applyExponent', { square: true }); // squaring nothing

    expect(session.display).toBe('[|^2]');
    expect(session.run('backspace', {}).display).toBe('2|'); // the exponent goes, the 2 it held stays
    expect(session.run('backspace', {}).display).toBe('|');
  });

  //#endregion
  //#region Results of a command

  it('reports movements as unchanged and keeps the tree identical', () => {
    const session = edit().type('1+2');
    const before = session.tree;

    session.move('left');

    expect(session.lastChanged).toBeFalse();
    expect(session.tree).toBe(before);
  });

  it('never edits the tree it was given', () => {
    const before = edit().type('1+2');
    const snapshot = before.tree;

    const result = dispatchEditCommand(snapshot, {
      name: 'typeInput',
      targetId: before.focusId!,
      input: '5',
    });

    expect(renderToken(snapshot)).toBe('1+2');
    expect(renderToken(result.tree)).toBe('1+25');
    expect(result.changed).toBeTrue();
  });

  it('normalizes a focus ID which is no longer in the tree', () => {
    const session = edit().type('4');
    const stale = session.focusId;
    session.run('clearAll', {});

    expect(session.focusOn(stale).focusId).toBe(session.tree.id);
    expect(session.lastChanged).toBeFalse();
  });

  //#endregion
  //#region Compiling what the editor produces

  function compiles(build: (session: EditSession) => EditSession, expectedFormula: string) {
    return () => expect(build(edit()).formula).toBe(expectedFormula);
  }

  it(
    'compiles a parenthesized group',
    compiles((s) => s.type('2*(3+4)'), '(multiply 2 (add 3 4))'),
  );
  it(
    'compiles implicit multiplication',
    compiles((s) => s.type('(3+4)2'), '(multiply (add 3 4) 2)'),
  );
  it(
    'compiles a sign after an operator',
    compiles((s) => s.type('2*').run('toggleNegate', {}).type('3'), '(multiply 2 (negate 3))'),
  );
  it(
    'compiles a leading sign',
    compiles((s) => s.type('2').run('toggleNegate', {}), '(negate 2)'),
  );

  it('compiles a fraction in front of a literal as a product', () => {
    const session = edit().type('1').run('applyFraction', { composite: false }).type('2');
    session.move('right').type('3');

    expect(session.display).toBe('[1/2]3|');
    expect(session.formula).toBe('(multiply (divide 1 2) 3)');
  });

  it('compiles a literal in front of a fraction as a product', () => {
    const session = edit().type('1').run('applyFraction', { composite: false }).type('2');
    session.focusOn(session.tree.id).type('3'); // in front of the fraction

    expect(session.display).toBe('3|[1/2]');
    expect(session.formula).toBe('(multiply 3 (divide 1 2))');
  });

  it('compiles a literal in front of an exponent as a product', () => {
    const session = edit().type('2').run('applyExponent', { square: true });
    session.focusOn(session.tree.id).type('3');

    expect(session.display).toBe('3|[2^2]');
    expect(session.formula).toBe('(multiply 3 (pow 2 2))');
  });

  it('reports an issue for incomplete input instead of looping', () => {
    expect(edit().type('1+').formula).toBe('issue:unexpectedEnd');
    expect(edit().type('(1+2').formula).toBe('issue:unexpectedEnd');
    expect(compileToFormula(parseFromLatex('1+2)')).ok).toBeFalse(); // a surplus fence can only come from outside
    expect(edit().run('applyFraction', { composite: false }).formula).toBe('issue:empty');
    expect(edit().formula).toBe('issue:empty');
  });

  //#endregion
  //#region LaTeX storage

  // What this application writes must come back exactly, as tokens and as text
  function storesAs(build: (session: EditSession) => EditSession, expectedLatex: string) {
    return () => {
      const tree = build(edit()).tree;
      const latex = formatToLatex(tree);
      expect(latex).toBe(expectedLatex);

      const restored = parseFromLatex(latex);
      expect(renderToken(restored)).toBe(renderToken(tree)); // same tokens, reported readably on failure
      expect(EditTraversal.structurallyEqual(restored, tree)).toBeTrue();
      expect(formatToLatex(restored)).toBe(latex); // same text again
    };
  }

  function reads(latex: string, expectedTokens: string) {
    return () => expect(renderToken(parseFromLatex(latex))).toBe(expectedTokens);
  }

  it(
    'stores an empty sequence',
    storesAs((s) => s, ''),
  );
  it(
    'stores numbers and operators',
    storesAs((s) => s.type('1+2-3*4/5'), '1+2-3\\cdot4\\div5'),
  );
  it(
    'stores a decimal number',
    storesAs((s) => s.type('12+3.5'), '12+3.5'),
  );
  it(
    'stores a trailing decimal point',
    storesAs((s) => s.type('3.'), '3.'),
  );
  it(
    'stores fences as they are',
    storesAs((s) => s.type('2*(3+4)'), '2\\cdot(3+4)'),
  );
  it(
    'stores an unbalanced fence',
    storesAs((s) => s.type('(1+2'), '(1+2'),
  );
  it(
    'stores the constants',
    storesAs((s) => {
      for (const input of [ConstantSymbol.Pi, ConstantSymbol.E, ConstantSymbol.Tau, ConstantSymbol.Phi]) {
        s.run('typeInput', { input });
      }
      return s;
    }, '\\pi\\mathrm{e}\\tau\\varphi'),
  );
  it(
    'stores a square',
    storesAs((s) => s.type('2').run('applyExponent', { square: true }), '{2}^{2}'),
  );
  it(
    'stores an exponent still to be filled in',
    storesAs((s) => s.type('2').run('applyExponent', { square: false }), '{2}^{}'),
  );
  it(
    'stores a whole group as the base',
    storesAs((s) => s.type('(1+2)').run('applyExponent', { square: false }).type('3'), '{(1+2)}^{3}'),
  );
  it(
    'stores a square root without an index',
    storesAs((s) => s.type('9').run('applyRoot', { sqrt: true }), '\\sqrt{9}'),
  );
  it(
    'stores the index of an nth root',
    storesAs((s) => s.type('8').run('applyRoot', { sqrt: false }).type('3'), '\\sqrt[3]{8}'),
  );
  it(
    'stores a fraction',
    storesAs((s) => s.type('1').run('applyFraction', { composite: false }).type('2'), '\\frac{1}{2}'),
  );
  it(
    'stores the blanks of an untouched fraction',
    storesAs((s) => s.run('applyFraction', { composite: false }), '\\frac{}{}'),
  );
  it(
    'stores nested tokens',
    storesAs(
      (s) =>
        s
          .type('1')
          .run('applyFraction', { composite: false })
          .type('2')
          .run('applyExponent', { square: false })
          .type('3'),
      '\\frac{1}{{2}^{3}}',
    ),
  );

  // A mixed number, and a number, times a fraction are drawn alike, so the text has to tell them apart
  it(
    'braces the integer part of a mixed number',
    storesAs(
      (s) => s.type('3').run('applyFraction', { composite: true }).type('1').move('down').type('2'),
      '{3}\\frac{1}{2}',
    ),
  );
  it(
    'writes a number in front of a fraction without braces',
    storesAs((s) => {
      const session = s.type('1').run('applyFraction', { composite: false }).type('2');
      return session.focusOn(session.tree.id).type('3');
    }, '3\\frac{1}{2}'),
  );
  it(
    'writes a fraction in front of a number',
    storesAs(
      (s) => s.type('1').run('applyFraction', { composite: false }).type('2').move('right').type('3'),
      '\\frac{1}{2}3',
    ),
  );

  it('reads a fraction written without braces', reads('\\frac12', '[1/2]'));
  it('reads a power written without braces', reads('2^{10}', '[2^10]'));
  it('reads sized fences', reads('\\left(1+2\\right)', '(1+2)'));
  it('reads the other fraction commands', reads('\\dfrac{\\tfrac{1}{2}}{3}', '[[1/2]/3]'));
  it('reads the other product signs', reads('2\\times3', '2*3'));
  it('reads a square root without braces', reads('\\sqrt2', '[R2]'));
  it('reads a comma as the decimal point', reads('1{,}5+2,5', '1.5+2.5'));
  it('reads the constant e', reads('\\mathrm{e}^{2}', '[e^2]'));

  it('drops what the model cannot hold', () => {
    expect(renderToken(parseFromLatex('\\textcolor{red}{2}+1'))).toBe('2+1'); // an unknown command and its color
    expect(renderToken(parseFromLatex('x+1'))).toBe('+1'); // a variable
    expect(renderToken(parseFromLatex('2_{3}+1'))).toBe('2+1'); // an index
    expect(renderToken(parseFromLatex('}{ garbage \\foo{1}'))).toBe('1'); // broken syntax
    expect(renderToken(parseFromLatex(''))).toBe('_');
  });

  it('settles after reading foreign text, so that storing it again is stable', () => {
    const foreign = [
      '\\frac12',
      '2^3',
      '\\pi r^2',
      '1,5\\cdot\\left(2+3\\right)',
      '\\sqrt[3]{\\frac{8}{27}}',
      'x+1',
      '3\\frac{1}{2}',
    ];

    for (const latex of foreign) {
      const stored = formatToLatex(parseFromLatex(latex));
      expect(formatToLatex(parseFromLatex(stored)))
        .withContext(latex)
        .toBe(stored);
    }
  });

  it('reads two numbers written next to each other as one', () => {
    const session = edit().type('1');
    session.focusOn(session.tree.id).type('2'); // a second literal token in front of the first

    expect(session.display).toBe('2|1');
    expect(formatToLatex(session.tree)).toBe('21');
    expect(renderToken(parseFromLatex('21'))).toBe('21'); // one token now, which is what the display showed
  });

  //#endregion
  //#region Round trip through the formula AST

  function roundTrips(
    formula: FormulaNode,
    expectedTokens: string,
    expectedFormula = FormulaNode.asLispString(formula),
  ) {
    return () => {
      const tokens = tokenizeFormula(formula);
      expect(renderToken(tokens)).toBe(expectedTokens);

      const compiled = compileToFormula(tokens);
      const back = compiled.ok ? FormulaNode.asLispString(compiled.value) : `issue:${compiled.issue.code}`;
      expect(back).toBe(expectedFormula);
    };
  }

  const one: FormulaNode = { sourceTokenId: null, kind: 'literal', literal: '1' };
  const two: FormulaNode = { sourceTokenId: null, kind: 'literal', literal: '2' };
  const three: FormulaNode = { sourceTokenId: null, kind: 'literal', literal: '3' };

  it('keeps a negation', roundTrips({ sourceTokenId: null, kind: 'unary', operator: 'negate', operand: two }, '-2'));
  it(
    'keeps a negated group',
    roundTrips(
      {
        sourceTokenId: null,
        kind: 'unary',
        operator: 'negate',
        operand: { sourceTokenId: null, kind: 'binary', operator: 'add', left: one, right: two },
      },
      '-(1+2)',
    ),
  );
  it(
    'keeps a negated factor',
    roundTrips(
      {
        sourceTokenId: null,
        kind: 'binary',
        operator: 'multiply',
        left: three,
        right: { sourceTokenId: null, kind: 'unary', operator: 'negate', operand: two },
      },
      '3*(-2)',
    ),
  );
  it(
    'writes a square root without an index',
    roundTrips(
      {
        sourceTokenId: null,
        kind: 'root',
        radicand: { sourceTokenId: null, kind: 'literal', literal: '16' },
        degree: two,
      },
      '[R16]',
    ),
  );
  it(
    'keeps the index of an nth root',
    roundTrips(
      {
        sourceTokenId: null,
        kind: 'root',
        radicand: { sourceTokenId: null, kind: 'literal', literal: '27' },
        degree: three,
      },
      '[3R27]',
    ),
  );
  it(
    'parenthesizes a sum inside a product',
    roundTrips(
      {
        sourceTokenId: null,
        kind: 'binary',
        operator: 'multiply',
        left: { sourceTokenId: null, kind: 'binary', operator: 'add', left: one, right: two },
        right: three,
      },
      '(1+2)*3',
    ),
  );
  it(
    'keeps a composite fraction',
    roundTrips(
      { sourceTokenId: null, kind: 'composite', integerPart: two, numerator: one, denominator: three },
      '[2&1/3]',
      '(add 2 (divide 1 3))',
    ),
  );

  //#endregion
});
