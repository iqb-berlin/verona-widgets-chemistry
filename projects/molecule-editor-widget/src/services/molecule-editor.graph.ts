import type {
  AtomId,
  AtomModel,
  BondId,
  BondModel,
  FormulaSymbolId,
  FormulaSymbolModel,
  ItemId,
  MoleculeEditorModel,
  PartialChargeId,
  PartialChargeModel,
} from './molecule-editor.model';

type BondedAtomPair = readonly [left: AtomModel, right: AtomModel];

/** Indexed graph of connections within the model, used internally for operations that require item relations */
export interface MoleculeEditorGraph {
  readonly model: MoleculeEditorModel;
  readonly itemIndex: ReadonlyMap<ItemId, AtomModel | BondModel | PartialChargeModel | FormulaSymbolModel>;
  readonly atomBonds: ReadonlyMap<AtomId, ReadonlyArray<BondModel>>;
  readonly bondAtoms: ReadonlyMap<BondId, BondedAtomPair>;
  readonly atomIdsWithoutPartialCharge: ReadonlySet<AtomId>;
}

export namespace MoleculeEditorGraph {
  export function createFrom(model: MoleculeEditorModel): MoleculeEditorGraph {
    const itemIndex = new Map<ItemId, AtomModel | BondModel | PartialChargeModel | FormulaSymbolModel>();
    const atomBonds = new Map<AtomId, Array<BondModel>>();
    const bondAtoms = new Map<BondId, [AtomModel, AtomModel]>();
    const atomIdsWithoutPartialCharge = new Set<AtomId>();

    for (const atomKey in model.atoms) {
      const atomId = atomKey as AtomId;
      const atomModel = model.atoms[atomId];
      itemIndex.set(atomId, atomModel);
      atomBonds.set(atomId, []);
      atomIdsWithoutPartialCharge.add(atomId);
    }

    for (const partialKey in model.partials) {
      const partialId = partialKey as PartialChargeId;
      const partial = model.partials[partialId];
      itemIndex.set(partialId, partial);
      atomIdsWithoutPartialCharge.delete(partial.targetAtomId);
    }

    for (const bondKey in model.bonds) {
      const bondId = bondKey as BondId;
      const bondModel = model.bonds[bondId];
      const { leftAtomId, rightAtomId } = bondModel;
      const { [leftAtomId]: leftAtomModel, [rightAtomId]: rightAtomModel } = model.atoms;
      itemIndex.set(bondId, bondModel);
      atomBonds.get(leftAtomModel.id)?.push(bondModel);
      atomBonds.get(rightAtomModel.id)?.push(bondModel);
      bondAtoms.set(bondModel.id, [leftAtomModel, rightAtomModel]);
    }

    for (const symbolKey in model.symbols) {
      const symbolId = symbolKey as FormulaSymbolId;
      const symbolModel = model.symbols[symbolId];
      itemIndex.set(symbolId, symbolModel);
    }

    return { model, itemIndex, atomBonds, bondAtoms, atomIdsWithoutPartialCharge } as const;
  }

  export function findGroup(graph: MoleculeEditorGraph, pivotItemId: ItemId): Array<ItemId> {
    const pivotItem = graph.itemIndex.get(pivotItemId);
    if (!pivotItem) {
      return [];
    }
    switch (pivotItem.type) {
      case 'Atom':
        return findAtomRelationsRecursive(graph, pivotItem, new Set());
      case 'Bond':
        return findBondRelationsRecursive(graph, pivotItem, new Set());
      case 'PartialCharge':
        return findPartialChargeRelationsRecursive(graph, pivotItem, new Set());
      case 'FormulaSymbol':
        return findAllFormulaSymbolIds(graph);
      default:
        console.error('Unknown pivot item: ', pivotItem satisfies never);
        return [];
    }
  }

  function findAtomRelationsRecursive(
    graph: MoleculeEditorGraph,
    atom: AtomModel,
    visited: Set<ItemId>,
  ): Array<ItemId> {
    if (visited.has(atom.id)) return [];
    else visited.add(atom.id);

    const bonds = graph.atomBonds.get(atom.id) ?? [];
    const relations = bonds.flatMap((bond) => findBondRelationsRecursive(graph, bond, visited));

    const partialCharge = graph.model.partials[atom.id];
    if (partialCharge) relations.push(partialCharge.id);

    relations.push(atom.id);
    return relations;
  }

  function findBondRelationsRecursive(
    graph: MoleculeEditorGraph,
    bond: BondModel,
    visited: Set<ItemId>,
  ): Array<ItemId> {
    if (visited.has(bond.id)) return [];
    else visited.add(bond.id);

    const atoms = graph.bondAtoms.get(bond.id) ?? [];
    const relations = atoms.flatMap((atom) => findAtomRelationsRecursive(graph, atom, visited));
    relations.push(bond.id);
    return relations;
  }

  function findPartialChargeRelationsRecursive(
    graph: MoleculeEditorGraph,
    partial: PartialChargeModel,
    visited: Set<ItemId>,
  ) {
    if (visited.has(partial.id)) return [];
    else visited.add(partial.id);

    const atom = graph.model.atoms[partial.targetAtomId];
    const relations = atom && atom.type === 'Atom' ? findAtomRelationsRecursive(graph, atom, visited) : [];
    relations.push(partial.id);
    return relations;
  }

  function findAllFormulaSymbolIds(graph: MoleculeEditorGraph): Array<FormulaSymbolId> {
    return Object.keys(graph.model.symbols) as Array<FormulaSymbolId>;
  }
}
