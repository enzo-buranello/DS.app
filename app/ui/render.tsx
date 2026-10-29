import type { CSSProperties } from 'react';
import type {
  Breakpoint,
  Foundations,
  Node,
  Project,
  Style,
} from '../shared/project.js';

// Rendu des nœuds du projet : chaque style devient une variable CSS de
// fondation (--c-, --s-, --r-, --sh-, --f-). Aucune valeur en dur.

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
const v = (prefix: string, id?: string) => id && `var(--${prefix}-${id})`;

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

export function css(node: Node, s: Style): CSSProperties {
  const box = node.kind === 'box' || node.kind === 'list';
  return {
    ...(box && {
      display: 'flex',
      flexDirection: s.direction ?? 'column',
      gap: v('s', s.gap),
      alignItems:
        s.align && (s.align === 'stretch' ? 'stretch' : flex[s.align]),
      justifyContent:
        s.justify &&
        (s.justify === 'between' ? 'space-between' : flex[s.justify]),
    }),
    ...(s.hidden && { display: 'none' }),
    width:
      s.width === 'fill'
        ? '100%'
        : s.width === 'hug'
          ? 'fit-content'
          : undefined,
    maxWidth:
      v('s', s.maxWidth) ?? (node.kind === 'image' ? '100%' : undefined),
    padding: v('s', s.padding),
    background: v('c', s.background),
    color: v('c', s.color),
    border: s.border && `1px solid var(--c-${s.border})`,
    borderRadius: v('r', s.radius),
    boxShadow: v('sh', s.shadow),
    font: v('f', s.font),
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
};

export function Render({ node, ctx }: { node: Node; ctx: Ctx }) {
  const depth = ctx.depth ?? 0;
  if (depth > 12) return null;
  const style = css(node, resolve(node, ctx.bp, ctx.patches?.[node.id]));
  const data = { 'data-node': node.id };
  if (node.kind === 'text')
    return (
      <p style={style} {...data}>
        {node.text}
      </p>
    );
  if (node.kind === 'image')
    return node.src ? (
      <img style={style} src={node.src} alt="" {...data} />
    ) : (
      <div style={style} {...data} />
    );
  if (node.kind === 'component') {
    const c = node.component && ctx.project.components[node.component];
    return c ? (
      <div style={style} {...data}>
        <Render
          node={c.root}
          ctx={{ ...ctx, patches: undefined, depth: depth + 1 }}
        />
      </div>
    ) : null;
  }
  return (
    <div style={style} {...data}>
      {node.children?.map((c) => (
        <Render key={c.id} node={c} ctx={{ ...ctx, depth: depth + 1 }} />
      ))}
    </div>
  );
}
