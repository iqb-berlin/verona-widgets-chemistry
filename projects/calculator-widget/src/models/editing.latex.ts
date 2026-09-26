import { EditSequence, EditToken } from './editing.ast';
import { sequence, token } from './editing.factory';
import { CONSTANTS, ConstantSymbol } from './constants.model';

/**
 * LaTeX is the storage format of an edit sequence:
 * It carries what the user put in, and  nothing else - no styling, no layout commands, no alignment.
 * Writing is strict, reading is liberal: Anything the model cannot hold is dropped rather than rejected,
 * so that a formula from somewhere else still restores as far as it can.
 *
 * Round trips of what this application writes are exact, in both directions:
 * `parseFromLatex(formatToLatex(tree))` holds the same tokens as `tree`, and
 * `formatToLatex(parseFromLatex(latex))` is the very same string again.
 */
export function formatToLatex(tree: EditSequence): string {
  return tree.items.map(formatToken).join('');
}

export function parseFromLatex(latex: string): EditSequence {
  return new LatexParser(latex).parse();
}

//#region Writing

function formatToken(item: EditToken): string {
  function group(part: EditSequence): string {
    return `{${formatToLatex(part)}}`;
  }
  switch (item.kind) {
    case 'sequence':
      return formatToLatex(item); // a sequence is no token of its own, but stays readable
    case 'literal':
      return item.literal;
    case 'constant':
      return CONSTANTS[item.symbol].latex;
    case 'operator':
      return OPERATOR_LATEX[item.operator];
    case 'fence':
      return item.fence; // plain fences, as the sequence being edited may be unbalanced
    case 'fraction':
      return `\\frac${group(item.dividend)}${group(item.divisor)}`;
    case 'composite':
      // the braced integer part tells a mixed number from a product of a number and a fraction
      return `${group(item.integerPart)}\\frac${group(item.numerator)}${group(item.denominator)}`;
    case 'exponent':
      return `${group(item.base)}^${group(item.exponent)}`;
    case 'root':
      return item.degree.items.length === 0
        ? `\\sqrt${group(item.radicand)}` // an empty degree is the square root
        : `\\sqrt[${formatToLatex(item.degree)}]${group(item.radicand)}`;
  }
}

const OPERATOR_LATEX: Readonly<Record<EditToken.Operator['operator'], string>> = {
  '+': '+',
  '-': '-',
  '*': '\\cdot',
  '/': '\\div',
};

//#endregion
//#region Reading

const FRACTION_COMMANDS = new Set(['frac', 'dfrac', 'tfrac', 'cfrac']);
const PRODUCT_COMMANDS = new Set(['cdot', 'times', 'ast']);
const SPACING_COMMANDS = new Set([',', ';', ':', '!', ' ', '\\', 'quad', 'qquad', 'thinspace', 'enspace']);
const UPRIGHT_COMMANDS = new Set(['mathrm', 'text', 'textrm', 'operatorname']);

const CONSTANT_COMMANDS: Readonly<Record<string, ConstantSymbol>> = {
  ['pi']: ConstantSymbol.Pi,
  ['tau']: ConstantSymbol.Tau,
  ['varphi']: ConstantSymbol.Phi,
  ['phi']: ConstantSymbol.Phi,
  ['Phi']: ConstantSymbol.Phi,
};

const UPRIGHT_CONSTANTS: Readonly<Record<string, ConstantSymbol>> = {
  e: ConstantSymbol.E,
};

class LatexParser {
  private index = 0;

  constructor(private readonly source: string) {}

  parse(): EditSequence {
    return sequence(...this.items(null));
  }

  // Read tokens up to the given closing character, or up to the end of the input
  private items(until: null | '}' | ']'): ReadonlyArray<EditToken> {
    const items: EditToken[] = [];

    while (this.index < this.source.length) {
      const char = this.source[this.index];
      if (char === until) break;
      this.index++;

      switch (char) {
        case ' ':
        case '\t':
        case '\n':
        case '\r':
          break; // whitespace carries no meaning of its own
        case '{':
          this.group(items);
          break;
        case '}':
        case ']':
          break; // a closing character without its opening one is dropped
        case '\\':
          this.command(items);
          break;
        case '^':
          this.exponent(items);
          break;
        case '_':
          this.argument(); // an index cannot be held by the model, so it goes
          break;
        case '+':
        case '-':
          items.push(token('operator', { operator: char }));
          break;
        case '*':
          items.push(token('operator', { operator: '*' }));
          break;
        case '/':
          items.push(token('operator', { operator: '/' }));
          break;
        case '(':
        case ')':
          items.push(token('fence', { fence: char }));
          break;
        default:
          this.index--; // hand the character back to the literal reader
          if (!this.literal(items)) this.index++; // or drop it, if it starts no literal
          break;
      }
    }
    return items;
  }

  // A group either belongs to what follows it — the integer part of a mixed number, the
  // base of a power — or it is plain LaTeX grouping, which the model does not hold.
  private group(items: EditToken[]): void {
    const content = this.items('}');
    this.skip('}');

    if (this.startsFraction()) {
      const [numerator, denominator] = this.fractionArguments();
      items.push(token('composite', { integerPart: sequence(...content), numerator, denominator }));
      return;
    }
    if (this.startsExponent()) {
      items.push(token('exponent', { base: sequence(...content), exponent: this.argument() }));
      return;
    }
    items.push(...content);
  }

  // A power binds the group or token in front of it, e.g. `{1+2}^{3}` as well as `2^3`
  private exponent(items: EditToken[]): void {
    const exponent = this.argument();
    const previous = items.pop();
    const base = previous === undefined ? sequence() : sequence(previous);
    items.push(token('exponent', { base, exponent }));
  }

  private command(items: EditToken[]): void {
    const name = this.commandName();

    if (FRACTION_COMMANDS.has(name)) {
      const [dividend, divisor] = this.fractionArguments();
      items.push(token('fraction', { dividend, divisor }));
      return;
    }
    if (PRODUCT_COMMANDS.has(name)) {
      items.push(token('operator', { operator: '*' }));
      return;
    }
    if (SPACING_COMMANDS.has(name)) return;

    if (name === 'div') {
      items.push(token('operator', { operator: '/' }));
      return;
    }
    if (name === 'sqrt') {
      const degree = this.optionalArgument();
      const radicand = this.argument();
      items.push(token('root', { degree, radicand }));
      return;
    }
    if (name === 'left' || name === 'right') {
      const fence = this.delimiter();
      if (fence !== null) items.push(token('fence', { fence }));
      return;
    }
    if (UPRIGHT_COMMANDS.has(name)) {
      const symbol = UPRIGHT_CONSTANTS[this.rawArgument().trim()];
      if (symbol !== undefined) items.push(token('constant', { symbol }));
      return;
    }

    const constant = CONSTANT_COMMANDS[name];
    if (constant !== undefined) items.push(token('constant', { symbol: constant }));
    // every other command is unknown to the model and simply dropped
  }

  // Read a number, which is digits with at most one decimal point
  private literal(items: EditToken[]): boolean {
    let literal = '';
    let hasPoint = false;

    while (this.index < this.source.length) {
      const char = this.source[this.index];
      if (char >= '0' && char <= '9') {
        literal += char;
        this.index++;
        continue;
      }
      if (!hasPoint && this.readsAsDecimalPoint(literal.length > 0)) {
        literal += '.';
        hasPoint = true;
        continue;
      }
      break;
    }

    if (literal.length === 0) return false;
    items.push(token('literal', { literal }));
    return true;
  }

  // A decimal point is written as `.` or, in German formulas, as `,` - where `{,}` is the
  // usual way to keep it from being read as punctuation.
  private readsAsDecimalPoint(afterDigits: boolean): boolean {
    const char = this.source[this.index];
    if (char === '.' || (char === ',' && afterDigits && isDigit(this.source[this.index + 1]))) {
      this.index++;
      return true;
    }
    const braced = this.source.slice(this.index, this.index + 3);
    if ((braced === '{,}' || braced === '{.}') && isDigit(this.source[this.index + 3])) {
      this.index += 3;
      return true;
    }
    return false;
  }

  //#region Arguments

  // The argument of a command: a group, or the single token following it, as in `\frac12`
  private argument(): EditSequence {
    this.skipWhitespace();
    if (this.source[this.index] === '{') {
      this.index++;
      const content = this.items('}');
      this.skip('}');
      return sequence(...content);
    }

    const char = this.source[this.index];
    if (char === undefined) return sequence();

    const single: EditToken[] = [];
    if (char === '\\') {
      this.index++;
      this.command(single);
    } else if (isDigit(char) || char === '.') {
      this.literal1(single);
    } else {
      this.index++; // a single character the model cannot hold
    }
    return sequence(...single);
  }

  // A single digit binds as an argument on its own, e.g. `2^12` is `2^1` followed by `2`
  private literal1(items: EditToken[]): void {
    const char = this.source[this.index];
    this.index++;
    items.push(token('literal', { literal: char }));
  }

  private optionalArgument(): EditSequence {
    this.skipWhitespace();
    if (this.source[this.index] !== '[') return sequence();
    this.index++;
    const content = this.items(']');
    this.skip(']');
    return sequence(...content);
  }

  private fractionArguments(): [EditSequence, EditSequence] {
    return [this.argument(), this.argument()];
  }

  // The raw text of an argument, for commands whose content is no formula of its own
  private rawArgument(): string {
    this.skipWhitespace();
    if (this.source[this.index] !== '{') {
      const char = this.source[this.index] ?? '';
      this.index += char.length;
      return char;
    }

    this.index++;
    let depth = 1;
    let raw = '';
    while (this.index < this.source.length && depth > 0) {
      const char = this.source[this.index++];
      if (char === '{') depth++;
      if (char === '}' && --depth === 0) break;
      raw += char;
    }
    return raw;
  }

  private delimiter(): null | '(' | ')' {
    this.skipWhitespace();
    const char = this.source[this.index];
    if (char === '(' || char === ')') {
      this.index++;
      return char;
    }
    if (char === '\\') {
      this.commandName(); // `\left\{` and the like are dropped
    } else if (char !== undefined) {
      this.index++; // `\left.` and the like as well
    }
    return null;
  }

  //#endregion
  //#region Reading characters

  private commandName(): string {
    const first = this.source[this.index];
    if (first === undefined) return '';
    if (!isLetter(first)) {
      this.index++;
      return first; // a command of one character, such as the spacing `\,`
    }

    let name = '';
    while (this.index < this.source.length && isLetter(this.source[this.index])) {
      name += this.source[this.index++];
    }
    return name;
  }

  // Look ahead for a fraction command, consuming it only when it is there
  private startsFraction(): boolean {
    const mark = this.index;
    this.skipWhitespace();
    if (this.source[this.index] === '\\') {
      this.index++;
      if (FRACTION_COMMANDS.has(this.commandName())) return true;
    }
    this.index = mark;
    return false;
  }

  private startsExponent(): boolean {
    const mark = this.index;
    this.skipWhitespace();
    if (this.source[this.index] === '^') {
      this.index++;
      return true;
    }
    this.index = mark;
    return false;
  }

  private skipWhitespace(): void {
    while (this.index < this.source.length && ' \t\n\r'.includes(this.source[this.index])) this.index++;
  }

  private skip(char: '}' | ']'): void {
    if (this.source[this.index] === char) this.index++;
  }

  //#endregion
}

function isDigit(char: undefined | string): boolean {
  return char !== undefined && char >= '0' && char <= '9';
}

function isLetter(char: undefined | string): boolean {
  return char !== undefined && ((char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z'));
}

//#endregion
