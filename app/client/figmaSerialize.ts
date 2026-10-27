import { tokenKeys, type TokenKey, type Tokens } from '../shared/model.js';
import {
  EXPORT_VERSION,
  type ExportPayload,
  type PageTarget,
  type Paint,
  type SceneNode,
} from '../shared/figmaExport.js';

// Rendu réel (iframe cachée) → arbre de nœuds pour Figma. Les flex sans retour
// à la ligne deviennent de l'auto layout ; toute valeur égale à un token est
// rattachée à sa variable ; les composants DS marqués (data-ds-id) deviennent
// des composants Figma, puis des instances dans les écrans.

const INLINE = new Set([
  'SPAN',
  'STRONG',
  'EM',
  'B',
  'I',
  'BR',
  'SMALL',
  'A',
  'SUP',
  'SUB',
  'CODE',
]);
const SKIP = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'LINK',
  'META',
]);
const colorKeys = tokenKeys.filter((k) => k.startsWith('color.'));
// Ordre de préférence quand deux tokens ont la même valeur.
const PREFER: Record<'fill' | 'text' | 'stroke', TokenKey[]> = {
  fill: [
    'color.brand',
    'color.surface',
    'color.canvas',
    'color.danger',
    'color.success',
    ...colorKeys,
  ],
  text: [
    'color.text',
    'color.muted',
    'color.onBrand',
    'color.brand',
    ...colorKeys,
  ],
  stroke: ['color.border', 'color.brand', 'color.focus', ...colorKeys],
};
const SPACE: TokenKey[] = ['space.sm', 'space.md', 'space.lg'];

function parseColor(css: string): { hex: string; opacity: number } | null {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const [r, g, b, a = '1'] = m[1].split(/[\s,/]+/).filter(Boolean);
  const alpha = parseFloat(a);
  if (!(alpha > 0)) return null;
  const hex =
    '#' +
    [r, g, b]
      .map((v) => Math.round(parseFloat(v)).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  return { hex, opacity: Math.round(alpha * 100) / 100 };
}
const isFlex = (cs: CSSStyleDeclaration) =>
  cs.display === 'flex' || cs.display === 'inline-flex';
const isAutoLayout = (cs: CSSStyleDeclaration) =>
  isFlex(cs) && cs.flexWrap === 'nowrap';

export class Serializer {
  readonly textStyles = new Map<string, ExportPayload['textStyles'][number]>();
  readonly effectStyles = new Map<
    string,
    ExportPayload['effectStyles'][number]
  >();
  constructor(private tokens: Tokens) {}

  private paint(css: string, role: keyof typeof PREFER): Paint | undefined {
    const c = parseColor(css);
    if (!c) return undefined;
    const variable = PREFER[role].find(
      (k) => String(this.tokens[k].$value).toUpperCase() === c.hex,
    );
    return variable ? { ...c, variable } : c;
  }
  private dim(value: number, keys: TokenKey[]) {
    return keys.find((k) => this.tokens[k].$value === value) ?? null;
  }
  // Style de texte : tokens (Titre, Corps) puis chaque autre combinaison vue.
  private textStyle(
    family: string,
    size: number,
    weight: number,
    lineHeight: number,
    letterSpacing: number,
    sample: string,
  ) {
    const key = [family, size, weight, lineHeight, letterSpacing].join('|');
    const existing = this.textStyles.get(key);
    if (existing) return existing.id;
    const sizeVariable =
      this.dim(size, ['font.heading', 'font.body']) ?? undefined;
    const base =
      sizeVariable === 'font.heading'
        ? 'Titre'
        : sizeVariable === 'font.body'
          ? 'Corps'
          : `Texte ${size}`;
    const name = `DS-Studio/${base}${weight === 400 ? '' : ` ${weight}`}`;
    let id = `text/${base.toLowerCase().replace(/\s+/g, '-')}-${weight}`;
    while ([...this.textStyles.values()].some((s) => s.id === id))
      id += `-${lineHeight}`;
    const familyIsToken =
      family.toLowerCase() ===
      String(this.tokens['font.family'].$value).toLowerCase();
    this.textStyles.set(key, {
      id,
      name: [...this.textStyles.values()].some((s) => s.name === name)
        ? `${name} · ${lineHeight}px`
        : name,
      fontFamily: family,
      ...(familyIsToken ? { fontFamilyVariable: 'font.family' } : {}),
      fontWeight: weight,
      fontSize: size,
      ...(sizeVariable ? { fontSizeVariable: sizeVariable } : {}),
      lineHeight,
      letterSpacing,
      sample: sample.slice(0, 60) || 'Aa',
    });
    return id;
  }
  private text(
    el: Element,
    characters: string,
  ): NonNullable<SceneNode['text']> {
    const cs = getComputedStyle(el);
    const fontSize = parseFloat(cs.fontSize) || 16;
    const fontWeight = parseInt(cs.fontWeight, 10) || 400;
    const fontFamily = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    const lineHeight =
      cs.lineHeight === 'normal'
        ? Math.round(fontSize * 1.2)
        : parseFloat(cs.lineHeight);
    const letterSpacing =
      cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) || 0;
    const fontSizeVariable = this.dim(fontSize, ['font.body', 'font.heading']);
    return {
      characters,
      fontFamily,
      fontWeight,
      fontSize,
      ...(fontSizeVariable ? { fontSizeVariable } : {}),
      lineHeight,
      letterSpacing,
      align:
        cs.textAlign === 'center'
          ? 'CENTER'
          : cs.textAlign === 'right' || cs.textAlign === 'end'
            ? 'RIGHT'
            : 'LEFT',
      color: this.paint(cs.color, 'text') ?? { hex: '#000000', opacity: 1 },
      style: this.textStyle(
        fontFamily,
        fontSize,
        fontWeight,
        lineHeight,
        letterSpacing,
        characters,
      ),
    };
  }
  private shadow(css: string): SceneNode['shadow'] {
    if (!css || css === 'none') return undefined;
    // Format calculé : « rgba(r, g, b, a) x y flou étendue » (première ombre seulement).
    const m = css.match(
      /(rgba?\([^)]+\))\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px(?:\s+(-?[\d.]+)px)?/,
    );
    if (!m || css.includes('inset')) return undefined;
    const color = this.paint(m[1], 'text');
    if (!color) return undefined;
    const shadow = {
      x: +m[2],
      y: +m[3],
      blur: +m[4],
      spread: +(m[5] ?? 0),
      color,
    };
    const key = JSON.stringify(shadow);
    if (!this.effectStyles.has(key))
      this.effectStyles.set(key, {
        id: `shadow/${this.effectStyles.size + 1}`,
        name: `DS-Studio/Ombre ${this.effectStyles.size + 1}`,
        shadow,
      });
    return { ...shadow, style: this.effectStyles.get(key)!.id };
  }
  private hasBox(cs: CSSStyleDeclaration) {
    return (
      !!parseColor(cs.backgroundColor) ||
      (parseFloat(cs.borderTopWidth) > 0 && !!parseColor(cs.borderTopColor))
    );
  }
  private isTextLeaf(el: Element): boolean {
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType !== Node.ELEMENT_NODE) continue;
      const c = n as Element;
      if (
        !INLINE.has(c.tagName) ||
        this.hasBox(getComputedStyle(c)) ||
        !this.isTextLeaf(c)
      )
        return false;
    }
    return true;
  }
  // Dimensionnement dans le parent : FILL si le parent étire l'enfant, HUG si le
  // contenu dicte la taille, FIXED sinon.
  private sizing(
    el: Element,
    cs: CSSStyleDeclaration,
    parent: CSSStyleDeclaration | null,
  ) {
    const style = (el as HTMLElement).style;
    const inParentLayout = !!parent && isAutoLayout(parent);
    const row = parent?.flexDirection.startsWith('row');
    const inline =
      cs.display.startsWith('inline') || style.width === 'fit-content';
    const sizingH: SceneNode['sizingH'] =
      style.width === '100%' ||
      (inParentLayout && row && parseFloat(cs.flexGrow) > 0) ||
      (inParentLayout &&
        !row &&
        !inline &&
        cs.alignSelf !== 'center' &&
        parent!.alignItems !== 'center' &&
        parent!.alignItems !== 'flex-start')
        ? 'FILL'
        : inline || isAutoLayout(cs)
          ? 'HUG'
          : 'FIXED';
    const explicitHeight = /px$/.test(style.height);
    const sizingV: SceneNode['sizingV'] =
      style.height === '100%'
        ? 'FILL'
        : explicitHeight
          ? 'FIXED'
          : isAutoLayout(cs) || this.isTextLeaf(el)
            ? 'HUG'
            : 'FIXED';
    return { sizingH, sizingV };
  }
  private textNode(
    el: Element,
    range: Range | Element,
    characters: string,
    origin: DOMRect,
  ): SceneNode {
    const r = range.getBoundingClientRect();
    const multiline =
      r.height > (parseFloat(getComputedStyle(el).lineHeight) || 20) * 1.5;
    return {
      name: characters.slice(0, 40).replace(/\s+/g, ' '),
      x: r.left - origin.left,
      y: r.top - origin.top,
      w: Math.ceil(r.width) + 1,
      h: Math.ceil(r.height),
      sizingH: multiline ? 'FILL' : 'HUG',
      sizingV: 'HUG',
      text: this.text(el, characters),
      children: [],
    };
  }

  walk(
    el: Element,
    origin: DOMRect,
    parent: CSSStyleDeclaration | null = null,
  ): SceneNode | null {
    if (SKIP.has(el.tagName)) return null;
    const cs = getComputedStyle(el);
    if (
      cs.display === 'none' ||
      cs.visibility === 'hidden' ||
      parseFloat(cs.opacity) === 0
    )
      return null;
    const rect = el.getBoundingClientRect();
    if (rect.width < 0.5 || rect.height < 0.5) return null;
    const dsId = el.getAttribute('data-ds-id');
    const node: SceneNode = {
      name:
        el.getAttribute('data-ds-variant') ??
        el.getAttribute('data-ds-name') ??
        el.getAttribute('aria-label') ??
        (el.className?.toString().split(' ')[0] || el.tagName.toLowerCase()),
      x: rect.left - origin.left,
      y: rect.top - origin.top,
      w: rect.width,
      h: rect.height,
      ...this.sizing(el, cs, parent),
      ...(dsId ? { instanceOf: dsId } : {}),
      children: [],
    };
    const fill = this.paint(cs.backgroundColor, 'fill');
    if (fill) node.fill = fill;
    const bw = parseFloat(cs.borderTopWidth);
    const stroke = bw > 0 ? this.paint(cs.borderTopColor, 'stroke') : undefined;
    if (stroke) node.stroke = { ...stroke, weight: bw };
    const radii = [
      cs.borderTopLeftRadius,
      cs.borderTopRightRadius,
      cs.borderBottomRightRadius,
      cs.borderBottomLeftRadius,
    ].map((r) =>
      Math.min(parseFloat(r) || 0, rect.height / 2, rect.width / 2),
    ) as [number, number, number, number];
    if (radii.some((r) => r > 0)) {
      node.radius = radii;
      node.radiusVariables = radii.map((r) => this.dim(r, ['radius.control']));
    }
    const shadow = this.shadow(cs.boxShadow);
    if (shadow) node.shadow = shadow;

    // Champs de formulaire : boîte + texte de la valeur ou du placeholder.
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    ) {
      if (
        el instanceof HTMLInputElement &&
        (el.type === 'checkbox' || el.type === 'radio')
      ) {
        node.stroke ??= { hex: '#767676', opacity: 1, weight: 1 };
        node.fill ??= { hex: '#FFFFFF', opacity: 1 };
        node.radius =
          el.type === 'radio'
            ? [rect.width / 2, rect.width / 2, rect.width / 2, rect.width / 2]
            : [3, 3, 3, 3];
        node.sizingH = node.sizingV = 'FIXED';
        return node;
      }
      const value =
        el instanceof HTMLSelectElement
          ? (el.selectedOptions[0]?.text ?? '')
          : el.value || (el as HTMLInputElement).placeholder || '';
      const pl = parseFloat(cs.paddingLeft) || 0;
      const pt = parseFloat(cs.paddingTop) || 0;
      node.layout = {
        direction: 'HORIZONTAL',
        gap: 0,
        padding: [pt, pl, pt, pl],
        paddingVariables: [
          this.dim(pt, SPACE),
          this.dim(pl, SPACE),
          this.dim(pt, SPACE),
          this.dim(pl, SPACE),
        ],
        primary: 'MIN',
        counter: 'CENTER',
      };
      if (value) {
        const t = this.text(el, value);
        if (!el.value)
          t.color = { ...t.color, opacity: Math.min(t.color.opacity, 0.55) };
        node.children.push({
          name: value.slice(0, 40),
          x: pl + bw,
          y: (rect.height - t.lineHeight) / 2,
          w: Math.max(1, rect.width - 2 * (pl + bw)),
          h: t.lineHeight,
          sizingH: 'FILL',
          sizingV: 'HUG',
          text: t,
          children: [],
        });
      }
      return node;
    }

    const boxed = !!fill || !!stroke;
    if (this.isTextLeaf(el)) {
      const characters = (el as HTMLElement).innerText?.trim() ?? '';
      if (!characters) return boxed ? node : null;
      if (!boxed && !isFlex(cs) && !dsId) {
        const t = this.textNode(el, el, characters, origin);
        return {
          ...t,
          w: rect.width,
          h: rect.height,
          sizingH: node.sizingH === 'FILL' ? 'FILL' : t.sizingH,
        };
      }
      const range = el.ownerDocument.createRange();
      range.selectNodeContents(el);
      node.children.push(this.textNode(el, range, characters, rect));
    } else {
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const c = this.walk(child as Element, rect, cs);
          if (c) node.children.push(c);
        } else if (
          child.nodeType === Node.TEXT_NODE &&
          child.textContent?.trim()
        ) {
          const range = el.ownerDocument.createRange();
          range.selectNodeContents(child);
          if (range.getBoundingClientRect().width > 0)
            node.children.push(
              this.textNode(el, range, child.textContent.trim(), rect),
            );
        }
      }
    }
    // Les flex sans retour à la ligne deviennent de l'auto layout ; un bloc dont
    // les enfants s'empilent devient un auto layout vertical.
    const stacked =
      !isFlex(cs) &&
      node.children.length > 1 &&
      node.children.every(
        (c, i, all) => i === 0 || c.y >= all[i - 1].y + all[i - 1].h - 1,
      );
    if ((isAutoLayout(cs) && node.children.length) || stacked) {
      const horizontal = isAutoLayout(cs) && cs.flexDirection.startsWith('row');
      const gap = isAutoLayout(cs)
        ? parseFloat(horizontal ? cs.columnGap : cs.rowGap) || 0
        : Math.max(
            0,
            Math.round(
              Math.min(
                ...node.children
                  .slice(1)
                  .map(
                    (c, i) => c.y - (node.children[i].y + node.children[i].h),
                  ),
              ),
            ),
          );
      const padding = [
        cs.paddingTop,
        cs.paddingRight,
        cs.paddingBottom,
        cs.paddingLeft,
      ].map((p) => (parseFloat(p) || 0) + (stroke ? bw : 0)) as [
        number,
        number,
        number,
        number,
      ];
      const jc = cs.justifyContent;
      const ai = cs.alignItems;
      node.layout = {
        direction: horizontal ? 'HORIZONTAL' : 'VERTICAL',
        gap,
        ...(this.dim(gap, SPACE) ? { gapVariable: this.dim(gap, SPACE)! } : {}),
        padding,
        paddingVariables: padding.map((p) => (p ? this.dim(p, SPACE) : null)),
        primary: !isAutoLayout(cs)
          ? 'MIN'
          : jc.includes('space-between')
            ? 'SPACE_BETWEEN'
            : jc.includes('center')
              ? 'CENTER'
              : jc.includes('end')
                ? 'MAX'
                : 'MIN',
        counter: !isAutoLayout(cs)
          ? 'MIN'
          : ai.includes('center')
            ? 'CENTER'
            : ai.includes('end')
              ? 'MAX'
              : 'MIN',
      };
      if (isAutoLayout(cs) && cs.flexDirection.endsWith('reverse'))
        node.children.reverse();
    }
    if (!boxed && !node.children.length) return null;
    return node;
  }
}

async function render(src: string, width: number, ready: string) {
  const frame = document.createElement('iframe');
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:1200px;border:0;opacity:0;pointer-events:none`;
  frame.src = src;
  document.body.append(frame);
  await new Promise<void>((resolve, reject) => {
    frame.onload = () => resolve();
    setTimeout(() => reject(new Error('Rendu trop long à charger.')), 15_000);
  });
  const doc = frame.contentDocument!;
  const deadline = Date.now() + 10_000;
  while (!doc.querySelector(ready)) {
    if (Date.now() > deadline) {
      frame.remove();
      throw new Error('Rendu introuvable pour l’export.');
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  await doc.fonts?.ready;
  // Hauteur naturelle : l'iframe est réduite puis ajustée au contenu.
  const tick = () => new Promise((r) => requestAnimationFrame(() => r(null)));
  frame.style.height = '50px';
  await tick();
  frame.style.height = `${doc.documentElement.scrollHeight}px`;
  await tick();
  return { frame, doc };
}
function variables(tokens: Tokens): ExportPayload['variables'] {
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
// Chaque composant DS isolé (planche d'export) devient une définition.
async function components(serializer: Serializer) {
  const { frame, doc } = await render('/?export=ds', 480, '.export-sheet');
  try {
    const defs: ExportPayload['components'] = [];
    for (const el of Array.from(
      doc.querySelectorAll('.export-item > [data-ds-id]'),
    )) {
      const root = serializer.walk(el, el.getBoundingClientRect());
      const id = el.getAttribute('data-ds-id');
      if (!root || !id || defs.some((d) => d.id === id)) continue;
      delete root.instanceOf;
      root.x = root.y = 0;
      defs.push({
        id,
        name: el.getAttribute('data-ds-name') ?? id,
        set: el.getAttribute('data-ds-set'),
        variant: el.getAttribute('data-ds-variant'),
        root,
      });
    }
    return defs;
  } finally {
    frame.remove();
  }
}
const finish = (s: Serializer) => ({
  textStyles: [...s.textStyles.values()],
  effectStyles: [...s.effectStyles.values()],
});

export async function designSystemPayload(
  tokens: Tokens,
  page: PageTarget,
): Promise<ExportPayload> {
  const s = new Serializer(tokens);
  const defs = await components(s);
  return {
    version: EXPORT_VERSION,
    kind: 'design_system',
    page,
    variables: variables(tokens),
    ...finish(s),
    components: defs,
  };
}

export async function previewPayload(
  tokens: Tokens,
  page: PageTarget,
  scenario: { id: string; label: string; width: number },
): Promise<ExportPayload> {
  const s = new Serializer(tokens);
  const { frame, doc } = await render(
    `/?preview=1&scenario=${encodeURIComponent(scenario.id)}`,
    scenario.width,
    '.scenario',
  );
  let root: SceneNode | null;
  try {
    const el = doc.querySelector('.ds')!;
    root = s.walk(el, el.getBoundingClientRect());
  } finally {
    frame.remove();
  }
  if (!root) throw new Error('Aperçu vide : rien à exporter.');
  const bg = parseColor(getComputedStyle(document.body).backgroundColor);
  root.fill ??= bg ?? { hex: '#FFFFFF', opacity: 1 };
  root.name = `DS-Studio / ${scenario.label} / ${scenario.width}`;
  root.w = scenario.width;
  root.sizingH = 'FIXED';
  root.sizingV = 'HUG';
  // Composants utilisés par l'écran : envoyés pour être créés s'ils manquent.
  const used = new Set<string>();
  const collect = (n: SceneNode) => {
    if (n.instanceOf) used.add(n.instanceOf);
    n.children.forEach(collect);
  };
  collect(root);
  const all = await components(s);
  const needed = all.filter((d) => used.has(d.id));
  for (const d of needed) collect(d.root);
  return {
    version: EXPORT_VERSION,
    kind: 'preview',
    page,
    variables: variables(tokens),
    ...finish(s),
    components: all.filter((d) => used.has(d.id)),
    screen: {
      id: `screen/${scenario.id}/${scenario.width}`,
      name: root.name,
      root,
    },
  };
}
