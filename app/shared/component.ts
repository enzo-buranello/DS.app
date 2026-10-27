import { z } from 'zod';
import { tokenKeys, type TokenKey } from './model.js';

// Composants créés à la main. Une valeur liée garde la référence du token :
// le rendu passe par var(--token), jamais par une copie de sa valeur.
const keysOf = (prefix: string) =>
  tokenKeys.filter((k) => k.startsWith(prefix)) as [TokenKey, ...TokenKey[]];
export const colorTokenKeys = keysOf('color.');
export const lengthTokenKeys = [...keysOf('space.'), ...keysOf('radius.')] as [
  TokenKey,
  ...TokenKey[],
];
export const fontSizeTokenKeys = [
  'font.body',
  'font.heading',
] as const satisfies TokenKey[];
export const fontFamilies = ['system-ui', 'Arial', 'Georgia', 'Verdana'];

const opacity = z.number().min(0).max(1).default(1);
export const colorValueSchema = z.union([
  z.object({ token: z.enum(colorTokenKeys), opacity }).strict(),
  z.object({ hex: z.string().regex(/^#[0-9a-fA-F]{6}$/), opacity }).strict(),
]);
const px = (max: number) =>
  z.object({ px: z.number().min(0).max(max) }).strict();
export const lengthValueSchema = z.union([
  z.object({ token: z.enum(lengthTokenKeys) }).strict(),
  px(512),
]);
export const fontSizeValueSchema = z.union([
  z.object({ token: z.enum(fontSizeTokenKeys) }).strict(),
  px(200),
]);
const optionalPx = z.number().min(0).max(4000).nullable().default(null);
const sizing = z.enum(['hug', 'fill', 'fixed']);

export const componentSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(60),
    label: z.string().max(200),
    icon: z.string().max(4).default(''),
    fill: colorValueSchema.nullable(),
    stroke: colorValueSchema.nullable(),
    text: colorValueSchema,
    radius: z
      .object({
        topLeft: lengthValueSchema,
        topRight: lengthValueSchema,
        bottomRight: lengthValueSchema,
        bottomLeft: lengthValueSchema,
      })
      .strict(),
    layout: z
      .object({
        direction: z.enum(['horizontal', 'vertical']),
        gap: lengthValueSchema,
        padding: z
          .object({
            top: lengthValueSchema,
            right: lengthValueSchema,
            bottom: lengthValueSchema,
            left: lengthValueSchema,
          })
          .strict(),
        align: z.enum(['start', 'center', 'end', 'stretch']),
        distribute: z.enum(['start', 'center', 'end', 'space-between']),
        sizingX: sizing,
        sizingY: sizing,
      })
      .strict(),
    typography: z
      .object({
        family: z.union([
          z.object({ token: z.literal('font.family') }).strict(),
          z
            .object({ value: z.enum(fontFamilies as [string, ...string[]]) })
            .strict(),
        ]),
        size: fontSizeValueSchema,
        weight: z.number().int().min(100).max(900).multipleOf(100),
        lineHeight: z.number().min(0.8).max(3),
      })
      .strict(),
    border: z
      .object({
        width: z.number().min(0).max(32),
        style: z.enum(['solid', 'dashed', 'dotted']),
      })
      .strict(),
    effects: z
      .object({
        shadow: z
          .object({
            x: z.number().min(-200).max(200),
            y: z.number().min(-200).max(200),
            blur: z.number().min(0).max(200),
            spread: z.number().min(-200).max(200),
            color: colorValueSchema,
          })
          .strict()
          .nullable(),
        blur: z.number().min(0).max(100),
      })
      .strict(),
    size: z
      .object({
        width: optionalPx,
        height: optionalPx,
        minWidth: optionalPx,
        maxWidth: optionalPx,
        minHeight: optionalPx,
        maxHeight: optionalPx,
      })
      .strict(),
  })
  .strict();
export type DSComponent = z.infer<typeof componentSchema>;
export type ColorValue = z.infer<typeof colorValueSchema>;
export type LengthValue = z.infer<typeof lengthValueSchema>;
export type FontSizeValue = z.infer<typeof fontSizeValueSchema>;
export const MAX_COMPONENTS = 50;
export const componentsFileSchema = z
  .object({
    components: z.array(componentSchema).max(MAX_COMPONENTS).default([]),
  })
  .strict();

export function newComponent(id: string, index: number): DSComponent {
  const radius = { token: 'radius.control' } as const;
  return {
    id,
    name: `Bouton ${index}`,
    label: 'Bouton',
    icon: '→',
    fill: { token: 'color.brand', opacity: 1 },
    stroke: null,
    text: { token: 'color.onBrand', opacity: 1 },
    radius: {
      topLeft: radius,
      topRight: radius,
      bottomRight: radius,
      bottomLeft: radius,
    },
    layout: {
      direction: 'horizontal',
      gap: { token: 'space.sm' },
      padding: {
        top: { token: 'space.sm' },
        right: { token: 'space.md' },
        bottom: { token: 'space.sm' },
        left: { token: 'space.md' },
      },
      align: 'center',
      distribute: 'center',
      sizingX: 'hug',
      sizingY: 'hug',
    },
    typography: {
      family: { token: 'font.family' },
      size: { token: 'font.body' },
      weight: 600,
      lineHeight: 1.5,
    },
    border: { width: 0, style: 'solid' },
    effects: { shadow: null, blur: 0 },
    size: {
      width: null,
      height: null,
      minWidth: null,
      maxWidth: null,
      minHeight: null,
      maxHeight: null,
    },
  };
}

const cssVar = (key: TokenKey) => `var(--${key.replaceAll('.', '-')})`;
export function colorCss(value: ColorValue | null): string {
  if (!value) return 'transparent';
  const base = 'token' in value ? cssVar(value.token) : value.hex;
  return value.opacity >= 1
    ? base
    : `color-mix(in srgb, ${base} ${Math.round(value.opacity * 100)}%, transparent)`;
}
export function lengthCss(value: LengthValue | FontSizeValue): string {
  return 'token' in value ? cssVar(value.token) : `${value.px}px`;
}
const flex = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  'space-between': 'space-between',
} as const;
const pxOrNone = (v: number | null) => (v === null ? undefined : `${v}px`);
// Traduction du modèle en CSS : auto layout = flexbox, hug/fill/fixed par axe.
export function componentCss(c: DSComponent): Record<string, string | number> {
  const { layout, typography: t, size, effects } = c;
  const axis = (mode: typeof layout.sizingX, fixed: number | null) =>
    mode === 'fill'
      ? '100%'
      : mode === 'fixed' && fixed !== null
        ? `${fixed}px`
        : 'fit-content';
  const css: Record<string, string | number | undefined> = {
    display: 'flex',
    flexDirection: layout.direction === 'horizontal' ? 'row' : 'column',
    gap: lengthCss(layout.gap),
    padding: [
      layout.padding.top,
      layout.padding.right,
      layout.padding.bottom,
      layout.padding.left,
    ]
      .map(lengthCss)
      .join(' '),
    alignItems: flex[layout.align],
    justifyContent: flex[layout.distribute],
    width: axis(layout.sizingX, size.width),
    height: axis(layout.sizingY, size.height),
    alignSelf: layout.sizingY === 'fill' ? 'stretch' : undefined,
    minWidth: pxOrNone(size.minWidth),
    maxWidth: pxOrNone(size.maxWidth),
    minHeight: pxOrNone(size.minHeight),
    maxHeight: pxOrNone(size.maxHeight),
    background: colorCss(c.fill),
    color: colorCss(c.text),
    borderWidth: c.border.width ? `${c.border.width}px` : 0,
    borderStyle: c.border.style,
    borderColor: colorCss(c.stroke),
    borderRadius: [
      c.radius.topLeft,
      c.radius.topRight,
      c.radius.bottomRight,
      c.radius.bottomLeft,
    ]
      .map(lengthCss)
      .join(' '),
    fontFamily: 'token' in t.family ? cssVar(t.family.token) : t.family.value,
    fontSize: lengthCss(t.size),
    fontWeight: t.weight,
    lineHeight: t.lineHeight,
    boxShadow: effects.shadow
      ? `${effects.shadow.x}px ${effects.shadow.y}px ${effects.shadow.blur}px ${effects.shadow.spread}px ${colorCss(effects.shadow.color)}`
      : 'none',
    filter: effects.blur ? `blur(${effects.blur}px)` : undefined,
    boxSizing: 'border-box',
    overflow: 'hidden',
  };
  return Object.fromEntries(
    Object.entries(css).filter(([, v]) => v !== undefined),
  ) as Record<string, string | number>;
}
