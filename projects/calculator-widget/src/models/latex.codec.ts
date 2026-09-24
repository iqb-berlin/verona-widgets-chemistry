import * as AST from './ast.model';
import * as C from './constants.model';
import {
  add,
  compositeFraction,
  constant,
  decimal,
  divide,
  group,
  hole,
  multiply,
  negate,
  pow,
  root,
  sqrt,
  subtract,
} from './ast.factory';

export interface LatexOptions {
  readonly holeCommand?: string;
  readonly enableStretchyFences?: boolean;
}

export interface LatexParseIssue {
  readonly cause: 'unexpected' | 'end';
  readonly position: number;
  readonly detail: string;
  readonly expected?: string;
}

export type LatexParseResult =
  | {
      readonly ok: true;
      readonly formula: AST.FormulaNode;
    }
  | {
      readonly ok: false;
      readonly issue: LatexParseIssue;
    };

export function latexFormat(formula: AST.FormulaNode, options: LatexOptions = {}): string {
  const formatter = new LatexFormatter(options);
  return formatter.format(formula);
}

export function latexParse(source: string): LatexParseResult {
  try {
    const tokens = Array.from(latexTokenize(source));
    const parser = new LatexParser(tokens, source.length);
    const formula = parser.parse();
    return { ok: true, formula };
  } catch (error: unknown) {
    if (error instanceof LatexSyntaxError) return { ok: false, issue: error.issue };
    throw error;
  }
}

//#region Formatter

const FENCE_COMMANDS = {
  parentheses: ['(', ')'],
  brackets: ['[', ']'],
  braces: ['{', '}'],
} as const satisfies Record<AST.GroupFence, [string, string]>;

const MULTIPLY_COMMANDS = {
  dot: ' \\cdot ',
  cross: ' \\times ',
  implicit: '',
} as const satisfies Record<AST.MultiplyNotation, string>;

const DIVIDE_COMMANDS = {
  solidus: ' / ',
} as const satisfies Record<Exclude<AST.DivisionNotation, 'fraction'>, string>;

class LatexFormatter {
  private readonly holeCommand: string;
  private readonly enableStretchyFences: boolean;

  constructor(options: LatexOptions) {
    this.holeCommand = options.holeCommand ?? '\\square';
    this.enableStretchyFences = options.enableStretchyFences ?? true;
  }

  format(node: AST.FormulaNode): string {
    switch (node.kind) {
      case 'hole': {
        return this.holeCommand;
      }
      case 'number': {
        return node.literal.replaceAll(',', '.');
      }
      case 'constant': {
        return C.CONSTANTS[node.symbol].latex;
      }
      case 'group': {
        const expression = this.format(node.expression);
        return this.fence(expression, node.fence);
      }
      case 'negate': {
        const operand = this.child(node, 'operand', node.operand);
        return `-${operand}`;
      }
      case 'add': {
        const left = this.child(node, 'left', node.left);
        const right = this.child(node, 'right', node.right);
        return `${left} + ${right}`;
      }
      case 'subtract': {
        const left = this.child(node, 'left', node.left);
        const right = this.child(node, 'right', node.right);
        return `${left} - ${right}`;
      }
      case 'multiply': {
        const left = this.child(node, 'left', node.left);
        const right = this.child(node, 'right', node.right);
        const operator = MULTIPLY_COMMANDS[node.notation];
        return `${left}${operator}${right}`;
      }
      case 'divide': {
        const dividend = this.child(node, 'dividend', node.dividend);
        const divisor = this.child(node, 'divisor', node.divisor);
        if (node.notation === 'fraction') {
          return `\\frac{${dividend}}{${divisor}}`;
        } else {
          const operator = DIVIDE_COMMANDS[node.notation];
          return `${dividend}${operator}${divisor}`;
        }
      }
      case 'composite': {
        const integer = this.child(node, 'integerPart', node.integerPart);
        const numerator = this.child(node, 'numerator', node.numerator);
        const denominator = this.child(node, 'denominator', node.denominator);
        return `${integer}\\frac{${numerator}}{${denominator}}`;
      }
      case 'pow': {
        const base = this.child(node, 'base', node.base);
        const exponent = this.format(node.exponent);
        return `${base}^{${exponent}}`;
      }
      case 'root': {
        const radicand = this.child(node, 'radicand', node.radicand);
        if (node.degree === null) {
          return `\\sqrt{${radicand}}`;
        } else {
          const degree = this.child(node, 'degree', node.degree);
          return `\\sqrt[${degree}]{${radicand}}`;
        }
      }
      default:
        console.error('Invalid node:', node satisfies never);
        return ''; // omit invalid nodes
    }
  }

  private fence(body: string, type: AST.GroupFence): string {
    const [open, close] = FENCE_COMMANDS[type];
    return this.enableStretchyFences ? `\\left${open}${body}\\right${close}` : `${open}${body}${close}`;
  }

  private child(parent: AST.FormulaNode, slot: AST.FormulaSlot, value: AST.FormulaNode): string {
    const content = this.format(value);
    return AST.needsParentheses(parent, slot, value) ? this.fence(content, 'parentheses') : content;
  }
}

//#endregion
//#region Parser

type LatexTokenType = 'number' | 'command' | 'symbol' | 'letter';

interface LatexToken {
  readonly type: LatexTokenType;
  readonly value: string;
  readonly position: number;
}

class LatexSyntaxError extends Error {
  constructor(readonly issue: LatexParseIssue) {
    super(issue.detail);
    this.name = 'LatexSyntaxError';
  }
}

const CONSTANT_COMMANDS = new Map<string, C.ConstantInfo>();
CONSTANT_COMMANDS.set('\\pi', C.CONSTANTS[C.ConstantSymbol.Pi]);
CONSTANT_COMMANDS.set('\\tau', C.CONSTANTS[C.ConstantSymbol.Tau]);
CONSTANT_COMMANDS.set('\\phi', C.CONSTANTS[C.ConstantSymbol.Phi]);
CONSTANT_COMMANDS.set('\\varphi', C.CONSTANTS[C.ConstantSymbol.Phi]);

const HOLE_COMMANDS = new Set(['\\square', '\\Box', '\\placeholder']);
const FRACTION_COMMANDS = new Set(['\\frac', '\\dfrac', '\\tfrac', '\\cfrac']);
const IGNORED_COMMANDS = new Set([
  '\\,',
  '\\;',
  '\\:',
  '\\!',
  '\\quad',
  '\\qquad',
  '\\displaystyle',
  '\\textstyle',
  '\\\\',
]);

const R_WHITESPACE = /\s/;
const R_COMMAND = /^\\[a-z0-9*_-]*/i;
const R_DIGIT = /\d/;
const R_NUMBER = /^\d*[,.]?\d*/;
const R_LETTER = /[a-z]/i;

function* latexTokenize(source: string): Generator<LatexToken> {
  let position = 0;
  while (position < source.length) {
    const c = source[position];
    if (R_WHITESPACE.test(c)) {
      position++;
    } else if (c === '\\') {
      const match = source.slice(position).match(R_COMMAND);
      const value = match ? match[0] : '\\\\';
      yield { type: 'command', position, value };
      position += value.length;
    } else if (R_DIGIT.test(c) || (c === '.' && R_DIGIT.test(source[position + 1] ?? ''))) {
      const match = source.slice(position).match(R_NUMBER);
      const value = match ? match[0] : '';
      yield { type: 'number', position, value };
      position += value.length;
    } else if (R_LETTER.test(c)) {
      yield { type: 'letter', position, value: c };
      position++;
    } else {
      yield { type: 'symbol', position, value: c };
      position++;
    }
  }
}

class LatexParser {
  private index = 0;

  constructor(
    private readonly tokens: ReadonlyArray<LatexToken>,
    private readonly sourceLength: number,
  ) {}

  parse(): AST.FormulaNode {
    if (this.tokens.length === 0) {
      return hole();
    }

    const node = this.expression();
    if (this.index < this.tokens.length) {
      const unexpected = this.peek();
      throw new LatexSyntaxError({
        cause: 'unexpected',
        detail: unexpected?.value ?? '',
        position: unexpected?.position ?? this.sourceLength,
      });
    }

    return node;
  }

  private consume(required?: string): LatexToken {
    const token = this.tokens[this.index];
    if (token === undefined) {
      throw new LatexSyntaxError({ cause: 'end', detail: '', position: this.sourceLength });
    }
    if (required !== undefined && token.value !== required) {
      const position = token?.position ?? this.sourceLength;
      throw new LatexSyntaxError({ cause: 'unexpected', position, detail: token.value, expected: required });
    }
    this.index++;
    return token;
  }

  private peek(offset = 0): undefined | LatexToken {
    return this.tokens[this.index + offset];
  }

  private matches(...values: string[]): boolean {
    const next = this.peek();
    return next !== undefined && values.includes(next.value);
  }

  private expression(): AST.FormulaNode {
    let lhs = this.unary();
    while (this.matches('+', '-')) {
      const operator = this.consume().value;
      const rhs = this.unary();
      lhs = operator === '+' ? add(lhs, rhs) : subtract(lhs, rhs);
    }
    return lhs;
  }

  private unary(): AST.FormulaNode {
    if (this.matches('-')) {
      this.consume();
      return negate(this.unary());
    }
    if (this.matches('+')) {
      this.consume();
      return this.unary();
    }
    return this.product();
  }

  private product(): AST.FormulaNode {
    let lhs = this.pow();
    while (true) {
      if (this.matches('\\cdot', '*')) {
        this.consume();
        lhs = multiply(lhs, this.pow(), 'dot');
      } else if (this.matches('\\times')) {
        this.consume();
        lhs = multiply(lhs, this.pow(), 'cross');
      } else if (this.matches('\\div', '/')) {
        this.consume();
        lhs = divide(lhs, this.pow(), 'solidus');
      } else if (this.startsAtom()) {
        lhs = multiply(lhs, this.pow(), 'implicit');
      } else {
        return lhs;
      }
    }
  }

  private pow(): AST.FormulaNode {
    const base = this.atom();
    if (this.matches('^')) {
      this.consume();
      return pow(base, this.argument());
    }
    return base;
  }

  private argument(optional: boolean = false): AST.FormulaNode {
    if (this.matches(optional ? '[' : '{')) {
      this.consume();
      const node = this.expression();
      this.consume(optional ? ']' : '}');
      return node;
    }
    // Unbraced number takes all of its digits, e.g. 2^10 = 2^(10) instead of (2^1)*0
    return this.atom();
  }

  private startsAtom(): boolean {
    const token = this.peek();
    if (token === undefined) return false; // whoops
    switch (token.type) {
      case 'number':
      case 'letter':
        return true;
      case 'symbol':
        return '([{'.includes(token.value);
      case 'command':
        return (
          FRACTION_COMMANDS.has(token.value) ||
          HOLE_COMMANDS.has(token.value) ||
          CONSTANT_COMMANDS.has(token.value) ||
          token.value === '\\sqrt' ||
          token.value === '\\left' ||
          token.value === '\\mathrm'
        );
      default:
        return false;
    }
  }

  private atom(): AST.FormulaNode {
    const token = this.peek();
    if (token === undefined) throw new LatexSyntaxError({ cause: 'end', detail: '', position: this.sourceLength });

    switch (token.type) {
      case 'number': {
        this.consume();
        const literal = decimal(token.value);

        // detect composite fraction, e.g. 1\frac{2}{3} => 1+(2/3)
        const following = this.peek();
        const isInteger = !literal.literal.includes('.') && !literal.literal.includes(',');
        if (isInteger && following?.type === 'command' && FRACTION_COMMANDS.has(following.value)) {
          this.consume();
          const numerator = this.argument();
          const denominator = this.argument();
          return compositeFraction(literal, numerator, denominator);
        } else {
          return literal;
        }
      }
      case 'symbol': {
        if ('(['.includes(token.value)) {
          this.consume();
          const expression = this.expression();
          this.consume(token.value === '(' ? ')' : ']');
          return group(expression, token.value === '(' ? 'parentheses' : 'brackets');
        }
        if (token.value === '{') {
          return this.argument();
        }
        throw new LatexSyntaxError({ cause: 'unexpected', detail: token.value, position: token.position });
      }
      case 'letter': {
        const symbol = this.symbol();
        return constant(symbol);
      }
      case 'command': {
        return this.command();
      }
      default: {
        console.error('Unknown Latex token:', token.type satisfies never);
        throw new Error(`Unknown Latex token: ${JSON.stringify(token)}`);
      }
    }
  }

  private symbol(): C.ConstantSymbol {
    let token = this.peek();
    const startPosition = token?.position ?? this.sourceLength;

    let text = '';
    while (token !== undefined && token.type === 'letter') {
      this.consume();
      text += token.value;
      token = this.peek();
    }

    for (const { symbol, unicode, latex } of Object.values(C.CONSTANTS)) {
      if (text === symbol || text === latex || text === unicode) return symbol;
    }
    throw new LatexSyntaxError({ cause: 'unexpected', detail: text, position: startPosition });
  }

  private command(): AST.FormulaNode {
    const command = this.consume();
    if (FRACTION_COMMANDS.has(command.value)) {
      const dividend = this.argument();
      const divisor = this.argument();
      return divide(dividend, divisor, 'fraction');
    }
    if (HOLE_COMMANDS.has(command.value)) {
      return hole();
    }
    if (CONSTANT_COMMANDS.has(command.value)) {
      const { symbol } = CONSTANT_COMMANDS.get(command.value)!;
      return constant(symbol);
    }
    if (command.value === '\\sqrt') {
      if (this.matches('[')) {
        const degree = this.argument(true);
        const radicant = this.argument();
        return root(radicant, degree);
      } else {
        const radicant = this.argument();
        return sqrt(radicant);
      }
    }
    if (command.value === '\\mathrm') {
      return this.argument();
    }
    if (command.value === '\\left') {
      const opening = this.consume();
      const body = this.expression();
      this.consume('\\right');
      this.consume(); // closing
      const fence: AST.GroupFence = opening.value === '[' ? 'brackets' : 'parentheses';
      return group(body, fence);
    }
    throw new LatexSyntaxError({ cause: 'unexpected', detail: command.value, position: command.position });
  }
}

//#endregion
