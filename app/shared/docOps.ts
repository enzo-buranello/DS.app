import {
  descendants,
  screenSlug,
  type Doc,
  type DocNode,
  type Override,
  type Props,
} from './doc.js';
import { CUSTOM_SECTION, customSectionNodes } from './migrate.js';
import { locate, walk as walkR, type RNode } from './render.js';
import { resolvedAt, rootOf } from './edit.js';

// Opérations de structure (panneau Calques, raccourcis) : fonctions pures qui
// renvoient les nœuds à écrire (null = supprimé). L'appelant en fait un seul
// geste annulable. Le serveur revalide l'arbre entier (cycles, orphelins).
export interface Change {
  id: string;
  after: DocNode | null;
}
export class OpError extends Error {}

/** Identifiant neuf, compatible avec le schéma (préfixe lisible). */
export function newId(doc: Doc, prefix = 'n') {
  for (;;) {
    const id = `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
    if (!doc.nodes[id]) return id;
  }
}

class Draft {
  out = new Map<string, DocNode | null>();
  constructor(readonly doc: Doc) {}
  get(id: string): DocNode {
    const n = this.out.has(id) ? this.out.get(id) : this.doc.nodes[id];
    if (!n) throw new OpError(`Calque introuvable : ${id}.`);
    return this.out.has(id) ? n : structuredClone(n);
  }
  has(id: string) {
    return this.out.has(id) ? this.out.get(id) !== null : !!this.doc.nodes[id];
  }
  put(n: DocNode) {
    this.out.set(n.id, n);
  }
  drop(id: string) {
    this.out.set(id, null);
  }
  id(prefix?: string) {
    let id: string;
    do id = newId(this.doc, prefix);
    while (this.out.has(id));
    return id;
  }
  changes(): Change[] {
    return [...this.out].map(([id, after]) => ({ id, after }));
  }
}
const CONTAINER: DocNode['type'][] = [
  'frame',
  'component',
  'component-set',
  'page',
];
export const isContainer = (n: DocNode | undefined) =>
  !!n && CONTAINER.includes(n.type);
const isRoot = (doc: Doc, id: string) =>
  id === doc.components || doc.screens.includes(id);
function within(d: Draft, id: string, ancestor: string) {
  for (let p: string | null = id; p; p = d.get(p).parent)
    if (p === ancestor) return true;
  return false;
}
// Seuls les nœuds réels se manipulent (pas le contenu d'une instance).
export function realId(doc: Doc, key: string) {
  const t = locate(doc, key);
  if (!t || t.kind !== 'node')
    throw new OpError(
      'Calque d’instance : modifiable dans l’inspecteur, ou détachez l’instance.',
    );
  return t.id;
}

function detachFrom(d: Draft, id: string) {
  const n = d.get(id);
  if (!n.parent) return;
  const p = d.get(n.parent);
  p.children = p.children.filter((c) => c !== id);
  d.put(p);
}
function attach(d: Draft, id: string, parent: string, index?: number) {
  const p = d.get(parent);
  const children = p.children.filter((c) => c !== id);
  children.splice(index ?? children.length, 0, id);
  p.children = children;
  d.put(p);
  const n = d.get(id);
  n.parent = parent;
  d.put(n);
}

// --- Insertion ---
export type InsertKind = 'frame' | 'text' | 'rect' | 'image' | 'instance';
const BLOCKS: Record<Exclude<InsertKind, 'instance'>, Partial<DocNode>> = {
  frame: {
    type: 'frame',
    name: 'Cadre',
    props: {
      layout: {
        mode: 'vertical',
        gap: { token: 'space.sm' },
        padding: {
          top: { token: 'space.md' },
          right: { token: 'space.md' },
          bottom: { token: 'space.md' },
          left: { token: 'space.md' },
        },
      },
      fills: [
        {
          type: 'solid',
          color: { token: 'color.surface', opacity: 1 },
          visible: true,
        },
      ],
      size: { width: { mode: 'fixed', px: 200 }, minHeight: 80 },
    },
  },
  text: { type: 'text', name: 'Texte', characters: 'Texte', props: {} },
  rect: {
    type: 'rect',
    name: 'Rectangle',
    props: {
      size: {
        width: { mode: 'fixed', px: 100 },
        height: { mode: 'fixed', px: 100 },
      },
      fills: [
        {
          type: 'solid',
          color: { token: 'color.muted', opacity: 1 },
          visible: true,
        },
      ],
    },
  },
  image: {
    type: 'image',
    name: 'Image',
    props: {
      size: {
        width: { mode: 'fixed', px: 160 },
        height: { mode: 'fixed', px: 120 },
      },
      fills: [
        {
          type: 'solid',
          color: { token: 'color.canvas', opacity: 1 },
          visible: true,
        },
      ],
    },
  },
};
/**
 * Où insérer à partir de la sélection : dans un conteneur, sinon juste après
 * l'élément (dans son parent). Sans sélection : à la fin de la racine.
 */
export function insertionPoint(doc: Doc, key: string | null, root: string) {
  if (!key) return { parent: root, index: undefined as number | undefined };
  const head = key.split('>')[0];
  const id = locate(doc, key)?.kind === 'node' ? head : head;
  const n = doc.nodes[id];
  if (!n) return { parent: root, index: undefined };
  if (isContainer(n) && n.type !== 'component-set')
    return { parent: id, index: undefined };
  if (!n.parent) return { parent: root, index: undefined };
  const p = doc.nodes[n.parent];
  return { parent: n.parent, index: p.children.indexOf(id) + 1 };
}
export function insert(
  doc: Doc,
  at: { parent: string; index?: number },
  kind: InsertKind,
  componentId?: string,
): { changes: Change[]; id: string } {
  const d = new Draft(doc);
  const id = d.id(kind === 'instance' ? 'i' : kind[0]);
  let node: DocNode;
  if (kind === 'instance') {
    const c = componentId && doc.nodes[componentId];
    if (!c || c.type !== 'component')
      throw new OpError('Composant introuvable.');
    if (within(d, at.parent, c.id))
      throw new OpError(
        'Une instance ne peut pas se trouver dans son composant.',
      );
    node = {
      id,
      type: 'instance',
      name: c.name,
      parent: at.parent,
      children: [],
      props: {},
      componentId: c.id,
    };
  } else
    node = {
      ...structuredClone(BLOCKS[kind]),
      id,
      parent: at.parent,
      children: [],
    } as DocNode;
  d.put(node);
  attach(d, id, at.parent, at.index);
  return { changes: d.changes(), id };
}

// --- Suppression ---
export function remove(doc: Doc, ids: string[]): Change[] {
  const d = new Draft(doc);
  for (const id of ids) {
    if (isRoot(doc, id))
      throw new OpError('Un écran se supprime depuis la liste des écrans.');
    if (!d.has(id)) continue;
    const gone = descendants(doc, id);
    // Un composant encore utilisé ne disparaît pas en silence.
    const used = Object.values(doc.nodes).find(
      (n) =>
        n.type === 'instance' &&
        n.componentId &&
        gone.includes(n.componentId) &&
        !gone.includes(n.id),
    );
    if (used)
      throw new OpError(
        `Composant utilisé par « ${used.name} » : détachez ou supprimez ses instances d’abord.`,
      );
    detachFrom(d, id);
    for (const g of gone) d.drop(g);
  }
  return d.changes();
}

// --- Duplication et copier/coller ---
/** Sous-arbre(s) sérialisé(s) pour le presse-papiers interne. */
export interface Clip {
  roots: string[];
  nodes: Record<string, DocNode>;
}
export function copy(doc: Doc, ids: string[]): Clip {
  const nodes: Record<string, DocNode> = {};
  for (const id of ids)
    for (const n of descendants(doc, id))
      nodes[n] = structuredClone(doc.nodes[n]);
  return { roots: ids, nodes };
}
function cloneInto(
  d: Draft,
  clip: Clip,
  root: string,
  parent: string,
  index?: number,
) {
  const map = new Map<string, string>();
  const walk = (old: string): string => {
    const src = clip.nodes[old];
    const id = d.id(src.type === 'instance' ? 'i' : 'n');
    map.set(old, id);
    const children = src.children.map(walk);
    d.put({ ...structuredClone(src), id, parent: null, children });
    for (const c of children) {
      const n = d.get(c);
      n.parent = id;
      d.put(n);
    }
    return id;
  };
  const id = walk(root);
  // Copie d'un composant : c'est un nouveau composant, sans variante liée.
  const n = d.get(id);
  if (n.type === 'component' && d.get(parent).type !== 'component-set')
    delete n.variant;
  d.put(n);
  attach(d, id, parent, index);
  return id;
}
export function paste(
  doc: Doc,
  clip: Clip,
  at: { parent: string; index?: number },
): { changes: Change[]; ids: string[] } {
  const d = new Draft(doc);
  const parent = d.get(at.parent);
  const ids = clip.roots.map((r, i) => {
    // Instance collée dans son propre composant : refusée.
    for (const n of Object.values(clip.nodes))
      if (
        n.type === 'instance' &&
        n.componentId &&
        within(d, at.parent, n.componentId)
      )
        throw new OpError(
          'Une instance ne peut pas se trouver dans son composant.',
        );
    return cloneInto(
      d,
      clip,
      r,
      parent.id,
      at.index === undefined ? undefined : at.index + i,
    );
  });
  return { changes: d.changes(), ids };
}
export function duplicate(doc: Doc, ids: string[]) {
  const first = doc.nodes[ids[0]];
  if (!first?.parent)
    throw new OpError('Un écran se duplique depuis la liste des écrans.');
  const p = doc.nodes[first.parent];
  const last = Math.max(...ids.map((i) => p.children.indexOf(i)));
  return paste(doc, copy(doc, ids), { parent: first.parent, index: last + 1 });
}

// --- Déplacement (glisser-déposer, imbrication) ---
export function move(
  doc: Doc,
  id: string,
  parent: string,
  index?: number,
): Change[] {
  const d = new Draft(doc);
  if (isRoot(doc, id)) throw new OpError('Un écran ne se déplace pas.');
  if (within(d, parent, id))
    throw new OpError('Impossible de placer un calque dans lui-même.');
  const target = d.get(parent);
  if (!isContainer(target))
    throw new OpError('Ce calque ne peut pas contenir d’enfants.');
  const n = d.get(id);
  if (target.type === 'component-set' && n.type !== 'component')
    throw new OpError('Un component set ne contient que des variantes.');
  // Même parent : l'index visé tient compte du retrait de l'élément.
  const from = target.children.indexOf(id);
  const at =
    index !== undefined && from !== -1 && from < index ? index - 1 : index;
  detachFrom(d, id);
  attach(d, id, parent, at);
  return d.changes();
}

// --- Grouper, auto-layout ---
function sameParent(doc: Doc, ids: string[]) {
  const parents = new Set(ids.map((i) => doc.nodes[i]?.parent ?? null));
  const [parent] = parents;
  if (parents.size !== 1 || !parent)
    throw new OpError('Les calques doivent avoir le même parent.');
  return parent;
}
function wrap(doc: Doc, ids: string[], props: Props, name: string) {
  const parent = sameParent(doc, ids);
  const d = new Draft(doc);
  const p = d.get(parent);
  const order = [...ids].sort(
    (a, b) => p.children.indexOf(a) - p.children.indexOf(b),
  );
  const index = p.children.indexOf(order[0]);
  const id = d.id('g');
  d.put({ id, type: 'frame', name, parent, children: [], props });
  attach(d, id, parent, index);
  for (const c of order) {
    detachFrom(d, c);
    attach(d, c, id);
  }
  return { changes: d.changes(), id };
}
/** Cmd+G : cadre sans style qui épouse ses enfants. */
export function group(doc: Doc, ids: string[]) {
  const parentLayout = doc.nodes[sameParent(doc, ids)].props.layout?.mode;
  return wrap(
    doc,
    ids,
    {
      layout: {
        mode: parentLayout === 'horizontal' ? 'horizontal' : 'vertical',
        gap: { px: 0 },
      },
    },
    'Groupe',
  );
}
/** Maj+A : auto-layout sur un cadre, sinon autour de la sélection. */
export function autoLayout(doc: Doc, ids: string[]) {
  if (ids.length === 1 && isContainer(doc.nodes[ids[0]])) {
    const n = structuredClone(doc.nodes[ids[0]]);
    const on =
      n.props.layout?.mode === 'horizontal' ||
      n.props.layout?.mode === 'vertical';
    n.props = {
      ...n.props,
      layout: on
        ? { ...n.props.layout, mode: 'none' }
        : { gap: { token: 'space.sm' }, ...n.props.layout, mode: 'vertical' },
    };
    return { changes: [{ id: n.id, after: n }], id: n.id };
  }
  return wrap(
    doc,
    ids,
    { layout: { mode: 'vertical', gap: { token: 'space.sm' } } },
    'Auto-layout',
  );
}

// --- Composants ---
// Section « Mes composants » (créée au besoin), où vont les nouveaux maîtres.
function ensureSection(d: Draft) {
  if (d.has(CUSTOM_SECTION)) return;
  for (const n of customSectionNodes(d.doc)) d.put(n);
  const page = d.get(d.doc.components);
  page.children = [...page.children, CUSTOM_SECTION];
  d.put(page);
}
/**
 * Cmd+Alt+K : la sélection devient un composant maître (section « Mes
 * composants ») et sa place est prise par une instance, comme dans Figma.
 */
export function createComponent(doc: Doc, ids: string[]) {
  const d = new Draft(doc);
  ensureSection(d);
  const parent = sameParent(doc, ids);
  const p = doc.nodes[parent];
  const order = [...ids].sort(
    (a, b) => p.children.indexOf(a) - p.children.indexOf(b),
  );
  for (const id of order) {
    const n = doc.nodes[id];
    if (n.type === 'component' || n.type === 'component-set')
      throw new OpError('C’est déjà un composant.');
    if (descendants(doc, id).some((x) => doc.nodes[x].type === 'component'))
      throw new OpError('La sélection contient un composant maître.');
  }
  const index = p.children.indexOf(order[0]);
  const single = order.length === 1 && isContainer(doc.nodes[order[0]]);
  const compId = d.id('c');
  if (single) {
    // Le cadre lui-même devient le composant (ses propriétés comprises).
    const src = d.get(order[0]);
    detachFrom(d, src.id);
    d.drop(src.id);
    d.put({
      ...src,
      id: compId,
      type: 'component',
      parent: null,
      children: [],
    });
    for (const c of src.children) {
      const child = d.get(c);
      child.parent = compId;
      d.put(child);
    }
    const comp = d.get(compId);
    comp.children = src.children;
    d.put(comp);
  } else {
    d.put({
      id: compId,
      type: 'component',
      name: 'Composant',
      parent: null,
      children: [],
      props: { layout: { mode: 'vertical', gap: { px: 0 } } },
    });
    for (const id of order) {
      detachFrom(d, id);
      attach(d, id, compId);
    }
  }
  // Taille dépendante de l'emplacement : gardée sur l'instance.
  const comp = d.get(compId);
  const { size, position, ...rest } = comp.props;
  comp.props = rest;
  d.put(comp);
  attach(d, compId, CUSTOM_SECTION);
  const instId = d.id('i');
  d.put({
    id: instId,
    type: 'instance',
    name: comp.name,
    parent,
    children: [],
    props: Object.fromEntries(
      Object.entries({ size, position }).filter(([, v]) => v),
    ),
    componentId: compId,
  });
  attach(d, instId, parent, index);
  return { changes: d.changes(), component: compId, instance: instId };
}

/** Nouvelle variante : crée le component set au besoin. */
export function addVariant(doc: Doc, componentId: string) {
  const d = new Draft(doc);
  const c = d.get(componentId);
  if (c.type !== 'component')
    throw new OpError('Sélectionnez un composant maître.');
  let setId = c.parent!;
  if (d.get(setId).type !== 'component-set') {
    const parent = setId;
    const index = d.get(parent).children.indexOf(c.id);
    setId = d.id('s');
    d.put({
      id: setId,
      type: 'component-set',
      name: c.name,
      parent,
      children: [],
      props: {
        layout: { mode: 'horizontal', wrap: true, gap: { token: 'space.sm' } },
      },
    });
    attach(d, setId, parent, index);
    detachFrom(d, c.id);
    attach(d, c.id, setId);
    const self = d.get(c.id);
    self.variant = { Propriété: 'Défaut' };
    d.put(self);
  }
  const base = d.get(c.id);
  const prop = Object.keys(base.variant ?? { Propriété: '' })[0];
  const taken = new Set(
    d.get(setId).children.map((x) => d.get(x).variant?.[prop]),
  );
  let n = 2;
  while (taken.has(`Variante ${n}`)) n++;
  const draftDoc = { ...doc, nodes: { ...doc.nodes } };
  for (const [id, v] of d.out) if (v) draftDoc.nodes[id] = v;
  const clip = copy(draftDoc, [c.id]);
  const set = d.get(setId);
  const id = cloneInto(d, clip, c.id, setId, set.children.indexOf(c.id) + 1);
  const v = d.get(id);
  v.variant = { ...base.variant, [prop]: `Variante ${n}` };
  v.name = `Variante ${n}`;
  d.put(v);
  return { changes: d.changes(), id };
}
/** Renomme une propriété de variante dans tout le set. */
export function renameVariantProp(
  doc: Doc,
  setId: string,
  from: string,
  to: string,
) {
  const d = new Draft(doc);
  if (!to.trim() || from === to) return [];
  for (const id of d.get(setId).children) {
    const v = d.get(id);
    if (!v.variant || !(from in v.variant)) continue;
    const { [from]: value, ...rest } = v.variant;
    v.variant = { ...rest, [to]: value };
    d.put(v);
  }
  return d.changes();
}

export type PropType = 'text' | 'boolean' | 'instance-swap';
/** Propriété de composant liée à un calque (texte, visibilité, échange). */
export function addComponentProp(
  doc: Doc,
  componentId: string,
  layerId: string,
  type: PropType,
  name: string,
): Change[] {
  const d = new Draft(doc);
  const c = d.get(componentId);
  const layer = d.get(layerId);
  if (c.type !== 'component')
    throw new OpError('Sélectionnez un composant maître.');
  if (!within(d, layerId, componentId) || layerId === componentId)
    throw new OpError('Le calque doit appartenir au composant.');
  if (type === 'text' && layer.type !== 'text')
    throw new OpError('Une propriété texte se lie à un calque texte.');
  if (type === 'instance-swap' && layer.type !== 'instance')
    throw new OpError('Un échange se lie à une instance.');
  const key = name.trim() || 'Propriété';
  c.componentProps = {
    ...c.componentProps,
    [key]:
      type === 'text'
        ? { type, default: layer.characters ?? '' }
        : type === 'boolean'
          ? { type, default: true }
          : { type, default: layer.componentId! },
  };
  d.put(c);
  layer.bind = {
    ...layer.bind,
    [type === 'text' ? 'characters' : type === 'boolean' ? 'visible' : 'swap']:
      key,
  };
  d.put(layer);
  return d.changes();
}

/** Détacher : l'instance devient des calques ordinaires, valeurs rendues figées. */
export function detach(
  doc: Doc,
  key: string,
): { changes: Change[]; id: string } {
  const id = realId(doc, key);
  const n = doc.nodes[id];
  if (n.type !== 'instance')
    throw new OpError('Ce calque n’est pas une instance.');
  const r = resolvedAt(doc, key);
  if (!r) throw new OpError('Instance introuvable.');
  const d = new Draft(doc);
  // Différences d'un rendu par rapport au nœud source (groupe par groupe).
  const diff = (a: Props, b: Props) =>
    Object.fromEntries(
      Object.entries(a).filter(
        ([k, v]) => JSON.stringify(v) !== JSON.stringify(b[k as keyof Props]),
      ),
    ) as Props;
  // Instance imbriquée : reste une instance (variante rendue), ses valeurs
  // locales et celles de ses calques deviennent des overrides.
  const nested = (x: RNode, parent: string) => {
    const comp = doc.nodes[x.marks['data-ds-id']];
    const src = doc.nodes[x.id];
    const nid = d.id('i');
    const overrides: Record<string, Override> = {};
    walkR(x, (c) => {
      if (c === x || c.type === 'instance') return;
      const base = doc.nodes[c.id];
      if (!base) return;
      const o: Override = {};
      const props = diff(c.props, base.props);
      if (Object.keys(props).length) o.props = props;
      if (c.characters !== undefined && c.characters !== base.characters)
        o.characters = c.characters;
      if (Object.keys(o).length) overrides[c.id] = o;
    });
    d.put({
      id: nid,
      type: 'instance',
      name: x.name,
      parent,
      children: [],
      props: diff(x.props, comp.props),
      componentId: comp.id,
      ...(src?.propValues
        ? { propValues: structuredClone(src.propValues) }
        : {}),
      ...(Object.keys(overrides).length ? { overrides } : {}),
    });
    return nid;
  };
  const build = (x: RNode, parent: string | null, keepId?: string): string => {
    if (!keepId && x.type === 'instance') return nested(x, parent!);
    const nid = keepId ?? d.id(x.type[0]);
    d.put({
      id: nid,
      type: x.type === 'instance' || x.type === 'component' ? 'frame' : x.type,
      name: x.name,
      parent,
      children: [],
      props: structuredClone(x.props),
      ...(x.states && Object.keys(x.states).length
        ? { states: structuredClone(x.states) }
        : {}),
      ...(Object.keys(x.semantics).length
        ? { semantics: structuredClone(x.semantics) }
        : {}),
      ...(x.interactions.length
        ? { interactions: structuredClone(x.interactions) }
        : {}),
      ...(x.characters !== undefined ? { characters: x.characters } : {}),
      ...(x.field ? { field: structuredClone(x.field) } : {}),
      ...(x.vector ? { vector: structuredClone(x.vector) } : {}),
    });
    const kids = x.children.map((c) => build(c, nid));
    const self = d.get(nid);
    self.children = kids;
    d.put(self);
    return nid;
  };
  // Le cadre garde l'id de l'instance : liens et sélection restent valides.
  build(r, n.parent, id);
  return { changes: d.changes(), id };
}

// --- Écrans ---
const slugOf = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'ecran';
function screenId(doc: Doc, name: string) {
  let id = `screen.${slugOf(name)}`;
  for (let i = 2; doc.nodes[id]; i++) id = `screen.${slugOf(name)}-${i}`;
  return id;
}
/** Changements de nœuds + nouvelle liste d'écrans (racines du document). */
export interface ScreenOp {
  changes: Change[];
  screens: string[];
  id: string;
}
export function createScreen(doc: Doc, name: string): ScreenOp {
  const id = screenId(doc, name);
  const node: DocNode = {
    id,
    type: 'frame',
    name: name.trim() || 'Écran',
    parent: null,
    children: [],
    props: {
      layout: {
        mode: 'vertical',
        gap: { token: 'space.md' },
        padding: {
          top: { token: 'space.lg' },
          right: { token: 'space.lg' },
          bottom: { token: 'space.lg' },
          left: { token: 'space.lg' },
        },
      },
      fills: [
        {
          type: 'solid',
          color: { token: 'color.canvas', opacity: 1 },
          visible: true,
        },
      ],
      size: { width: { mode: 'fill' }, minHeight: 400 },
    },
  };
  return { changes: [{ id, after: node }], screens: [...doc.screens, id], id };
}
export function duplicateScreen(doc: Doc, screen: string): ScreenOp {
  const src = doc.nodes[screen];
  if (!src || !doc.screens.includes(screen))
    throw new OpError('Écran introuvable.');
  const id = screenId(doc, `${src.name} copie`);
  const d = new Draft(doc);
  const clip = copy(doc, [screen]);
  // Racine : id d'écran lisible ; enfants : ids neufs.
  d.put({
    ...structuredClone(src),
    id,
    name: `${src.name} copie`,
    children: [],
  });
  for (const c of src.children) cloneInto(d, clip, c, id);
  return { changes: d.changes(), screens: [...doc.screens, id], id };
}
export function deleteScreen(doc: Doc, screen: string): ScreenOp {
  if (doc.screens.length <= 1)
    throw new OpError('Il faut garder au moins un écran.');
  if (!doc.screens.includes(screen)) throw new OpError('Écran introuvable.');
  const gone = descendants(doc, screen);
  const d = new Draft(doc);
  for (const g of gone) d.drop(g);
  // Les interactions qui menaient à cet écran sont retirées.
  for (const n of Object.values(doc.nodes)) {
    if (gone.includes(n.id) || !n.interactions?.length) continue;
    const kept = n.interactions.filter(
      (i) => !(i.action.type === 'navigate' && i.action.screen === screen),
    );
    if (kept.length !== n.interactions.length) {
      const x = d.get(n.id);
      x.interactions = kept;
      d.put(x);
    }
  }
  const screens = doc.screens.filter((s) => s !== screen);
  return { changes: d.changes(), screens, id: screens[0] };
}
export const screenLabel = (doc: Doc, id: string) =>
  doc.nodes[id]?.name ?? screenSlug(id);
export { rootOf };
