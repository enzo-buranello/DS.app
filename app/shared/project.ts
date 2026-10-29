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
  })
  .strict();
export type Project = z.infer<typeof projectSchema>;

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
