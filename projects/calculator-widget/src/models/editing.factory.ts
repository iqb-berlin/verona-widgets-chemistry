import { EditToken, EditTokenId } from './editing.ast';

export type EditTokenIdGenerator = () => EditTokenId;

let idCounter = 1;
let idGenerator: EditTokenIdGenerator = () => {
  const id = idCounter++;
  return ('T:' + id.toString(36)) as EditTokenId;
};

export function resetTokenIdGenerator(counter: number = 0) {
  idCounter = counter;
}

export function replaceTokenIdGenerator(replacement: EditTokenIdGenerator) {
  idGenerator = replacement;
}

export function editTokenId(): EditTokenId {
  return idGenerator();
}

type EditItemKind = Exclude<EditToken.Kind, 'sequence'>;
type EditItemDetails<K extends EditItemKind> = Omit<EditToken.OfKind<K>, 'id' | 'kind'>;

export function token<K extends EditItemKind>(kind: K, details: EditItemDetails<K>): EditToken.OfKind<K> {
  const id = editTokenId();
  return { kind, id, ...details } as EditToken.OfKind<K>;
}

export function sequence(...tokens: ReadonlyArray<EditToken>): EditToken.Sequence {
  const id = editTokenId();
  return { kind: 'sequence', id, items: flattenTokens(tokens) };
}

function flattenTokens(tokens: ReadonlyArray<EditToken>): ReadonlyArray<EditToken> {
  return tokens.flatMap((token) => {
    return token.kind === 'sequence' ? flattenTokens(token.items) : [token];
  });
}
