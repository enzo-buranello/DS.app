import { createElement, useMemo, type ReactNode } from 'react';
import type { Doc, Interaction } from '../shared/doc.js';
import { BASE_RULES, nodeRules } from '../shared/nodeCss.js';
import {
  renderTree,
  walk,
  type RNode,
  type Runtime,
} from '../shared/render.js';
import type { Vector, VectorNode } from '../shared/vector.js';

// Rendu d'un arbre du document : une feuille de style (règles par nœud, états
// compris) et des éléments HTML sans style inline. Les interactions ne
// s'exécutent qu'en mode Test (en Édition, l'aperçu bloque les évènements).
/** État montré sur un élément pendant qu'on l'édite (inspecteur). */
export interface PreviewState {
  key: string;
  state: string;
}
export interface Behaviour {
  runtime: Runtime;
  /** Change la variante d'une instance rendue (composant interactif). */
  setVariant: (instance: string, variant: Record<string, string>) => void;
  navigate: (screen: string) => void;
  back: () => void;
}
const camel = (name: string) =>
  name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
function vectorElement(node: VectorNode, key: number): ReactNode {
  return createElement(
    node.tag,
    {
      key,
      ...Object.fromEntries(
        Object.entries(node.attrs).map(([k, v]) => [camel(k), v]),
      ),
    },
    node.children.map(vectorElement),
  );
}
export function VectorView({ vector }: { vector: Vector }) {
  return (
    <svg
      viewBox={vector.viewBox}
      width={vector.width}
      height={vector.height}
      aria-hidden="true"
      style={{ flex: 'none' }}
    >
      {vector.nodes.map(vectorElement)}
    </svg>
  );
}

export function treeCss(tree: RNode): string {
  const rules: string[] = [];
  walk(tree, (r) =>
    rules.push(
      nodeRules(r.key, r.props, r.states, {
        type: r.type,
        parent: r.parentProps,
      }),
    ),
  );
  return rules.join('\n');
}

export function NodeTree({
  doc,
  root,
  behaviour,
  preview,
}: {
  doc: Doc;
  root: string;
  behaviour?: Behaviour;
  preview?: PreviewState | null;
}) {
  const runtime = behaviour?.runtime;
  const tree = useMemo(
    () => renderTree(doc, root, runtime),
    [doc, root, runtime],
  );
  const css = useMemo(() => (tree ? treeCss(tree) : ''), [tree]);
  if (!tree) return null;
  return (
    <>
      <style>{`${BASE_RULES}\n${css}`}</style>
      <Element
        r={tree}
        chain={[]}
        doc={doc}
        behaviour={behaviour}
        preview={preview ?? null}
      />
    </>
  );
}

// Instance à modifier pour « change-to » : la plus proche dont le component
// set connaît toutes les propriétés demandées (comme dans Figma).
function variantTarget(
  doc: Doc,
  chain: RNode[],
  variant: Record<string, string>,
) {
  for (let i = chain.length - 1; i >= 0; i--) {
    const r = chain[i];
    if (r.type !== 'instance') continue;
    const c = doc.nodes[r.marks['data-ds-id']];
    if (c?.variant && Object.keys(variant).every((k) => k in c.variant!))
      return r.key;
  }
  return null;
}
function run(
  doc: Doc,
  list: Interaction[],
  trigger: Interaction['trigger'],
  chain: RNode[],
  b: Behaviour | undefined,
) {
  if (!b) return;
  for (const i of list) {
    if (i.trigger !== trigger) continue;
    const a = i.action;
    if (a.type === 'navigate') b.navigate(a.screen);
    else if (a.type === 'back') b.back();
    else {
      const target = variantTarget(doc, chain, a.variant);
      if (target) b.setVariant(target, a.variant);
    }
  }
}

// Clé React par nom de calque : d'une variante à l'autre, les calques de même
// nom sont conservés (un champ saisi garde sa valeur, comme le smart animate).
function childKeys(children: RNode[]) {
  const seen = new Map<string, number>();
  return children.map((c) => {
    const n = seen.get(c.name) ?? 0;
    seen.set(c.name, n + 1);
    return `${c.name}#${n}`;
  });
}

function Element({
  r,
  chain,
  doc,
  behaviour,
  preview,
}: {
  r: RNode;
  chain: RNode[];
  doc: Doc;
  behaviour?: Behaviour;
  preview: PreviewState | null;
}) {
  const sem = r.semantics;
  const here = [...chain, r];
  const attrs: Record<string, unknown> = {
    'data-ds-node': r.key,
    'data-ds-layer': r.name,
    ...r.marks,
    ...(sem.className ? { className: sem.className } : {}),
    ...(sem.role ? { role: sem.role } : {}),
    ...(sem.ariaLabel ? { 'aria-label': sem.ariaLabel } : {}),
    ...(sem.ariaLive ? { 'aria-live': sem.ariaLive } : {}),
    ...(sem.ariaCurrent ? { 'aria-current': sem.ariaCurrent } : {}),
    ...(sem.ariaHidden ? { 'aria-hidden': 'true' } : {}),
    ...(preview?.key === r.key ? { 'data-ds-preview': preview.state } : {}),
    // Verrouillé : ignoré par la sélection du canevas (comme Figma).
    ...(r.props.layer?.locked ? { 'data-ds-locked': '' } : {}),
  };
  const clicks = r.interactions.some((i) => i.trigger === 'click');
  if (clicks)
    attrs.onClick = (e: React.MouseEvent) => {
      // L'interaction la plus profonde gagne (bouton dans une carte cliquable).
      e.stopPropagation();
      run(doc, r.interactions, 'click', here, behaviour);
    };
  if (r.type === 'field') {
    const f = r.field ?? {};
    return createElement('input', {
      ...attrs,
      type: f.input ?? 'text',
      placeholder: f.placeholder,
      required: f.required,
      disabled: f.disabled,
    });
  }
  let tag: string = sem.tag ?? (r.type === 'text' ? 'span' : 'div');
  if (tag === 'button') {
    attrs.type = sem.buttonType ?? 'button';
    if (sem.disabled) attrs.disabled = true;
  }
  if (tag === 'form')
    attrs.onSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      run(doc, r.interactions, 'submit', here, behaviour);
    };
  if (r.type === 'vector' && r.vector) {
    tag = 'span';
    return createElement(
      tag,
      attrs,
      <VectorView vector={r.vector as Vector} />,
    );
  }
  const keys = childKeys(r.children);
  return createElement(
    tag,
    attrs,
    r.characters,
    ...r.children.map((c, i) => (
      <Element
        key={keys[i]}
        r={c}
        chain={here}
        doc={doc}
        behaviour={behaviour}
        preview={preview}
      />
    )),
  );
}
