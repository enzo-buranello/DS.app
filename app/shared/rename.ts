import { slug, type Node, type Project } from './project.js';

// Identifiants lisibles : un identifiant créé par défaut (page-3,
// collection-1, champ-2) suit le nom donné ensuite. Liens et liaisons suivent.

export const isAuto = (id: string) =>
  /^(page|collection|champ)(-\d+)+$/.test(id);

function mapNodes(p: Project, fn: (n: Node) => Node): Project {
  const walk = (n: Node): Node =>
    fn(n.children ? { ...n, children: n.children.map(walk) } : n);
  const roots = <T extends { root: Node }>(o: Record<string, T>) =>
    Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, { ...v, root: walk(v.root) }]),
    );
  return { ...p, pages: roots(p.pages), components: roots(p.components) };
}

/** Remplace une clé en gardant l'ordre. */
const rekey = <T>(o: Record<string, T>, from: string, to: string, v: T) =>
  Object.fromEntries(
    Object.entries(o).map(([k, x]) => (k === from ? [to, v] : [k, x])),
  );

export function renamePage(p: Project, id: string, name: string) {
  const page = { ...p.pages[id], name };
  const { [id]: _, ...rest } = p.pages;
  const to = isAuto(id) ? slug(name, rest) : id;
  const next = { ...p, pages: rekey(p.pages, id, to, page) };
  if (to === id) return { project: next, id };
  const fix = (h?: string) => (h === `/${id}` ? `/${to}` : h);
  return {
    id: to,
    project: mapNodes(next, (n) => {
      const out = { ...n };
      if (n.href) out.href = fix(n.href);
      if (n.overrides)
        out.overrides = Object.fromEntries(
          Object.entries(n.overrides).map(([k, o]) => [
            k,
            o.href ? { ...o, href: fix(o.href) } : o,
          ]),
        );
      return out;
    }),
  };
}

export function renameCollection(p: Project, id: string, name: string) {
  const c = { ...p.collections[id], name };
  const { [id]: _, ...rest } = p.collections;
  const to = isAuto(id) ? slug(name, rest) : id;
  const next = { ...p, collections: rekey(p.collections, id, to, c) };
  if (to === id) return { project: next, id };
  return {
    id: to,
    project: mapNodes(next, (n) =>
      n.bind?.collection === id
        ? { ...n, bind: { ...n.bind, collection: to } }
        : n,
    ),
  };
}

export function renameField(
  p: Project,
  cid: string,
  fid: string,
  name: string,
) {
  const c = p.collections[cid];
  const others = Object.fromEntries(
    c.fields.filter((f) => f.id !== fid).map((f) => [f.id, 1]),
  );
  const to = isAuto(fid) ? slug(name, others) : fid;
  const collection = {
    ...c,
    fields: c.fields.map((f) => (f.id === fid ? { ...f, id: to, name } : f)),
    items:
      to === fid
        ? c.items
        : c.items.map((i) => ({
            ...i,
            values: rekey(i.values, fid, to, i.values[fid]),
          })),
  };
  const next = { ...p, collections: { ...p.collections, [cid]: collection } };
  if (to === fid) return { project: next, id: to };
  return {
    id: to,
    project: mapNodes(next, (n) =>
      n.bind?.collection === cid && n.bind.field === fid
        ? { ...n, bind: { ...n.bind, field: to } }
        : n,
    ),
  };
}
