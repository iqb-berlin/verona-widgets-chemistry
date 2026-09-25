import { EditSequence, EditToken, EditTokenId } from './editing.ast';
import { FormulaNode } from './formula.ast';
import { add, constant, decimal, divide, exponential, multiply, negate, root, subtract } from './formula.factory';
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

export type CompileToFormulaIssueCode = 'incomplete' | 'unexpectedEnd' | 'unexpectedToken';

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
      this.raiseIssue('incomplete');
    }

    const node = this.expression();
    if (this.index < this.sequence.items.length) {
      const unexpected = this.peek()!;
      this.raiseIssue('unexpectedToken', unexpected, unexpected.kind);
    }

    return node;
  }

  private raiseIssue(code: CompileToFormulaIssueCode, offender?: null | EditToken, detail?: null | string): never {
    const sequenceId = this.sequence.id;
    const tokenId = offender?.id ?? null;
    throw new CompileToFormulaError({ code, sequenceId, tokenId, detail: detail ?? null });
  }

  //#region Syntax tree

  private expression(): FormulaNode {
    let result = this.unary();
    while (this.matches((t) => t.kind === 'operator' && (t.operator === '+' || t.operator === '-'))) {
      const operator = this.consume() as EditToken.Operator;
      const next = this.unary();
      if (operator.operator === '+') result = add(result, next);
      if (operator.operator === '-') result = subtract(result, next);
    }
    return result;
  }

  private unary(): FormulaNode {
    if (this.matches((t) => t.kind === 'operator' && t.operator === '-')) {
      this.consume();
      return negate(this.unary()); // unary -
    }
    if (this.matches((t) => t.kind === 'operator' && t.operator === '+')) {
      this.consume();
      return this.unary(); // unary +
    }
    return this.product();
  }

  private product(): FormulaNode {
    let result = this.exponential();
    while (true) {
      if (this.matches((t) => t.kind === 'operator' && t.operator === '*')) {
        this.consume();
        result = multiply(result, this.exponential());
      } else if (this.matches((t) => t.kind === 'operator' && t.operator === '/')) {
        this.consume();
        result = divide(result, this.exponential());
      } else if (this.matches((t) => t.kind === 'fraction')) {
        this.consume();
        result = divide(result, this.exponential());
      } else if (this.startsAtom()) {
        result = multiply(result, this.exponential());
      } else {
        return result;
      }
    }
  }

  private exponential(): FormulaNode {
    const base = this.atom();
    if (this.matches((t) => t.kind === 'exponent')) {
      this.consume();
      return exponential(base, this.argument());
    }
    return base;
  }

  private argument(): FormulaNode {
    if (this.matches((t) => t.kind === 'fence' && t.fence === '(')) {
      this.consume();
      const node = this.expression();
      this.consume((t) => t.kind === 'fence' && t.fence === ')');
      return node;
    }
    return this.atom();
  }

  private startsAtom(): boolean {
    const token = this.peek();
    if (token === undefined) return false; // this should never happen
    switch (token.kind) {
      case 'literal':
      case 'constant':
      case 'fence':
      case 'fraction':
      case 'composite':
      case 'root':
        return true;
      case 'operator':
      case 'exponent':
      case 'sequence':
        return false;
    }
  }

  private atom(): FormulaNode {
    const token = this.peek();
    if (token === undefined) this.raiseIssue('unexpectedEnd');

    switch (token.kind) {
      case 'fence': {
        this.consume((t) => t.kind === 'fence' && t.fence === '(');
        const expression = this.expression();
        this.consume((t) => t.kind === 'fence' && t.fence === ')');
        return expression;
      }
      case 'literal': {
        return decimal(token.literal);
      }
      case 'constant': {
        return constant(token.symbol);
      }
      case 'fraction': {
        const dividend = this.childSequence(token.dividend);
        const divisor = this.childSequence(token.divisor);
        return divide(dividend, divisor);
      }
      case 'composite': {
        const integerPart = this.childSequence(token.integerPart);
        const numerator = this.childSequence(token.numerator);
        const denominator = this.childSequence(token.denominator);
        return add(integerPart, divide(numerator, denominator));
      }
      case 'exponent': {
        const base = this.childSequence(token.base);
        const exponent = this.childSequence(token.exponent);
        return exponential(base, exponent);
      }
      case 'root': {
        const degree = this.childSequence(token.degree);
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
