import type { Vector2 } from './molecule-editor.model';

export interface MoleculeCanvasTransform {
  (event: PointerEvent): MoleculeCanvasEvent;
}

export interface MoleculeCanvasEvent {
  readonly event: 'move' | 'up' | 'down' | 'click';
  readonly position: Vector2;
}

interface TransformPosition {
  (event: PointerEvent): Vector2;
}

export function moleculeCanvasTransformPosition(transformPosition: TransformPosition): MoleculeCanvasTransform {
  return (pointerEvent) => {
    const position = transformPosition(pointerEvent);
    switch (pointerEvent.type) {
      case 'pointermove':
      case 'mousemove':
        return { event: 'move', position };
      case 'pointerdown':
      case 'mousedown':
        return { event: 'down', position };
      case 'pointerup':
      case 'mouseup':
        return { event: 'up', position };
      case 'click':
        return { event: 'click', position };
      default:
        throw new Error(`Unexpected editor canvas pointer-event: ${pointerEvent.type}`);
    }
  };
}
