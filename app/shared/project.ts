import { z } from 'zod';

// Fichier .studio/project.json : seule source de vérité du projet.
// Les styles ne contiennent que des identifiants de tokens, jamais de valeur.

export const PROJECT_VERSION = 1;

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/);
const name = z.string().trim().min(1).max(60);
const hex = z.string().regex(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i);
const px = z.number().finite().min(0).max(1000);

// --- Fondations ---
const color = z.object({ name, light: hex, dark: hex }).strict();
const font = z
  .object({
    name,
    family: z.string().min(1).max(80),
    size: px,
    weight: z.number().int().min(100).max(900),
    lineHeight: z.number().min(0.8).max(3),
  })
  .strict();
const length = z.object({ name, value: px }).strict();
const shadow = z
  .object({ name, x: z.number(), y: z.number(), blur: px, color: id })
  .strict();

export const foundationsSchema = z
  .object({
    colors: z.record(id, color),
    fonts: z.record(id, font),
    spacing: z.record(id, length),
    radius: z.record(id, length),
    shadows: z.record(id, shadow),
  })
  .strict();

// --- Éléments : flux uniquement, styles par format d'écran ---
export const breakpoints = ['desktop', 'tablet', 'mobile'] as const;
export type Breakpoint = (typeof breakpoints)[number];

export const styleSchema = z
  .object({
    direction: z.enum(['row', 'column']),
    gap: id,
    align: z.enum(['start', 'center', 'end', 'stretch']),
    justify: z.enum(['start', 'center', 'end', 'between']),
    width: z.enum(['hug', 'fill']),
    maxWidth: id,
    padding: id,
    background: id,
    color: id,
    border: id,
    radius: id,
    shadow: id,
    font: id,
    hidden: z.boolean(),
  })
  .partial()
  .strict();
export type Style = z.infer<typeof styleSchema>;

export type Node = {
  id: string;
  kind: 'box' | 'text' | 'image' | 'component' | 'list';
  name?: string;
  style?: Partial<Record<Breakpoint, Style>>;
  text?: string;
  src?: string;
  component?: string;
  bind?: { collection: string; field: string };
  children?: Node[];
};
export const nodeSchema: z.ZodType<Node> = z.lazy(() =>
  z
    .object({
      id,
      kind: z.enum(['box', 'text', 'image', 'component', 'list']),
      name: name.optional(),
      style: z.partialRecord(z.enum(breakpoints), styleSchema).optional(),
      text: z.string().max(5000).optional(),
      src: z.string().max(500).optional(),
      component: id.optional(),
      bind: z.object({ collection: id, field: id }).strict().optional(),
      children: z.array(nodeSchema).max(500).optional(),
    })
    .strict(),
);

export const componentStates = ['hover', 'active', 'disabled'] as const;
const componentSchema = z
  .object({
    name,
    root: nodeSchema,
    states: z
      .partialRecord(z.enum(componentStates), z.record(id, styleSchema))
      .default({}),
  })
  .strict();
const pageSchema = z.object({ name, root: nodeSchema }).strict();

// --- Contenus ---
export const fieldTypes = [
  'text',
  'longText',
  'image',
  'number',
  'date',
  'link',
  'boolean',
] as const;
const collectionSchema = z
  .object({
    name,
    fields: z.array(z.object({ id, name, type: z.enum(fieldTypes) }).strict()),
    items: z.array(
      z
        .object({
          id,
          values: z.record(id, z.union([z.string(), z.number(), z.boolean()])),
        })
        .strict(),
    ),
  })
  .strict();

export const targets = ['react', 'next', 'html', 'swiftui'] as const;

export const projectSchema = z
  .object({
    version: z.literal(PROJECT_VERSION),
    name,
    updatedAt: z.string().datetime(),
    targets: z.array(z.enum(targets)).default([]),
    foundations: foundationsSchema,
    components: z.record(id, componentSchema),
    pages: z.record(id, pageSchema),
    collections: z.record(id, collectionSchema),
    figma: z
      .object({ fileKey: z.string(), importedAt: z.string().datetime() })
      .strict()
      .optional(),
  })
  .strict();
export type Project = z.infer<typeof projectSchema>;
export type Foundations = Project['foundations'];
export type FoundationKind = keyof Foundations;
export type Component = Project['components'][string];

// Ce que l'agent Design renvoie : le design system complet.
export const designSchema = z
  .object({
    foundations: foundationsSchema,
    components: z.record(id, componentSchema),
  })
  .strict();
export type Design = z.infer<typeof designSchema>;

// Chaque propriété de style pointe vers une famille de fondations.
export const styleKinds: Partial<Record<keyof Style, FoundationKind>> = {
  gap: 'spacing',
  padding: 'spacing',
  maxWidth: 'spacing',
  background: 'colors',
  color: 'colors',
  border: 'colors',
  radius: 'radius',
  shadow: 'shadows',
  font: 'fonts',
};

const walk = (node: Node, fn: (n: Node) => void) => {
  fn(node);
  node.children?.forEach((c) => walk(c, fn));
};
const styles = (node: Node) => Object.values(node.style ?? {});

/** Références (fondation ou composant) utilisées par le projet, « famille:id ». */
export function references(
  p: Pick<Project, 'components' | 'pages'> & { foundations: Foundations },
) {
  const used = new Set<string>();
  const add = (style: Style) => {
    for (const [k, v] of Object.entries(style)) {
      const kind = styleKinds[k as keyof Style];
      if (kind && typeof v === 'string') used.add(`${kind}:${v}`);
    }
  };
  for (const s of Object.values(p.foundations.shadows))
    used.add(`colors:${s.color}`);
  const roots = [
    ...Object.values(p.components).map((c) => {
      Object.values(c.states).forEach((patches) =>
        Object.values(patches ?? {}).forEach(add),
      );
      return c.root;
    }),
    ...Object.values(p.pages).map((pg) => pg.root),
  ];
  for (const root of roots)
    walk(root, (n) => {
      styles(n).forEach((s) => s && add(s));
      if (n.component) used.add(`components:${n.component}`);
    });
  return used;
}

/** Références vers des fondations ou composants absents. */
export function brokenReferences(p: Parameters<typeof references>[0]) {
  return [...references(p)].filter((ref) => {
    const [kind, key] = ref.split(':') as [
      FoundationKind | 'components',
      string,
    ];
    return !(kind === 'components' ? p.components : p.foundations[kind])[key];
  });
}

export function slug(text: string, taken: object) {
  const base =
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'element';
  let out = base;
  for (let i = 2; out in taken; i++) out = `${base}-${i}`;
  return out;
}

export const emptyProject = (projectName: string): Project => ({
  version: PROJECT_VERSION,
  name: name.parse(projectName),
  updatedAt: new Date().toISOString(),
  targets: [],
  foundations: { colors: {}, fonts: {}, spacing: {}, radius: {}, shadows: {} },
  components: {},
  pages: {},
  collections: {},
});

// Entrée de la liste des projets récents (conservée hors des projets).
export type ProjectEntry = { path: string; name: string; updatedAt: string };
