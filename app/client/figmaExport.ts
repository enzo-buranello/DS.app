import type { TokenKey, Tokens } from '../shared/model.js';
import type {
  NativeExport,
  SceneFill,
  SceneNode,
  SceneScreen,
  SceneText,
} from '../shared/figma.js';

// Convertit un scénario rendu (iframe même origine) en arbre de nœuds Figma.
// Les flex sans retour à la ligne deviennent de l'auto-layout ; le reste est positionné.
// Chaque couleur ou dimension égale à un token est liée à la variable correspondante.

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
const PREFER: Record<'fill' | 'text' | 'stroke', TokenKey[]> = {
  fill: [
    'color.brand',
    'color.surface',
    'color.canvas',
    'color.danger',
    'color.success',
    'color.brandHover',
    'color.border',
    'color.focus',
    'color.onBrand',
    'color.text',
    'color.muted',
  ],
  text: [
    'color.text',
    'color.muted',
    'color.onBrand',
    'color.brand',
    'color.danger',
    'color.success',
    'color.brandHover',
    'color.surface',
    'color.canvas',
    'color.border',
    'color.focus',
  ],
  stroke: [
    'color.border',
    'color.brand',
    'color.focus',
    'color.danger',
    'color.success',
    'color.text',
    'color.muted',
    'color.brandHover',
    'color.surface',
    'color.canvas',
    'color.onBrand',
  ],
};

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

export class Serializer {
  constructor(private tokens: Tokens) {}
  private colorToken(hex: string, role: keyof typeof PREFER) {
    return PREFER[role].find(
      (k) => String(this.tokens[k].$value).toUpperCase() === hex,
    );
  }
  private dimToken(value: number, keys: TokenKey[]) {
    return keys.find((k) => this.tokens[k].$value === value);
  }
  private fill(css: string, role: keyof typeof PREFER): SceneFill | undefined {
    const c = parseColor(css);
    if (!c) return undefined;
    const token = this.colorToken(c.hex, role);
    return token ? { ...c, token } : c;
  }
  private textStyle(el: Element, characters: string): SceneText {
    const cs = getComputedStyle(el);
    const fontSize = parseFloat(cs.fontSize) || 16;
    const align =
      cs.textAlign === 'center'
        ? 'CENTER'
        : cs.textAlign === 'right' || cs.textAlign === 'end'
          ? 'RIGHT'
          : 'LEFT';
    const fontSizeToken = this.dimToken(fontSize, [
      'font.body',
      'font.heading',
    ]);
    return {
      characters,
      fontFamily: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
      fontWeight: parseInt(cs.fontWeight, 10) || 400,
      fontSize,
      ...(fontSizeToken ? { fontSizeToken } : {}),
      lineHeight:
        cs.lineHeight === 'normal'
          ? Math.round(fontSize * 1.2)
          : parseFloat(cs.lineHeight),
      letterSpacing:
        cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing) || 0,
      align,
      color: this.fill(cs.color, 'text') ?? { hex: '#000000', opacity: 1 },
      uppercase: false, // innerText applique déjà text-transform.
    };
  }
  private hasBox(cs: CSSStyleDeclaration) {
    return (
      !!parseColor(cs.backgroundColor) ||
      (parseFloat(cs.borderTopWidth) > 0 && !!parseColor(cs.borderTopColor))
    );
  }
  private isTextLeaf(el: Element): boolean {
    for (const n of Array.from(el.childNodes)) {
      if (n.nodeType === Node.TEXT_NODE) continue;
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
  private textNode(
    el: Element,
    range: Range | Element,
    characters: string,
    origin: DOMRect,
  ): SceneNode {
    const r = range.getBoundingClientRect();
    return {
      name: characters.slice(0, 40).replace(/\s+/g, ' '),
      x: r.left - origin.left,
      y: r.top - origin.top,
      w: Math.ceil(r.width) + 1,
      h: Math.ceil(r.height),
      text: this.textStyle(el, characters),
      children: [],
    };
  }

  walk(el: Element, origin: DOMRect): SceneNode | null {
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
    const name =
      el.getAttribute('aria-label') ||
      el.className?.toString().split(' ')[0] ||
      el.tagName.toLowerCase();
    const node: SceneNode = {
      name,
      x: rect.left - origin.left,
      y: rect.top - origin.top,
      w: rect.width,
      h: rect.height,
      children: [],
    };
    const component = el.getAttribute('data-ds-component');
    if (component) {
      const variant = el.getAttribute('data-ds-variant');
      node.component = {
        key:
          el.getAttribute('data-ds-key') ??
          (variant ? `${component}|${variant}` : component),
        name: component,
        set: variant ? component : null,
        variant,
      };
      node.name = variant ?? component;
    }
    const fill = this.fill(cs.backgroundColor, 'fill');
    if (fill) node.fill = fill;
    const bw = parseFloat(cs.borderTopWidth);
    const stroke = bw > 0 ? this.fill(cs.borderTopColor, 'stroke') : undefined;
    if (stroke) node.stroke = { ...stroke, weight: bw };
    const radius = parseFloat(cs.borderTopLeftRadius) || 0;
    if (radius) {
      node.radius = Math.min(radius, rect.height / 2, rect.width / 2);
      const rt = this.dimToken(radius, ['radius.control']);
      if (rt) node.radiusToken = rt;
    }

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
        node.radius = el.type === 'radio' ? rect.width / 2 : 3;
        return node;
      }
      const value =
        el instanceof HTMLSelectElement
          ? (el.selectedOptions[0]?.text ?? '')
          : el.value || (el as HTMLInputElement).placeholder || '';
      if (value) {
        const t = this.textStyle(el, value);
        if (!el.value)
          t.color = { ...t.color, opacity: Math.min(t.color.opacity, 0.55) };
        const pl = parseFloat(cs.paddingLeft) || 0;
        node.children.push({
          name: value.slice(0, 40),
          x: pl + bw,
          y: (rect.height - t.lineHeight) / 2,
          w: Math.max(1, rect.width - 2 * (pl + bw)),
          h: t.lineHeight,
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
      if (!boxed && cs.display !== 'flex' && cs.display !== 'inline-flex') {
        const t = this.textNode(el, el, characters, origin);
        return { ...t, w: rect.width, h: rect.height };
      }
      const range = el.ownerDocument.createRange();
      range.selectNodeContents(el);
      node.children.push(this.textNode(el, range, characters, rect));
    } else {
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const c = this.walk(child as Element, rect);
          if (c) node.children.push(c);
        } else if (
          child.nodeType === Node.TEXT_NODE &&
          child.textContent?.trim()
        ) {
          const range = el.ownerDocument.createRange();
          range.selectNodeContents(child);
          const r = range.getBoundingClientRect();
          if (r.width > 0)
            node.children.push(
              this.textNode(el, range, child.textContent.trim(), rect),
            );
        }
      }
    }

    // Auto-layout pour les flex sans retour à la ligne.
    if (
      (cs.display === 'flex' || cs.display === 'inline-flex') &&
      cs.flexWrap === 'nowrap' &&
      node.children.length
    ) {
      const horizontal = cs.flexDirection.startsWith('row');
      const gap = parseFloat(horizontal ? cs.columnGap : cs.rowGap) || 0;
      const padding: [number, number, number, number] = [
        cs.paddingTop,
        cs.paddingRight,
        cs.paddingBottom,
        cs.paddingLeft,
      ].map((p) => parseFloat(p) || 0) as never;
      const space: TokenKey[] = ['space.sm', 'space.md', 'space.lg'];
      const jc = cs.justifyContent;
      const ai = cs.alignItems;
      node.layout = {
        mode: horizontal ? 'HORIZONTAL' : 'VERTICAL',
        gap,
        ...(this.dimToken(gap, space)
          ? { gapToken: this.dimToken(gap, space) }
          : {}),
        padding,
        paddingTokens: padding.map((p) =>
          p ? this.dimToken(p, space) : undefined,
        ),
        primary: jc.includes('space-between')
          ? 'SPACE_BETWEEN'
          : jc.includes('center')
            ? 'CENTER'
            : jc.includes('end')
              ? 'MAX'
              : 'MIN',
        counter: ai.includes('center')
          ? 'CENTER'
          : ai.includes('end')
            ? 'MAX'
            : 'MIN',
      };
      if (cs.flexDirection.endsWith('reverse')) node.children.reverse();
    }
    // Conteneur invisible sans enfant : inutile.
    if (!boxed && !node.children.length) return null;
    return node;
  }
}

/** Rend un scénario dans une iframe cachée à la largeur demandée et le sérialise. */
export async function captureScreen(
  scenario: string,
  label: string,
  width: number,
  tokens: Tokens,
): Promise<SceneScreen> {
  const frame = document.createElement('iframe');
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:1200px;border:0;opacity:0;pointer-events:none`;
  frame.src = `/?preview=1&scenario=${encodeURIComponent(scenario)}`;
  document.body.append(frame);
  try {
    await new Promise<void>((resolve, reject) => {
      frame.onload = () => resolve();
      setTimeout(
        () => reject(new Error('Aperçu trop long à charger.')),
        15_000,
      );
    });
    const doc = frame.contentDocument!;
    const deadline = Date.now() + 10_000;
    while (!doc.querySelector('.scenario')) {
      if (Date.now() > deadline)
        throw new Error('Scénario introuvable dans l’aperçu.');
      await new Promise((r) => setTimeout(r, 100));
    }
    await doc.fonts?.ready;
    // Hauteur naturelle : on réduit l'iframe pour neutraliser les min-height en vh.
    const tick = () => new Promise((r) => requestAnimationFrame(() => r(null)));
    frame.style.height = '50px';
    await tick();
    frame.style.height = `${doc.documentElement.scrollHeight}px`;
    await tick();
    const root = doc.querySelector('.ds')!;
    const rect = root.getBoundingClientRect();
    const serializer = new Serializer(tokens);
    const node = serializer.walk(root, rect) ?? {
      name: label,
      x: 0,
      y: 0,
      w: width,
      h: rect.height,
      children: [],
    };
    // Fond de page : celui du body si la racine est transparente.
    if (!node.fill) {
      const bg = getComputedStyle(doc.body).backgroundColor;
      const c = parseColor(bg);
      node.fill = c ? c : { hex: '#FFFFFF', opacity: 1 };
    }
    node.name = `DS-Studio / ${label} / ${width}`;
    node.w = width;
    node.h = Math.ceil(doc.documentElement.scrollHeight);
    return { name: node.name, width, root: node };
  } finally {
    frame.remove();
  }
}

async function loadHidden(src: string, width: number, ready: string) {
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
    await new Promise((r) => setTimeout(r, 100));
  }
  await doc.fonts?.ready;
  return { frame, doc };
}

/** Planche d'export : chaque composant DS isolé devient une définition Figma. */
export async function captureDesignSystem(
  tokens: Tokens,
): Promise<NativeExport['definitions']> {
  const { frame, doc } = await loadHidden('/?export=ds', 480, '.export-sheet');
  try {
    const serializer = new Serializer(tokens);
    const definitions: NativeExport['definitions'] = [];
    // Seuls les composants de premier niveau sont des définitions ; ceux qu'ils
    // contiennent (bouton d'une carte) deviennent des instances.
    for (const el of Array.from(
      doc.querySelectorAll(
        '.export-sheet > .export-item > [data-ds-component]',
      ),
    )) {
      const node = serializer.walk(el, el.getBoundingClientRect());
      if (!node?.component) continue;
      node.x = 0;
      node.y = 0;
      const { key, name, set, variant } = node.component;
      if (definitions.some((d) => d.key === key)) continue;
      definitions.push({ key, name, set, variant, root: node });
    }
    return definitions;
  } finally {
    frame.remove();
  }
}
