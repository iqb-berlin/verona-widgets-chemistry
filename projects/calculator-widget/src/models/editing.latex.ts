import { EditSequence } from './editing.ast';

export function formatToLatex(sequence: EditSequence): string {
  //TODO: Format conservatively, creating a verbatim LaTeX expression representing the given tokens
  throw new Error('Not implemented');
}

export function parseFromLatex(latex: string): EditSequence {
  //TODO: Parse liberally, ignoring and omitting unknown commands or bad syntax
  throw new Error('Not implemented');
}
