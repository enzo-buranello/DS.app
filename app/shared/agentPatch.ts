import { z } from 'zod';
import {
  propsSchema,
  statesSchema,
  type Doc,
  type DocNode,
  type Props,
  type States,
} from './doc.js';
import { resolvedAt, select, writeFacet, type Facet } from './edit.js';
import { walk, type RNode } from './render.js';

// Réponse de l'agent sur un élément sélectionné : des patchs de nœuds rendus,
// validés par les mêmes schémas que le document. Le périmètre (l'élément et
// ses descendants) est recalculé par le contrôleur, jamais pris de l'agent.
export const MAX_AGENT_NODES = 60;
export const nodePatchSchema = z
  .object({
    /** Clé rendue (data-ds-node) d'un nœud du périmètre. */
    key: z.string().min(1).max(400),
    props: propsSchema.optional(),
    states: statesSchema.optional(),
    characters: z.string().max(2000).optional(),
  })
  .strict();
export type NodePatch = z.infer<typeof nodePatchSchema>;
export const nodePatchesSchema = z.array(nodePatchSchema).max(MAX_AGENT_NODES);

export class ScopeError extends Error {}

/** Nœuds rendus du périmètre : l'élément puis ses descendants. */
export function agentScope(doc: Doc, key: string): RNode[] {
  const root = resolvedAt(doc, key);
  if (!root) return [];
  const out: RNode[] = [];
  walk(root, (r) => void out.push(r));
  return out;
}
/** Vue compacte transmise à l'agent (valeurs rendues, sans marqueurs). */
export function scopeContext(doc: Doc, key: string) {
  return agentScope(doc, key)
    .slice(0, MAX_AGENT_NODES)
    .map((r) => ({
      key: r.key,
      type: r.type,
      name: r.name,
      props: r.props,
      ...(r.states ? { states: r.states } : {}),
      ...(r.characters !== undefined ? { characters: r.characters } : {}),
    }));
}

// Fusion par groupe : un objet complète le groupe, une liste le remplace.
function mergeGroups<T extends Record<string, unknown>>(base: T, patch: T): T {
  const out: Record<string, unknown> = { ...base };
  for (const [g, v] of Object.entries(patch)) {
    const b = out[g];
    out[g] =
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      b &&
      typeof b === 'object' &&
      !Array.isArray(b)
        ? { ...b, ...v }
        : v;
  }
  return out as T;
}

/**
 * Nœuds modifiés par les patchs, tous dans le périmètre de `key` ; sinon
 * ScopeError et rien n'est produit. Plusieurs patchs d'une même instance
 * cumulent leurs overrides.
 */
export function applyAgentPatches(
  doc: Doc,
  key: string,
  patches: NodePatch[],
): DocNode[] {
  const scope = new Map(agentScope(doc, key).map((r) => [r.key, r]));
  for (const p of patches)
    if (!scope.has(p.key))
      throw new ScopeError(`« ${p.key} » est hors du périmètre.`);
  let current = doc;
  const out = new Map<string, DocNode>();
  for (const p of patches) {
    const s = select(current, p.key);
    if (!s) throw new ScopeError(`« ${p.key} » est introuvable.`);
    if (p.characters !== undefined && scope.get(p.key)!.type !== 'text')
      throw new ScopeError(`« ${p.key} » n’est pas un texte.`);
    const own: Facet = structuredClone(s.own);
    if (p.props)
      own.props = mergeGroups((own.props ?? {}) as Props, p.props as Props);
    if (p.states) {
      const states: States = { ...own.states };
      for (const [name, v] of Object.entries(p.states))
        states[name as keyof States] = mergeGroups(
          (states[name as keyof States] ?? {}) as Props,
          v as Props,
        );
      own.states = states;
    }
    if (p.characters !== undefined) own.characters = p.characters;
    for (const n of writeFacet(current, p.key, own)) {
      out.set(n.id, n);
      current = { ...current, nodes: { ...current.nodes, [n.id]: n } };
    }
  }
  return [...out.values()];
}
