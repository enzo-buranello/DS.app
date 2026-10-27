import { z } from 'zod';
import { tokenKeys, type TokenKey } from './model.js';

// --- Export : arbre de nœuds produit par l'app, dessiné par le plugin. ---
export interface SceneFill {
  hex: string;
  opacity: number;
  token?: TokenKey;
}
export interface SceneText {
  characters: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  fontSizeToken?: TokenKey;
  lineHeight: number;
  letterSpacing: number;
  align: 'LEFT' | 'CENTER' | 'RIGHT';
  color: SceneFill;
  uppercase: boolean;
}
export interface SceneNode {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: SceneFill;
  stroke?: SceneFill & { weight: number };
  radius?: number;
  radiusToken?: TokenKey;
  layout?: {
    mode: 'HORIZONTAL' | 'VERTICAL';
    gap: number;
    gapToken?: TokenKey;
    padding: [number, number, number, number];
    paddingTokens: (TokenKey | undefined | null)[];
    primary: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
    counter: 'MIN' | 'CENTER' | 'MAX';
  };
  text?: SceneText;
  // Composant DS reconnu dans le rendu : devient composant ou instance dans Figma.
  component?: SceneComponent;
  children: SceneNode[];
}
export interface SceneComponent {
  key: string;
  name: string;
  set: string | null;
  variant: string | null;
}
export interface SceneScreen {
  name: string;
  width: number;
  root: SceneNode;
}
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const fill = z
  .object({
    hex,
    opacity: z.number().min(0).max(1),
    token: z.enum(tokenKeys as [TokenKey, ...TokenKey[]]).optional(),
  })
  .strict();
const tokenKey = z.enum(tokenKeys as [TokenKey, ...TokenKey[]]);
const coord = z.number().finite().min(-100_000).max(100_000);
const componentRef = z
  .object({
    key: z.string().max(200),
    name: z.string().max(200),
    set: z.string().max(200).nullable(),
    variant: z.string().max(400).nullable(),
  })
  .strict();
export const sceneNodeSchema: z.ZodType<SceneNode> = z.lazy(() =>
  z
    .object({
      name: z.string().max(200),
      x: coord,
      y: coord,
      w: coord,
      h: coord,
      fill: fill.optional(),
      stroke: fill.extend({ weight: z.number().min(0).max(100) }).optional(),
      radius: z.number().min(0).max(10_000).optional(),
      radiusToken: tokenKey.optional(),
      layout: z
        .object({
          mode: z.enum(['HORIZONTAL', 'VERTICAL']),
          gap: z.number().min(0).max(10_000),
          gapToken: tokenKey.optional(),
          padding: z.tuple([z.number(), z.number(), z.number(), z.number()]),
          paddingTokens: z.array(tokenKey.nullish()).max(4),
          primary: z.enum(['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN']),
          counter: z.enum(['MIN', 'CENTER', 'MAX']),
        })
        .strict()
        .optional(),
      text: z
        .object({
          characters: z.string().max(5000),
          fontFamily: z.string().max(100),
          fontWeight: z.number().min(100).max(1000),
          fontSize: z.number().min(1).max(1000),
          fontSizeToken: tokenKey.optional(),
          lineHeight: z.number().min(0).max(2000),
          letterSpacing: z.number().min(-100).max(100),
          align: z.enum(['LEFT', 'CENTER', 'RIGHT']),
          color: fill,
          uppercase: z.boolean(),
        })
        .strict()
        .optional(),
      component: componentRef.optional(),
      children: z.array(sceneNodeSchema).max(500),
    })
    .strict(),
);
// Export natif via le lien direct : définitions de composants et/ou écrans.
export const nativeExportSchema = z
  .object({
    pageId: z.string().max(80),
    kind: z.enum(['ds', 'preview']),
    definitions: z
      .array(componentRef.extend({ root: sceneNodeSchema }).strict())
      .max(250),
    screens: z
      .array(
        z
          .object({
            key: z.string().max(200),
            name: z.string().max(200),
            root: sceneNodeSchema,
          })
          .strict(),
      )
      .max(12),
  })
  .strict();
export type NativeExport = z.infer<typeof nativeExportSchema>;
export const exportSummarySchema = z
  .object({
    pageId: z.string().max(80),
    pageName: z.string().max(200),
    created: z.number().int().min(0),
    updated: z.number().int().min(0),
    components: z.number().int().min(0),
    sets: z.number().int().min(0),
    screens: z.number().int().min(0),
    variables: z.number().int().min(0),
    mismatched: z.array(z.string().max(200)).max(200),
    // Correspondances clé DS-Studio → id du nœud Figma, conservées côté app.
    nodes: z.record(z.string().max(200), z.string().max(80)),
  })
  .strict();
// Canal direct avec le plugin ouvert : il annonce le fichier et ses pages,
// reçoit des commandes et renvoie les résultats. Seul le fichier ouvert est visible.
export const liveInfoSchema = z
  .object({
    file: z
      .object({
        name: z.string().max(200),
        key: z.string().max(64).nullable(),
      })
      .strict(),
    pages: z
      .array(
        z
          .object({ id: z.string().max(80), name: z.string().max(200) })
          .strict(),
      )
      .max(500),
  })
  .strict();
export type LiveInfo = z.infer<typeof liveInfoSchema>;
