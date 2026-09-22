import * as C from './constants.model';
import { ConstantSymbol } from './constants.model';
import * as R from './rational.model';
import { Operand, Sign } from './operand.model';
import { Nominal } from './nominal';
import * as U from './utils';
import { bigIsEven } from './utils';

type BaseKey = Nominal<string, 'Base'>;
type FactorKey = Nominal<string, 'Factor'>;
type SignatureKey = Nominal<string, 'Signature'>;
type PolynomialKey = Nominal<string, 'Polynomial'>;
type ExactKey = Nominal<string, 'Exact'>;

const MAX_ROOT_DEGREE = 128n;
const MAX_POW_EXPONENT = 4096n;

const ZERO_POLY: Polynomial = [] as const;
const ONE_POLY: Polynomial = [{ coefficient: R.Rational.ONE, factors: [] }] as const;

/**
 * # Model of an exact symbolic value
 *
 * A calculator that must keep `pi` and `sqrt(2)` exact needs more than
 * rationals; this model is a rational function over a small symbol algebra:
 * ```
 * ExactValue  =  Polynomial / Polynomial;
 * Polynomial  =  Sum of Monomials (canonically ordered);
 * Monomial    =  Rational coefficient * product of Factors;
 * Factor      =  Base ^ Positive-rational-exponent;
 * Base        =  An irrational constant (pi, e, tau, phi) |  A radicand (an ExactValue, e.g. the 2 in sqrt(2));
 * ```
 *
 * ## Closure properties that matter:
 * - Operators `+ - * /` are closed, because division just swaps the two polynomials.
 * - Roots are closed, because an unresolvable root becomes a new radical base.
 * - Every factor exponent is strictly positive: `1/pi` is `ONE / [pi]`, never
 *   `pi^-1`. That single invariant removes a whole class of edge cases.
 *
 * ## Normal form:
 * - Surds (aka irrational root numbers) over rational radicands are always cleared from
 *   the denominator (`1/sqrt(2)` -> `sqrt(2)/2`), perfect powers are extracted (`sqrt(8)` ->
 *   `2*sqrt(2)`), and the denominator carries a positive leading coefficient
 * - Irrational constants are *not* cleared from the denominator, because
 *   `1/pi` is already the form a user expects to read.
 *
 * Known limitation, stated rather than hidden: Equality is structural on the
 * canonical form. `sqrt(2)*sqrt(8) - 4` collapses to zero, but
 * `sqrt(2+sqrt(3)) - (1+sqrt(3))/sqrt(2)` does not. Deciding zero for nested
 * radicals is exactly the hard part of a real CAS; callers that need certainty
 * should compare `toDecimalString(n)` as well.
 */
export class ExactValue implements Operand<ExactValue> {
  static readonly ZERO = new this(ZERO_POLY, ONE_POLY);
  static readonly ONE = new this(ONE_POLY, ONE_POLY);
  static readonly isOnePolynomial = isOnePoly

  private constructor(
    readonly numerator: Polynomial,
    readonly denominator: Polynomial,
  ) {}

  static fromRational(rational: R.Rational): ExactValue {
    if (rational.isZero) return ExactValue.ZERO;
    const numerator: Polynomial = [{ coefficient: rational, factors: [] }];
    return ExactValue.normalize(numerator, ONE_POLY);
  }

  static fromInteger(integer: number | bigint): ExactValue {
    const bigint = typeof integer === 'number' ? BigInt(integer) : integer;
    return ExactValue.fromRational(R.Rational.of(bigint));
  }

  static fromConstant(symbol: ConstantSymbol): ExactValue {
    const base: ConstantBase = { kind: 'constant', symbol };
    const factor: Factor = { base, exponent: R.Rational.ONE };
    const numerator: Polynomial = [{ coefficient: R.Rational.ONE, factors: [factor] }];
    return new ExactValue(numerator, ONE_POLY);
  }

  /** @internal Radicands must be stored denominator-free */
  static fromPolynomial(polynomial: Polynomial) {
    return new ExactValue(polynomial, ONE_POLY);
  }

  private static normalize(numerator: Polynomial, denominator: Polynomial): ExactValue {
    if (numerator.length === 0) return ExactValue.ZERO;
    if (denominator.length === 0) throw new ExactError(ExactErrorType.DivisionByZero, 'Zero denominator');

    if (denominator.length === 1) {
      const singleDenominatorTerm = denominator[0];

      // split the denominator into:
      // - the part that can be inverted exactly (rational coefficient plus every surd over a rational radicant)
      // - the residual part (constants, nested radicals) that stays below the line as a denominator
      let multiplier: Polynomial = ONE_POLY;
      let clearedScalar = singleDenominatorTerm.coefficient;
      const residualFactors: Array<Factor> = [];
      for (const factor of singleDenominatorTerm.factors) {
        const radicant = factor.base.kind === 'radical' ? factor.base.radicand.asRational() : null;
        if (radicant === null) {
          residualFactors.push(factor);
          continue;
        }

        // 1 / r^e <=> r^(1-e) -> canonical surd exponents live in 0..1
        const inverseFactor: Factor = { base: factor.base, exponent: R.Rational.ONE.subtract(factor.exponent) };
        const monomial = monoNormalize(R.Rational.ONE, [inverseFactor]);
        multiplier = polyMultiply(multiplier, monomial);
        clearedScalar = clearedScalar.multiply(radicant);
      }

      const scaleByPoly = [{ coefficient: clearedScalar.inverse(), factors: [] }];
      const scaledPoly = polyMultiply(polyMultiply(numerator, multiplier), scaleByPoly);
      const restPoly: Polynomial =
        residualFactors.length === 0 ? ONE_POLY : [{ coefficient: R.Rational.ONE, factors: residualFactors }];

      return ExactValue.polyCancelContents(scaledPoly, restPoly);
    }

    return ExactValue.polyCancelContents(numerator, denominator);
  }

  // cancel the common rational content, and fix the denominator's sign
  private static polyCancelContents(numerator: Polynomial, denominator: Polynomial): ExactValue {
    // trivial cases
    if (numerator.length === 0) return ExactValue.ZERO;
    if (isOnePoly(denominator)) return new ExactValue(numerator, ONE_POLY);

    let commonD = 1n;
    const allTerms: Polynomial = [...numerator, ...denominator];
    for (const term of allTerms) {
      commonD = U.bigLcm(commonD, term.coefficient.denominator);
    }

    let commonN = 0n; // common numerator
    for (const term of allTerms) {
      const scaled = term.coefficient.numerator * (commonD / term.coefficient.denominator);
      commonN = U.bigGcd(commonN, U.bigAbs(scaled));
    }
    if (commonN === 0n) {
      commonN = 1n; // fallback
    }

    let scale = R.Rational.of(commonD, commonN);
    if (denominator[denominator.length - 1].coefficient.isNegative) {
      scale = scale.negate();
    }

    const applyScale = (poly: Polynomial): Polynomial => {
      return poly.map((term) => {
        const coefficient = term.coefficient.multiply(scale);
        return { coefficient, factors: term.factors };
      });
    };

    return new ExactValue(applyScale(numerator), applyScale(denominator));
  }

  //#region Exact functions

  get key(): ExactKey {
    const n = polynomialKey(this.numerator);
    const d = polynomialKey(this.denominator);
    return `${n}|${d}` as ExactKey;
  }

  // null when irrational symbol is present
  asRational(): null | R.Rational {
    const n = polyAsRational(this.numerator);
    const d = polyAsRational(this.denominator);
    if (n === null || d === null || d.isZero) return null;
    return n.divide(d);
  }

  // true if no irrational symbols are present
  get isRational(): boolean {
    return this.asRational() !== null;
  }

  //#endregion
  //#region Operand functions

  get isZero(): boolean {
    return this.numerator.length === 0;
  }

  get isOne(): boolean {
    return isOnePoly(this.numerator) && isOnePoly(this.denominator);
  }

  get isNegative(): boolean {
    return this.valueOf() < 0;
  }

  add(other: ExactValue): ExactValue {
    // simplified case: common denominator
    if (polynomialKey(this.denominator) === polynomialKey(other.denominator)) {
      return ExactValue.normalize(polyAdd(this.numerator, other.numerator), this.denominator);
    }
    // divergent denominator: full multiply
    return ExactValue.normalize(
      polyAdd(polyMultiply(this.numerator, other.denominator), polyMultiply(other.numerator, this.denominator)),
      polyMultiply(this.denominator, other.denominator),
    );
  }

  subtract(other: ExactValue): ExactValue {
    return this.add(other.negate());
  }

  multiply(other: ExactValue): ExactValue {
    return ExactValue.normalize(
      polyMultiply(this.numerator, other.numerator),
      polyMultiply(this.denominator, other.denominator),
    );
  }

  divide(other: ExactValue): ExactValue {
    if (other.isZero) throw new ExactError(ExactErrorType.DivisionByZero, 'Division by zero');
    return ExactValue.normalize(
      polyMultiply(this.numerator, other.denominator),
      polyMultiply(this.denominator, other.numerator),
    );
  }

  pow(exponent: bigint): ExactValue {
    if (exponent === 0n) {
      if (this.isZero) throw new ExactError(ExactErrorType.Indeterminate, 'Zero raised to the power of zero');
      return ExactValue.ONE;
    }
    if (exponent < 0n) return this.pow(-exponent).inverse();

    return ExactValue.normalize(polyPow(this.numerator, exponent), polyPow(this.denominator, exponent));
  }

  rationalPow(exponent: R.Rational): ExactValue {
    if (exponent.isInteger) return this.pow(exponent.numerator);
    if (exponent.isNegative) return this.rationalPow(exponent.negate()).inverse();
    if (this.isZero) return ExactValue.ZERO;
    if (this.isNegative && bigIsEven(exponent.denominator))
      throw new ExactError(ExactErrorType.ComplexResult, 'Even root of a negative value');

    return ExactValue.normalize(polyRoot(this.numerator, exponent), polyRoot(this.denominator, exponent));
  }

  rationalRoot(degree: R.Rational): ExactValue {
    if (degree.isZero) throw new ExactError(ExactErrorType.Indeterminate, 'Root of degree zero');
    return this.rationalPow(degree.inverse());
  }

  compareTo(other: ExactValue): Sign {
    return U.compareSign(this.valueOf(), other.valueOf());
  }

  // checks for structural equality of the canonical form, known caveat
  equalTo(other: ExactValue): boolean {
    return this.key === other.key || this.subtract(other).isZero;
  }

  negate(): ExactValue {
    return new ExactValue(polyNegate(this.numerator), this.denominator);
  }

  inverse(): ExactValue {
    if (this.isZero) throw new ExactError(ExactErrorType.DivisionByZero, 'Inverse of zero');
    return ExactValue.normalize(this.denominator, this.numerator);
  }

  absolute(): ExactValue {
    throw new Error('Method not implemented.');
  }

  sign(): Sign {
    if (this.isZero) return 0;
    return U.compareSign(this.valueOf(), 0);
  }

  toDecimalString(digits: number, dropTrailingZeros?: boolean): string {
    const guard = digits + 12;
    const numerator = polyScalar(this.numerator, guard);
    const denominator = polyScalar(this.denominator, guard);
    if (denominator === 0n) throw new ExactError(ExactErrorType.DivisionByZero, 'Denominator evaluates to zero');
    return R.Rational.of(numerator, denominator).toDecimalString(digits, dropTrailingZeros);
  }

  //#endregion

  toString(): string {
    const n = polyString(this.numerator);
    if (isOnePoly(this.denominator)) return n;
    const d = polyString(this.denominator);
    return `(${n})/(${d})`;
  }

  valueOf(): number {
    return Number(this.toDecimalString(17, true));
  }
}

export const enum ExactErrorType {
  DivisionByZero = 'divisionByZero',
  ComplexResult = 'complexResult',
  Indeterminate = 'indeterminate',
  Unsupported = 'unsupported',
}

export class ExactError extends Error {
  readonly type: ExactErrorType;

  constructor(type: ExactErrorType, message: string) {
    super(message);
    this.name = 'ExactError';
    this.type = type;
  }
}

//#region Component types

export interface ConstantBase {
  readonly kind: 'constant';
  readonly symbol: C.ConstantSymbol;
}

export interface RadicalBase {
  readonly kind: 'radical';
  readonly radicand: ExactValue;
}

export type FactorBase = ConstantBase | RadicalBase;

export interface Factor {
  readonly base: FactorBase;
  readonly exponent: R.Rational;
}

export interface Monomial {
  readonly coefficient: R.Rational;
  readonly factors: ReadonlyArray<Factor>;
}

export type Polynomial = ReadonlyArray<Monomial>;

//#endregion
//#region Canonical key functions

function baseKey(base: FactorBase): BaseKey {
  switch (base.kind) {
    case 'constant':
      return `c:${base.symbol}` as BaseKey;
    case 'radical':
      return `r:(${base.radicand.key})` as BaseKey;
  }
}

function factorKey(factor: Factor): FactorKey {
  const b = baseKey(factor.base);
  const e = factor.exponent.toString();
  return `${b}^${e}` as FactorKey;
}

function signatureKey(factors: ReadonlyArray<Factor>): SignatureKey {
  return factors.map(factorKey).join('*') as SignatureKey;
}

function polynomialKey(polynomial: Polynomial): PolynomialKey {
  return polynomial
    .map((monomial) => `${monomial.coefficient.toString()}#${signatureKey(monomial.factors)}`)
    .join('+') as PolynomialKey;
}

//#endregion
//#region Polynomial primitives

function isOnePoly(poly: Polynomial): boolean {
  if (poly.length !== 1) return false;
  const singleTerm = poly[0];
  return singleTerm.factors.length === 0 && singleTerm.coefficient.isOne;
}

function polyAdd(left: Polynomial, right: Polynomial): Polynomial {
  const monos = new Map<SignatureKey, Monomial>();
  for (const leftMono of left) {
    const key = signatureKey(leftMono.factors);
    monos.set(key, leftMono);
  }
  for (const rightMono of right) {
    const key = signatureKey(rightMono.factors);
    const leftMono = monos.get(key);
    if (leftMono) {
      const coefficient = rightMono.coefficient.add(leftMono.coefficient);
      monos.set(key, { coefficient, factors: leftMono.factors });
    } else {
      monos.set(key, rightMono);
    }
  }
  const sum = polySort(Array.from(monos.values()));
  return sum.filter((mono) => !mono.coefficient.isZero);
}

// CAREFUL: MUTATION (for better performance)
function polySort(terms: Array<Monomial>): Polynomial {
  return terms.sort((a, b) => {
    const left = signatureKey(a.factors);
    const right = signatureKey(b.factors);
    return U.compareSign(left, right);
  });
}

function polyMultiply(left: Polynomial, right: Polynomial): Polynomial {
  let result: Polynomial = ZERO_POLY;
  for (const leftMono of left) {
    for (const rightMono of right) {
      const coefficient = leftMono.coefficient.multiply(rightMono.coefficient);
      const factors = leftMono.factors.concat(rightMono.factors);
      result = polyAdd(result, monoNormalize(coefficient, factors));
    }
  }
  return result;
}

function polyNegate(poly: Polynomial): Polynomial {
  return poly.map((mono) => {
    const coefficient = mono.coefficient.negate();
    return { coefficient, factors: mono.factors };
  });
}

function polyAsRational(poly: Polynomial): null | R.Rational {
  if (poly.length === 0) return R.Rational.ZERO;
  if (poly.length > 1) return null; // no rational representation for multi-term polynomial
  const mono = poly[0];
  if (mono.factors.length > 0) return null; // no rational representation for monomial with factors
  return mono.coefficient; // single-term polynomial without factors <=> rational
}

function polyPow(poly: Polynomial, exponent: bigint): Polynomial {
  if (exponent < 0n) throw new ExactError(ExactErrorType.Unsupported, 'Negative polynomial');
  if (exponent > MAX_POW_EXPONENT)
    throw new ExactError(ExactErrorType.Unsupported, `Exponent ${exponent} is too large`);

  let base = poly;
  let result: Polynomial = ONE_POLY;
  while (exponent > 0n) {
    if (exponent & 1n) result = polyMultiply(result, base);
    exponent >>= 1n;
    if (exponent > 0n) base = polyMultiply(base, base);
  }
  return result;
}

function polyRoot(poly: Polynomial, exponent: R.Rational): Polynomial {
  if (poly.length === 0) {
    if (exponent.sign() <= 0)
      throw new ExactError(ExactErrorType.DivisionByZero, 'Zero raised to a non-positive power');
    return ZERO_POLY;
  }

  // single-term monomial distributes: (c * f1 * f2)^e = c^e * f1^e * f2^e
  if (poly.length === 1) {
    const singleTerm = poly[0];
    const factors: Factor[] = singleTerm.factors.map((factor) => {
      return { base: factor.base, exponent: factor.exponent.multiply(exponent) };
    });
    if (!singleTerm.coefficient.isOne) {
      const base: RadicalBase = { kind: 'radical', radicand: ExactValue.fromRational(singleTerm.coefficient) };
      factors.push({ base, exponent });
    }
    return monoNormalize(R.Rational.ONE, factors);
  }

  // genuine sum becomes its own radical base
  const base: RadicalBase = { kind: 'radical', radicand: ExactValue.fromPolynomial(poly) };
  return monoNormalize(R.Rational.ONE, [{ base, exponent }]);
}

function polyScalar(poly: Polynomial, digits: number): bigint {
  let total = 0n;
  for (const term of poly) {
    let accumulator = (term.coefficient.numerator * U.bigPow10(digits)) / term.coefficient.denominator;
    for (const factor of term.factors) {
      accumulator = mulScaled(accumulator, factorScalar(factor, digits), digits);
    }
    total += accumulator;
  }
  return total;
}

function polyString(poly: Polynomial): string {
  if (poly.length === 0) return '0';
  return poly
    .map((term, index) => {
      const negative = term.coefficient.isNegative;
      const termString = monoString(term);
      if (index === 0) return negative ? `-${termString}` : termString;
      return negative ? `-${termString}` : `+${termString}`;
    })
    .join('');
}

//#endregion
//#region Monomial primitives

function monoString(mono: Monomial): string {
  const coefficient = mono.coefficient.absolute();
  if (mono.factors.length === 0) return coefficient.toString();
  const factorsString = mono.factors.map((factor) => factorString(factor)).join('*');
  if (coefficient.isOne) return factorsString;
  return `${coefficient.toString()}*${factorsString}`;
}

function monoNormalize(coefficient: R.Rational, rawFactors: ReadonlyArray<Factor>): Polynomial {
  if (coefficient.isZero) return ZERO_POLY;

  const mergedFactors = new Map<BaseKey, Factor>();
  for (const rawFactor of rawFactors) {
    if (rawFactor.exponent.isZero) continue;
    if (rawFactor.exponent.isNegative)
      throw new ExactError(ExactErrorType.Unsupported, 'Factor exponents must remain positive');

    const key = baseKey(rawFactor.base);
    const existingFactor = mergedFactors.get(key);
    if (existingFactor) {
      const exponent = existingFactor.exponent.add(rawFactor.exponent);
      mergedFactors.set(key, { base: rawFactor.base, exponent });
    } else {
      mergedFactors.set(key, rawFactor);
    }
  }

  let scalar = coefficient;
  const retainedFactors: Array<Factor> = [];
  let expandedPoly: null | Polynomial = null;
  for (const factor of mergedFactors.values()) {
    if (factor.base.kind === 'constant') {
      retainedFactors.push(factor);
      continue;
    }
    // infer factor.base.kind === 'constant'
    const radicant = factor.base.radicand;
    if (radicant.isZero) return ZERO_POLY; // immediately collapses everything to zero
    if (radicant.isOne) continue; // factor can be dropped

    // split base^(k + f) into the whole power base^k and the surd base^f
    const whole = factor.exponent.floor();
    const fractional = factor.exponent.subtract(R.Rational.of(whole));
    if (whole > 0n) {
      const power = polyPow(radicant.numerator, whole);
      expandedPoly = expandedPoly === null ? power : polyMultiply(expandedPoly, power);
    }
    if (fractional.isZero) continue;

    const radicantRational = radicant.asRational();
    if (radicantRational !== null) {
      const [simplifiedCoefficient, simplifiedFactor] = simplifySurd(radicantRational, fractional);
      scalar = scalar.multiply(simplifiedCoefficient);
      if (simplifiedFactor) retainedFactors.push(simplifiedFactor);
    } else if (U.bigIsEven(fractional.denominator) && radicant.valueOf() < 0) {
      throw new ExactError(ExactErrorType.ComplexResult, 'Even root of a negative value');
    } else {
      retainedFactors.push({ base: factor.base, exponent: fractional });
    }
  }

  if (scalar.isZero) return ZERO_POLY;

  retainedFactors.sort((a, b) => {
    const left = baseKey(a.base);
    const right = baseKey(b.base);
    return U.compareSign(left, right);
  });

  const monomial: Monomial = { coefficient: scalar, factors: retainedFactors };
  return expandedPoly === null ? [monomial] : polyMultiply([monomial], expandedPoly);
}

/**
 * `(p/q)^(a/b)` with `0 < a/b < 1` becomes `coefficient * inside^(1/b)`.
 *
 * Derivation: `(p/q)^(a/b) = (p^a * q^(b-a))^(1/b) / q`, after which every
 * perfect `b`-th power is extracted from the integer radicand.
 */
function simplifySurd(value: R.Rational, exponent: R.Rational): [coefficient: R.Rational, factor: Factor | null] {
  const a = exponent.numerator;
  const b = exponent.denominator;
  if (b > MAX_ROOT_DEGREE)
    throw new ExactError(ExactErrorType.Unsupported, `Root degree ${b} exceeds the supported maximum`);

  const negative = value.isNegative;
  if (negative && U.bigIsEven(b)) throw new ExactError(ExactErrorType.ComplexResult, 'Even root of a negative number');

  const sign = negative && !U.bigIsEven(a) ? R.Rational.MINUS_ONE : R.Rational.ONE;

  const radicand = U.bigPow(U.bigAbs(value.numerator), a) * U.bigPow(value.denominator, b - a);
  const { outside, inside } = U.extractNthPower(radicand, Number(b));
  const coefficient = sign.multiply(R.Rational.of(outside, value.denominator));

  if (inside === 1n) {
    return [coefficient, null];
  } else {
    const base: RadicalBase = { kind: 'radical', radicand: ExactValue.fromRational(R.Rational.of(inside)) } as const;
    const factor: Factor = { base, exponent: R.Rational.of(1n, b) };
    return [coefficient, factor];
  }
}

//#endregion
//#region Factor primitives

function factorScalar(factor: Factor, digits: number): bigint {
  const base = baseScalar(factor.base, digits);
  const whole = factor.exponent.floor();
  const fractional = factor.exponent.subtract(R.Rational.of(whole));

  let result = powScaled(base, whole, digits);
  if (fractional.isZero) return result;

  return mulScaled(result, rootScalar(base, fractional, digits), digits);
}

function factorString(factor: Factor): string {
  switch (factor.base.kind) {
    case 'constant': {
      return factor.exponent.isOne ? factor.base.symbol : `${factor.base.symbol}^${factor.exponent.toString()}`;
    }
    case 'radical': {
      const radicand = factor.base.radicand.toString();
      if (factor.exponent.numerator !== 1n) return `(${radicand})^${factor.exponent.toString()}`;
      if (factor.exponent.denominator === 2n) return `sqrt(${radicand})`;
      return `root${factor.exponent.denominator}(${radicand})`;
    }
  }
}

//#endregion
//#region Base primitives

function baseScalar(base: FactorBase, digits: number): bigint {
  if (base.kind === 'constant') {
    return constantScalar(C.CONSTANTS[base.symbol].decimal, digits);
  }
  // infer base.kind === 'radical'
  const numerator = polyScalar(base.radicand.numerator, digits);
  const denominator = polyScalar(base.radicand.denominator, digits);
  if (denominator === 0n) throw new ExactError(ExactErrorType.DivisionByZero, 'Radicand denominator evaluates to zero');
  return (numerator * U.bigPow10(digits)) / denominator;
}

function constantScalar(decimal: string, digits: number): bigint {
  const [integerPart, fractionPart = ''] = decimal.split('.');
  const padded = digits <= fractionPart.length ? fractionPart.slice(0, digits) : fractionPart.padEnd(digits, '0');

  return BigInt(`${integerPart}${padded}`);
}

// `(value / 10 ^ d) ** (a / b)`, scaled back up, via an integer b-th root.
function rootScalar(value: bigint, exponent: R.Rational, digits: number): bigint {
  const a = exponent.numerator;
  const b = exponent.denominator;
  const degree = Number(b);
  const negative = value < 0n;
  if (negative && degree % 2 === 0) throw new ExactError(ExactErrorType.ComplexResult, 'Even root of a negative value');

  // (X / S) ^ (a / b) * S == (X ^ a * S ^ (b - a)) ^ (1 / b)
  const inner = U.bigPow(U.bigAbs(value), a) * U.bigPow(U.bigPow10(digits), b - a);
  const root = U.floorNthRoot(inner, degree);
  return negative && a % 2n === 1n ? -root : root;
}

function powScaled(base: bigint, exponent: bigint, digits: number): bigint {
  let result = U.bigPow10(digits);
  while (exponent > 0n) {
    if (exponent & 1n) result = mulScaled(result, base, digits);
    exponent >>= 1n;
    if (exponent > 0n) base = mulScaled(base, base, digits);
  }
  return result;
}

function mulScaled(left: bigint, right: bigint, digits: number): bigint {
  return (left * right) / U.bigPow10(digits);
}

//#endregion
