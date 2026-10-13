import { EditSequence, EditToken } from './editing.ast';
import { FormulaNode } from './formula.ast';
import { BinaryOperator, NumericEnumLiteral, UnaryOperator } from './types';
import { sequence, token } from './editing.factory';

export function tokenizeFormula(node: FormulaNode): EditSequence {
  const token = tokenizeNode(node);
  return token.kind === 'sequence' ? token : sequence(token);
}

function tokenizeNode(node: FormulaNode): EditToken {
  switch (node.kind) {
    case 'literal':
      return token('literal', { literal: node.literal });
    case 'constant':
      return token('constant', { symbol: node.symbol });
    case 'unary':
      return sequence(operatorToken(node.operator), tokenizeChild(node, node.operand));
    case 'binary':
      return sequence(
        tokenizeChild(node, node.left, true),
        operatorToken(node.operator),
        tokenizeChild(node, node.right),
      );
    case 'fraction':
      return token('fraction', {
        dividend: tokenizeChild(node, node.dividend, true),
        divisor: tokenizeChild(node, node.divisor),
      });
    case 'composite':
      return token('composite', {
        integerPart: tokenizeChild(node, node.integerPart),
        numerator: tokenizeChild(node, node.numerator),
        denominator: tokenizeChild(node, node.denominator),
      });
    case 'exponential':
      return token('exponent', {
        base: tokenizeChild(node, node.base, true),
        exponent: tokenizeChild(node, node.exponent),
      });
    case 'root':
      return token('root', {
        // an empty degree denotes the square root, which is written without an index
        degree: isSquareDegree(node.degree) ? sequence() : tokenizeChild(node, node.degree),
        radicand: tokenizeChild(node, node.radicand),
      });
    default:
      return invalidNode(node);
  }
}

function isSquareDegree(degree: FormulaNode): boolean {
  return degree.kind === 'literal' && degree.literal === '2';
}

function tokenizeChild(parent: FormulaNode, child: FormulaNode, leftHand: boolean = false): EditSequence {
  const content = tokenizeNode(child);
  if (!needsParentheses(parent, child, leftHand)) return sequence(content);

  const open = token('fence', { fence: '(' });
  const close = token('fence', { fence: ')' });
  return sequence(open, content, close);
}

function operatorToken(operator: BinaryOperator | UnaryOperator): EditToken {
  switch (operator) {
    case 'add':
      return token('operator', { operator: '+' });
    case 'subtract':
      return token('operator', { operator: '-' });
    case 'multiply':
      return token('operator', { operator: '*' });
    case 'divide':
      return token('operator', { operator: '/' });
    case 'negate':
      return token('operator', { operator: '-' });
    default:
      return invalidNode(operator);
  }
}

const enum Precedence {
  Additive = 1, // lowest precedence, least tightly binding
  Unary = 2,
  Multiplicative = 3,
  Exponential = 4,
  Atom = 5, // highest precedence, most tightly binding
}

type PrecedenceLevel = NumericEnumLiteral<Precedence>;

// How tightly a node binds when written inline
function precedenceOf(node: FormulaNode): PrecedenceLevel {
  switch (node.kind) {
    case 'binary':
      switch (node.operator) {
        case 'add':
        case 'subtract':
          return Precedence.Additive;
        case 'multiply':
        case 'divide':
          return Precedence.Multiplicative;
        default:
          return invalidNode(node);
      }
    case 'unary':
      return Precedence.Unary;
    case 'exponential':
      return Precedence.Exponential;
    case 'literal':
    case 'constant':
    case 'fraction':
    case 'composite':
    case 'root':
      return Precedence.Atom;
    default:
      return invalidNode(node);
  }
}

// True if a node's atomicity is already determined by itself, so no parentheses are required
function isSelfEnclosed(node: FormulaNode, leftHand: boolean) {
  switch (node.kind) {
    case 'composite':
    case 'fraction':
    case 'root':
      return true;
    case 'exponential':
      return leftHand;
    case 'binary':
    case 'literal':
    case 'constant':
    case 'unary':
      return false;
  }
}

function requiredPrecedence(node: FormulaNode, leftHand: boolean): PrecedenceLevel {
  if (isSelfEnclosed(node, leftHand)) {
    return Precedence.Additive; // lowest requirement, always succeeds
  }
  switch (node.kind) {
    case 'unary':
      return Precedence.Multiplicative;
    case 'binary':
      switch (node.operator) {
        case 'add':
        case 'subtract':
          return leftHand ? Precedence.Additive : Precedence.Unary;
        case 'multiply':
        case 'divide':
          return leftHand ? Precedence.Multiplicative : Precedence.Exponential;
        default:
          return invalidNode(node);
      }
    case 'exponential':
      // must bind tighter, as exponential operator is right-associative, e.g. (a^b)^c
      return Precedence.Atom;
    case 'literal':
    case 'constant':
    case 'composite':
    case 'fraction':
    case 'root':
      return Precedence.Additive;
    default:
      return invalidNode(node);
  }
}

function needsParentheses(parent: FormulaNode, child: FormulaNode, leftHand: boolean): boolean {
  return precedenceOf(child) < requiredPrecedence(parent, leftHand);
}

function invalidNode(node: never): never {
  console.error('Invalid formula node:', node);
  throw new Error(`Invalid formula node: ${JSON.stringify(node)}`);
}
