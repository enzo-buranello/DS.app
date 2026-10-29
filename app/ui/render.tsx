import { useState, type CSSProperties } from 'react';
import { applyOverride, SEP } from '../shared/instances.js';
import { display, type Value } from '../shared/content.js';
import type {
  Breakpoint,
  Foundations,
  Node,
  Project,
  Style,
} from '../shared/project.js';

// Rendu des nœuds du projet. Un token devient une variable CSS de fondation
// (--c-, --s-, --r-, --sh-, --f-) ; une valeur libre est écrite telle quelle.

export type Theme = 'light' | 'dark';

/** Feuille Google Fonts des familles du projet (hors polices du système). */
export function fontsHref(f: Foundations) {
  const families = [
    ...new Set(Object.values(f.fonts).map((t) => t.family.trim())),
  ].filter(
    (n) => n && !/^(system-ui|sans-serif|serif|monospace|Geist)/i.test(n),
  );
  if (!families.length) return null;
  const q = families
    .map((n) => `${n.replace(/ /g, '+')}:300,400,500,600,700,400i`)
    .join('|');
  return `https://fonts.googleapis.com/css?family=${encodeURIComponent(q).replace(/%2B/g, '+')}&display=swap`;
}

export function foundationVars(f: Foundations, theme: Theme) {
  const vars: Record<string, string> = {};
  for (const [id, c] of Object.entries(f.colors)) vars[`--c-${id}`] = c[theme];
  for (const [id, s] of Object.entries(f.spacing))
    vars[`--s-${id}`] = `${s.value}px`;
  for (const [id, r] of Object.entries(f.radius))
    vars[`--r-${id}`] = `${r.value}px`;
  for (const [id, s] of Object.entries(f.shadows))
    vars[`--sh-${id}`] = `${s.x}px ${s.y}px ${s.blur}px var(--c-${s.color})`;
  for (const [id, t] of Object.entries(f.fonts))
    vars[`--f-${id}`] =
      `${t.weight} ${t.size}px/${t.lineHeight} "${t.family}", system-ui, sans-serif`;
  return vars as CSSProperties;
}

const flex = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
} as const;
const len = (prefix: string, v?: string | number) =>
  v === undefined
    ? undefined
    : typeof v === 'number'
      ? `${v}px`
      : `var(--${prefix}-${v})`;
export const paint = (v?: string) =>
  v === undefined ? undefined : v.startsWith('#') ? v : `var(--c-${v})`;
const size = (v?: 'hug' | 'fill' | number) =>
  v === 'fill'
    ? '100%'
    : v === 'hug'
      ? 'fit-content'
      : v === undefined
        ? undefined
        : `${v}px`;

/** Style effectif : bureau, puis tablette, puis mobile. */
export function resolve(node: Node, bp: Breakpoint, patch?: Style): Style {
  const s = node.style ?? {};
  const order: Breakpoint[] =
    bp === 'mobile'
      ? ['desktop', 'tablet', 'mobile']
      : bp === 'tablet'
        ? ['desktop', 'tablet']
        : ['desktop'];
  return Object.assign({}, ...order.map((b) => s[b]), patch);
}

export function css(node: Node, s: Style, inFree = false): CSSProperties {
  const box = node.kind === 'box' || node.kind === 'list';
  const free = box && s.direction === 'free';
  return {
    ...(box &&
      (free
        ? { position: 'relative' }
        : s.direction === 'grid'
          ? {
              display: 'grid',
              gridTemplateColumns: `repeat(${s.columns ?? 2}, minmax(0, 1fr))`,
              gap: len('s', s.gap),
              alignItems:
                s.align && (s.align === 'stretch' ? 'stretch' : flex[s.align]),
            }
          : {
              display: 'flex',
              flexDirection: s.direction === 'row' ? 'row' : 'column',
              gap: len('s', s.gap),
              alignItems:
                s.align && (s.align === 'stretch' ? 'stretch' : flex[s.align]),
              justifyContent:
                s.justify &&
                (s.justify === 'between' ? 'space-between' : flex[s.justify]),
            })),
    ...(inFree && { position: 'absolute', left: s.x ?? 0, top: s.y ?? 0 }),
    alignSelf:
      !inFree && s.alignSelf
        ? s.alignSelf === 'stretch'
          ? 'stretch'
          : flex[s.alignSelf]
        : undefined,
    ...(s.hidden && { display: 'none' }),
    width: size(s.width),
    height: size(s.height),
    maxWidth:
      len('s', s.maxWidth) ?? (node.kind === 'image' ? '100%' : undefined),
    padding: len('s', s.padding),
    background: paint(s.background),
    color: paint(s.color),
    border:
      s.border !== undefined
        ? `${s.borderWidth ?? 1}px solid ${paint(s.border)}`
        : undefined,
    borderRadius: len('r', s.radius),
    boxShadow: s.shadow && `var(--sh-${s.shadow})`,
    opacity: s.opacity,
    font: s.font && `var(--f-${s.font})`,
    fontSize: s.fontSize,
    fontWeight: s.fontWeight,
    textAlign: s.textAlign,
    objectFit: node.kind === 'image' ? 'cover' : undefined,
    margin: 0,
    boxSizing: 'border-box',
  };
}

type Ctx = {
  project: Project;
  bp: Breakpoint;
  /** Patchs d'état par identifiant de nœud. */
  patches?: Record<string, Style>;
  depth?: number;
  /** Dossier du projet : les images locales s'y trouvent. */
  base?: string;
  /** Contenu d'une instance : pas sélectionnable séparément. */
  inert?: boolean;
  /** Le parent place ses enfants librement. */
  inFree?: boolean;
  /** Contenu d'une instance : ajustements locaux et identifiants « instance/élément ». */
  instance?: { id: string; overrides?: Node['overrides']; root: string };
  /** Élément de collection affiché par la liste englobante. */
  item?: { collection: string; values: Record<string, Value> };
  /** Mode test : rien n'est sélectionnable, les liens mènent aux pages. */
  play?: (href: string) => void;
};

/** Valeur liée : élément de la liste englobante, sinon premier élément. */
function boundValue(node: Node, ctx: Ctx) {
  const b = node.bind;
  if (!b?.field) return null;
  const c = ctx.project.collections[b.collection];
  const f = c?.fields.find((x) => x.id === b.field);
  if (!c || !f) return null;
  const values =
    ctx.item?.collection === b.collection
      ? ctx.item.values
      : c.items[0]?.values;
  const v = values?.[f.id];
  return {
    field: f,
    value: v,
    text: v === undefined ? f.name : display(v, f.type),
  };
}

/** Image du projet (« assets/… ») ou adresse web. */
export const assetUrl = (src: string, base?: string) =>
  /^https?:|^data:/.test(src) || !base
    ? src
    : `studio://asset/${encodeURIComponent(base)}/${src}`;

export function Render({ node: raw, ctx }: { node: Node; ctx: Ctx }) {
  const depth = ctx.depth ?? 0;
  if (depth > 12) return null;
  const inst = ctx.instance;
  const node = inst ? applyOverride(raw, inst.overrides?.[raw.id]) : raw;
  const s = resolve(node, ctx.bp, ctx.patches?.[node.id]);
  const style = css(node, s, ctx.inFree);
  // La racine d'un composant se confond avec son instance.
  const data =
    ctx.inert || ctx.play || (inst && node.id === inst.root)
      ? {}
      : { 'data-node': inst ? `${inst.id}${SEP}${node.id}` : node.id };
  const go = ctx.play;
  if (go && node.href) {
    style.cursor = 'pointer';
    Object.assign(data, {
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        go(node.href!);
      },
    });
  }
  const child = { ...ctx, depth: depth + 1, inFree: false };
  const bound = boundValue(node, ctx);
  if (node.kind === 'text')
    return (
      <p style={style} {...data}>
        {bound ? bound.text : node.text}
      </p>
    );
  if (node.kind === 'shape') return <div style={style} {...data} />;
  const src =
    bound?.field.type === 'image' && typeof bound.value === 'string'
      ? bound.value
      : node.src;
  if (node.kind === 'image')
    return src ? (
      <img style={style} src={assetUrl(src, ctx.base)} alt="" {...data} />
    ) : (
      <div className="placeholder" style={style} {...data} />
    );
  if (node.kind === 'component') {
    const c = node.component && ctx.project.components[node.component];
    if (c && go)
      return <Live node={node} ctx={ctx} style={style} data={data} />;
    return c ? (
      <div style={style} {...data}>
        <Render
          node={c.root}
          ctx={{
            ...child,
            patches: undefined,
            inert: ctx.inert || !!inst,
            instance: {
              id: node.id,
              overrides: node.overrides,
              root: c.root.id,
            },
          }}
        />
      </div>
    ) : null;
  }
  // Conteneur libre sans hauteur fixe : il englobe ses enfants placés.
  const free = s.direction === 'free';
  if (free && typeof s.height !== 'number')
    style.minHeight = Math.max(
      0,
      ...(node.children ?? []).map((c) => {
        const cs = resolve(c, ctx.bp);
        return (cs.y ?? 0) + (typeof cs.height === 'number' ? cs.height : 40);
      }),
    );
  // Liste : son contenu se répète pour chaque élément de la collection (une
  // fois, avec les noms des champs, si elle est vide).
  if (node.kind === 'list' && node.bind) {
    const c = node.bind && ctx.project.collections[node.bind.collection];
    const items = c && c.items.length ? c.items : [{ id: 'vide', values: {} }];
    return (
      <div style={style} {...data}>
        {items.map((it) =>
          node.children?.map((ch) => (
            <Render
              key={`${it.id}-${ch.id}`}
              node={ch}
              ctx={{
                ...child,
                inFree: free,
                item: { collection: node.bind!.collection, values: it.values },
              }}
            />
          )),
        )}
      </div>
    );
  }
  return (
    <div style={style} {...data}>
      {node.children?.map((c) => (
        <Render key={c.id} node={c} ctx={{ ...child, inFree: free }} />
      ))}
    </div>
  );
}

// Instance en mode test : survol et appui appliquent les états du composant.
function Live(props: {
  node: Node;
  ctx: Ctx;
  style: CSSProperties;
  data: object;
}) {
  const { node, ctx } = props;
  const c = ctx.project.components[node.component!];
  const [state, setState] = useState<'hover' | 'active' | null>(null);
  return (
    <div
      style={props.style}
      {...props.data}
      onMouseEnter={() => setState('hover')}
      onMouseLeave={() => setState(null)}
      onMouseDown={() => setState('active')}
      onMouseUp={() => setState('hover')}
    >
      <Render
        node={c.root}
        ctx={{
          ...ctx,
          depth: (ctx.depth ?? 0) + 1,
          inFree: false,
          patches: state ? c.states[state] : undefined,
          instance: { id: node.id, overrides: node.overrides, root: c.root.id },
        }}
      />
    </div>
  );
}
