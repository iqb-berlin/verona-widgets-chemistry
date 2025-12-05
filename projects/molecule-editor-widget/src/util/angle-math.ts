import { Vector2 } from '../services/molecule-editor.model';

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
