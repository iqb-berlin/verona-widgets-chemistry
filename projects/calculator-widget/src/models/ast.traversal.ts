import {
  FormulaNode,
  FormulaNodeId,
  FormulaNodeKind,
  FormulaNodeOfKind,
  FormulaNodePath,
  FormulaSlot,
  hasDecimalPoint,
  SLOTS,
} from './ast.model';
import { generateNodeId } from './ast.factory';
import { produce } from 'immer';

export interface FormulaSlotChild {
  readonly slot: FormulaSlot;
  readonly child: FormulaNode;
}

export type FormulaNodeDispatch<R> = { readonly [T in FormulaNodeKind]: (node: FormulaNodeOfKind<T>) => R };

export type FormulaNodeReplacement = FormulaNode | ((existing: FormulaNode) => FormulaNode);

export namespace Traversal {
  type ContainerNode = FormulaNode & Readonly<Record<FormulaSlot, unknown>>;

  const EMPTY_ARRAY: ReadonlyArray<never> = [];

  export function getChild(node: FormulaNode, slot: FormulaSlot): null | FormulaNode {
    const container = node as ContainerNode;
    const value = container[slot];
    return value === null || value === undefined ? null : (value as FormulaNode);
  }

  export function declaredSlots(node: FormulaNode): ReadonlyArray<FormulaSlot> {
    return SLOTS[node.kind];
  }

  export function isLeaf(node: FormulaNode): boolean {
    return declaredSlots(node).length === 0;
  }

  export function slotsOf(node: FormulaNode): ReadonlyArray<FormulaSlot> {
    return declaredSlots(node).filter((slot) => getChild(node, slot) !== null);
  }

  export function childEntries(node: FormulaNode): ReadonlyArray<FormulaSlotChild> {
    if (isLeaf(node)) {
      return EMPTY_ARRAY;
    }

    const entries: FormulaSlotChild[] = [];
    for (const slot of declaredSlots(node)) {
      const child = getChild(node, slot);
      if (child !== null) entries.push({ slot, child });
    }
    return entries;
  }

  export function childrenOf(node: FormulaNode): ReadonlyArray<FormulaNode> {
    return childEntries(node).map((entry) => entry.child);
  }

  export function withChild(node: FormulaNode, slot: FormulaSlot, child: null | FormulaNode): FormulaNode {
    return produce(node as ContainerNode, (draft) => {
      draft[slot] = child;
    });
  }

  export function mapWithChildren(
    node: FormulaNode,
    mapper: (child: FormulaNode, slot: FormulaSlot) => FormulaNode,
  ): FormulaNode {
    return produce(node as ContainerNode, (draft) => {
      for (const { slot, child } of childEntries(draft)) {
        draft[slot] = mapper(child, slot);
      }
    });
  }

  // Exhaustive dispatch over a given node
  export function matchNode<R>(node: FormulaNode, dispatch: FormulaNodeDispatch<R>): R {
    const handler = dispatch[node.kind] as (node: FormulaNode) => R;
    return handler(node);
  }

  // Bottom-up recursive fold of children, from leaf up through parents
  export function foldNode<R>(tree: FormulaNode, reducer: (node: FormulaNode, results: ReadonlyArray<R>) => R): R {
    const childResults = childrenOf(tree).map((child) => foldNode(child, reducer));
    return reducer(tree, childResults);
  }

  // Node tree-walking visitor
  export interface VisitContext {
    readonly parent: FormulaNode | null;
    readonly slot: FormulaSlot | null;
    readonly path: FormulaNodePath;
    readonly depth: number;
  }

  // Node tree-walk; return `false` from visitor to cancel walking the branch
  export function walk(tree: FormulaNode, visitor: (node: FormulaNode, context: VisitContext) => void | boolean) {
    step(tree, { parent: null, slot: null, path: [], depth: 0 });
    function step(node: FormulaNode, context: VisitContext) {
      if (visitor(node, context) !== false) {
        for (const { child, slot } of childEntries(node)) {
          const depth = context.depth + 1;
          const path = context.path.concat(slot);
          step(child, { parent: node, slot, path, depth });
        }
      }
    }
  }

  // Filter list of nodes in tree matching the given predicate
  export function filter(tree: FormulaNode, predicate: (node: FormulaNode) => boolean): ReadonlyArray<FormulaNode> {
    const found: Array<FormulaNode> = [];
    walk(tree, (node) => {
      if (predicate(node)) {
        found.push(node);
      }
    });
    return found;
  }

  // Count number of nodes in tree, optionally count only nodes matching the given predicate
  export function count(tree: FormulaNode, predicate?: (node: FormulaNode) => boolean): number {
    return foldNode(tree, (node, results) => {
      const match = predicate ? predicate(node) : true;
      const count = match ? 1 : 0;
      return count + results.reduce((a, b) => a + b, 0);
    });
  }

  // Max depth of the given tree
  export function maxDepth(tree: FormulaNode): number {
    return foldNode(tree, (node, results) => {
      return 1 + Math.max(0, ...results);
    });
  }

  // Find one specific thing within the tree, which will be the first non-null result encountered in a tree walk
  function findOne<R>(tree: FormulaNode, search: (node: FormulaNode, context: VisitContext) => null | R): null | R {
    let found: null | R = null;
    walk(tree, (node, context) => {
      if (found !== null) return false; // already found
      const searchResult = search(node, context); // search current node
      if (searchResult !== null) found = searchResult; // result found!
      return found === null; // keep searching unless already found
    });
    return found;
  }

  // Lookup a specific node within the given tree by its ID
  export function lookupNode(tree: FormulaNode, id: FormulaNodeId): null | FormulaNode {
    return findOne(tree, (node) => (node.id === id ? node : null));
  }

  // Check if the given tree contains a node with the given ID
  export function containsNode(tree: FormulaNode, id: FormulaNodeId): boolean {
    return findOne(tree, (node) => (node.id === id ? true : null)) ?? false;
  }

  // Lookup a specific node's path within the given tree by its ID
  export function lookupPath(tree: FormulaNode, id: FormulaNodeId): null | FormulaNodePath {
    return findOne(tree, (node, context) => (node.id === id ? context.path : null));
  }

  // Lookup a specific node's parent node, and the slot it appears in, within the given tree by its ID
  export function lookupParentOf(
    tree: FormulaNode,
    id: FormulaNodeId,
  ): null | { parent: FormulaNode; slot: FormulaSlot } {
    return findOne(tree, (parent, context) => {
      for (const { slot, child } of childEntries(parent)) {
        if (child.id === id) return { parent, slot };
      }
      return null;
    });
  }

  // Resolve the path against a given tree
  export function resolvePath(tree: FormulaNode, path: FormulaNodePath): null | FormulaNode {
    let current: null | FormulaNode = tree;
    for (const slot of path) {
      if (current === null) return null;
      current = getChild(current, slot);
    }
    return current;
  }

  // List all ancestors of a specific node within a given tree by its ID
  export function ancestorsOf(tree: FormulaNode, id: FormulaNodeId): ReadonlyArray<FormulaNode> {
    const path = lookupPath(tree, id);
    if (path === null) return EMPTY_ARRAY;

    let current: FormulaNode = tree;
    const chain: Array<FormulaNode> = [];
    for (const slot of path) {
      chain.push(current);
      const next = getChild(current, slot);
      if (next === null) break;
      current = next;
    }
    return chain;
  }

  function resolveReplacement(existing: FormulaNode, replacement: FormulaNodeReplacement): FormulaNode {
    return typeof replacement === 'function' ? replacement(existing) : replacement;
  }

  // Replace a node within the given tree by its ID
  export function replaceNode(tree: FormulaNode, id: FormulaNodeId, replace: FormulaNodeReplacement): FormulaNode {
    if (tree.id === id) return resolveReplacement(tree, replace);
    return mapWithChildren(tree, (child) => replaceNode(child, id, replace));
  }

  // Replace a node at the given path within the given tree
  export function replaceAtPath(
    tree: FormulaNode,
    path: FormulaNodePath,
    replace: FormulaNodeReplacement,
  ): FormulaNode {
    if (path.length === 0) return resolveReplacement(tree, replace);

    const [slot, ...tail] = path;
    const child = getChild(tree, slot);
    if (child === null) throw new RangeError(`replaceAtPath missing slot "${slot}" in ${tree.kind} node "${tree.id}"`);
    return withChild(tree, slot, replaceAtPath(child, tail, replace));
  }

  // Recursively transform an entire tree by replacing all nodes using the given rewrite mapping
  export function transform(tree: FormulaNode, rewrite: (node: FormulaNode) => FormulaNode): FormulaNode {
    return rewrite(mapWithChildren(tree, (child) => transform(child, rewrite)));
  }

  // Check if two trees are structurally equal (i.e. same structure/values, possibly different IDs)
  export function structurallyEqual(left: FormulaNode, right: FormulaNode): boolean {
    // immediately reject incompatible trees
    if (left.kind !== right.kind) return false;

    // check leaf properties (node values)
    switch (left.kind) {
      case 'number': {
        const lhs = left;
        const rhs = right as typeof left;
        if (lhs.literal !== rhs.literal) return false; // numeric inequality
        break;
      }
      case 'constant': {
        const lhs = left;
        const rhs = right as typeof left;
        if (lhs.symbol !== rhs.symbol) return false; // symbolic inequality
        break;
      }
      case 'group': {
        const lhs = left;
        const rhs = right as typeof left;
        if (lhs.fence !== rhs.fence) return false; // fence inequality
        break;
      }
      case 'multiply':
      case 'divide': {
        const lhs = left;
        const rhs = right as typeof left;
        if (lhs.notation !== rhs.notation) return false; // notational inequality
        break;
      }
      case 'hole':
      case 'negate':
      case 'add':
      case 'subtract':
      case 'composite':
      case 'pow':
      case 'root':
        break; // proceed to recursively check children
      default: {
        console.error('Invalid node:', left satisfies never);
        throw new Error(`Invalid node: ${JSON.stringify(left)}`);
      }
    }

    // recursively check children
    const leftEntries = childEntries(left);
    const rightEntries = childEntries(right);
    if (leftEntries.length !== rightEntries.length) return false;
    return leftEntries.every((lhs, index) => {
      const rhs = rightEntries[index];
      return lhs.slot === rhs.slot && structurallyEqual(lhs.child, rhs.child);
    });
  }

  // Deep copy the given tree with fresh IDs (e.g. for duplication)
  export function structurallyClone(tree: FormulaNode): FormulaNode {
    return produce(tree as ContainerNode, (draft) => {
      for (const { slot, child } of childEntries(draft)) {
        draft[slot] = structurallyClone(child);
        draft.id = generateNodeId();
      }
    });
  }
}

export namespace Validation {
  export type IssueCode =
    | 'duplicateId'
    | 'emptyNumber'
    | 'openValue'
    | 'literalDivisionByZero'
    | 'nonIntegralRootDegree'
    | 'nonIntegralCompositeFractional'
    | 'invalidNode';

  export type IssueSeverity = 'error' | 'warning' | 'incomplete';

  export interface Issue {
    readonly code: IssueCode;
    readonly severity: IssueSeverity;
    readonly nodeId: FormulaNodeId;
    readonly path: FormulaNodePath;
    readonly detail?: string;
  }

  export function isReadyToEvaluate(tree: FormulaNode): boolean {
    const issues = validate(tree);
    return !issues.some((issue) => issue.severity === 'incomplete');
  }

  export function validate(tree: FormulaNode): ReadonlyArray<Issue> {
    const issues: Issue[] = [];
    const alreadySeen = new Map<FormulaNodeId, FormulaNodePath>();

    Traversal.walk(tree, (node, { path }) => {
      function raiseIssue(on: FormulaNode, code: IssueCode, severity: IssueSeverity, detail?: string) {
        const onPath = Traversal.lookupPath(tree, on.id) ?? [];
        issues.push({ nodeId: on.id, path: onPath, code, severity, detail });
      }

      if (alreadySeen.has(node.id)) {
        const previousPath = alreadySeen.get(node.id)!.join('/');
        raiseIssue(node, 'duplicateId', 'error', previousPath);
      }
      alreadySeen.set(node.id, path);

      switch (node.kind) {
        case 'number': {
          if (node.literal.length === 0) raiseIssue(node, 'emptyNumber', 'incomplete');
          break;
        }
        case 'hole': {
          raiseIssue(node, 'openValue', 'incomplete', node.kind);
          break;
        }
        case 'divide': {
          if (isLiteralZero(node.divisor)) raiseIssue(node.divisor, 'literalDivisionByZero', 'error');
          break;
        }
        case 'composite': {
          for (const { slot, child } of Traversal.childEntries(node)) {
            if (!isIntegerLiteralOrHole(child)) {
              raiseIssue(child, 'nonIntegralCompositeFractional', 'warning', `${slot}:${child.kind}`);
            }
          }
          break;
        }
        case 'root': {
          if (node.degree && !isIntegerLiteralOrHole(node.degree)) {
            raiseIssue(node.degree, 'nonIntegralRootDegree', 'warning', node.degree.kind);
          }
          break;
        }
        case 'constant':
        case 'group':
        case 'negate':
        case 'add':
        case 'subtract':
        case 'multiply':
        case 'pow': {
          // Nothing to validate
          break;
        }
        default: {
          console.error('Invalid node:', node satisfies never);
          raiseIssue(node, 'invalidNode', 'error', JSON.stringify(node));
        }
      }
    });

    return issues;
  }

  function isIntegerLiteralOrHole(node: FormulaNode): boolean {
    return node.kind === 'hole' || !hasDecimalPoint(node);
  }

  const ALL_ZEROES = /^0*[,.]?0*$/;

  function isLiteralZero(node: FormulaNode): boolean {
    return node.kind === 'number' && ALL_ZEROES.test(node.literal) && node.literal.length > 0;
  }
}
