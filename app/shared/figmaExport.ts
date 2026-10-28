import { z } from 'zod';

// Payload d'export vers Figma, partagé par l'app (qui le produit) et par le
// plugin (compilé depuis figma-plugin/src, qui le valide avant d'écrire).
// Les valeurs liées à un token portent la clé du token (ex. « color.brand ») :
// le plugin les relie à la variable Figma correspondante, jamais en dur.
export const EXPORT_VERSION = 2;
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
const unit = z.number().min(0).max(1);

// Version 2 : construit depuis le document de nœuds (et non plus lu sur le
// DOM). Chaque propriété correspond à une propriété native de Figma.
/** Couleur simple (texte, contour, ombre) : liée à une variable si token. */
export const paintSchema = z
  .object({
    hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    opacity: unit,
    variable: tokenKey.optional(),
  })
  .strict();
export type Paint = z.infer<typeof paintSchema>;
const stopSchema = paintSchema.extend({ position: unit });
/** Fond empilé : couleur, dégradé ou image (comme la liste Fill de Figma). */
export const fillSchema = z.discriminatedUnion('type', [
  paintSchema.extend({ type: z.literal('SOLID'), visible: z.boolean() }),
  z
    .object({
      type: z.literal('GRADIENT_LINEAR'),
      /** Angle CSS (0 = vers le haut, 90 = vers la droite). */
      angle: finite,
      stops: z.array(stopSchema).min(2).max(8),
      opacity: unit,
      visible: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('GRADIENT_RADIAL'),
      stops: z.array(stopSchema).min(2).max(8),
      opacity: unit,
      visible: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal('IMAGE'),
      asset: z.string().regex(/^[a-f0-9]{16,64}\.(png|jpe?g|webp)$/),
      scaleMode: z.enum(['FILL', 'FIT', 'TILE']),
      opacity: unit,
      visible: z.boolean(),
    })
    .strict(),
]);
export type Fill = z.infer<typeof fillSchema>;
export const strokeSchema = z
  .object({
    paint: paintSchema,
    /** Épaisseur uniforme ou par côté (haut, droite, bas, gauche). */
    weight: z.union([
      z.number().min(0).max(100),
      z.tuple([finite, finite, finite, finite]),
    ]),
    align: z.enum(['INSIDE', 'CENTER', 'OUTSIDE']),
    dash: z.array(z.number().min(0).max(1000)).max(4),
    visible: z.boolean(),
  })
  .strict();
export const effectSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.enum(['DROP_SHADOW', 'INNER_SHADOW']),
      x: finite,
      y: finite,
      blur: z.number().min(0).max(1000),
      spread: finite,
      color: paintSchema,
      visible: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.enum(['LAYER_BLUR', 'BACKGROUND_BLUR']),
      radius: z.number().min(0).max(1000),
      visible: z.boolean(),
    })
    .strict(),
]);
export type Effect = z.infer<typeof effectSchema>;
const lineHeightSchema = z.discriminatedUnion('unit', [
  z.object({ unit: z.literal('AUTO') }).strict(),
  z
    .object({ unit: z.literal('PIXELS'), value: z.number().min(0).max(2000) })
    .strict(),
  z
    .object({ unit: z.literal('PERCENT'), value: z.number().min(0).max(1000) })
    .strict(),
]);
export type LineHeight = z.infer<typeof lineHeightSchema>;

export const sceneTextSchema = z
  .object({
    characters: z.string().max(10_000),
    fontFamily: z.string().max(100),
    fontFamilyVariable: tokenKey.optional(),
    fontWeight: z.number().int().min(100).max(1000),
    fontSize: z.number().min(1).max(1000),
    fontSizeVariable: tokenKey.optional(),
    lineHeight: lineHeightSchema,
    letterSpacing: z.number().min(-100).max(100),
    align: z.enum(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED']),
    valign: z.enum(['TOP', 'CENTER', 'BOTTOM']),
    textCase: z.enum(['ORIGINAL', 'UPPER', 'LOWER', 'TITLE']),
    decoration: z.enum(['NONE', 'UNDERLINE', 'STRIKETHROUGH']),
    autoResize: z.enum(['WIDTH_AND_HEIGHT', 'HEIGHT', 'NONE', 'TRUNCATE']),
    maxLines: z.number().int().min(1).max(50).nullable(),
    color: paintSchema,
    /** Style de texte Figma à appliquer (id DS-Studio du style). */
    style: id.optional(),
  })
  .strict();
const sizing = z.enum(['FIXED', 'HUG', 'FILL']);
const constraint = z.enum(['MIN', 'MAX', 'CENTER', 'STRETCH']);
const blend = z.enum([
  'NORMAL',
  'MULTIPLY',
  'SCREEN',
  'OVERLAY',
  'DARKEN',
  'LIGHTEN',
  'COLOR_DODGE',
  'COLOR_BURN',
  'HARD_LIGHT',
  'SOFT_LIGHT',
  'DIFFERENCE',
  'EXCLUSION',
  'HUE',
  'SATURATION',
  'COLOR',
  'LUMINOSITY',
]);
const layoutSchema = z
  .object({
    direction: z.enum(['HORIZONTAL', 'VERTICAL']),
    wrap: z.boolean(),
    gap: z.number().min(0).max(10_000),
    gapVariable: tokenKey.optional(),
    /** Écart entre lignes (retour à la ligne). */
    counterGap: z.number().min(0).max(10_000).optional(),
    counterGapVariable: tokenKey.optional(),
    padding: z.tuple([finite, finite, finite, finite]),
    paddingVariables: z.array(tokenKey.nullable()).max(4),
    primary: z.enum(['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN']),
    counter: z.enum(['MIN', 'CENTER', 'MAX', 'BASELINE']),
    /** Le premier enfant passe devant (« Canvas stacking » de Figma). */
    reverseZ: z.boolean(),
  })
  .strict();
const propValue = z.union([z.string().max(200), z.boolean()]);

export interface SceneNode {
  /** Clé DS-Studio du calque rendu (data-ds-node). */
  key?: string;
  kind?: 'FRAME' | 'RECTANGLE' | 'TEXT' | 'VECTOR';
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Comment ce nœud se dimensionne dans un parent en auto layout. */
  sizingH: 'FIXED' | 'HUG' | 'FILL';
  sizingV: 'FIXED' | 'HUG' | 'FILL';
  minW?: number;
  maxW?: number;
  minH?: number;
  maxH?: number;
  visible?: boolean;
  locked?: boolean;
  opacity?: number;
  blendMode?: z.infer<typeof blend>;
  clip?: boolean;
  /** Degrés, sens Figma (antihoraire). */
  rotation?: number;
  /** Position absolue dans un auto layout, avec ses contraintes. */
  absolute?: { h: z.infer<typeof constraint>; v: z.infer<typeof constraint> };
  fills?: Fill[];
  strokes?: z.infer<typeof strokeSchema>[];
  effects?: Effect[];
  effectStyle?: string;
  radius?: [number, number, number, number];
  radiusVariables?: (string | null)[];
  cornerSmoothing?: number;
  layout?: z.infer<typeof layoutSchema>;
  text?: z.infer<typeof sceneTextSchema>;
  /** SVG du vecteur importé (balises et attributs déjà validés). */
  svg?: string;
  /** Composant DS : dans un écran ou un autre composant, une instance. */
  instanceOf?: string;
  /** Override d'instance : ses valeurs priment sur le composant. */
  overridden?: boolean;
  /** Instance : valeurs des propriétés de composant (échange = id). */
  propValues?: Record<string, string | boolean>;
  /** Calque d'un composant lié à une de ses propriétés. */
  refs?: { characters?: string; visible?: string; mainComponent?: string };
  children: SceneNode[];
}
export const sceneNodeSchema: z.ZodType<SceneNode> = z.lazy(() =>
  z
    .object({
      key: z.string().max(400).optional(),
      kind: z.enum(['FRAME', 'RECTANGLE', 'TEXT', 'VECTOR']).optional(),
      name: z.string().max(200),
      x: px,
      y: px,
      w: px,
      h: px,
      sizingH: sizing,
      sizingV: sizing,
      minW: px.optional(),
      maxW: px.optional(),
      minH: px.optional(),
      maxH: px.optional(),
      visible: z.boolean().optional(),
      locked: z.boolean().optional(),
      opacity: unit.optional(),
      blendMode: blend.optional(),
      clip: z.boolean().optional(),
      rotation: z.number().min(-360).max(360).optional(),
      absolute: z.object({ h: constraint, v: constraint }).strict().optional(),
      fills: z.array(fillSchema).max(8).optional(),
      strokes: z.array(strokeSchema).max(4).optional(),
      effects: z.array(effectSchema).max(8).optional(),
      effectStyle: id.optional(),
      radius: z.tuple([finite, finite, finite, finite]).optional(),
      radiusVariables: z.array(tokenKey.nullable()).max(4).optional(),
      cornerSmoothing: unit.optional(),
      layout: layoutSchema.optional(),
      text: sceneTextSchema.optional(),
      svg: z.string().max(200_000).optional(),
      instanceOf: id.optional(),
      overridden: z.boolean().optional(),
      propValues: z.record(z.string().max(60), propValue).optional(),
      refs: z
        .object({
          characters: z.string().max(60),
          visible: z.string().max(60),
          mainComponent: z.string().max(60),
        })
        .partial()
        .strict()
        .optional(),
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
    lineHeight: lineHeightSchema,
    letterSpacing: z.number().min(-100).max(100),
    sample: z.string().max(200),
  })
  .strict();
export const effectStyleSchema = z
  .object({
    id,
    name: z.string().max(200),
    effects: z.array(effectSchema).min(1).max(8),
  })
  .strict();
export const componentPropertySchema = z
  .object({
    name: z.string().max(60),
    type: z.enum(['TEXT', 'BOOLEAN', 'INSTANCE_SWAP']),
    /** Échange d'instance : id DS-Studio du composant par défaut. */
    default: propValue,
  })
  .strict();
export const componentDefSchema = z
  .object({
    id,
    name: z.string().max(200),
    /** Component set (ex. « Button ») et variante au format Figma « Prop=Val, … ». */
    set: z.string().max(200).nullable(),
    variant: z.string().max(400).nullable(),
    /** Propriétés de composant (portées par le set s'il existe). */
    properties: z.array(componentPropertySchema).max(50),
    root: sceneNodeSchema,
  })
  .strict();
/** Images de fond utilisées (base64), envoyées une fois par export. */
export const imageSchema = z
  .object({
    asset: z.string().regex(/^[a-f0-9]{16,64}\.(png|jpe?g|webp)$/),
    data: z.string().max(3_000_000),
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
  images: z.array(imageSchema).max(40),
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
    /** Ids DS-Studio des éléments créés par cet export (les autres ont été mis à jour). */
    createdIds: z.array(z.string().max(200)).max(1000),
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
