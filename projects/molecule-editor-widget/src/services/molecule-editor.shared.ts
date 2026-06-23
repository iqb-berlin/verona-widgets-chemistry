/** Single, double, or triple bonds */
export type BondMultiplicity = 1 | 2 | 3;

/** Available formula symbols */
export const enum FormulaSymbol {
  ReactionPlus = '+',
  ReactionArrow = '→',
  EquilibriumArrow = '⇌',
}

/** Polarity of a partial charge */
export const enum PartialCharge {
  Positive = '+',
  Negative = '-',
}

/** Vector in 2D Euclidean space */
export type Vector2 = readonly [x: number, y: number];

export namespace Vector2 {
  export const zero = [0, 0] as const satisfies Vector2;

  function binaryOp(componentFn: (a: number, b: number) => number) {
    return ([ax, ay]: Vector2, [bx, by]: Vector2): Vector2 => {
      const rx = componentFn(ax, bx);
      const ry = componentFn(ay, by);
      return [rx, ry] as const;
    };
  }

  export const add = binaryOp((a, b) => a + b);
  export const sub = binaryOp((a, b) => a - b);
  export const middle = binaryOp((a, b) => (a + b) / 2);

  export const neg = ([x, y]: Vector2): Vector2 => [-x, -y] as const;
  export const scale = (s: number, [x, y]: Vector2): Vector2 => [x * s, y * s] as const;
  export const magnitude = ([x, y]: Vector2): number => Math.sqrt(x * x + y * y);

  export const normalize = (v: Vector2) => scale(1 / magnitude(v), v);

  export function distance(a: Vector2, b: Vector2): number {
    return Math.sqrt(sqrDistance(a, b));
  }

  export function sqrDistance([ax, ay]: Vector2, [bx, by]: Vector2): number {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }

  export function clampMagnitude(v: Vector2, maxLength: number): Vector2 {
    const length = magnitude(v);
    return length > maxLength ? scale(maxLength, normalize(v)) : v;
  }
}

/** Utilities for angular mathematics */
export namespace AngleMath {
  export const rad = 2 * Math.PI;

  export function deg(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  export function anglePosition(angle: number): Vector2 {
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    return [x, y] as const;
  }

  export function angleBetween(a: Vector2, b: Vector2): number {
    const [ax, ay] = a;
    const [bx, by] = b;
    const dx = bx - ax;
    const dy = by - ay;
    return Math.atan2(dy, dx);
  }
}
