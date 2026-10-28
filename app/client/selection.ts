import type { Doc } from '../shared/doc.js';
import type { OverrideField } from '../shared/edits.js';
import { legacyFields } from '../shared/legacy.js';

// Élément sélectionnable, retrouvé par ses marqueurs data-ds-* (jamais par
// une position) : il survit aux re-rendus et aux changements de valeur.
export interface Selection {
  /** « token:<clé> », sinon la clé rendue du nœud (data-ds-node). */
  key: string;
  kind: 'token' | 'master' | 'instance' | 'node';
  /** Clé du token ou clé rendue du nœud. */
  id: string;
  name: string;
  text: string | null;
}
export const SELECTOR = '[data-ds-token],[data-ds-node]';

const variantLabel = (variant: string | null) =>
  variant ? (variant.split(',')[0].split('=')[1] ?? variant) : null;

export function describe(el: Element): Selection | null {
  const token = el.getAttribute('data-ds-token');
  if (token)
    return {
      key: `token:${token}`,
      kind: 'token',
      id: token,
      name: token,
      text: null,
    };
  const key = el.getAttribute('data-ds-node');
  if (!key) return null;
  const text = el.textContent?.trim() ?? null;
  const layer = el.getAttribute('data-ds-layer') ?? key;
  // Racine de composant ou d'instance : « Button · Secondaire ».
  const own = el.getAttribute('data-ds-id');
  const owner = own ? el : el.parentElement?.closest('[data-ds-id]');
  const base = owner?.getAttribute('data-ds-name') ?? layer;
  const variant = variantLabel(owner?.getAttribute('data-ds-variant') ?? null);
  const ownerName = variant ? `${base} · ${variant}` : base;
  const name = own ? ownerName : owner ? `${ownerName} › ${layer}` : layer;
  const inInstance =
    key.includes('>') || el.getAttribute('data-ds-inst') === key;
  const inMaster = !!el.closest('[data-ds-id]:not([data-ds-inst])');
  return {
    key,
    kind: inInstance ? 'instance' : inMaster ? 'master' : 'node',
    id: key,
    name,
    text,
  };
}
export function fieldsOf(doc: Doc, s: Selection): OverrideField[] {
  if (s.kind === 'token') return [];
  return legacyFields(doc, s.key);
}
export const canEditText = (doc: Doc, s: Selection) =>
  fieldsOf(doc, s).includes('label');

// Ancêtres sélectionnables, du plus externe au plus proche.
export function chainOf(el: Element, root: Element): Element[] {
  const chain: Element[] = [];
  let p = el.parentElement?.closest(SELECTOR);
  while (p && root.contains(p)) {
    chain.unshift(p);
    p = p.parentElement?.closest(SELECTOR);
  }
  return chain;
}
// Pile d'éléments sous le point, du plus externe au plus profond.
export function stackAt(root: Element, x: number, y: number): Element[] {
  let best: Element[] = [];
  for (const el of root.querySelectorAll(SELECTOR)) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    if (el.closest('[data-ds-locked]')) continue;
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
    const chain = [...chainOf(el, root), el];
    if (chain.length > best.length) best = chain;
  }
  return best;
}
export function findByKey(root: Element, key: string): Element | null {
  const value = CSS.escape(key.startsWith('token:') ? key.slice(6) : key);
  return root.querySelector(
    key.startsWith('token:')
      ? `[data-ds-token="${value}"]`
      : `[data-ds-node="${value}"]`,
  );
}
// Clic : même niveau que la sélection courante si on reste dans son parent ;
// sinon le composant ou l'instance le plus externe, à défaut l'enfant direct
// de l'écran (comme Figma). Cmd+clic : l'élément le plus profond. On descend
// ensuite par double-clic et on remonte par Échap.
export function pick(
  stack: Element[],
  selected: Element | null,
  root: Element,
  deep = false,
) {
  if (!stack.length) return null;
  if (deep) return stack.at(-1)!;
  const parent = selected ? chainOf(selected, root).at(-1) : undefined;
  const i = parent ? stack.indexOf(parent) : -1;
  if (i >= 0) return stack[i + 1] ?? stack[i];
  return (
    stack.find((el) => el.hasAttribute('data-ds-id')) ?? stack[1] ?? stack[0]
  );
}
