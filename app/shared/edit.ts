import {
  type Doc,
  type DocNode,
  type Interaction,
  type Override,
  type Props,
  type StateName,
  type States,
} from './doc.js';
import { locate, renderTree, walk, type RNode, type Target } from './render.js';

// Lecture et écriture génériques d'un élément rendu, pour l'inspecteur :
// un nœud du document (maître, calque d'écran, instance de premier niveau)
// ou un override porté par l'instance de premier niveau (contenu d'instance).
export interface Facet {
  props?: Props;
  states?: States;
  characters?: string;
  interactions?: Interaction[];
  semantics?: DocNode['semantics'];
  variant?: Record<string, string>;
}
export interface Selected {
  key: string;
  target: Target;
  /** Nœud du document dont l'élément provient. */
  node: DocNode;
  /** Valeurs propres à la cible : nœud lui-même, ou override. */
  own: Facet;
  /** Valeurs rendues (composant + overrides). */
  resolved: RNode;
  /** Élément d'instance : ses valeurs propres sont des overrides. */
  inInstance: boolean;
}

export function rootOf(doc: Doc, id: string) {
  let root = id;
  for (let p: string | null = id; p; p = doc.nodes[p]?.parent ?? null) root = p;
  return root;
}
export function resolvedAt(doc: Doc, key: string): RNode | null {
  const head = key.split('>')[0];
  if (!doc.nodes[head]) return null;
  const tree = renderTree(doc, rootOf(doc, head));
  let found: RNode | null = null;
  if (tree) walk(tree, (r) => void (r.key === key && (found = r)));
  return found;
}

export function select(doc: Doc, key: string): Selected | null {
  const target = locate(doc, key);
  const resolved = resolvedAt(doc, key);
  if (!target || !resolved) return null;
  const node = doc.nodes[target.id];
  if (target.kind === 'node')
    return {
      key,
      target,
      node,
      own: {
        props: node.props,
        states: node.states,
        characters: node.characters,
        interactions: node.interactions,
        semantics: node.semantics,
        variant: node.variant,
      },
      resolved,
      inInstance: node.type === 'instance',
    };
  const o: Override = doc.nodes[target.instance].overrides?.[target.path] ?? {};
  return { key, target, node, own: o, resolved, inInstance: true };
}

const empty = (v: unknown) =>
  v === undefined ||
  (!!v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
function cleanFacet(f: Facet): Facet {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (k === 'props' && v) {
      const props = Object.fromEntries(
        Object.entries(v as object).filter(([, x]) => !empty(x)),
      );
      if (Object.keys(props).length) out.props = props;
    } else if (k === 'states' && v) {
      const states = Object.fromEntries(
        Object.entries(v as object).filter(
          ([, x]) => x && Object.values(x as object).some((y) => !empty(y)),
        ),
      );
      if (Object.keys(states).length) out.states = states;
    } else if (!empty(v)) out[k] = v;
  }
  return out as Facet;
}

/** Nœuds modifiés pour donner à la cible ces valeurs propres. */
export function writeFacet(doc: Doc, key: string, own: Facet): DocNode[] {
  const s = select(doc, key);
  if (!s) return [];
  const f = cleanFacet(own);
  if (s.target.kind === 'node') {
    const n: DocNode = structuredClone(s.node);
    n.props = f.props ?? {};
    for (const k of [
      'states',
      'characters',
      'interactions',
      'semantics',
      'variant',
    ] as const)
      if (f[k] !== undefined) (n as Record<string, unknown>)[k] = f[k];
      else delete (n as Record<string, unknown>)[k];
    // Un texte garde son contenu, même vide.
    if (n.type === 'text') n.characters = f.characters ?? '';
    return [n];
  }
  const h: DocNode = structuredClone(doc.nodes[s.target.instance]);
  const overrides = { ...h.overrides };
  if (Object.keys(f).length) overrides[s.target.path] = f as Override;
  else delete overrides[s.target.path];
  if (Object.keys(overrides).length) h.overrides = overrides;
  else delete h.overrides;
  return [h];
}

// --- Modifications ponctuelles, pour l'inspecteur ---
type Group = keyof Props;
/** Valeurs d'un groupe à l'état choisi (base, ou base + état). */
export function groupAt<G extends Group>(
  s: Selected,
  group: G,
  state: StateName | null,
): Props[G] {
  const base = s.resolved.props[group];
  const patch = state ? s.resolved.states?.[state]?.[group] : undefined;
  if (patch === undefined) return base;
  if (Array.isArray(patch) || patch === null || typeof patch !== 'object')
    return patch;
  return { ...(base as object), ...(patch as object) } as Props[G];
}
/** Champ d'un groupe défini localement (override ou état) ? */
export function isOwn(
  s: Selected,
  group: Group,
  field: string | null,
  state: StateName | null,
) {
  const src = state ? s.own.states?.[state] : s.own.props;
  const g = src?.[group];
  if (g === undefined) return false;
  if (field === null || Array.isArray(g) || g === null || typeof g !== 'object')
    return true;
  return (g as Record<string, unknown>)[field] !== undefined;
}
/**
 * Écrit un groupe (ou un champ d'un groupe) : value undefined retire la
 * valeur locale (retour à celle du composant, ou au défaut).
 */
export function setProp(
  doc: Doc,
  key: string,
  state: StateName | null,
  group: Group,
  field: string | null,
  value: unknown,
): DocNode[] {
  const s = select(doc, key);
  if (!s) return [];
  const own: Facet = structuredClone(s.own);
  const holder = (
    state ? ((own.states ??= {})[state] ??= {}) : (own.props ??= {})
  ) as Record<string, unknown>;
  if (field === null) {
    if (value === undefined) delete holder[group];
    else holder[group] = value;
  } else {
    const g = { ...(holder[group] as object) } as Record<string, unknown>;
    if (value === undefined) delete g[field];
    else g[field] = value;
    if (Object.keys(g).length) holder[group] = g;
    else delete holder[group];
  }
  return writeFacet(doc, key, own);
}
export function setFacet<K extends keyof Facet>(
  doc: Doc,
  key: string,
  field: K,
  value: Facet[K] | undefined,
): DocNode[] {
  const s = select(doc, key);
  if (!s) return [];
  return writeFacet(doc, key, { ...s.own, [field]: value });
}
/** Nombre de valeurs locales d'un élément d'instance (overrides). */
export function overrideCount(s: Selected): number {
  if (!s.inInstance) return 0;
  let n = 0;
  for (const g of Object.values(s.own.props ?? {}))
    n +=
      g && typeof g === 'object' && !Array.isArray(g)
        ? Object.keys(g).length
        : 1;
  for (const st of Object.values(s.own.states ?? {}))
    n += Object.keys(st ?? {}).length;
  if (s.target.kind === 'override' && s.own.characters !== undefined) n += 1;
  // Overrides des calques internes d'une instance de premier niveau.
  if (s.target.kind === 'node' && s.node.type === 'instance')
    n += Object.keys(s.node.overrides ?? {}).length;
  return n;
}
/** Retire tous les overrides (la variante choisie et les liens restent). */
export function resetOverrides(doc: Doc, key: string): DocNode[] {
  const s = select(doc, key);
  if (!s || !s.inInstance) return [];
  const kept: Facet = {
    variant: s.own.variant,
    interactions: s.own.interactions,
  };
  if (s.target.kind === 'node') {
    const n = structuredClone(s.node);
    const { size, position } = n.props;
    n.props = Object.fromEntries(
      Object.entries({ size, position }).filter(([, v]) => v),
    );
    delete n.states;
    delete n.overrides;
    return [n];
  }
  // Contenu d'instance : l'override et ceux de ses calques internes.
  const { instance, path } = s.target;
  const h = structuredClone(doc.nodes[instance]);
  const overrides = Object.fromEntries(
    Object.entries(h.overrides ?? {}).filter(
      ([p]) => p !== path && !p.startsWith(`${path}>`),
    ),
  );
  const rest = cleanFacet(kept);
  if (Object.keys(rest).length) overrides[path] = rest as Override;
  h.overrides = Object.keys(overrides).length ? overrides : undefined;
  if (!h.overrides) delete h.overrides;
  return [h];
}
/**
 * Même écriture sur plusieurs éléments (multi-sélection) : chaque écriture
 * part du document déjà modifié, deux éléments d'une même instance
 * cumulent donc leurs overrides.
 */
export function setPropMany(
  doc: Doc,
  keys: string[],
  state: StateName | null,
  group: Group,
  field: string | null,
  value:
    | string
    | number
    | boolean
    | object
    | null
    | undefined
    | ((s: Selected) => unknown),
): DocNode[] {
  let current = doc;
  const out = new Map<string, DocNode>();
  for (const key of keys) {
    const s = select(current, key);
    if (!s) continue;
    const v = typeof value === 'function' ? value(s) : value;
    for (const n of setProp(current, key, state, group, field, v)) {
      out.set(n.id, n);
      current = { ...current, nodes: { ...current.nodes, [n.id]: n } };
    }
  }
  return [...out.values()];
}
