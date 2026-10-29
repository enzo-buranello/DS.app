import type { Node } from './project.js';

// Opérations sur un arbre d'éléments (page ou composant). Toujours une copie :
// l'arbre d'origine n'est jamais modifié.

export function find(
  root: Node,
  id: string,
  parent: Node | null = null,
): { node: Node; parent: Node | null; index: number } | null {
  if (root.id === id)
    return { node: root, parent, index: parent?.children?.indexOf(root) ?? -1 };
  for (const c of root.children ?? []) {
    const hit = find(c, id, root);
    if (hit) return hit;
  }
  return null;
}

export const ids = (root: Node): string[] => [
  root.id,
  ...(root.children ?? []).flatMap(ids),
];

export function newId(
  root: Node,
  kind: Node['kind'],
  taken = new Set(ids(root)),
) {
  let i = 1;
  while (taken.has(`${kind}-${i}`)) i++;
  const id = `${kind}-${i}`;
  taken.add(id);
  return id;
}

export function update(root: Node, id: string, fn: (n: Node) => Node): Node {
  if (root.id === id) return fn(root);
  if (!root.children) return root;
  return { ...root, children: root.children.map((c) => update(c, id, fn)) };
}

export function remove(root: Node, id: string): Node {
  if (!root.children) return root;
  return {
    ...root,
    children: root.children
      .filter((c) => c.id !== id)
      .map((c) => remove(c, id)),
  };
}

export const canHold = (n: Node) => n.kind === 'box' || n.kind === 'list';

export type Place = { target: string; where: 'before' | 'after' | 'inside' };

/** Insère un élément ; « inside » l'ajoute à la fin d'un bloc. */
export function insert(root: Node, node: Node, at: Place): Node {
  const hit = find(root, at.target);
  if (!hit) return root;
  if (at.where === 'inside' || !hit.parent)
    return update(root, hit.node.id, (n) => ({
      ...n,
      children: [...(n.children ?? []), node],
    }));
  const i = hit.index + (at.where === 'after' ? 1 : 0);
  return update(root, hit.parent.id, (p) => ({
    ...p,
    children: [...p.children!.slice(0, i), node, ...p.children!.slice(i)],
  }));
}

/** Déplace un élément ; refusé dans lui-même ou un de ses descendants. */
export function move(root: Node, id: string, at: Place): Node {
  const hit = find(root, id);
  if (!hit?.parent || id === at.target || find(hit.node, at.target))
    return root;
  return insert(remove(root, id), hit.node, at);
}

/** Copie avec de nouveaux identifiants, placée juste après l'original. */
export function duplicate(root: Node, id: string): { root: Node; id: string } {
  const hit = find(root, id);
  if (!hit?.parent) return { root, id };
  const taken = new Set(ids(root));
  const copy = (n: Node): Node => ({
    ...n,
    id: newId(root, n.kind, taken),
    children: n.children?.map(copy),
  });
  const node = copy(hit.node);
  return {
    root: insert(root, node, { target: id, where: 'after' }),
    id: node.id,
  };
}

/** Où ajouter un nouvel élément : dans le bloc sélectionné, sinon après. */
export function placeFor(root: Node, selected: string | null): Place {
  const hit = selected ? find(root, selected) : null;
  if (!hit) return { target: root.id, where: 'inside' };
  return canHold(hit.node)
    ? { target: hit.node.id, where: 'inside' }
    : { target: hit.node.id, where: 'after' };
}
