import { colorCss, lengthCss } from './component.js';
import type {
  Color,
  DocNode,
  Effect,
  Length,
  Paint,
  Props,
  StateName,
  States,
} from './doc.js';

// Seule traduction nœud → CSS, partagée par le catalogue, l'aperçu, l'export
// et les tests. Les tokens restent des var(--token). Le rendu passe par une
// feuille de style (règles par nœud), jamais par du style inline : les états
// (:hover, :active…) restent donc applicables quelle que soit la base.
export type Css = Record<string, string>;

const px = (v: number) => `${Math.round(v * 100) / 100}px`;
const len = (v: Length) => lengthCss(v);
const color = (c: Color) => colorCss(c);
const withAlpha = (c: Color, alpha: number) =>
  alpha >= 1 ? color(c) : color({ ...c, opacity: c.opacity * alpha });

// Fond : un seul aplat → background-color (lu tel quel par l'export) ; sinon
// couches empilées, la première en haut comme dans le panneau de Figma.
export function fillsCss(fills: Paint[]): Css {
  const shown = fills.filter((f) => f.visible !== false);
  if (!shown.length) return { background: 'none' };
  if (shown.length === 1 && shown[0].type === 'solid')
    return { 'background-color': color(shown[0].color) };
  const layers = shown.map((f) => {
    if (f.type === 'solid') {
      const c = color(f.color);
      return `linear-gradient(${c}, ${c})`;
    }
    if (f.type === 'image') {
      const url = `url("/api/assets/${f.asset}")`;
      return f.fit === 'tile'
        ? `${url} repeat`
        : `${url} center / ${f.fit === 'fit' ? 'contain' : 'cover'} no-repeat`;
    }
    const stops = f.stops
      .map(
        (s) =>
          `${withAlpha(s.color, f.opacity)} ${Math.round(s.position * 100)}%`,
      )
      .join(', ');
    return f.type === 'linear'
      ? `linear-gradient(${f.angle}deg, ${stops})`
      : `radial-gradient(circle, ${stops})`;
  });
  return { background: layers.join(', ') };
}

function effectsCss(effects: Effect[], text: boolean, inset: string[]): Css {
  const shadows: string[] = [...inset];
  const filters: string[] = [];
  const css: Css = {};
  for (const e of effects) {
    if (e.visible === false) continue;
    if (!('x' in e)) {
      if (e.type === 'layer-blur') filters.push(`blur(${px(e.radius)})`);
      else css['backdrop-filter'] = `blur(${px(e.radius)})`;
    } else if (text && e.type === 'drop-shadow')
      css['text-shadow'] =
        `${px(e.x)} ${px(e.y)} ${px(e.blur)} ${color(e.color)}`;
    else
      shadows.push(
        `${e.type === 'inner-shadow' ? 'inset ' : ''}${px(e.x)} ${px(e.y)} ${px(e.blur)} ${px(e.spread)} ${color(e.color)}`,
      );
  }
  if (shadows.length) css['box-shadow'] = shadows.join(', ');
  else if (effects.length) css['box-shadow'] = 'none';
  if (filters.length) css.filter = filters.join(' ');
  return css;
}

// Contour : intérieur = border (box-sizing border-box : le trait reste dans la
// boîte, comme dans Figma) ; extérieur = outline ; centre = outline décalé.
// Par côté + extérieur/centre : impossible en CSS, rendu uniforme au maximum.
function strokeCss(stroke: NonNullable<Props['stroke']>): Css {
  if (stroke.visible === false) return { border: '0' };
  const c = color(stroke.color);
  const w = stroke.weight;
  if (stroke.align === 'inside') {
    if (typeof w === 'number')
      return { border: `${px(w)} ${stroke.style} ${c}` };
    return {
      'border-style': stroke.style,
      'border-color': c,
      'border-width': [w.top, w.right, w.bottom, w.left].map(px).join(' '),
    };
  }
  const uniform =
    typeof w === 'number' ? w : Math.max(w.top, w.right, w.bottom, w.left);
  return {
    border: '0',
    outline: `${px(uniform)} ${stroke.style} ${c}`,
    'outline-offset': stroke.align === 'center' ? px(-uniform / 2) : '0px',
  };
}

const flexAlign = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
  auto: 'auto',
} as const;

function textCss(t: NonNullable<Props['text']>, isText: boolean): Css {
  const css: Css = {};
  if (t.family)
    css['font-family'] =
      'token' in t.family ? 'var(--font-family)' : t.family.value;
  if (t.weight) css['font-weight'] = String(t.weight);
  if (t.size) css['font-size'] = len(t.size);
  if (t.color) css.color = color(t.color);
  if (t.lineHeight)
    css['line-height'] =
      'ratio' in t.lineHeight
        ? String(t.lineHeight.ratio)
        : px(t.lineHeight.px);
  if (t.letterSpacing !== undefined)
    css['letter-spacing'] = px(t.letterSpacing);
  if (t.align) css['text-align'] = t.align;
  if (t.case)
    css['text-transform'] = {
      none: 'none',
      upper: 'uppercase',
      lower: 'lowercase',
      title: 'capitalize',
    }[t.case];
  if (t.decoration)
    css['text-decoration'] = {
      none: 'none',
      underline: 'underline',
      strike: 'line-through',
    }[t.decoration];
  if (!isText) return css;
  if (t.resize === 'auto-width') {
    css['white-space'] = 'nowrap';
    css.width = 'max-content';
  }
  if (t.maxLines) {
    css.display = '-webkit-box';
    css['-webkit-box-orient'] = 'vertical';
    css['-webkit-line-clamp'] = String(t.maxLines);
    css.overflow = 'hidden';
  } else if (t.truncate) {
    css['white-space'] = 'nowrap';
    css.overflow = 'hidden';
    css['text-overflow'] = 'ellipsis';
  } else if (t.valign && t.valign !== 'top') {
    css.display = 'flex';
    css['flex-direction'] = 'column';
    css['justify-content'] = t.valign === 'center' ? 'center' : 'flex-end';
  }
  return css;
}

// Dimensions selon le parent : Fill = flex: 1 sur l'axe principal, stretch
// sur l'axe secondaire, 100 % hors auto-layout ; Hug = fit-content.
function sizeCss(props: Props, parent: Props | null): Css {
  const css: Css = {};
  const s = props.size ?? {};
  const dir = parent?.layout?.mode;
  const inFlex = dir === 'horizontal' || dir === 'vertical';
  const absolute = props.position?.mode === 'absolute';
  const axis = (which: 'width' | 'height', v: NonNullable<typeof s.width>) => {
    const main = inFlex && (dir === 'horizontal') === (which === 'width');
    if (v.mode === 'fixed') {
      css[which] = px(v.px);
      if (main) css['flex-shrink'] = '0';
    } else if (v.mode === 'hug') {
      css[which] = 'fit-content';
      if (main) css.flex = 'none';
    } else if (absolute || !inFlex) css[which] = '100%';
    else if (main) {
      css.flex = '1 1 0';
      css[`min-${which}`] = '0';
    } else css['align-self'] = 'stretch';
  };
  if (s.width) axis('width', s.width);
  if (s.height) axis('height', s.height);
  if (s.minWidth != null) css['min-width'] = px(s.minWidth);
  if (s.maxWidth != null) css['max-width'] = px(s.maxWidth);
  if (s.minHeight != null) css['min-height'] = px(s.minHeight);
  if (s.maxHeight != null) css['max-height'] = px(s.maxHeight);
  return css;
}

function positionCss(p: NonNullable<Props['position']>): Css {
  const css: Css = {};
  const transforms: string[] = [];
  if (p.mode === 'absolute') {
    css.position = 'absolute';
    const x = p.x ?? 0;
    const y = p.y ?? 0;
    const cx = p.constraintX ?? 'left';
    const cy = p.constraintY ?? 'top';
    if (cx === 'left' || cx === 'stretch') css.left = px(x);
    if (cx === 'right') css.right = px(x);
    if (cx === 'stretch') css.right = px(p.xEnd ?? 0);
    if (cx === 'center') {
      css.left = `calc(50% + ${px(x)})`;
      transforms.push('translateX(-50%)');
    }
    if (cy === 'top' || cy === 'stretch') css.top = px(y);
    if (cy === 'bottom') css.bottom = px(y);
    if (cy === 'stretch') css.bottom = px(p.yEnd ?? 0);
    if (cy === 'center') {
      css.top = `calc(50% + ${px(y)})`;
      transforms.push('translateY(-50%)');
    }
  }
  // Écart connu : en CSS la rotation ne change pas l'encombrement dans l'auto-layout.
  if (p.rotation) transforms.push(`rotate(${p.rotation}deg)`);
  if (transforms.length) css.transform = transforms.join(' ');
  if (p.alignSelf && p.alignSelf !== 'auto')
    css['align-self'] = flexAlign[p.alignSelf];
  return css;
}

export interface CssContext {
  type: DocNode['type'];
  /** Propriétés du parent rendu (auto-layout, pour le sizing). */
  parent: Props | null;
  /** Règle de base (et non d'état) : valeurs par défaut du type incluses. */
  base?: boolean;
}
/** Propriétés d'un nœud → déclarations CSS (kebab-case). */
export function nodeCss(props: Props, ctx: CssContext): Css {
  const isText = ctx.type === 'text';
  const css: Css = {};
  const l = props.layout;
  if (l?.mode === 'horizontal' || l?.mode === 'vertical') {
    css.display = 'flex';
    css['flex-direction'] = l.mode === 'horizontal' ? 'row' : 'column';
    if (l.wrap) css['flex-wrap'] = 'wrap';
  } else if (l?.mode === 'none') css.display = 'block';
  if (l) {
    if (l.gap === 'auto') css['justify-content'] = 'space-between';
    else if (l.gap) css[l.wrap && l.rowGap ? 'column-gap' : 'gap'] = len(l.gap);
    if (l.wrap && l.rowGap) css['row-gap'] = len(l.rowGap);
    if (l.padding)
      css.padding = [
        l.padding.top,
        l.padding.right,
        l.padding.bottom,
        l.padding.left,
      ]
        .map(len)
        .join(' ');
    if (l.alignMain && l.gap !== 'auto')
      css['justify-content'] = flexAlign[l.alignMain];
    if (l.alignCross) css['align-items'] = flexAlign[l.alignCross];
  }
  Object.assign(css, sizeCss(props, ctx.parent));
  if (props.position) Object.assign(css, positionCss(props.position));
  const r = props.radius;
  if (r && (r.topLeft || r.topRight || r.bottomRight || r.bottomLeft)) {
    const zero = { px: 0 } as const;
    css['border-radius'] = [r.topLeft, r.topRight, r.bottomRight, r.bottomLeft]
      .map((v) => len(v ?? zero))
      .join(' ');
  }
  if (props.fills && ctx.type === 'field' && !isText) {
    const solid = props.fills.find((f) => f.type === 'solid');
    if (solid?.type === 'solid') css['accent-color'] = color(solid.color);
  }
  if (props.fills) Object.assign(css, fillsCss(props.fills));
  // Contour intérieur plein et uniforme : bordure. Sinon voir strokeCss.
  if (props.stroke !== undefined)
    Object.assign(
      css,
      props.stroke ? strokeCss(props.stroke) : { border: '0' },
    );
  if (props.effects) Object.assign(css, effectsCss(props.effects, isText, []));
  if (props.text) Object.assign(css, textCss(props.text, isText));
  // Texte : bloc, retours à la ligne et espaces conservés (comme Figma).
  if (isText && ctx.base) {
    css.display ??= 'block';
    css['white-space'] ??= 'pre-wrap';
  }
  const layer = props.layer;
  if (layer) {
    if (layer.visible === false) css.display = 'none';
    if (layer.opacity !== undefined) css.opacity = String(layer.opacity);
    if (layer.blend && layer.blend !== 'normal')
      css['mix-blend-mode'] = layer.blend;
    if (layer.clip !== undefined)
      css.overflow = layer.clip ? 'hidden' : 'visible';
    if (layer.cursor) css.cursor = layer.cursor;
  }
  return css;
}

// Sélecteurs des états interactifs (mode Test). « disabled » vise aussi
// aria-disabled, « invalid » la validation native après saisie.
export const stateSelector: Record<StateName, string> = {
  hover: ':hover:not(:disabled)',
  pressed: ':active:not(:disabled)',
  focus: ':focus-visible',
  disabled: ':disabled',
  invalid: ':user-invalid',
};
const declarations = (css: Css) =>
  Object.entries(css)
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
const escape = (key: string) => key.replace(/["\\]/g, '\\$&');
/** Règles d'un nœud rendu (base puis états), pour la feuille partagée. */
export function nodeRules(
  key: string,
  props: Props,
  states: States | undefined,
  ctx: CssContext,
): string {
  const sel = `.ds [data-ds-node="${escape(key)}"]`;
  const rules = [
    `${sel}{${declarations(nodeCss(props, { ...ctx, base: true }))}}`,
  ];
  for (const [state, patch] of Object.entries(states ?? {})) {
    if (!patch) continue;
    const css = nodeCss(patch, { ...ctx, parent: null });
    // Le sizing dépend du parent : un état ne le redéfinit pas.
    if (Object.keys(css).length)
      // État forcé depuis l'inspecteur (data-ds-preview) : montré au repos.
      rules.push(
        `${sel}${stateSelector[state as StateName]},${sel}[data-ds-preview="${state}"]{${declarations(css)}}`,
      );
  }
  return rules.join('\n');
}
// Remise à zéro commune : pas de marges ni de styles natifs (comme Figma).
export const BASE_RULES = [
  '.ds :where([data-ds-node]){margin:0;box-sizing:border-box;min-width:0}',
  '.ds :where(button[data-ds-node],input[data-ds-node]){font:inherit;color:inherit;background:none;border:0;padding:0;text-align:inherit}',
  '.ds :where([data-ds-node]){position:relative}',
].join('\n');
