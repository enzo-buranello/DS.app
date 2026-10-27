import { z } from 'zod';

// Payload d'export vers Figma, partagé par l'app (qui le produit) et par le
// plugin (compilé depuis figma-plugin/src, qui le valide avant d'écrire).
// Les valeurs liées à un token portent la clé du token (ex. « color.brand ») :
// le plugin les relie à la variable Figma correspondante, jamais en dur.
export const EXPORT_VERSION = 1;
export const COLLECTION_NAME = 'DS-Studio';
export const PLUGIN_DATA_KEY = 'dsStudioId';
export const EXPORT_TIMEOUT_MS = 120_000;
export const CHUNK_SIZE = 256 * 1024;

const finite = z.number().finite();
const px = z.number().finite().min(-100_000).max(100_000);
const tokenKey = z
  .string()
  .regex(/^[a-z]+\.[A-Za-z]+$/)
  .max(60);
const id = z.string().min(1).max(200);

export const paintSchema = z
  .object({
    hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    opacity: z.number().min(0).max(1),
    variable: tokenKey.optional(),
  })
  .strict();
export type Paint = z.infer<typeof paintSchema>;
const sizing = z.enum(['FIXED', 'HUG', 'FILL']);
export const shadowSchema = z
  .object({
    x: finite,
    y: finite,
    blur: z.number().min(0).max(1000),
    spread: finite,
    color: paintSchema,
  })
  .strict();

export const sceneTextSchema = z
  .object({
    characters: z.string().max(10_000),
    fontFamily: z.string().max(100),
    fontWeight: z.number().int().min(100).max(1000),
    fontSize: z.number().min(1).max(1000),
    fontSizeVariable: tokenKey.optional(),
    lineHeight: z.number().min(0).max(2000),
    letterSpacing: z.number().min(-100).max(100),
    align: z.enum(['LEFT', 'CENTER', 'RIGHT']),
    color: paintSchema,
    /** Style de texte Figma à appliquer (id DS-Studio du style). */
    style: id.optional(),
  })
  .strict();

export interface SceneNode {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Comment ce nœud se dimensionne dans un parent en auto layout. */
  sizingH: 'FIXED' | 'HUG' | 'FILL';
  sizingV: 'FIXED' | 'HUG' | 'FILL';
  fill?: Paint;
  stroke?: Paint & { weight: number };
  radius?: [number, number, number, number];
  radiusVariables?: (string | null)[];
  shadow?: z.infer<typeof shadowSchema> & { style?: string };
  layout?: {
    direction: 'HORIZONTAL' | 'VERTICAL';
    gap: number;
    gapVariable?: string;
    padding: [number, number, number, number];
    paddingVariables: (string | null)[];
    primary: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
    counter: 'MIN' | 'CENTER' | 'MAX';
  };
  text?: z.infer<typeof sceneTextSchema>;
  /** Composant DS reconnu : dans un écran, il devient une instance. */
  instanceOf?: string;
  children: SceneNode[];
}
export const sceneNodeSchema: z.ZodType<SceneNode> = z.lazy(() =>
  z
    .object({
      name: z.string().max(200),
      x: px,
      y: px,
      w: px,
      h: px,
      sizingH: sizing,
      sizingV: sizing,
      fill: paintSchema.optional(),
      stroke: paintSchema
        .extend({ weight: z.number().min(0).max(100) })
        .optional(),
      radius: z.tuple([finite, finite, finite, finite]).optional(),
      radiusVariables: z.array(tokenKey.nullable()).max(4).optional(),
      shadow: shadowSchema.extend({ style: id.optional() }).optional(),
      layout: z
        .object({
          direction: z.enum(['HORIZONTAL', 'VERTICAL']),
          gap: z.number().min(0).max(10_000),
          gapVariable: tokenKey.optional(),
          padding: z.tuple([finite, finite, finite, finite]),
          paddingVariables: z.array(tokenKey.nullable()).max(4),
          primary: z.enum(['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN']),
          counter: z.enum(['MIN', 'CENTER', 'MAX']),
        })
        .strict()
        .optional(),
      text: sceneTextSchema.optional(),
      instanceOf: id.optional(),
      children: z.array(sceneNodeSchema).max(1000),
    })
    .strict(),
);

export const variableSchema = z
  .object({
    token: tokenKey,
    /** Nom Figma : « color/brand ». */
    name: z.string().max(100),
    type: z.enum(['COLOR', 'FLOAT', 'STRING']),
    value: z.union([z.string().max(200), finite]),
    category: z.enum(['color', 'space', 'radius', 'typography']),
  })
  .strict();
export const textStyleSchema = z
  .object({
    id,
    name: z.string().max(200),
    fontFamily: z.string().max(100),
    fontFamilyVariable: tokenKey.optional(),
    fontWeight: z.number().int().min(100).max(1000),
    fontSize: z.number().min(1).max(1000),
    fontSizeVariable: tokenKey.optional(),
    lineHeight: z.number().min(0).max(2000),
    letterSpacing: z.number().min(-100).max(100),
    sample: z.string().max(200),
  })
  .strict();
export const effectStyleSchema = z
  .object({ id, name: z.string().max(200), shadow: shadowSchema })
  .strict();
export const componentDefSchema = z
  .object({
    id,
    name: z.string().max(200),
    /** Component set (ex. « Button ») et variante au format Figma « Prop=Val, … ». */
    set: z.string().max(200).nullable(),
    variant: z.string().max(400).nullable(),
    root: sceneNodeSchema,
  })
  .strict();
export const pageTargetSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('current') }).strict(),
  z.object({ mode: z.literal('existing'), id: z.string().max(80) }).strict(),
  z
    .object({ mode: z.literal('new'), name: z.string().trim().min(1).max(200) })
    .strict(),
]);
export type PageTarget = z.infer<typeof pageTargetSchema>;
const base = {
  version: z.literal(EXPORT_VERSION),
  page: pageTargetSchema,
  variables: z.array(variableSchema).max(500),
  textStyles: z.array(textStyleSchema).max(200),
  effectStyles: z.array(effectStyleSchema).max(100),
  components: z.array(componentDefSchema).max(300),
};
export const exportPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('design_system'), ...base }).strict(),
  z
    .object({
      kind: z.literal('preview'),
      ...base,
      screen: z
        .object({ id, name: z.string().max(200), root: sceneNodeSchema })
        .strict(),
    })
    .strict(),
]);
export type ExportPayload = z.infer<typeof exportPayloadSchema>;
export type ExportKind = ExportPayload['kind'];

export const exportResultSchema = z
  .object({
    pageId: z.string().max(80),
    pageName: z.string().max(200),
    created: z.number().int().min(0),
    updated: z.number().int().min(0),
    warnings: z.array(z.string().max(500)).max(200),
    /** Éléments DS-Studio présents dans Figma mais absents de l'app : signalés, jamais supprimés. */
    orphans: z
      .array(z.object({ id: z.string(), name: z.string() }).strict())
      .max(500),
  })
  .strict();
export type ExportResult = z.infer<typeof exportResultSchema>;
export interface ExportProgress {
  done: number;
  total: number;
  label: string;
}
