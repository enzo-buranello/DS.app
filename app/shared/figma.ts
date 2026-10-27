import { z } from 'zod';
import { tokenKeys, type TokenKey, type Tokens } from './model.js';

// Données envoyées par le plugin Figma. Tout est non fiable : bornes strictes.
const name = z.string().trim().min(1).max(200);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const variableBase = { name, collection: z.string().max(200) };
export const figmaVariableSchema = z.discriminatedUnion('type', [
  z.object({ ...variableBase, type: z.literal('COLOR'), value: hex }).strict(),
  z
    .object({
      ...variableBase,
      type: z.literal('FLOAT'),
      value: z.number().finite(),
    })
    .strict(),
  z
    .object({
      ...variableBase,
      type: z.literal('STRING'),
      value: z.string().max(200),
    })
    .strict(),
]);
export const figmaPaintStyleSchema = z.object({ name, hex }).strict();
export const figmaTextStyleSchema = z
  .object({
    name,
    fontFamily: z.string().max(100),
    fontStyle: z.string().max(100),
    fontSize: z.number().finite().min(0).max(1000),
  })
  .strict();
export const figmaImageSchema = z
  .object({
    name,
    width: z.number().finite().min(0).max(20_000),
    height: z.number().finite().min(0).max(20_000),
    // PNG en base64, 3 Mo max par image.
    png: z
      .string()
      .max(4_000_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export const figmaImportSchema = z
  .object({
    fileName: z.string().max(200),
    variables: z.array(figmaVariableSchema).max(2000),
    paintStyles: z.array(figmaPaintStyleSchema).max(1000),
    textStyles: z.array(figmaTextStyleSchema).max(500),
    images: z.array(figmaImageSchema).max(12),
  })
  .strict();
export type FigmaImport = z.infer<typeof figmaImportSchema>;

// Ce que le serveur conserve (images sur disque, référencées par un id serveur).
export interface StoredImport extends Omit<FigmaImport, 'images'> {
  date: string;
  images: { id: string; name: string; width: number; height: number }[];
}

/** Un élément Figma candidat à l'import, avec sa correspondance proposée. */
export interface ImportItem {
  source: 'variable' | 'paint' | 'text';
  label: string;
  value: string | number;
  suggested: TokenKey | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const fonts = ['system-ui', 'Arial', 'Georgia', 'Verdana'];

/** Une valeur Figma est-elle compatible avec le type du token ? */
export function compatible(
  tokens: Tokens,
  key: TokenKey,
  value: string | number,
): boolean {
  const type = tokens[key].$type;
  if (type === 'color')
    return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
  if (type === 'dimension')
    return typeof value === 'number' && value >= 0 && value <= 128;
  return typeof value === 'string' && fonts.includes(value);
}

function guess(
  tokens: Tokens,
  label: string,
  value: string | number,
  prefer: (k: TokenKey) => boolean,
): TokenKey | null {
  const n = norm(label.split('/').slice(-2).join(''));
  const full = norm(label);
  const keys = tokenKeys.filter(
    (k) => prefer(k) && compatible(tokens, k, value),
  );
  // Nom exact (color/brand ↔ color.brand), puis suffixe (Brand/Hover ↔ color.brandHover).
  return (
    keys.find((k) => norm(k) === full) ??
    keys.find((k) => norm(k) === n) ??
    keys.find((k) => norm(k).endsWith(n) && n.length >= 3) ??
    keys.find(
      (k) =>
        n.endsWith(norm(k.split('.')[1])) && norm(k.split('.')[1]).length >= 3,
    ) ??
    null
  );
}

/** Liste plate des éléments importés avec une correspondance suggérée. */
export function importItems(data: StoredImport, tokens: Tokens): ImportItem[] {
  const items: ImportItem[] = [];
  for (const v of data.variables) {
    const label = `${v.collection ? v.collection + ' · ' : ''}${v.name}`;
    items.push({
      source: 'variable',
      label,
      value: v.value,
      suggested: guess(tokens, v.name, v.value, () => true),
    });
  }
  for (const p of data.paintStyles)
    items.push({
      source: 'paint',
      label: p.name,
      value: p.hex,
      suggested: guess(tokens, p.name, p.hex, (k) => k.startsWith('color.')),
    });
  for (const t of data.textStyles) {
    const n = norm(t.name);
    const size: TokenKey | null = /body|corps|paragraph|text/.test(n)
      ? 'font.body'
      : /head|title|titre|h1|h2|display/.test(n)
        ? 'font.heading'
        : null;
    items.push({
      source: 'text',
      label: `${t.name} · taille`,
      value: t.fontSize,
      suggested: size && compatible(tokens, size, t.fontSize) ? size : null,
    });
    items.push({
      source: 'text',
      label: `${t.name} · police`,
      value: t.fontFamily,
      suggested: compatible(tokens, 'font.family', t.fontFamily)
        ? 'font.family'
        : null,
    });
  }
  return items;
}

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
export interface FigmaExport {
  date: string;
  tokens: Tokens;
  screens: SceneScreen[];
}

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
  })
  .strict();
export const screensSchema = z
  .object({
    screens: z
      .array(
        z
          .object({
            name: z.string().max(200),
            width: z.number().int().min(1).max(10_000),
            root: sceneNodeSchema,
          })
          .strict(),
      )
      .min(1)
      .max(12),
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
