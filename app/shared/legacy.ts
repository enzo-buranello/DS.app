import {
  componentOf,
  mergeProps,
  mergeStates,
  screenSlug,
  variantOf,
  type Doc,
  type DocNode,
  type Interaction,
  type Override,
  type Props,
} from './doc.js';
import type { InstanceOverride, OverrideField } from './edits.js';
import { locate, renderTree, walk, type RNode } from './render.js';

// Pont entre les champs v1 (fill, text, radius, paddingX/Y, fontSize, label,
// variant, disabled, link) et le modèle de nœuds. Sert au panneau actuel, à
// l'agent et à la migration de edits.json, en attendant l'inspecteur complet.
export type Legacy = InstanceOverride;

const VARIANT = {
  primary: 'Principal',
  secondary: 'Secondaire',
  danger: 'Danger',
} as const;
const fromVariant = (v: string | undefined) =>
  (Object.entries(VARIANT).find(([, name]) => name === v)?.[0] ??
    undefined) as Legacy['variant'];

// Ce qu'on modifie pour une clé rendue : le nœud du document, ou l'override
// de l'instance de premier niveau ; « base » = valeurs héritées (composant).
interface Spot {
  key: string;
  node: DocNode;
  /** Instance de premier niveau qui porte l'override (sinon null). */
  holder: DocNode | null;
  path: string | null;
  own: Override;
  base: Props;
  /** Composant source quand la cible est une instance. */
  component: DocNode | null;
}
function spot(doc: Doc, key: string): Spot | null {
  const t = locate(doc, key);
  if (!t) return null;
  const node = doc.nodes[t.id];
  const sourceOf = (n: DocNode, variant?: Record<string, string>) => {
    const c = n.componentId ? doc.nodes[n.componentId] : undefined;
    return c ? variantOf(doc, c, { ...n.variant, ...variant }) : null;
  };
  if (t.kind === 'node') {
    const component = node.type === 'instance' ? sourceOf(node) : null;
    return {
      key,
      node,
      holder: null,
      path: null,
      own: {
        props: node.props,
        states: node.states,
        interactions: node.interactions,
        variant: node.variant,
        ...(node.characters !== undefined
          ? { characters: node.characters }
          : {}),
      },
      base: component?.props ?? {},
      component,
    };
  }
  const holder = doc.nodes[t.instance];
  const own = holder.overrides?.[t.path] ?? {};
  const component =
    node.type === 'instance' ? sourceOf(node, own.variant) : null;
  return {
    key,
    node,
    holder,
    path: t.path,
    own,
    base:
      node.type === 'instance'
        ? mergeProps(component?.props ?? {}, node.props)
        : node.props,
    component,
  };
}
// Calque texte lié à la propriété « Texte » d'un composant (libellé du bouton).
function labelOf(doc: Doc, component: DocNode | null) {
  if (!component) return null;
  return (
    component.children
      .map((c) => doc.nodes[c])
      .find((c) => c?.type === 'text' && c.bind?.characters) ?? null
  );
}
const isButton = (doc: Doc, s: Spot) => {
  const c = s.component ?? (s.node.type === 'component' ? s.node : null);
  const set = c?.parent ? doc.nodes[c.parent] : undefined;
  return set?.id === 'button';
};

export function legacyFields(doc: Doc, key: string): OverrideField[] {
  const s = spot(doc, key);
  if (!s) return [];
  if (s.node.type === 'text') return ['text', 'fontSize', 'label'];
  if (isButton(doc, s))
    return [
      'fill',
      'text',
      'radius',
      'paddingX',
      'paddingY',
      'fontSize',
      'label',
      ...(s.node.type === 'instance'
        ? (['variant', 'disabled', 'link'] as const)
        : []),
    ];
  return ['fill', 'radius', 'paddingX', 'paddingY'];
}

function propsToLegacy(p: Props | undefined): Legacy {
  const out: Legacy = {};
  const f = p?.fills;
  if (f?.length === 1 && f[0].type === 'solid') out.fill = f[0].color;
  if (p?.text?.color) out.text = p.text.color;
  if (p?.radius?.topLeft) out.radius = p.radius.topLeft;
  if (p?.layout?.padding) {
    out.paddingX = p.layout.padding.left;
    out.paddingY = p.layout.padding.top;
  }
  if (p?.text?.size) out.fontSize = p.text.size;
  return out;
}
const linkOf = (i: Interaction[] | undefined) => {
  if (!i) return undefined;
  const nav = i.find((x) => x.action.type === 'navigate');
  return nav?.action.type === 'navigate'
    ? (screenSlug(nav.action.screen) as Legacy['link'])
    : null;
};

/** Valeurs propres à la cible (maître : ses valeurs ; instance : overrides). */
export function readOwn(doc: Doc, key: string): Legacy {
  const s = spot(doc, key);
  if (!s) return {};
  const fields = legacyFields(doc, key);
  const out: Legacy = propsToLegacy(s.own.props);
  if (s.node.type === 'text' && s.holder && s.own.characters !== undefined)
    out.label = s.own.characters;
  if (s.node.type === 'text' && !s.holder && s.node.characters !== undefined)
    out.label = s.node.characters;
  if (s.node.type === 'instance') {
    const label = labelOf(doc, s.component);
    const path = s.holder ? `${s.path}>${label?.id}` : label?.id;
    const holder = s.holder ?? s.node;
    const o = path ? holder.overrides?.[path] : undefined;
    if (o?.characters !== undefined) out.label = o.characters;
    const variant = s.own.variant;
    if (variant?.Variante) out.variant = fromVariant(variant.Variante);
    if (variant?.État) out.disabled = variant.État === 'Désactivé';
    const link = linkOf(s.own.interactions);
    if (link !== undefined) out.link = link;
  }
  if (s.node.type === 'component') {
    const t = s.node.componentProps?.Texte;
    if (t?.type === 'text') out.label = t.default;
  }
  return Object.fromEntries(
    Object.entries(out).filter(([k]) => fields.includes(k as OverrideField)),
  ) as Legacy;
}
// Écrit les champs v1 dans les propriétés : « remove » retire ceux qui ne
// figurent pas dans value (panneau) ; sinon ajout seul (migration).
function legacyProps(
  own: Props | undefined,
  base: Props,
  value: Legacy,
  remove: boolean,
): Props {
  const p: Props = structuredClone(own ?? {});
  const has = (f: OverrideField) => value[f] !== undefined;
  if (has('fill'))
    p.fills = [{ type: 'solid', color: value.fill!, visible: true }];
  else if (remove && propsToLegacy(p).fill) delete p.fills;
  const text = { ...p.text };
  if (has('text')) text.color = value.text!;
  else if (remove) delete text.color;
  if (has('fontSize')) text.size = value.fontSize!;
  else if (remove) delete text.size;
  if (Object.keys(text).length) p.text = text;
  else delete p.text;
  if (has('radius')) {
    const r = value.radius!;
    p.radius = {
      ...p.radius,
      topLeft: r,
      topRight: r,
      bottomRight: r,
      bottomLeft: r,
    };
  } else if (remove && p.radius) {
    const { smoothing } = p.radius;
    if (smoothing !== undefined) p.radius = { smoothing };
    else delete p.radius;
  }
  const zero = { px: 0 };
  const from = p.layout?.padding ?? base.layout?.padding;
  if (has('paddingX') || has('paddingY')) {
    const x = value.paddingX ?? from?.left ?? zero;
    const y = value.paddingY ?? from?.top ?? zero;
    p.layout = {
      ...p.layout,
      padding: { top: y, right: x, bottom: y, left: x },
    };
  } else if (remove && p.layout?.padding) {
    const { padding: _, ...rest } = p.layout;
    if (Object.keys(rest).length) p.layout = rest;
    else delete p.layout;
  }
  return p;
}
const clean = <T extends object>(o: T) =>
  withProps(
    Object.fromEntries(
      Object.entries(o).filter(
        ([, v]) =>
          v !== undefined &&
          !(
            v &&
            typeof v === 'object' &&
            !Array.isArray(v) &&
            !Object.keys(v).length
          ),
      ),
    ) as T,
  );
// Un nœud garde toujours ses propriétés (même vides) et ses enfants.
function withProps<T extends object>(o: T): T {
  if ('id' in o && 'type' in o) {
    const n = o as unknown as DocNode;
    n.props ??= {};
    n.children ??= [];
  }
  return o;
}

/** Nœuds modifiés (valeur « après ») pour écrire value sur la cible. */
export function writeLegacy(
  doc: Doc,
  key: string,
  value: Legacy | null,
  remove = true,
): DocNode[] {
  const s = spot(doc, key);
  if (!s) return [];
  const v = value ?? {};
  const changed = new Map<string, DocNode>();
  const get = (id: string) => changed.get(id) ?? structuredClone(doc.nodes[id]);
  const put = (n: DocNode) => changed.set(n.id, n);
  const props = legacyProps(s.own.props, s.base, v, remove);
  // Variante et lien : seulement là où le panneau les propose.
  const fields = legacyFields(doc, key);
  const interactions = !fields.includes('link')
    ? s.own.interactions
    : v.link !== undefined
      ? v.link
        ? [
            {
              trigger: 'click' as const,
              action: { type: 'navigate' as const, screen: `screen.${v.link}` },
            },
          ]
        : []
      : remove
        ? undefined
        : s.own.interactions;
  const variant = !fields.includes('variant')
    ? s.own.variant
    : v.variant !== undefined || v.disabled !== undefined
      ? clean({
          ...s.own.variant,
          ...(v.variant ? { Variante: VARIANT[v.variant] } : {}),
          ...(v.disabled !== undefined
            ? { État: v.disabled ? 'Désactivé' : 'Défaut' }
            : {}),
        })
      : remove
        ? undefined
        : s.own.variant;

  if (!s.holder) {
    const n = get(s.node.id);
    n.props = props;
    if (n.type === 'instance') {
      n.variant = variant && Object.keys(variant).length ? variant : undefined;
      n.interactions = interactions;
    }
    if (n.type === 'text' && (v.label !== undefined || !remove))
      n.characters = v.label ?? n.characters;
    if (n.type === 'component' && v.label !== undefined) {
      const t = n.componentProps?.Texte;
      if (t?.type === 'text')
        n.componentProps = {
          ...n.componentProps,
          Texte: { ...t, default: v.label },
        };
    }
    put(clean(n));
  } else {
    const h = get(s.holder.id);
    const overrides = { ...h.overrides };
    const o: Override = clean({
      ...s.own,
      props: clean(props),
      ...(s.node.type === 'instance' ? { variant, interactions } : {}),
      ...(s.node.type === 'text'
        ? { characters: v.label ?? (remove ? undefined : s.own.characters) }
        : {}),
    });
    if (Object.keys(o).length) overrides[s.path!] = o;
    else delete overrides[s.path!];
    h.overrides = Object.keys(overrides).length ? overrides : undefined;
    put(clean(h));
  }
  // Libellé d'une instance : override du calque texte lié.
  if (s.node.type === 'instance') {
    const label = labelOf(doc, s.component);
    if (label) {
      const holder = get((s.holder ?? s.node).id);
      const path = s.holder ? `${s.path}>${label.id}` : label.id;
      const overrides = { ...holder.overrides };
      const o = clean({
        ...overrides[path],
        characters:
          v.label ?? (remove ? undefined : overrides[path]?.characters),
      });
      if (Object.keys(o).length) overrides[path] = o;
      else delete overrides[path];
      holder.overrides = Object.keys(overrides).length ? overrides : undefined;
      put(clean(holder));
    }
  }
  return [...changed.values()];
}

// Calque correspondant dans un autre composant (même chemin de noms).
function counterpart(doc: Doc, component: DocNode, id: string) {
  const n = doc.nodes[id];
  if (!n) return null;
  if (componentOf(doc, id)?.id === component.id) return n;
  const names: string[] = [];
  for (
    let p: DocNode | undefined = n;
    p && p.type !== 'component';
    p = p.parent ? doc.nodes[p.parent] : undefined
  )
    names.unshift(p.name);
  let cur: DocNode | undefined = component;
  for (const name of names)
    cur = cur?.children.map((c) => doc.nodes[c]).find((c) => c?.name === name);
  return cur ?? null;
}

/**
 * « Appliquer au composant » : tous les overrides de l'instance passent sur
 * son composant (style, états, texte, interactions, calques internes). Seuls
 * restent propres à l'instance le choix de variante, la taille et la
 * position, qui dépendent de son emplacement.
 */
export function applyToComponent(doc: Doc, key: string): DocNode[] {
  const s = spot(doc, key);
  if (!s || s.node.type !== 'instance' || !s.component) return [];
  const changed = new Map<string, DocNode>();
  const get = (id: string) => changed.get(id) ?? structuredClone(doc.nodes[id]);
  const put = (n: DocNode) => changed.set(n.id, clean(n));
  const comp = get(s.component.id);
  const { size, position, ...style } = s.own.props ?? {};
  comp.props = mergeProps(comp.props, style);
  comp.states = mergeStates(comp.states, s.own.states);
  if (s.own.interactions) comp.interactions = s.own.interactions;
  put(comp);

  const holder = get((s.holder ?? s.node).id);
  const prefix = s.holder ? `${s.path}>` : '';
  const label = labelOf(doc, s.component);
  const rest: Record<string, Override> = {};
  for (const [path, o] of Object.entries(holder.overrides ?? {})) {
    if (!path.startsWith(prefix) || (s.holder && path === s.path)) {
      rest[path] = o;
      continue;
    }
    const inner = path.slice(prefix.length);
    const [first, ...tail] = inner.split('>');
    const target = counterpart(doc, s.component, first);
    if (!target) {
      rest[path] = o;
      continue;
    }
    const t = get(target.id);
    if (tail.length) {
      t.overrides = { ...t.overrides, [tail.join('>')]: o };
    } else {
      t.props = mergeProps(t.props, o.props);
      t.states = mergeStates(t.states, o.states);
      if (o.interactions) t.interactions = o.interactions;
      if (o.characters !== undefined) {
        // Libellé lié à « Texte » : la valeur par défaut du composant change,
        // et l'instance la garde comme valeur de propriété.
        if (label && target.id === label.id) {
          const c = get(s.component.id);
          const p = c.componentProps?.Texte;
          if (p?.type === 'text') {
            c.componentProps = {
              ...c.componentProps,
              Texte: { ...p, default: o.characters },
            };
            put(c);
          }
          if (!s.holder) {
            const h = changed.get(holder.id) ?? holder;
            h.propValues = { ...h.propValues, Texte: o.characters };
          }
        } else t.characters = o.characters;
      }
    }
    put(t);
  }
  const h = changed.get(holder.id) ?? holder;
  h.overrides = Object.keys(rest).length ? rest : undefined;
  if (s.holder) {
    const own =
      s.own.variant || size || position
        ? clean({ variant: s.own.variant, props: clean({ size, position }) })
        : null;
    if (own && Object.keys(own).length)
      h.overrides = { ...h.overrides, [s.path!]: own };
  } else {
    h.props = clean({ size, position });
    h.states = undefined;
    h.interactions = undefined;
  }
  put(h);
  return [...changed.values()];
}

// Texte rendu sous une clé (pour ignorer un override identique au défaut).
export function renderedText(doc: Doc, key: string): string | null {
  const head = key.split('>')[0];
  let root: string | null = head;
  for (let p: string | null = head; p; p = doc.nodes[p]?.parent ?? null)
    root = p;
  const tree = root ? renderTree(doc, root) : null;
  let found: RNode | null = null;
  if (tree) walk(tree, (r) => void (r.key === key && (found = r)));
  if (!found) return null;
  const parts: string[] = [];
  walk(found, (r) => void (r.characters && parts.push(r.characters)));
  return parts.join('');
}
