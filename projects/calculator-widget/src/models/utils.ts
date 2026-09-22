export function bigAbs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

export function bigIsEven(value: bigint): boolean {
  return value % 2n === 0n;
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

// Least Common Multiple
export function bigLcm(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) return 0n;
  return bigAbs(a * b) / bigGcd(a, b);
}

export function bigPow(value: bigint, exponent: bigint): bigint {
  if (exponent < 0n) throw new RangeError(`Negative pow exponent: ${exponent}`);
  let r = 1n;
  while (exponent > 0n) {
    if (exponent & 1n) r *= value;
    value *= value;
    exponent >>= 1n;
  }
  return r;
}

const POW10: bigint[] = [1n];

export function bigPow10(exponent: number): bigint {
  if (exponent < 0) throw new RangeError(`Negative pow10 exponent: ${exponent}`);
  while (POW10.length <= exponent) POW10.push(POW10[POW10.length - 1] * 10n);
  return POW10[exponent];
}

export function floorNthRoot(value: bigint, degree: number): bigint {
  if (value < 0n) throw new RangeError(`Negative floorNthRoot radicant: ${value}`);
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
