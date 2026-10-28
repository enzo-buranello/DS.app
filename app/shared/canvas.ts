import type { Props } from './doc.js';

// Géométrie des manipulations du canevas (mode Édition) : rectangle de
// sélection, poignées, déplacement absolu, réordonnancement en auto-layout,
// repères de mesure et d'espacement. Fonctions pures, en px du document.
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const right = (r: Rect) => r.x + r.w;
export const bottom = (r: Rect) => r.y + r.h;

/** Rectangle tracé entre deux points, quel que soit le sens. */
export function rectFrom(
  a: { x: number; y: number },
  b: { x: number; y: number },
): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}
/** Rectangle de sélection : un calque touché est pris (comme Figma). */
export const intersects = (a: Rect, b: Rect) =>
  a.x <= right(b) && right(a) >= b.x && a.y <= bottom(b) && bottom(a) >= b.y;
export function marqueeHits<T>(
  items: { item: T; box: Rect }[],
  area: Rect,
): T[] {
  return items.filter((i) => intersects(i.box, area)).map((i) => i.item);
}
/** Enveloppe de plusieurs rectangles (contour d'une multi-sélection). */
export function union(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    w: Math.max(...rects.map(right)) - x,
    h: Math.max(...rects.map(bottom)) - y,
  };
}

// --- Poignées de redimensionnement ---
export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const HANDLES: readonly Handle[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
];
/**
 * Nouvelle taille après un glissé de poignée. Les poignées gauche et haut
 * déplacent aussi l'origine (dx, dy), utile pour un calque absolu. Ratio :
 * Maj ou « verrouiller le ratio ».
 */
export function resize(
  start: { w: number; h: number },
  handle: Handle,
  dx: number,
  dy: number,
  keepRatio = false,
): {
  w: number;
  h: number;
  dx: number;
  dy: number;
  width: boolean;
  height: boolean;
} {
  const width = handle.includes('e') || handle.includes('w');
  const height = handle.includes('n') || handle.includes('s');
  let w =
    start.w + (handle.includes('e') ? dx : handle.includes('w') ? -dx : 0);
  let h =
    start.h + (handle.includes('s') ? dy : handle.includes('n') ? -dy : 0);
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  let both = { width, height };
  if (keepRatio && start.w > 0 && start.h > 0) {
    const ratio = start.w / start.h;
    if (
      width &&
      (!height || Math.abs(w - start.w) >= Math.abs(h - start.h) * ratio)
    )
      h = Math.max(1, Math.round(w / ratio));
    else w = Math.max(1, Math.round(h * ratio));
    both = { width: true, height: true };
  }
  return {
    w,
    h,
    dx: handle.includes('w') ? start.w - w : 0,
    dy: handle.includes('n') ? start.h - h : 0,
    ...both,
  };
}

/** Propriété de taille après redimensionnement : l'axe touché passe en fixe. */
export function sizeAfterResize(
  size: Props['size'],
  r: { w: number; h: number; width: boolean; height: boolean },
): NonNullable<Props['size']> {
  const next = { ...size };
  if (r.width) next.width = { mode: 'fixed', px: r.w };
  if (r.height) next.height = { mode: 'fixed', px: r.h };
  return next;
}

/**
 * Déplacement d'un calque absolu, selon ses contraintes : « droite » compte
 * depuis le bord droit, « étirer » garde les deux marges.
 */
export function moveAbsolute(
  pos: NonNullable<Props['position']>,
  dx: number,
  dy: number,
): NonNullable<Props['position']> {
  const next = { ...pos, mode: 'absolute' as const };
  const r = (v: number) => Math.round(v);
  const cx = pos.constraintX ?? 'left';
  const cy = pos.constraintY ?? 'top';
  if (dx) {
    next.x = r((pos.x ?? 0) + (cx === 'right' ? -dx : dx));
    if (cx === 'stretch') next.xEnd = r((pos.xEnd ?? 0) - dx);
  }
  if (dy) {
    next.y = r((pos.y ?? 0) + (cy === 'bottom' ? -dy : dy));
    if (cy === 'stretch') next.yEnd = r((pos.yEnd ?? 0) - dy);
  }
  return next;
}

/**
 * Réordonnancement dans un auto-layout : index d'insertion (dans la liste
 * d'origine, comme `move`) d'après la position du pointeur. Avec retour à
 * la ligne, l'ordre de lecture (ligne puis colonne) fait foi.
 */
export function reorderIndex(
  siblings: Rect[],
  p: { x: number; y: number },
  axis: 'horizontal' | 'vertical',
  wrap = false,
): number {
  let i = 0;
  for (const b of siblings) {
    const before =
      axis === 'vertical'
        ? b.y + b.h / 2 < p.y
        : wrap
          ? bottom(b) < p.y || (b.y <= p.y && b.x + b.w / 2 < p.x)
          : b.x + b.w / 2 < p.x;
    if (before) i += 1;
  }
  return i;
}
/** Trait d'insertion affiché pendant le réordonnancement. */
export function insertionLine(
  siblings: Rect[],
  index: number,
  axis: 'horizontal' | 'vertical',
  parent: Rect,
): { x1: number; y1: number; x2: number; y2: number } {
  const prev = siblings[index - 1];
  const next = siblings[index];
  if (axis === 'vertical') {
    const y =
      prev && next
        ? (bottom(prev) + next.y) / 2
        : prev
          ? bottom(prev)
          : next
            ? next.y
            : parent.y;
    const ref = next ?? prev ?? parent;
    return { x1: ref.x, y1: y, x2: right(ref), y2: y };
  }
  const x =
    prev && next && prev.y === next.y
      ? (right(prev) + next.x) / 2
      : prev
        ? right(prev)
        : next
          ? next.x
          : parent.x;
  const ref = next && (!prev || prev.y === next.y) ? next : (prev ?? parent);
  return { x1: x, y1: ref.y, x2: x, y2: bottom(ref) };
}

// --- Repères ---
export interface Guide {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Distance affichée (px du document). */
  value: number;
}
const mid = (a: number, b: number) => (a + b) / 2;
/**
 * Repères de mesure (Alt) entre la sélection `a` et le calque survolé `b` :
 * écarts entre bords s'ils sont séparés, marges intérieures si l'un contient
 * l'autre.
 */
export function measureGuides(a: Rect, b: Rect): Guide[] {
  const out: Guide[] = [];
  const push = (g: Guide) =>
    g.value > 0 && out.push({ ...g, value: Math.round(g.value) });
  const contains = (o: Rect, i: Rect) =>
    o.x <= i.x && o.y <= i.y && right(o) >= right(i) && bottom(o) >= bottom(i);
  if (contains(b, a) || contains(a, b)) {
    const [o, i] = contains(b, a) ? [b, a] : [a, b];
    const cy = mid(i.y, bottom(i));
    const cx = mid(i.x, right(i));
    push({ x1: o.x, y1: cy, x2: i.x, y2: cy, value: i.x - o.x });
    push({
      x1: right(i),
      y1: cy,
      x2: right(o),
      y2: cy,
      value: right(o) - right(i),
    });
    push({ x1: cx, y1: o.y, x2: cx, y2: i.y, value: i.y - o.y });
    push({
      x1: cx,
      y1: bottom(i),
      x2: cx,
      y2: bottom(o),
      value: bottom(o) - bottom(i),
    });
    return out;
  }
  // Axe horizontal : trait à mi-hauteur de la zone commune (ou de `a`).
  const top = Math.max(a.y, b.y);
  const low = Math.min(bottom(a), bottom(b));
  const cy = top <= low ? mid(top, low) : mid(a.y, bottom(a));
  if (right(a) <= b.x)
    push({ x1: right(a), y1: cy, x2: b.x, y2: cy, value: b.x - right(a) });
  else if (right(b) <= a.x)
    push({ x1: right(b), y1: cy, x2: a.x, y2: cy, value: a.x - right(b) });
  const l = Math.max(a.x, b.x);
  const rr = Math.min(right(a), right(b));
  const cx = l <= rr ? mid(l, rr) : mid(a.x, right(a));
  if (bottom(a) <= b.y)
    push({ x1: cx, y1: bottom(a), x2: cx, y2: b.y, value: b.y - bottom(a) });
  else if (bottom(b) <= a.y)
    push({ x1: cx, y1: bottom(b), x2: cx, y2: a.y, value: a.y - bottom(b) });
  return out;
}

export interface Band extends Rect {
  kind: 'padding' | 'gap';
  value: number;
}
/**
 * Repères d'espacement d'un auto-layout : marges intérieures et écarts entre
 * enfants (bandes roses de Figma). Les écarts nuls ne sont pas montrés.
 */
export function spacingBands(
  box: Rect,
  padding: { top: number; right: number; bottom: number; left: number },
  children: Rect[],
  axis: 'horizontal' | 'vertical',
): Band[] {
  const out: Band[] = [];
  const add = (b: Band) =>
    b.w > 0.5 && b.h > 0.5 && out.push({ ...b, value: Math.round(b.value) });
  const { top, left } = padding;
  add({ kind: 'padding', x: box.x, y: box.y, w: box.w, h: top, value: top });
  add({
    kind: 'padding',
    x: box.x,
    y: bottom(box) - padding.bottom,
    w: box.w,
    h: padding.bottom,
    value: padding.bottom,
  });
  add({
    kind: 'padding',
    x: box.x,
    y: box.y + top,
    w: left,
    h: box.h - top - padding.bottom,
    value: left,
  });
  add({
    kind: 'padding',
    x: right(box) - padding.right,
    y: box.y + top,
    w: padding.right,
    h: box.h - top - padding.bottom,
    value: padding.right,
  });
  const sorted = [...children].sort((a, b) =>
    axis === 'vertical' ? a.y - b.y : a.x - b.x,
  );
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1];
    const b = sorted[i];
    if (axis === 'vertical' && b.y > bottom(a))
      add({
        kind: 'gap',
        x: box.x + left,
        y: bottom(a),
        w: box.w - left - padding.right,
        h: b.y - bottom(a),
        value: b.y - bottom(a),
      });
    // Même ligne seulement (un retour à la ligne n'est pas un écart).
    if (
      axis === 'horizontal' &&
      b.x > right(a) &&
      b.y < bottom(a) &&
      a.y < bottom(b)
    ) {
      const y = Math.min(a.y, b.y);
      add({
        kind: 'gap',
        x: right(a),
        y,
        w: b.x - right(a),
        h: Math.max(bottom(a), bottom(b)) - y,
        value: b.x - right(a),
      });
    }
  }
  return out;
}

/** Valeur commune à plusieurs calques, ou « mixte ». */
export const MIXED = Symbol('mixte');
export function common<T>(values: T[]): T | typeof MIXED {
  const [first, ...rest] = values;
  const key = JSON.stringify(first);
  return rest.every((v) => JSON.stringify(v) === key) ? first : MIXED;
}
