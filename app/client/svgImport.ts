import {
  componentDraftSchema,
  type ComponentDraft,
} from '../shared/componentDraft.js';
import {
  vectorAttributes,
  vectorTags,
  type VectorAttribute,
  type VectorNode,
} from '../shared/vector.js';

// SVG → brouillon de composant, sans IA : le fond devient fill/stroke/radius,
// les textes deviennent des calques texte, le reste un calque vectoriel.
const NS = 'http://www.w3.org/2000/svg';
const COLOR_ATTRS = new Set(['fill', 'stroke']);
type Box = { x: number; y: number; width: number; height: number };

const ctx = document.createElement('canvas').getContext('2d');
/** Couleur CSS → #RRGGBB (ou none/currentColor). null si non représentable (dégradé…). */
function normalizeColor(value: string): string | null {
  const v = value.trim();
  if (v === 'none' || v === 'transparent') return 'none';
  if (v === 'currentColor') return v;
  if (/url\(/i.test(v) || !ctx) return null;
  ctx.fillStyle = '#000000';
  ctx.fillStyle = v;
  const out = ctx.fillStyle;
  return /^#[0-9a-f]{6}$/i.test(out) ? out.toUpperCase() : null;
}
function declared(el: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) attrs[a.name] = a.value;
  // Les déclarations « style » priment, comme dans le navigateur.
  for (const decl of (el.getAttribute('style') ?? '').split(';')) {
    const [k, ...rest] = decl.split(':');
    if (k && rest.length) attrs[k.trim()] = rest.join(':').trim();
  }
  return attrs;
}
function vectorNode(el: Element): VectorNode | null {
  const tag = el.tagName.toLowerCase() as VectorNode['tag'];
  if (!vectorTags.includes(tag)) return null;
  const attrs: VectorNode['attrs'] = {};
  for (const [name, raw] of Object.entries(declared(el))) {
    if (!vectorAttributes.includes(name as VectorAttribute)) continue;
    const value = COLOR_ATTRS.has(name) ? normalizeColor(raw) : raw.trim();
    if (value !== null && /^[-0-9a-zA-Z.,#%()\s]*$/.test(value))
      attrs[name as VectorAttribute] = value;
  }
  const children = Array.from(el.children)
    .map(vectorNode)
    .filter((n): n is VectorNode => !!n);
  return { tag, attrs, children };
}
function render(node: VectorNode): SVGElement {
  const el = document.createElementNS(NS, node.tag);
  for (const [k, v] of Object.entries(node.attrs)) el.setAttribute(k, v!);
  for (const c of node.children) el.append(render(c));
  return el;
}
const union = (boxes: Box[]): Box | null => {
  if (!boxes.length) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
};
function colors(nodes: VectorNode[], out = new Set<string>()) {
  for (const n of nodes) {
    for (const k of COLOR_ATTRS) {
      const v = n.attrs[k as VectorAttribute];
      if (v && v !== 'none') out.add(v);
    }
    colors(n.children, out);
  }
  return out;
}
function recolor(nodes: VectorNode[], from: string): VectorNode[] {
  return nodes.map((n) => ({
    ...n,
    attrs: Object.fromEntries(
      Object.entries(n.attrs).map(([k, v]) => [
        k,
        COLOR_ATTRS.has(k) && v === from ? 'currentColor' : v,
      ]),
    ),
    children: recolor(n.children, from),
  }));
}

/** Analyse un SVG et renvoie un brouillon validé (lève une erreur lisible sinon). */
export function svgToDraft(source: string, name: string): ComponentDraft {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = doc.documentElement;
  if (doc.querySelector('parsererror') || root.tagName.toLowerCase() !== 'svg')
    throw new Error('SVG illisible.');
  const num = (v: string | null) => {
    const n = parseFloat(v ?? '');
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const vb = (root.getAttribute('viewBox') ?? '')
    .split(/[\s,]+/)
    .map(Number)
    .filter(Number.isFinite);
  const view: Box =
    vb.length === 4 && vb[2] > 0 && vb[3] > 0
      ? { x: vb[0], y: vb[1], width: vb[2], height: vb[3] }
      : {
          x: 0,
          y: 0,
          width: num(root.getAttribute('width')) ?? 100,
          height: num(root.getAttribute('height')) ?? 100,
        };
  const width = num(root.getAttribute('width')) ?? view.width;
  const scale = width / view.width;

  // Copie nettoyée, rendue hors écran pour mesurer les boîtes (getBBox).
  const host = document.createElementNS(NS, 'svg');
  host.setAttribute(
    'viewBox',
    `${view.x} ${view.y} ${view.width} ${view.height}`,
  );
  host.setAttribute('width', String(width));
  host.style.cssText = 'position:fixed;left:-20000px;top:0;visibility:hidden';
  document.body.append(host);
  try {
    const shapes: { node: VectorNode; el: SVGGraphicsElement }[] = [];
    const texts: {
      el: SVGGraphicsElement;
      layer: ComponentDraft['layers'][number];
    }[] = [];
    const walk = (el: Element) => {
      for (const child of Array.from(el.children)) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'text') {
          const a = declared(child);
          const copy = document.createElementNS(NS, 'text');
          for (const k of [
            'x',
            'y',
            'font-size',
            'font-family',
            'font-weight',
            'transform',
          ])
            if (a[k]) copy.setAttribute(k, a[k]);
          copy.textContent = child.textContent ?? '';
          host.append(copy);
          const fontSize = (num(a['font-size']) ?? 16) * scale;
          texts.push({
            el: copy,
            layer: {
              type: 'text',
              text: (child.textContent ?? '').trim().slice(0, 200),
              color: {
                hex: normalizeColor(a.fill ?? '#000000') ?? '#000000',
                opacity: 1,
              },
              fontFamily: (a['font-family'] ?? 'system-ui').slice(0, 100),
              fontSize: Math.min(200, fontSize),
              fontWeight:
                a['font-weight'] === 'bold'
                  ? 700
                  : Math.min(
                      900,
                      Math.max(
                        100,
                        Math.round((num(a['font-weight']) ?? 400) / 100) * 100,
                      ),
                    ),
              lineHeight: 1.2,
            },
          });
        } else if (tag === 'g' && !child.querySelector('text')) {
          const node = vectorNode(child);
          if (node) {
            const el = render(node) as SVGGraphicsElement;
            host.append(el);
            shapes.push({ node, el });
          }
        } else if (tag === 'g') walk(child);
        else {
          // Éléments non vectoriels (image, use, style, script, foreignObject…) ignorés.
          const node = vectorNode(child);
          if (!node) continue;
          const el = render(node) as SVGGraphicsElement;
          host.append(el);
          shapes.push({ node, el });
        }
      }
    };
    walk(root);
    const box = (el: SVGGraphicsElement): Box => {
      const b = el.getBBox();
      return { x: b.x, y: b.y, width: b.width, height: b.height };
    };
    // Fond : premier rectangle qui couvre au moins 90 % de la zone.
    const bgIndex = shapes.findIndex(({ node, el }) => {
      if (node.tag !== 'rect') return false;
      const b = box(el);
      return b.width * b.height >= 0.9 * view.width * view.height;
    });
    const bg = bgIndex >= 0 ? shapes.splice(bgIndex, 1)[0].node : null;
    const color = (v?: string) =>
      v && v !== 'none' && /^#/.test(v) ? v : null;
    const fillHex = color(bg?.attrs.fill ?? (bg ? '#000000' : undefined));
    const strokeHex = color(bg?.attrs.stroke);
    const opacity = (v?: string) =>
      Math.min(1, Math.max(0, num(v ?? '1') ?? 1));
    const rx = (num(bg?.attrs.rx ?? bg?.attrs.ry ?? null) ?? 0) * scale;

    const shapeBox = union(shapes.map((s) => box(s.el)));
    const textBox = union(texts.map((t) => box(t.el)));
    const content = union([shapeBox, textBox].filter((b): b is Box => !!b));
    const layers: ComponentDraft['layers'] = [];
    let iconColor: string | null = null;
    if (shapes.length && shapeBox) {
      let nodes = shapes.map((s) => s.node);
      const used = [...colors(nodes)];
      const firstText = texts[0]?.layer;
      const textHex = firstText?.type === 'text' ? firstText.color.hex : null;
      // Icône d'une seule couleur, sans texte ou de la même couleur que lui :
      // elle suit la couleur de texte du composant, donc reste modifiable.
      if (
        used.length === 1 &&
        /^#/.test(used[0]) &&
        (!textHex || textHex === used[0])
      ) {
        iconColor = used[0];
        nodes = recolor(nodes, iconColor);
      }
      layers.push({
        type: 'vector',
        vector: {
          viewBox: [shapeBox.x, shapeBox.y, shapeBox.width, shapeBox.height]
            .map((n) => Math.round(n * 1000) / 1000)
            .join(' '),
          width: Math.min(4000, Math.max(1, shapeBox.width * scale)),
          height: Math.min(4000, Math.max(1, shapeBox.height * scale)),
          nodes,
        },
      });
    }
    layers.push(...texts.map((t) => t.layer));
    if (!texts.length && iconColor)
      layers.push({
        type: 'text',
        text: '',
        color: { hex: iconColor, opacity: 1 },
        fontFamily: 'system-ui',
        fontSize: 16,
        fontWeight: 400,
        lineHeight: 1.2,
      });
    // Icône à côté du texte (même hauteur) → horizontal ; au-dessus → vertical.
    const horizontal =
      !shapeBox || !textBox
        ? true
        : shapeBox.y + shapeBox.height / 2 >= textBox.y &&
          shapeBox.y + shapeBox.height / 2 <= textBox.y + textBox.height;
    const gap =
      shapeBox && textBox
        ? Math.max(
            0,
            horizontal
              ? Math.max(
                  textBox.x - (shapeBox.x + shapeBox.width),
                  shapeBox.x - (textBox.x + textBox.width),
                )
              : Math.max(
                  textBox.y - (shapeBox.y + shapeBox.height),
                  shapeBox.y - (textBox.y + textBox.height),
                ),
          ) * scale
        : 0;
    const pad = (v: number) => Math.min(512, Math.max(0, v * scale));
    const draft = {
      name:
        name
          .replace(/\.svg$/i, '')
          .trim()
          .slice(0, 60) || 'Composant SVG',
      width: Math.min(4000, width),
      height: Math.min(4000, view.height * scale),
      sizing: { x: 'fixed', y: 'fixed' },
      layout: {
        direction: horizontal ? 'horizontal' : 'vertical',
        gap: Math.min(512, gap),
        padding:
          bg && content
            ? [
                pad(content.y - view.y),
                pad(view.x + view.width - (content.x + content.width)),
                pad(view.y + view.height - (content.y + content.height)),
                pad(content.x - view.x),
              ]
            : [0, 0, 0, 0],
        align: 'center',
        distribute: 'center',
      },
      fill: fillHex
        ? { hex: fillHex, opacity: opacity(bg?.attrs['fill-opacity']) }
        : null,
      stroke: strokeHex
        ? {
            color: {
              hex: strokeHex,
              opacity: opacity(bg?.attrs['stroke-opacity']),
            },
            width: Math.min(
              32,
              (num(bg?.attrs['stroke-width'] ?? '1') ?? 1) * scale,
            ),
            style: 'solid',
          }
        : null,
      radius: [rx, rx, rx, rx].map((r) => Math.min(512, r)),
      shadow: null,
      layers: layers.slice(0, 20),
    };
    const parsed = componentDraftSchema.safeParse(draft);
    if (!parsed.success)
      throw new Error(
        'SVG non convertible : ' +
          parsed.error.issues
            .slice(0, 2)
            .map((i) => `${i.path.join('.')} ${i.message}`)
            .join(' ; '),
      );
    return parsed.data;
  } finally {
    host.remove();
  }
}
