import { computed, Injectable, signal } from '@angular/core';
import { EditSequence, EditToken, EditTokenId } from '../../models';

/**
 * Where the caret sits in the edit sequence being edited.
 *
 * A caret position is addressed by a single token ID, exactly the way the edit commands
 * address their target: the ID of a token puts the caret directly behind that token, the
 * ID of a sequence puts it at the start of that sequence — the only position an empty
 * sequence has. Resolving that ID into a position in the tree is the model's business
 * (`EditTraversal.caretAt`), so this context only has to hand the ID around.
 */
@Injectable()
export class CaretContext {
  private readonly _position = signal<null | EditTokenId>(null);

  // The token ID the caret is attached to, which edit commands take as their target
  readonly position = this._position.asReadonly();

  // False while no caret is shown at all, e.g. before the first token was placed
  readonly isPlaced = computed(() => this._position() !== null);

  // The caret sits directly behind this token
  isBehind(token: EditToken): boolean {
    return this._position() === token.id;
  }

  // The caret sits at the start of this sequence
  isAtStartOf(sequence: EditSequence): boolean {
    return this._position() === sequence.id;
  }

  placeAt(position: EditTokenId): void {
    this._position.set(position);
  }

  placeBehind(token: EditToken): void {
    this._position.set(token.id);
  }

  placeInside(sequence: EditSequence): void {
    this._position.set(sequence.id);
  }

  remove(): void {
    this._position.set(null);
  }
}
