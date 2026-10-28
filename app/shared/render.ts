import {
  componentOf,
  mergeProps,
  mergeStates,
  variantOf,
  type Doc,
  type DocNode,
  type Interaction,
  type Override,
  type Props,
  type States,
} from './doc.js';

// Résolution pure du document en arbre rendu : instances clonées depuis leur
// composant (variante choisie), propriétés de composant, puis overrides.
// Chaque élément rendu porte une clé unique (data-ds-node) :
//   nœud réel → son id ; contenu d'instance → « instance>chemin ».
export interface RNode {
  key: string;
  /** Nœud du document dont ce rendu provient. */
  id: string;
  type: DocNode['type'];
  name: string;
  props: Props;
  states?: States;
  semantics: NonNullable<DocNode['semantics']>;
  interactions: Interaction[];
  characters?: string;
  field?: DocNode['field'];
  vector?: unknown;
  /** Marqueurs data-ds-* lus par la sélection, l'export Figma et les tests. */
  marks: Record<string, string>;
  /** Clé de l'instance englobante la plus proche (composant interactif). */
  owner: string | null;
  parentProps: Props | null;
  children: RNode[];
}
/** Variantes choisies en mode Test (clé d'instance rendue → variante). */
export type Runtime = Record<string, Record<string, string>>;

interface InstCtx {
  key: string;
  overrides: Record<string, Override>;
  byName: Map<string, Override>;
  propValues: Record<string, string | boolean>;
}
const isEmpty = (o: object | undefined) => !o || !Object.keys(o).length;

// Chemin des noms depuis le composant : retrouve un override d'une variante à
// l'autre (comme Figma, qui associe les calques par nom).
function namePath(doc: Doc, node: DocNode) {
  const root = componentOf(doc, node.id);
  const names: string[] = [];
  for (
    let p: DocNode | undefined = node;
    p && p.id !== root?.id;
    p = p.parent ? doc.nodes[p.parent] : undefined
  )
    names.unshift(p.name);
  return names.join('/');
}
function byName(doc: Doc, overrides: Record<string, Override>) {
  const map = new Map<string, Override>();
  for (const [path, o] of Object.entries(overrides)) {
    if (path.includes('>')) continue;
    const n = doc.nodes[path];
    if (n) map.set(namePath(doc, n), o);
  }
  return map;
}
function lookup(doc: Doc, inst: InstCtx | null, node: DocNode) {
  if (!inst) return undefined;
  return inst.overrides[node.id] ?? inst.byName.get(namePath(doc, node));
}
function variantMark(v: Record<string, string> | undefined) {
  return v && Object.keys(v).length
    ? Object.entries(v)
        .map(([k, x]) => `${k}=${x}`)
        .join(', ')
    : undefined;
}
function componentMarks(doc: Doc, c: DocNode) {
  const set = c.parent ? doc.nodes[c.parent] : undefined;
  const inSet = set?.type === 'component-set';
  const marks: Record<string, string> = {
    'data-ds-id': c.id,
    'data-ds-name': inSet ? set.name : c.name,
  };
  if (inSet) marks['data-ds-set'] = set.name;
  const variant = variantMark(c.variant);
  if (variant) marks['data-ds-variant'] = variant;
  return marks;
}

export function renderTree(
  doc: Doc,
  rootId: string,
  runtime: Runtime = {},
): RNode | null {
  const emit = (
    node: DocNode,
    key: string,
    parentProps: Props | null,
    inst: InstCtx | null,
    owner: string | null,
    depth: number,
  ): RNode | null => {
    if (depth > 64) return null;
    if (node.type === 'instance')
      return instance(node, key, parentProps, inst, owner, depth);
    const o = lookup(doc, inst, node);
    let props = mergeProps(node.props, o?.props);
    const bound = node.bind;
    // Hors instance (maître), un calque lié prend la valeur par défaut.
    const values =
      inst?.propValues ??
      (bound
        ? Object.fromEntries(
            Object.entries(componentOf(doc, node.id)?.componentProps ?? {}).map(
              ([k, p]) => [k, p.default],
            ),
          )
        : {});
    if (bound?.visible && values[bound.visible] === false)
      props = mergeProps(props, { layer: { visible: false } });
    const characters =
      o?.characters ??
      (bound?.characters !== undefined &&
      typeof values[bound.characters] === 'string'
        ? (values[bound.characters] as string)
        : node.characters);
    const marks: Record<string, string> = {};
    if (node.type === 'component' && !inst)
      Object.assign(marks, componentMarks(doc, node));
    const r: RNode = {
      key,
      id: node.id,
      type: node.type,
      name: node.name,
      props,
      states: mergeStates(node.states, o?.states),
      semantics: { ...node.semantics, ...o?.semantics },
      interactions: o?.interactions ?? node.interactions ?? [],
      characters,
      field: node.field,
      vector: node.vector,
      marks,
      owner,
      parentProps,
      children: [],
    };
    r.children = node.children.flatMap((c) => {
      const child = doc.nodes[c];
      if (!child) return [];
      const childKey = inst ? `${inst.key}>${c}` : c;
      const out = emit(child, childKey, props, inst, owner, depth + 1);
      return out ? [out] : [];
    });
    return r;
  };

  const instance = (
    node: DocNode,
    key: string,
    parentProps: Props | null,
    inst: InstCtx | null,
    _owner: string | null,
    depth: number,
  ): RNode | null => {
    // Propriété « échange d'instance » du composant englobant.
    const swapProp = node.bind?.swap;
    const swapValue = swapProp
      ? (inst?.propValues[swapProp] ??
        componentOf(doc, node.id)?.componentProps?.[swapProp]?.default)
      : undefined;
    const sourceId =
      typeof swapValue === 'string' &&
      doc.nodes[swapValue]?.type === 'component'
        ? swapValue
        : node.componentId;
    const source = sourceId ? doc.nodes[sourceId] : undefined;
    if (!source || source.type !== 'component') return null;
    // Valeurs propres à l'instance, puis override posé par l'instance parente.
    const o = lookup(doc, inst, node);
    const nested: Record<string, Override> = { ...node.overrides };
    if (inst)
      for (const [p, x] of Object.entries(inst.overrides))
        if (p.startsWith(`${node.id}>`))
          nested[p.slice(node.id.length + 1)] = x;
    const variant = { ...node.variant, ...o?.variant, ...runtime[key] };
    const component = variantOf(doc, source, variant);
    const defaults = Object.fromEntries(
      Object.entries(component.componentProps ?? {}).map(([k, p]) => [
        k,
        p.default,
      ]),
    );
    const ctx: InstCtx = {
      key,
      overrides: nested,
      byName: byName(doc, nested),
      propValues: { ...defaults, ...node.propValues },
    };
    const ownProps = mergeProps(node.props, o?.props);
    const props = mergeProps(component.props, ownProps);
    const overridden =
      !isEmpty(ownProps) ||
      !isEmpty(node.states) ||
      !isEmpty(o?.states) ||
      !isEmpty(nested) ||
      o?.characters !== undefined;
    const r: RNode = {
      key,
      id: node.id,
      type: 'instance',
      name: node.name,
      props,
      states: mergeStates(
        mergeStates(component.states, node.states),
        o?.states,
      ),
      semantics: { ...component.semantics, ...node.semantics, ...o?.semantics },
      interactions:
        o?.interactions ?? node.interactions ?? component.interactions ?? [],
      characters: undefined,
      marks: {
        ...componentMarks(doc, component),
        'data-ds-inst': key,
        ...(overridden ? { 'data-ds-override': '' } : {}),
      },
      owner: key,
      parentProps,
      children: [],
    };
    r.children = component.children.flatMap((c) => {
      const child = doc.nodes[c];
      if (!child) return [];
      const out = emit(child, `${key}>${c}`, props, ctx, key, depth + 1);
      return out ? [out] : [];
    });
    return r;
  };

  const root = doc.nodes[rootId];
  return root ? emit(root, rootId, null, null, null, 0) : null;
}

export function walk(r: RNode, visit: (n: RNode) => void) {
  visit(r);
  for (const c of r.children) walk(c, visit);
}

// Où écrire une modification faite sur un élément rendu : le nœud lui-même,
// ou un override de l'instance de premier niveau (chemin dans le composant).
export type Target =
  | { kind: 'node'; id: string }
  | { kind: 'override'; instance: string; path: string; id: string };
export function locate(doc: Doc, key: string): Target | null {
  const [head, ...rest] = key.split('>');
  if (!doc.nodes[head]) return null;
  if (!rest.length) return { kind: 'node', id: head };
  const id = rest.at(-1)!;
  if (!doc.nodes[id]) return null;
  return { kind: 'override', instance: head, path: rest.join('>'), id };
}
