import { find, ids, newId, update } from './nodes.js';
import {
  isToken,
  slug,
  styleKinds,
  type Breakpoint,
  type Breakpoints,
  type Node,
  type Override,
  type Project,
  type Style,
} from './project.js';

// Instances et composants : un élément d'une instance se désigne par
// « instance/élément » ; ses changements sont des ajustements locaux.

export const SEP = '/';
export const split = (id: string) => {
  const i = id.indexOf(SEP);
  return i < 0 ? null : { instance: id.slice(0, i), inner: id.slice(i + 1) };
};

const mergeStyles = (a?: Breakpoints<Style>, b?: Breakpoints<Style>) => {
  if (!b) return a;
  const out: Breakpoints<Style> = { ...a };
  for (const [bp, s] of Object.entries(b))
    out[bp as Breakpoint] = { ...out[bp as Breakpoint], ...s };
  return out;
};

/** Élément d'un composant tel qu'il apparaît dans une instance. */
export const applyOverride = (n: Node, o?: Override): Node =>
  o
    ? {
        ...n,
        ...(o.text !== undefined && { text: o.text }),
        ...(o.src !== undefined && { src: o.src }),
        ...(o.href !== undefined && { href: o.href }),
        style: mergeStyles(n.style, o.style),
      }
    : n;

/** Élément désigné par un identifiant, réel ou dans une instance. */
export function target(project: Project, root: Node, id: string) {
  const part = split(id);
  if (!part) {
    const hit = find(root, id);
    return hit && { node: hit.node, parent: hit.parent, instance: null };
  }
  const inst = find(root, part.instance)?.node;
  const c = inst?.component && project.components[inst.component];
  const hit = c && find(c.root, part.inner);
  if (!inst || !hit) return null;
  return {
    node: applyOverride(hit.node, inst.overrides?.[part.inner]),
    parent: hit.parent,
    instance: inst,
  };
}

/** Parent dans l'arbre affiché ; la racine d'un composant est l'instance. */
export function parentOf(project: Project, root: Node, id: string) {
  const part = split(id);
  if (!part) return find(root, id)?.parent?.id ?? null;
  const t = target(project, root, id);
  const inst = find(root, part.instance)?.node;
  const c = inst?.component && project.components[inst.component];
  if (!t?.parent || !c || t.parent.id === c.root.id) return part.instance;
  return `${part.instance}${SEP}${t.parent.id}`;
}

/** Écrit un ajustement local dans une instance ; `undefined` le retire. */
export function setOverride(
  root: Node,
  id: string,
  patch: { text?: string; src?: string; href?: string },
  style?: { bp: Breakpoint; patch: Record<string, unknown> },
): Node {
  const part = split(id)!;
  return update(root, part.instance, (inst) => {
    const o: Override = { ...inst.overrides?.[part.inner], ...patch };
    if (style) {
      const at: Record<string, unknown> = {
        ...o.style?.[style.bp],
        ...style.patch,
      };
      for (const k of Object.keys(style.patch))
        if (at[k] === undefined) delete at[k];
      o.style = { ...o.style, [style.bp]: at };
    }
    return { ...inst, overrides: { ...inst.overrides, [part.inner]: o } };
  });
}

// Position et visibilité appartiennent à l'instance, pas au composant.
const placement = ['x', 'y', 'hidden', 'alignSelf'] as const;
const pick = (s: Breakpoints<Style> | undefined, keep: boolean) => {
  const out: Breakpoints<Style> = {};
  for (const [bp, st] of Object.entries(s ?? {})) {
    const part = Object.fromEntries(
      Object.entries(st ?? {}).filter(
        ([k]) => placement.includes(k as never) === keep,
      ),
    );
    if (Object.keys(part).length) out[bp as Breakpoint] = part;
  }
  return Object.keys(out).length ? out : undefined;
};

/** Valeur libre remplacée par le token de même valeur, s'il existe. */
function tokenize(style: Style, f: Project['foundations']): Style {
  const out: Record<string, unknown> = { ...style };
  for (const [k, v] of Object.entries(style)) {
    const kind = styleKinds[k as keyof Style];
    if (!kind || isToken(v) || v === undefined) continue;
    const hit = Object.entries(f[kind]).find(([, t]) =>
      kind === 'colors'
        ? String((t as { light: string }).light).toLowerCase() ===
          String(v).toLowerCase()
        : 'value' in t && t.value === v,
    );
    if (hit) out[k] = hit[0];
  }
  return out as Style;
}
const tokenizeTree = (n: Node, f: Project['foundations']): Node => ({
  ...n,
  style: n.style
    ? Object.fromEntries(
        Object.entries(n.style).map(([bp, s]) => [bp, s && tokenize(s, f)]),
      )
    : undefined,
  children: n.children?.map((c) => tokenizeTree(c, f)),
});

/** Nom provisoire tiré du contenu, avant la proposition de l'IA. */
export function draftName(n: Node, p: Project): string {
  if (n.name) return n.name;
  const text = (x: Node): string | undefined =>
    x.kind === 'text' ? x.text?.trim() : x.children?.map(text).find(Boolean);
  return text(n)?.slice(0, 24) || 'Composant';
}

/**
 * Transforme un élément en composant : ajouté au design system (styles
 * convertis en tokens quand c'est possible), l'élément devient une instance.
 */
export function componentize(p: Project, root: Node, id: string) {
  const hit = find(root, id);
  if (!hit?.parent || split(id)) return null;
  const n = hit.node;
  const name = draftName(n, p);
  const cid = slug(name, p.components);
  const compRoot = tokenizeTree(
    { ...n, id: 'root', name, style: pick(n.style, false) },
    p.foundations,
  );
  const instance: Node = {
    id: n.id,
    kind: 'component',
    component: cid,
    style: pick(n.style, true),
  };
  return {
    project: {
      ...p,
      components: {
        ...p.components,
        [cid]: { name, root: compRoot, states: {} },
      },
    },
    root: update(root, id, () => instance),
    id: cid,
  };
}

/** Détache une instance : copie indépendante, ajustements appliqués. */
export function detach(p: Project, root: Node, id: string): Node {
  const inst = find(root, id)?.node;
  const c = inst?.component && p.components[inst.component];
  if (!inst || !c) return root;
  const taken = new Set(ids(root));
  const copy = (n: Node, top = false): Node => {
    const own = applyOverride(n, inst.overrides?.[n.id]);
    return {
      ...own,
      id: top ? inst.id : newId(root, n.kind, taken),
      ...(top && { name: inst.name ?? c.name }),
      style: top ? mergeStyles(own.style, inst.style) : own.style,
      children: n.children?.map((ch) => copy(ch)),
    };
  };
  return update(root, id, () => copy(c.root, true));
}
