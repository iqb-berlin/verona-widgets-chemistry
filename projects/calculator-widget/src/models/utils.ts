export function bigAbs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

export function bigIsEven(value: bigint): boolean {
  return value % 2n === 0n;
}

const LOG2_10 = Math.log2(10);

export function bigIsPow10(value: bigint): boolean {
  // Cheap trivial cases
  if (value < 10n) return value === 1n;
  if (value % 10n !== 0n) return false;

  // Conversion to base 2^n (like 16) is significantly cheaper than to base 10
  const hex = value.toString(16);
  const bits = 4 * (hex.length - 1) + (32 - Math.clz32(parseInt(hex[0], 16)));

  // 10^k has floor(k * log2(10)) + 1 bits, so only one k can match
  const k = Math.round((bits - 0.5) / LOG2_10);
  return value === 10n ** BigInt(k);
}

// Greatest Common Divisor
export function bigGcd(left: bigint, right: bigint): bigint {
  let p = bigAbs(left);
  let q = bigAbs(right);
  while (q !== 0n) {
    const t = p % q;
    p = q;
    q = t;
  }
  return p;
}

export function bigPow(value: bigint, exponent: bigint): bigint {
  if (exponent < 0n) throw new RangeError(`Negative pow exponent: ${exponent}`);
  return value ** exponent;
}

// cache powers of 10
const POW10: bigint[] = [1n];
bigPow10(15); // warmup

export function bigPow10(exponent: number): bigint {
  if (exponent < 0) throw new RangeError(`Negative pow10 exponent: ${exponent}`);
  while (POW10.length <= exponent) POW10.push(POW10[POW10.length - 1] * 10n);
  return POW10[exponent];
}

export function floorNthRoot(value: bigint, degree: number): bigint {
  if (value < 0n) throw new RangeError(`Negative floorNthRoot radicand: ${value}`);
  if (degree < 1) throw new RangeError(`Non-positive floorNthRoot degree: ${degree}`);
  if (degree === 1 || value === 1n) return value;

  const nth = BigInt(degree);
  const bitCount = value.toString(2).length;

  let x = 1n << BigInt(Math.ceil(bitCount / degree) + 1);
  while (true) {
    const r = ((nth - 1n) * x + value / bigPow(x, nth - 1n)) / nth;
    if (r >= x) break;
    x = r;
  }
  return x;
}

export function exactNthRoot(value: bigint, degree: number): bigint | null {
  if (value < 0n) {
    if (degree % 2 === 0) return null;
    const positive = exactNthRoot(-value, degree);
    return positive === null ? null : -positive;
  } else {
    const root = floorNthRoot(value, degree);
    return bigPow(root, BigInt(degree)) === value ? root : null;
  }
}

/**
 * Split `value` into `outside ** degree * inside`, pulling out every perfect
 * `degree`-th power we can find cheaply. This is what turns `sqrt(8)` into
 * `2 * sqrt(2)`.
 *
 * Trial division is bounded by `trialLimit`; anything beyond that stays inside
 * the radical. That is a deliberate performance/precision trade: the result is
 * always *correct*, occasionally not maximally *simplified*.
 */
export function extractNthPower(
  value: bigint,
  degree: number,
  trialLimit = 10_000n,
): { outside: bigint; inside: bigint } {
  if (degree < 2 || value === 0n) return { outside: 1n, inside: value };

  let outside = 1n;
  let inside = bigAbs(value);

  const n = BigInt(degree);

  for (let d = 2n; d <= trialLimit && bigPow(d, n) <= inside; d += 1n) {
    if (inside % d !== 0n) continue;

    let count = 0n;
    while (inside % d === 0n) {
      inside /= d;
      count += 1n;
    }

    const pulled = count / n;
    if (pulled > 0n) outside *= bigPow(d, pulled);

    const left = count % n;
    if (left > 0n) inside *= bigPow(d, left);
  }

  const whole = exactNthRoot(inside, degree);
  if (whole !== null) {
    outside *= whole;
    inside = 1n;
  }

  const negative = value < 0n;
  return { outside, inside: negative ? -inside : inside };
}

export function compareSign<T extends string | number | bigint>(a: T, b: T) {
  return a < b ? -1 : a > b ? +1 : 0;
}

// Number of decimal digits of a whole number, ignoring its sign
export function bigDigits(value: bigint): number {
  return bigAbs(value).toString(10).length;
}

// Integer division, rounding halves away from zero
export function bigDivideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('bigDivideRounded: division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const n = bigAbs(numerator);
  const d = bigAbs(denominator);
  const quotient = n / d;
  const rounded = (n % d) * 2n >= d ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/**
 * Render `scaled * 10^-digits` as a decimal number, which is how both kinds of numeric
 * value reach the display once they are scaled to a whole number of decimal places.
 */
export function decimalText(scaled: bigint, digits: number, dropTrailingZeros: boolean): string {
  const negative = scaled < 0n;
  const text = bigAbs(scaled)
    .toString(10)
    .padStart(digits + 1, '0');

  const integerPart = digits === 0 ? text : text.slice(0, text.length - digits);
  let fractionPart = digits === 0 ? '' : text.slice(text.length - digits);
  if (dropTrailingZeros) fractionPart = fractionPart.replace(/0+$/, '');

  const magnitude = fractionPart.length > 0 ? `${integerPart}.${fractionPart}` : integerPart;
  return negative && /[1-9]/.test(magnitude) ? `-${magnitude}` : magnitude; // a rounded zero has no sign
}
