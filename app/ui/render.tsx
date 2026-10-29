import type { CSSProperties } from 'react';
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
};

/** Image du projet (« assets/… ») ou adresse web. */
export const assetUrl = (src: string, base?: string) =>
  /^https?:|^data:/.test(src) || !base
    ? src
    : `studio://asset/${encodeURIComponent(base)}/${src}`;

export function Render({ node, ctx }: { node: Node; ctx: Ctx }) {
  const depth = ctx.depth ?? 0;
  if (depth > 12) return null;
  const s = resolve(node, ctx.bp, ctx.patches?.[node.id]);
  const style = css(node, s, ctx.inFree);
  const data = ctx.inert ? {} : { 'data-node': node.id };
  const child = { ...ctx, depth: depth + 1, inFree: false };
  if (node.kind === 'text')
    return (
      <p style={style} {...data}>
        {node.text}
      </p>
    );
  if (node.kind === 'shape') return <div style={style} {...data} />;
  if (node.kind === 'image')
    return node.src ? (
      <img style={style} src={assetUrl(node.src, ctx.base)} alt="" {...data} />
    ) : (
      <div className="placeholder" style={style} {...data} />
    );
  if (node.kind === 'component') {
    const c = node.component && ctx.project.components[node.component];
    return c ? (
      <div style={style} {...data}>
        <Render
          node={c.root}
          ctx={{ ...child, patches: undefined, inert: true }}
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
  return (
    <div style={style} {...data}>
      {node.children?.map((c) => (
        <Render key={c.id} node={c} ctx={{ ...child, inFree: free }} />
      ))}
    </div>
  );
}
