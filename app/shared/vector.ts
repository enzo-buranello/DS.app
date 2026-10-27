import { z } from 'zod';

// Calque vectoriel issu d'un SVG importé. Stocké comme arbre d'éléments et
// d'attributs autorisés, puis rendu par React : aucun balisage brut, aucun
// script, lien, style ou objet étranger ne peut passer.
export const vectorTags = [
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
] as const;
export const vectorAttributes = [
  'd',
  'x',
  'y',
  'width',
  'height',
  'rx',
  'ry',
  'cx',
  'cy',
  'r',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'fill-rule',
  'clip-rule',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'transform',
] as const;
export type VectorAttribute = (typeof vectorAttributes)[number];
// Chiffres, lettres de commandes de tracé, couleurs #hex, mots-clés : pas de « : » ni de « / ».
const safeValue = z
  .string()
  .max(20_000)
  .regex(/^[-0-9a-zA-Z.,#%()\s]*$/)
  .refine((v) => !/url\s*\(|expression|javascript/i.test(v), 'Valeur refusée.');

export interface VectorNode {
  tag: (typeof vectorTags)[number];
  attrs: Partial<Record<VectorAttribute, string>>;
  children: VectorNode[];
}
export const vectorNodeSchema: z.ZodType<VectorNode> = z.lazy(() =>
  z
    .object({
      tag: z.enum(vectorTags),
      attrs: z.partialRecord(z.enum(vectorAttributes), safeValue),
      children: z.array(vectorNodeSchema).max(200),
    })
    .strict(),
);
const count = (nodes: VectorNode[]): number =>
  nodes.reduce((n, node) => n + 1 + count(node.children), 0);
export const vectorSchema = z
  .object({
    viewBox: z
      .string()
      .max(100)
      .regex(/^-?[\d.]+(\s+-?[\d.]+){3}$/),
    width: z.number().min(1).max(4000),
    height: z.number().min(1).max(4000),
    nodes: z.array(vectorNodeSchema).max(500),
  })
  .strict()
  .refine(
    (v) => count(v.nodes) <= 2000,
    'SVG trop complexe (2000 éléments maximum).',
  );
export type Vector = z.infer<typeof vectorSchema>;
