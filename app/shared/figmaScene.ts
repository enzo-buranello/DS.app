import {
  mergeProps,
  stateNames,
  type Color,
  type Doc,
  type DocNode,
  type Length,
  type Props,
  type StateName,
} from './doc.js';
import {
  EXPORT_VERSION,
  type Effect,
  type ExportPayload,
  type Fill,
  type LineHeight,
  type PageTarget,
  type Paint,
  type SceneNode,
} from './figmaExport.js';
import { tokenKeys, type TokenKey, type Tokens } from './model.js';
import { renderTree, walk, type RNode } from './render.js';
import type { Vector, VectorNode } from './vector.js';

// Document de nœuds → scène Figma (export v2). Chaque propriété est traduite
// vers sa propriété native ; un token devient la variable Figma du même nom.
// Seules les positions et tailles rendues viennent du navigateur (mesures).

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** Mesures du rendu réel, par clé rendue (data-ds-node). */
export interface Measures {
  box(key: string): Box | null;
  /** Interlignage calculé (px) quand le document n'en fixe pas. */
  lineHeight?(key: string): number | null;
}

/** Libellés Figma des états, exportés en variantes « Interaction=… ». */
export const STATE_VARIANT = 'Interaction';
const STATE_LABEL: Record<StateName | 'base', string> = {
  base: 'Défaut',
  hover: 'Survol',
  pressed: 'Appuyé',
  focus: 'Focus',
  disabled: 'Désactivé',
  invalid: 'Invalide',
};
const BLEND: Record<string, NonNullable<SceneNode['blendMode']>> = {
  normal: 'NORMAL',
  multiply: 'MULTIPLY',
  screen: 'SCREEN',
  overlay: 'OVERLAY',
  darken: 'DARKEN',
  lighten: 'LIGHTEN',
  'color-dodge': 'COLOR_DODGE',
  'color-burn': 'COLOR_BURN',
  'hard-light': 'HARD_LIGHT',
  'soft-light': 'SOFT_LIGHT',
  difference: 'DIFFERENCE',
  exclusion: 'EXCLUSION',
  hue: 'HUE',
  saturation: 'SATURATION',
  color: 'COLOR',
  luminosity: 'LUMINOSITY',
};
const ALIGN = { start: 'MIN', center: 'CENTER', end: 'MAX' } as const;
const CONSTRAINT = {
  left: 'MIN',
  top: 'MIN',
  right: 'MAX',
  bottom: 'MAX',
  center: 'CENTER',
  stretch: 'STRETCH',
} as const;
const round = (v: number) => Math.round(v * 100) / 100;
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

export function variantName(v: Record<string, string> | undefined) {
  return v && Object.keys(v).length
    ? Object.entries(v)
        .map(([k, x]) => `${k}=${x}`)
        .join(', ')
    : null;
}
const attr = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
function svgOf(v: Vector): string {
  const el = (n: VectorNode): string =>
    `<${n.tag}${Object.entries(n.attrs)
      .map(([k, x]) => ` ${k}="${attr(String(x))}"`)
      .join('')}>${n.children.map(el).join('')}</${n.tag}>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${attr(v.viewBox)}" width="${v.width}" height="${v.height}">${v.nodes.map(el).join('')}</svg>`;
}

export class SceneBuilder {
  readonly textStyles = new Map<string, ExportPayload['textStyles'][number]>();
  readonly effectStyles = new Map<
    string,
    ExportPayload['effectStyles'][number]
  >();
  /** Images de fond rencontrées (à joindre à l'export). */
  readonly assets = new Set<string>();
  constructor(
    private doc: Doc,
    private tokens: Tokens,
  ) {}

  // --- Valeurs ---
  color(c: Color): Paint {
    if ('token' in c)
      return {
        hex: String(this.tokens[c.token].$value).toUpperCase(),
        opacity: c.opacity ?? 1,
        variable: c.token,
      };
    return { hex: c.hex.toUpperCase(), opacity: c.opacity ?? 1 };
  }
  len(v: Length | { px: number } | undefined): {
    value: number;
    variable: TokenKey | null;
  } {
    if (!v) return { value: 0, variable: null };
    if ('token' in v)
      return { value: Number(this.tokens[v.token].$value), variable: v.token };
    return { value: v.px, variable: null };
  }
  private fills(fills: Props['fills']): Fill[] {
    return (fills ?? []).map((f): Fill => {
      const visible = f.visible !== false;
      if (f.type === 'solid')
        return { type: 'SOLID', ...this.color(f.color), visible };
      if (f.type === 'image') {
        this.assets.add(f.asset);
        return {
          type: 'IMAGE',
          asset: f.asset,
          scaleMode:
            f.fit === 'fit' ? 'FIT' : f.fit === 'tile' ? 'TILE' : 'FILL',
          opacity: f.opacity ?? 1,
          visible,
        };
      }
      const stops = f.stops.map((s) => ({
        ...this.color(s.color),
        position: s.position,
      }));
      return f.type === 'linear'
        ? {
            type: 'GRADIENT_LINEAR',
            angle: f.angle,
            stops,
            opacity: f.opacity ?? 1,
            visible,
          }
        : {
            type: 'GRADIENT_RADIAL',
            stops,
            opacity: f.opacity ?? 1,
            visible,
          };
    });
  }
  private effects(effects: Props['effects']): Effect[] {
    return (effects ?? []).map((e): Effect => {
      const visible = e.visible !== false;
      if (e.type === 'drop-shadow' || e.type === 'inner-shadow')
        return {
          type: e.type === 'drop-shadow' ? 'DROP_SHADOW' : 'INNER_SHADOW',
          x: e.x,
          y: e.y,
          blur: e.blur,
          spread: e.spread,
          color: this.color(e.color),
          visible,
        };
      return {
        type: e.type === 'layer-blur' ? 'LAYER_BLUR' : 'BACKGROUND_BLUR',
        radius: 'radius' in e ? e.radius : 0,
        visible,
      };
    });
  }
  // Style d'effet partagé : une combinaison d'effets = un style Figma.
  private effectStyle(effects: Effect[]) {
    if (!effects.length) return undefined;
    const key = JSON.stringify(effects);
    if (!this.effectStyles.has(key)) {
      const n = this.effectStyles.size + 1;
      this.effectStyles.set(key, {
        id: `effect/${n}`,
        name: `DS-Studio/Effet ${n}`,
        effects,
      });
    }
    return this.effectStyles.get(key)!.id;
  }
  // Style de texte : un par combinaison police, taille, graisse, interlignage.
  private textStyle(t: NonNullable<SceneNode['text']>) {
    const key = [
      t.fontFamily,
      t.fontSize,
      t.fontWeight,
      JSON.stringify(t.lineHeight),
      t.letterSpacing,
    ].join('|');
    const existing = this.textStyles.get(key);
    if (existing) return existing.id;
    const base =
      t.fontSizeVariable === 'font.heading'
        ? 'Titre'
        : t.fontSizeVariable === 'font.body'
          ? 'Corps'
          : `Texte ${t.fontSize}`;
    const name = `DS-Studio/${base}${t.fontWeight === 400 ? '' : ` ${t.fontWeight}`}`;
    let id = `text/${base.toLowerCase().replace(/\s+/g, '-')}-${t.fontWeight}`;
    const lh = t.lineHeight.unit === 'AUTO' ? 'auto' : t.lineHeight.value;
    while ([...this.textStyles.values()].some((s) => s.id === id))
      id += `-${lh}`;
    this.textStyles.set(key, {
      id,
      name: [...this.textStyles.values()].some((s) => s.name === name)
        ? `${name} · ${lh}`
        : name,
      fontFamily: t.fontFamily,
      ...(t.fontFamilyVariable
        ? { fontFamilyVariable: t.fontFamilyVariable }
        : {}),
      fontWeight: t.fontWeight,
      fontSize: t.fontSize,
      ...(t.fontSizeVariable ? { fontSizeVariable: t.fontSizeVariable } : {}),
      lineHeight: t.lineHeight,
      letterSpacing: t.letterSpacing,
      sample: t.characters.slice(0, 60) || 'Aa',
    });
    return id;
  }
  private text(
    key: string,
    characters: string,
    t: NonNullable<Props['text']>,
    m: Measures,
  ): NonNullable<SceneNode['text']> {
    const family = t.family ?? { token: 'font.family' as const };
    const size = this.len(t.size ?? { token: 'font.body' });
    const measured = m.lineHeight?.(key);
    const lineHeight: LineHeight = t.lineHeight
      ? 'ratio' in t.lineHeight
        ? { unit: 'PERCENT', value: round(t.lineHeight.ratio * 100) }
        : { unit: 'PIXELS', value: t.lineHeight.px }
      : measured
        ? { unit: 'PIXELS', value: round(measured) }
        : { unit: 'AUTO' };
    const out: NonNullable<SceneNode['text']> = {
      characters,
      fontFamily:
        'token' in family
          ? String(this.tokens['font.family'].$value)
              .split(',')[0]
              .replace(/["']/g, '')
              .trim()
          : family.value,
      ...('token' in family ? { fontFamilyVariable: 'font.family' } : {}),
      fontWeight: t.weight ?? 400,
      fontSize: size.value,
      ...(size.variable ? { fontSizeVariable: size.variable } : {}),
      lineHeight,
      letterSpacing: t.letterSpacing ?? 0,
      align:
        t.align === 'justify'
          ? 'JUSTIFIED'
          : t.align === 'center'
            ? 'CENTER'
            : t.align === 'right'
              ? 'RIGHT'
              : 'LEFT',
      valign:
        t.valign === 'center'
          ? 'CENTER'
          : t.valign === 'bottom'
            ? 'BOTTOM'
            : 'TOP',
      textCase:
        t.case === 'upper'
          ? 'UPPER'
          : t.case === 'lower'
            ? 'LOWER'
            : t.case === 'title'
              ? 'TITLE'
              : 'ORIGINAL',
      decoration:
        t.decoration === 'underline'
          ? 'UNDERLINE'
          : t.decoration === 'strike'
            ? 'STRIKETHROUGH'
            : 'NONE',
      autoResize:
        t.truncate || t.maxLines
          ? 'TRUNCATE'
          : t.resize === 'auto-width'
            ? 'WIDTH_AND_HEIGHT'
            : t.resize === 'fixed'
              ? 'NONE'
              : 'HEIGHT',
      maxLines: t.maxLines ?? null,
      color: this.color(t.color ?? { token: 'color.text', opacity: 1 }),
    };
    out.style = this.textStyle(out);
    return out;
  }

  /**
   * Nœud rendu → nœud de scène. `ref` : le même calque dans le composant
   * (contenu d'instance), pour ne marquer comme override que ce qui diffère.
   */
  scene(
    r: RNode,
    m: Measures,
    o: {
      parent?: { box: Box; props: Props } | null;
      inherited?: Props['text'];
      state?: StateName;
      ref?: RNode | null;
      inInstance?: boolean;
    } = {},
  ): SceneNode {
    const props = o.state ? mergeProps(r.props, r.states?.[o.state]) : r.props;
    const box = m.box(r.key) ?? {
      x: o.parent?.box.x ?? 0,
      y: o.parent?.box.y ?? 0,
      w: props.size?.width?.mode === 'fixed' ? props.size.width.px : 1,
      h: props.size?.height?.mode === 'fixed' ? props.size.height.px : 1,
    };
    const parentLayout = o.parent?.props.layout?.mode;
    const inFlex = parentLayout === 'horizontal' || parentLayout === 'vertical';
    const layout = props.layout;
    const flex = layout?.mode === 'horizontal' || layout?.mode === 'vertical';
    const isText = r.type === 'text';
    const absolute = props.position?.mode === 'absolute';
    const sizing = (axis: 'width' | 'height'): SceneNode['sizingH'] => {
      const v = props.size?.[axis];
      if (v)
        return v.mode === 'fixed'
          ? 'FIXED'
          : v.mode === 'fill'
            ? 'FILL'
            : 'HUG';
      // Racine (composant) : elle épouse son contenu en auto layout.
      if (!o.parent) return flex || isText ? 'HUG' : 'FIXED';
      if (axis === 'width') {
        if (isText && props.text?.resize === 'auto-width') return 'HUG';
        if (inFlex && !absolute) {
          const stretch =
            !o.parent?.props.layout?.alignCross ||
            o.parent.props.layout.alignCross === 'stretch';
          if (parentLayout === 'vertical') return stretch ? 'FILL' : 'HUG';
          return 'HUG';
        }
        return 'FIXED';
      }
      return flex || isText ? 'HUG' : 'FIXED';
    };
    const node: SceneNode = {
      key: r.key,
      kind:
        r.type === 'text'
          ? 'TEXT'
          : r.type === 'rect' || r.type === 'image'
            ? 'RECTANGLE'
            : r.type === 'vector' && r.vector
              ? 'VECTOR'
              : 'FRAME',
      name: r.name,
      x: round(box.x - (o.parent?.box.x ?? box.x)),
      y: round(box.y - (o.parent?.box.y ?? box.y)),
      w: round(box.w),
      h: round(box.h),
      sizingH: sizing('width'),
      sizingV: sizing('height'),
      children: [],
    };
    const size = props.size;
    if (size?.minWidth) node.minW = size.minWidth;
    if (size?.maxWidth) node.maxW = size.maxWidth;
    if (size?.minHeight) node.minH = size.minHeight;
    if (size?.maxHeight) node.maxH = size.maxHeight;
    const l = props.layer;
    if (l?.visible === false) node.visible = false;
    if (l?.locked) node.locked = true;
    if (l?.opacity !== undefined && l.opacity !== 1) node.opacity = l.opacity;
    if (l?.blend && l.blend !== 'normal') node.blendMode = BLEND[l.blend];
    if (l?.clip) node.clip = true;
    const p = props.position;
    if (p?.rotation) node.rotation = -p.rotation;
    if (absolute && inFlex)
      node.absolute = {
        h: CONSTRAINT[p?.constraintX ?? 'left'],
        v: CONSTRAINT[p?.constraintY ?? 'top'],
      };
    // Un texte porte sa couleur en fond Figma ; ses fonds CSS sont ignorés.
    if (!isText && props.fills?.length) node.fills = this.fills(props.fills);
    const s = props.stroke;
    if (s && !isText) {
      const w = s.weight;
      node.strokes = [
        {
          paint: this.color(s.color),
          weight:
            typeof w === 'number' ? w : [w.top, w.right, w.bottom, w.left],
          align:
            s.align === 'center'
              ? 'CENTER'
              : s.align === 'outside'
                ? 'OUTSIDE'
                : 'INSIDE',
          dash:
            s.style === 'dashed' ? [4, 4] : s.style === 'dotted' ? [1, 2] : [],
          visible: s.visible !== false,
        },
      ];
    }
    const effects = this.effects(props.effects);
    if (effects.length) {
      node.effects = effects;
      node.effectStyle = this.effectStyle(effects);
    }
    const rad = props.radius;
    if (rad) {
      const corners = [
        rad.topLeft,
        rad.topRight,
        rad.bottomRight,
        rad.bottomLeft,
      ].map((c) => this.len(c));
      if (corners.some((c) => c.value)) {
        node.radius = corners.map((c) => c.value) as SceneNode['radius'];
        node.radiusVariables = corners.map((c) => c.variable);
      }
      if (rad.smoothing) node.cornerSmoothing = rad.smoothing;
    }
    if (flex && layout) {
      const pad = ['top', 'right', 'bottom', 'left'].map((side) =>
        this.len(layout.padding?.[side as 'top']),
      );
      const gap = layout.gap === 'auto' ? null : this.len(layout.gap);
      const row = layout.rowGap ? this.len(layout.rowGap) : gap;
      node.layout = {
        direction: layout.mode === 'horizontal' ? 'HORIZONTAL' : 'VERTICAL',
        wrap: !!layout.wrap && layout.mode === 'horizontal',
        gap: gap?.value ?? 0,
        ...(gap?.variable ? { gapVariable: gap.variable } : {}),
        ...(layout.wrap && row
          ? {
              counterGap: row.value,
              ...(row.variable ? { counterGapVariable: row.variable } : {}),
            }
          : {}),
        padding: pad.map((x) => x.value) as [number, number, number, number],
        paddingVariables: pad.map((x) => x.variable),
        primary:
          layout.gap === 'auto'
            ? 'SPACE_BETWEEN'
            : ALIGN[layout.alignMain ?? 'start'],
        counter:
          layout.alignCross === 'baseline'
            ? 'BASELINE'
            : !layout.alignCross || layout.alignCross === 'stretch'
              ? 'MIN'
              : ALIGN[layout.alignCross],
        reverseZ: !!layout.reverseZ,
      };
    }
    // Typographie héritée des parents, comme en CSS.
    const inherited = { ...o.inherited, ...props.text };
    if (isText) node.text = this.text(r.key, r.characters ?? '', inherited, m);
    if (r.type === 'vector' && r.vector) node.svg = svgOf(r.vector as Vector);
    // Champ de saisie : cadre et texte indicatif (ou case à cocher).
    if (r.type === 'field' && r.field?.input !== 'checkbox') {
      const t = this.text(r.key, r.field?.placeholder ?? '', inherited, m);
      t.color = { ...t.color, opacity: Math.min(t.color.opacity, 0.55) };
      if (t.characters)
        node.children.push({
          name: 'Texte indicatif',
          kind: 'TEXT',
          x: 0,
          y: 0,
          w: node.w,
          h: node.h,
          sizingH: 'FILL',
          sizingV: 'HUG',
          text: t,
          children: [],
        });
    }
    // Propriété de composant liée à ce calque.
    const docNode: DocNode | undefined = this.doc.nodes[r.id];
    if (docNode?.bind && !o.inInstance) {
      const refs: NonNullable<SceneNode['refs']> = {};
      if (docNode.bind.characters) refs.characters = docNode.bind.characters;
      if (docNode.bind.visible) refs.visible = docNode.bind.visible;
      if (docNode.bind.swap) refs.mainComponent = docNode.bind.swap;
      node.refs = refs;
    }
    let ref = o.ref;
    if (r.type === 'instance') {
      node.instanceOf = r.marks['data-ds-id'];
      // Référence : le composant tel quel, pour repérer les overrides.
      ref = renderTree(this.doc, node.instanceOf) ?? null;
      const values = docNode?.propValues;
      if (values && Object.keys(values).length) node.propValues = values;
      node.overridden = !!ref && !same(ref.props, props) ? true : undefined;
      if (!node.overridden) delete node.overridden;
    } else if (o.inInstance) {
      const differs =
        !ref || !same(ref.props, props) || ref.characters !== r.characters;
      if (differs) node.overridden = true;
    }
    node.children.push(
      ...r.children.map((c, i) =>
        this.scene(c, m, {
          parent: { box, props },
          inherited,
          state: o.state,
          ref: ref?.children[i] ?? null,
          inInstance: o.inInstance || r.type === 'instance',
        }),
      ),
    );
    return node;
  }

  /** Définitions de composants ; chaque état devient une variante. */
  components(m: Measures): ExportPayload['components'] {
    const defs: ExportPayload['components'] = [];
    for (const c of Object.values(this.doc.nodes)) {
      if (c.type !== 'component') continue;
      const tree = renderTree(this.doc, c.id);
      if (!tree) continue;
      const parent = c.parent ? this.doc.nodes[c.parent] : undefined;
      const inSet = parent?.type === 'component-set';
      const states = new Set<StateName>();
      walk(tree, (r) => {
        for (const s of stateNames)
          if (r.states?.[s] && Object.keys(r.states[s]!).length) states.add(s);
      });
      const setStates = inSet
        ? parent.children.some((id) => {
            const t = renderTree(this.doc, id);
            let found = false;
            if (t)
              walk(
                t,
                (r) =>
                  void (
                    r.states &&
                    (found ||= stateNames.some(
                      (s) => r.states?.[s] && Object.keys(r.states[s]!).length,
                    ))
                  ),
              );
            return found;
          })
        : states.size > 0;
      const properties = Object.entries(c.componentProps ?? {}).map(
        ([name, p]) => ({
          name,
          type:
            p.type === 'text'
              ? ('TEXT' as const)
              : p.type === 'boolean'
                ? ('BOOLEAN' as const)
                : ('INSTANCE_SWAP' as const),
          default: p.default,
        }),
      );
      const base = variantName(c.variant);
      const variant = (state: StateName | 'base') =>
        setStates
          ? [base, `${STATE_VARIANT}=${STATE_LABEL[state]}`]
              .filter(Boolean)
              .join(', ')
          : base;
      const set = inSet ? parent.name : setStates ? c.name : null;
      const def = (state: StateName | 'base') => {
        const root = this.scene(tree, m, {
          state: state === 'base' ? undefined : state,
        });
        root.x = root.y = 0;
        delete root.instanceOf;
        return {
          id: state === 'base' ? c.id : `${c.id}::${state}`,
          name: inSet ? parent.name : c.name,
          set,
          variant: variant(state),
          properties,
          root: { ...root, name: variant(state) ?? c.name },
        };
      };
      defs.push(def('base'));
      for (const s of stateNames) if (states.has(s)) defs.push(def(s));
    }
    return defs;
  }
}

export function variablesOf(tokens: Tokens): ExportPayload['variables'] {
  return tokenKeys.map((token) => {
    const t = tokens[token];
    return {
      token,
      name: token.replace('.', '/'),
      type:
        t.$type === 'color'
          ? 'COLOR'
          : t.$type === 'dimension'
            ? 'FLOAT'
            : 'STRING',
      value: t.$value,
      category: token.startsWith('color.')
        ? 'color'
        : token.startsWith('space.')
          ? 'space'
          : token.startsWith('radius.')
            ? 'radius'
            : 'typography',
    };
  });
}

/** Payload du design system : tous les composants (et leurs états). */
export function designSystemScene(
  doc: Doc,
  tokens: Tokens,
  page: PageTarget,
  m: Measures,
): { payload: ExportPayload; assets: string[] } {
  const b = new SceneBuilder(doc, tokens);
  const components = b.components(m);
  return {
    payload: {
      version: EXPORT_VERSION,
      kind: 'design_system',
      page,
      variables: variablesOf(tokens),
      textStyles: [...b.textStyles.values()],
      effectStyles: [...b.effectStyles.values()],
      components,
      images: [],
    },
    assets: [...b.assets],
  };
}

/** Payload d'un écran : l'écran et les composants qu'il utilise. */
export function screenScene(
  doc: Doc,
  tokens: Tokens,
  page: PageTarget,
  /** node : id de l'écran dans le document ; id : identifiant d'export. */
  screen: { node: string; id: string; label: string; width: number },
  m: Measures,
  components: Measures,
): { payload: ExportPayload; assets: string[] } {
  const tree = renderTree(doc, screen.node);
  if (!tree) throw new Error('Écran introuvable.');
  const b = new SceneBuilder(doc, tokens);
  const root = b.scene(tree, m);
  root.name = `DS-Studio / ${screen.label} / ${screen.width}`;
  root.x = root.y = 0;
  root.w = screen.width;
  root.sizingH = 'FIXED';
  root.sizingV = 'HUG';
  root.fills ??= [
    {
      type: 'SOLID',
      ...b.color({ token: 'color.canvas', opacity: 1 }),
      visible: true,
    },
  ];
  const all = b.components(components);
  // Composants utilisés (et ceux qu'ils utilisent), états compris.
  const used = new Set<string>();
  const collect = (n: SceneNode) => {
    if (n.instanceOf && !used.has(n.instanceOf)) {
      used.add(n.instanceOf);
      const def = all.find((d) => d.id === n.instanceOf);
      if (def) collect(def.root);
    }
    n.children.forEach(collect);
  };
  collect(root);
  const sets = new Set(
    all.filter((d) => used.has(d.id) && d.set).map((d) => d.set),
  );
  return {
    payload: {
      version: EXPORT_VERSION,
      kind: 'preview',
      page,
      variables: variablesOf(tokens),
      textStyles: [...b.textStyles.values()],
      effectStyles: [...b.effectStyles.values()],
      // Un set exporté entier : Figma regroupe ses variantes.
      components: all.filter(
        (d) => used.has(d.id) || (d.set !== null && sets.has(d.set)),
      ),
      screen: {
        id: `screen/${screen.id}/${screen.width}`,
        name: root.name,
        root,
      },
      images: [],
    },
    assets: [...b.assets],
  };
}
