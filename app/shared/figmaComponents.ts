import { z } from 'zod';
import type { TokenKey, Tokens } from './model.js';
import {
  colorTokenKeys,
  fontFamilies,
  fontSizeTokenKeys,
  lengthTokenKeys,
  type ColorValue,
  type DSComponent,
  type FontSizeValue,
  type LengthValue,
} from './component.js';

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

export const componentListSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            id: z.string().max(80),
            name: z.string().max(200),
            type: z.enum(['COMPONENT', 'COMPONENT_SET']),
            variants: z.number().int().min(1).max(500),
            thumbnail: z.string().max(400_000).nullable(),
          })
          .strict(),
      )
      .max(300),
  })
  .strict();
export type ComponentListItem = z.infer<
  typeof componentListSchema
>['items'][number];

const paintSchema = z
  .object({
    hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    opacity: z.number().min(0).max(1),
    variable: z.string().max(200).nullable(),
  })
  .strict()
  .nullable();
const num = z.number().finite();
const bound = z.string().max(200).nullable();
// Description neutre d'un composant Figma, produite par le plugin.
export const figmaNodeSchema = z
  .object({
    nodeId: z.string().max(80),
    name: z.string().max(200),
    set: z
      .object({ id: z.string().max(80), name: z.string().max(120) })
      .strict()
      .nullable(),
    properties: z.record(z.string().max(60), z.string().max(60)),
    fill: paintSchema,
    stroke: paintSchema,
    strokeWeight: num,
    dash: z.enum(['solid', 'dashed', 'dotted']),
    radii: z.tuple([num, num, num, num]),
    radiusVariables: z.tuple([bound, bound, bound, bound]),
    layout: z
      .object({
        direction: z.enum(['HORIZONTAL', 'VERTICAL']),
        gap: num,
        gapVariable: bound,
        padding: z.tuple([num, num, num, num]),
        paddingVariables: z.tuple([bound, bound, bound, bound]),
        primary: z.enum(['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN']),
        counter: z.enum(['MIN', 'CENTER', 'MAX', 'BASELINE']),
        sizingH: z.enum(['FIXED', 'HUG', 'FILL']),
        sizingV: z.enum(['FIXED', 'HUG', 'FILL']),
      })
      .strict()
      .nullable(),
    width: num,
    height: num,
    minWidth: num.nullable(),
    maxWidth: num.nullable(),
    minHeight: num.nullable(),
    maxHeight: num.nullable(),
    shadow: z
      .object({
        x: num,
        y: num,
        blur: num,
        spread: num,
        color: paintSchema.unwrap(),
      })
      .strict()
      .nullable(),
    blur: num,
    text: z
      .object({
        characters: z.string().max(2000),
        fontFamily: z.string().max(100),
        fontWeight: num,
        fontSize: num,
        fontSizeVariable: bound,
        lineHeight: z.union([
          z.object({ unit: z.literal('AUTO') }).strict(),
          z
            .object({ unit: z.enum(['PIXELS', 'PERCENT']), value: num })
            .strict(),
        ]),
        color: paintSchema,
      })
      .strict()
      .nullable(),
  })
  .strict();
export type FigmaNode = z.infer<typeof figmaNodeSchema>;
export const figmaImportItemsSchema = z
  .object({ items: z.array(figmaNodeSchema).max(300) })
  .strict();

/** Extrait la clé d'un lien figma.com/file|design/<clé>/… (null si invalide). */
export function figmaFileKey(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !/(^|\.)figma\.com$/.test(u.hostname))
      return null;
    const m = u.pathname.match(
      /^\/(?:file|design|proto)\/([A-Za-z0-9]{10,64})/,
    );
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
// « color/brand » (variable exportée par DS-Studio) → « color.brand ».
const tokenFromVariable = (name: string | null, keys: readonly TokenKey[]) => {
  const key = name?.replace('/', '.') as TokenKey | undefined;
  return key && keys.includes(key) ? key : null;
};
function color(
  paint: { hex: string; opacity: number; variable: string | null },
  tokens: Tokens,
): ColorValue {
  const opacity = Math.round(paint.opacity * 100) / 100;
  const linked =
    tokenFromVariable(paint.variable, colorTokenKeys) ??
    colorTokenKeys.find(
      (k) => String(tokens[k].$value).toUpperCase() === paint.hex.toUpperCase(),
    );
  return linked
    ? { token: linked, opacity }
    : { hex: paint.hex.toUpperCase(), opacity };
}
function length(
  value: number,
  variable: string | null,
  tokens: Tokens,
  prefix: 'space.' | 'radius.',
): LengthValue {
  const fromVariable = tokenFromVariable(variable, lengthTokenKeys);
  if (fromVariable) return { token: fromVariable };
  // Par valeur, seulement dans la bonne famille : un rayon ne devient pas un espacement.
  const match = lengthTokenKeys
    .filter((k) => k.startsWith(prefix))
    .find((k) => tokens[k].$value === value);
  return match ? { token: match } : { px: clamp(Math.round(value), 0, 512) };
}
const align = {
  MIN: 'start',
  CENTER: 'center',
  MAX: 'end',
  BASELINE: 'start',
} as const;
const distribute = {
  MIN: 'start',
  CENTER: 'center',
  MAX: 'end',
  SPACE_BETWEEN: 'space-between',
} as const;
const sizing = { FIXED: 'fixed', HUG: 'hug', FILL: 'fill' } as const;
const optional = (v: number | null) =>
  v === null ? null : clamp(Math.round(v), 0, 4000);

/** Convertit un composant Figma en composant DS-Studio, lié aux tokens quand c'est possible. */
export function convertFigmaNode(
  node: FigmaNode,
  tokens: Tokens,
  id: string,
  file: { key: string | null; name: string },
): DSComponent {
  const t = node.text;
  const fontToken =
    t &&
    ((tokenFromVariable(t.fontSizeVariable, fontSizeTokenKeys) ??
      fontSizeTokenKeys.find((k) => tokens[k].$value === t.fontSize)) as
      (typeof fontSizeTokenKeys)[number] | undefined);
  const size: FontSizeValue = !t
    ? { token: 'font.body' }
    : fontToken
      ? { token: fontToken }
      : { px: clamp(Math.round(t.fontSize), 0, 200) };
  const lineHeight = !t
    ? 1.5
    : t.lineHeight.unit === 'AUTO'
      ? 1.2
      : t.lineHeight.unit === 'PERCENT'
        ? t.lineHeight.value / 100
        : t.lineHeight.value / Math.max(1, t.fontSize);
  const family: DSComponent['typography']['family'] =
    !t ||
    t.fontFamily === tokens['font.family'].$value ||
    !fontFamilies.includes(t.fontFamily)
      ? { token: 'font.family' }
      : { value: t.fontFamily };
  const l = node.layout;
  const radii = node.radii.map((r, i) =>
    length(r, node.radiusVariables[i], tokens, 'radius.'),
  );
  const padding = (l?.padding ?? [0, 0, 0, 0]).map((p, i) =>
    length(p, l?.paddingVariables[i] ?? null, tokens, 'space.'),
  );
  const variant = Object.entries(node.properties)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  const name =
    (node.set ? `${node.set.name} · ${variant || node.name}` : node.name)
      .trim()
      .slice(0, 60) || 'Composant Figma';
  return {
    id,
    name,
    label: (t?.characters ?? '').slice(0, 200),
    icon: '',
    fill: node.fill && color(node.fill, tokens),
    stroke: node.stroke && color(node.stroke, tokens),
    text: t?.color
      ? color(t.color, tokens)
      : { token: 'color.text', opacity: 1 },
    radius: {
      topLeft: radii[0],
      topRight: radii[1],
      bottomRight: radii[2],
      bottomLeft: radii[3],
    },
    layout: {
      direction: l?.direction === 'VERTICAL' ? 'vertical' : 'horizontal',
      gap: l ? length(l.gap, l.gapVariable, tokens, 'space.') : { px: 0 },
      padding: {
        top: padding[0],
        right: padding[1],
        bottom: padding[2],
        left: padding[3],
      },
      align: l ? align[l.counter] : 'center',
      distribute: l ? distribute[l.primary] : 'center',
      sizingX: l ? sizing[l.sizingH] : 'fixed',
      sizingY: l ? sizing[l.sizingV] : 'fixed',
    },
    typography: {
      family,
      size,
      weight: clamp(Math.round((t?.fontWeight ?? 400) / 100) * 100, 100, 900),
      lineHeight: clamp(Math.round(lineHeight * 100) / 100, 0.8, 3),
    },
    border: {
      width: node.stroke ? clamp(node.strokeWeight, 0, 32) : 0,
      style: node.dash,
    },
    effects: {
      shadow: node.shadow && {
        x: clamp(node.shadow.x, -200, 200),
        y: clamp(node.shadow.y, -200, 200),
        blur: clamp(node.shadow.blur, 0, 200),
        spread: clamp(node.shadow.spread, -200, 200),
        color: color(node.shadow.color, tokens),
      },
      blur: clamp(node.blur, 0, 100),
    },
    size: {
      width: clamp(Math.round(node.width), 0, 4000),
      height: clamp(Math.round(node.height), 0, 4000),
      minWidth: optional(node.minWidth),
      maxWidth: optional(node.maxWidth),
      minHeight: optional(node.minHeight),
      maxHeight: optional(node.maxHeight),
    },
    set: node.set && { ...node.set, properties: node.properties },
    source: { nodeId: node.nodeId, fileKey: file.key, fileName: file.name },
  };
}
