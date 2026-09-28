import { EditSequence, EditToken, EditTokenId } from './editing.ast';
import { FormulaNode } from './formula.ast';
import {
  add,
  constant,
  decimal,
  divide,
  exponential,
  int,
  multiply,
  negate,
  root,
  subtract,
  tokenScope,
} from './formula.factory';
import { Result } from './types';

export function compileToFormula(sequence: EditSequence): CompileToFormulaResult {
  const compiler = new EditSequenceCompiler(sequence);
  return compiler.compile();
}

export type CompileToFormulaResult = Result<FormulaNode, CompileToFormulaIssue>;

export interface CompileToFormulaIssue {
  readonly code: CompileToFormulaIssueCode;
  readonly sequenceId: EditTokenId;
  readonly tokenId: null | EditTokenId;
  readonly detail: null | string;
}

export type CompileToFormulaIssueCode = 'empty' | 'incomplete' | 'unexpectedEnd' | 'unexpectedToken';

//#region Internal

class CompileToFormulaError extends Error {
  constructor(readonly issue: CompileToFormulaIssue) {
    super(`${issue.code} @ ${issue.tokenId}: ${issue.detail}`);
    this.name = CompileToFormulaError.name;
  }
}

type EditTokenPredicate = (token: EditToken) => boolean;

class EditSequenceCompiler {
  private index: number = 0;

  constructor(private readonly sequence: EditSequence) {}

  compile(): CompileToFormulaResult {
    try {
      const formula = this.entrypoint();
      return Result.ok(formula);
    } catch (error: unknown) {
      if (error instanceof CompileToFormulaError) return Result.issue(error.issue);
      else throw error;
    }
  }

  private entrypoint(): FormulaNode {
    if (this.sequence.items.length === 0) {
      this.raiseIssue('empty');
    }

    return tokenScope(this.sequence, () => {
      const node = this.expression();
      if (this.index < this.sequence.items.length) {
        const unexpected = this.peek()!;
        this.raiseIssue('unexpectedToken', unexpected, unexpected.kind);
      }
      return node;
    });
  }

  private raiseIssue(code: CompileToFormulaIssueCode, offender?: null | EditToken, detail?: null | string): never {
    const sequenceId = this.sequence.id;
    const tokenId = offender?.id ?? null;
    throw new CompileToFormulaError({ code, sequenceId, tokenId, detail: detail ?? null });
  }

  //#region Syntax tree

  private expression(): FormulaNode {
    let result = this.product();
    while (this.matches((t) => t.kind === 'operator' && (t.operator === '+' || t.operator === '-'))) {
      const operator = this.consume() as EditToken.Operator;
      const next = this.product();
      tokenScope(operator, () => {
        if (operator.operator === '+') result = add(result, next);
        if (operator.operator === '-') result = subtract(result, next);
      });
    }
    return result;
  }

  private product(): FormulaNode {
    let result = this.factor();
    while (true) {
      if (this.matches((t) => t.kind === 'operator' && t.operator === '*')) {
        const operator = this.consume();
        const next = this.factor();
        tokenScope(operator, () => {
          result = multiply(result, next);
        });
      } else if (this.matches((t) => t.kind === 'operator' && t.operator === '/')) {
        const operator = this.consume();
        const next = this.factor();
        tokenScope(operator, () => {
          result = divide(result, next);
        });
      } else if (this.startsAtom()) {
        const next = this.atom();
        result = multiply(result, next); // implicit multiplication, e.g. 2(3+4)
      } else {
        return result;
      }
    }
  }

  // An atom, preceded by any number of signs, e.g. the `-3` of `2 * -3`
  private factor(): FormulaNode {
    if (this.matches((t) => t.kind === 'operator' && t.operator === '-')) {
      const operator = this.consume();
      return tokenScope(operator, () => negate(this.factor())); // unary -
    }
    if (this.matches((t) => t.kind === 'operator' && t.operator === '+')) {
      const operator = this.consume();
      return tokenScope(operator, () => this.factor()); // unary +
    }
    return this.atom();
  }

  private startsAtom(): boolean {
    const token = this.peek();
    if (token === undefined) return false; // this should never happen
    switch (token.kind) {
      case 'fence':
        return token.fence === '('; // a closing fence ends the enclosing atom instead
      case 'literal':
      case 'constant':
      case 'fraction':
      case 'composite':
      case 'exponent':
      case 'root':
        return true;
      case 'operator':
      case 'sequence':
        return false;
    }
  }

  private atom(): FormulaNode {
    const token = this.peek();
    if (token === undefined) this.raiseIssue('unexpectedEnd');

    return tokenScope(token, () => {
      switch (token.kind) {
        case 'fence': {
          this.consume((t) => t.kind === 'fence' && t.fence === '(');
          const expression = this.expression();
          this.consume((t) => t.kind === 'fence' && t.fence === ')');
          return expression;
        }
        case 'literal': {
          this.consume();
          return decimal(token.literal);
        }
        case 'constant': {
          this.consume();
          return constant(token.symbol);
        }
        case 'fraction': {
          this.consume();
          const dividend = this.childSequence(token.dividend);
          const divisor = this.childSequence(token.divisor);
          return divide(dividend, divisor);
        }
        case 'composite': {
          this.consume();
          const integerPart = this.childSequence(token.integerPart);
          const numerator = this.childSequence(token.numerator);
          const denominator = this.childSequence(token.denominator);
          return add(integerPart, divide(numerator, denominator));
        }
        case 'exponent': {
          this.consume();
          const base = this.childSequence(token.base);
          const exponent = this.childSequence(token.exponent);
          return exponential(base, exponent);
        }
        case 'root': {
          this.consume();
          // an empty degree denotes the square root, which is written without an index
          const degree = token.degree.items.length === 0 ? int(2) : this.childSequence(token.degree);
          const radicand = this.childSequence(token.radicand);
          return root(radicand, degree);
        }
        case 'operator':
        case 'sequence':
          return this.raiseIssue('unexpectedToken', token, token.kind);
        default:
          console.error('Unknown token:', token satisfies never);
          throw new Error(`Unknown token: ${JSON.stringify(token)}`);
      }
    });
  }

  //#endregion
  //#region Slot child sequences

  private childSequence(child: EditToken.Sequence): FormulaNode {
    const childCompiler = new EditSequenceCompiler(child);
    return childCompiler.entrypoint();
  }

  //#endregion
  //#region Token processing

  private peek(offset = 0): undefined | EditToken {
    return this.sequence.items[this.index + offset];
  }

  private consume(check?: EditTokenPredicate): EditToken {
    const token = this.sequence.items[this.index];
    if (token === undefined) this.raiseIssue('unexpectedEnd');
    if (check !== undefined && !check(token)) {
      this.raiseIssue('unexpectedToken', token, token.kind);
    }
    this.index++;
    return token;
  }

  private matches(test: EditTokenPredicate): boolean {
    const token = this.peek();
    return token !== undefined && test(token);
  }

  //#endregion
}

//#endregion
