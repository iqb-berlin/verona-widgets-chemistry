/** Single, double, or triple bonds */
export type BondMultiplicity = 1 | 2 | 3;

/** Available formula symbols */
export const enum FormulaSymbol {
  PlusOperator = '+',
  NetForwardArrow = '→',
  EquilibriumArrow = '⇌',
}

/** Vector in 2D Euclidean space */
export type Vector2 = readonly [x: number, y: number];

export namespace Vector2 {
  export function add([ax, ay]: Vector2, [bx, by]: Vector2): Vector2 {
    return [ax + bx, ay + by] as const;
  }

  export function sub([ax, ay]: Vector2, [bx, by]: Vector2): Vector2 {
    return [ax - bx, ay - by] as const;
  }

  export function middle([ax, ay]: Vector2, [bx, by]: Vector2): Vector2 {
    return [(ax + bx) / 2, (ay + by) / 2];
  }

  export function scale(s: number, [x, y]: Vector2): Vector2 {
    return [x * s, y * s] as const;
  }

  export function neg([x, y]: Vector2): Vector2 {
    return [-x, -y] as const;
  }

  export function magnitude([x, y]: Vector2): number {
    return Math.sqrt(x * x + y * y);
  }

  export function distance([ax, ay]: Vector2, [bx, by]: Vector2): number {
    const dx = ax - bx;
    const dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

/** Utilities for angular mathematics */
export namespace AngleMath {
  export const rad = 2 * Math.PI;

  export function deg(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  export function normalize(angle: number): number {
    const normalized = angle % rad;
    return normalized < 0 ? normalized + rad : normalized;
  }

  export function angleDiff(a: number, b: number): number {
    let diff = (a - b) % rad;
    if (diff > Math.PI) diff -= Math.PI;
    if (diff < -Math.PI) diff += Math.PI;
    return diff;
  }

  export function distributeAngles(count: number, jitter?: number): Array<number> {
    const angles: Array<number> = [];
    const sliceAngle = rad / count;
    for (let i = 0; i < count; i++) {
      const angle = i * sliceAngle;
      const deviation = jitter ? jitter * Math.random() : 0;
      angles.push(angle + deviation);
    }
    return angles;
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
