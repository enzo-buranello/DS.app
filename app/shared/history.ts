import type { Node, Project } from './project.js';

// Historique des itérations : un instantané du projet par entrée.

export type Entry = {
  id: string;
  /** Instruction donnée à l'IA, ou action nommée ; absent : modification manuelle. */
  label?: string;
  kind: 'ai' | 'manual' | 'restore' | 'create';
  scope: 'element' | 'global';
  /** Ce qui a changé : sert à regrouper les modifications manuelles. */
  target: string;
  at: string;
};

const json = (v: unknown) => JSON.stringify(v ?? null);
const shallow = ({ children, ...rest }: Node) =>
  json({
    ...rest,
    order: children?.map((c) => c.id),
  });

/** Éléments modifiés, ajoutés ou retirés entre deux arbres. */
function changedNodes(a: Node | undefined, b: Node | undefined): string[] {
  const index = (n: Node | undefined, out = new Map<string, Node>()) => {
    if (n) {
      out.set(n.id, n);
      n.children?.forEach((c) => index(c, out));
    }
    return out;
  };
  const ia = index(a);
  const ib = index(b);
  const out: string[] = [];
  for (const id of new Set([...ia.keys(), ...ib.keys()])) {
    const x = ia.get(id);
    const y = ib.get(id);
    if (!x || !y || shallow(x) !== shallow(y)) out.push(id);
  }
  return out;
}

/**
 * Ce qui a changé entre deux états : un seul élément (portée élément), sinon
 * le projet entier (portée globale).
 */
export function changeOf(
  a: Project,
  b: Project,
): Pick<Entry, 'scope' | 'target'> {
  const where: string[] = [];
  if (json(a.foundations) !== json(b.foundations)) where.push('foundations');
  if (a.name !== b.name) where.push('name');
  for (const kind of ['pages', 'components'] as const) {
    const keys = new Set([...Object.keys(a[kind]), ...Object.keys(b[kind])]);
    for (const k of keys) {
      const x = a[kind][k];
      const y = b[kind][k];
      if (json(x) === json(y)) continue;
      if (!x || !y || x.name !== y.name) {
        where.push(`${kind}:${k}`);
        continue;
      }
      const nodes = changedNodes(x.root, y.root);
      const states =
        kind === 'components' &&
        json(a.components[k].states) !== json(b.components[k].states);
      if (states) where.push(`${kind}:${k}`);
      else where.push(...nodes.map((n) => `${kind}:${k}:${n}`));
    }
  }
  if (json(a.collections) !== json(b.collections)) where.push('collections');
  return where.length === 1 && where[0].split(':').length === 3
    ? { scope: 'element', target: where[0] }
    : { scope: 'global', target: where.sort().join(',') };
}
