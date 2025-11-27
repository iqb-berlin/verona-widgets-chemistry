import { Vector2 } from '../services/molecule-editor.model';

export namespace AngleMath {
  export const deg2rad = Math.PI / 180;
  export const rad2deg = 180 / Math.PI;

  export function distributeAngles(count: number): ReadonlyArray<number> {
    const angles: Array<number> = [];
    const sliceAngle = 360 / count;
    for (let i = 0; i < count; i++) {
      angles.push(i * sliceAngle);
    }
    return angles;
  }

  export function anglePosition(angle: number): Vector2 {
    const rad = angle * deg2rad;
    const x = Math.cos(rad);
    const y = Math.sin(rad);
    return [x, y] as const;
  }

  export function angleBetween(a: Vector2, b: Vector2): number {
    const [ax, ay] = a;
    const [bx, by] = b;
    const dx = bx - ax;
    const dy = by - ay;
    return Math.atan2(dy, dx) * rad2deg;
  }
}
