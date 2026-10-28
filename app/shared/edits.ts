import { z } from 'zod';
import {
  colorCss,
  colorValueSchema,
  fontSizeValueSchema,
  lengthCss,
  lengthValueSchema,
  type DSComponent,
} from './component.js';

// Modifications faites au clic : sur un composant maître (propagées à toutes
// ses occurrences) ou sur une instance de l'aperçu (override local).
// Clé : id du maître (data-ds-id) ou de l'instance (data-ds-inst), suivi de
// « #partie » pour un sous-élément (titre, texte…).
export const screens = [
  { id: 'cards', label: 'Découvrir' },
  { id: 'form', label: 'Inscription' },
] as const;
export type ScreenId = (typeof screens)[number]['id'];
const screenIds = screens.map((s) => s.id) as [ScreenId, ...ScreenId[]];

export const styleOverrideSchema = z
  .object({
    fill: colorValueSchema,
    text: colorValueSchema,
    radius: lengthValueSchema,
    paddingX: lengthValueSchema,
    paddingY: lengthValueSchema,
    fontSize: fontSizeValueSchema,
    label: z.string().max(200),
  })
  .partial()
  .strict();
export const instanceOverrideSchema = styleOverrideSchema
  .extend({
    variant: z.enum(['primary', 'secondary', 'danger']),
    disabled: z.boolean(),
    link: z.enum(screenIds).nullable(),
  })
  .partial()
  .strict();
export type StyleOverride = z.infer<typeof styleOverrideSchema>;
export type InstanceOverride = z.infer<typeof instanceOverrideSchema>;
export type OverrideField = keyof InstanceOverride;

export const editKeySchema = z
  .string()
  .max(120)
  .regex(/^[A-Za-z0-9]+([./-][A-Za-z0-9]+)*(#[a-z]{1,20})?$/);
export const MAX_EDITS = 500;
export const editsFileSchema = z
  .object({
    masters: z.record(editKeySchema, styleOverrideSchema).default({}),
    instances: z.record(editKeySchema, instanceOverrideSchema).default({}),
  })
  .strict();
export type EditsFile = z.infer<typeof editsFileSchema>;
export type EditScope = 'masters' | 'instances';
export const emptyEdits = (): EditsFile => ({ masters: {}, instances: {} });
export const editOpSchema = z
  .object({
    scope: z.enum(['masters', 'instances']),
    key: editKeySchema,
    value: instanceOverrideSchema.nullable(),
  })
  .strict();
export type EditOp = z.infer<typeof editOpSchema>;

// Champs reportables sur le maître par « Appliquer au composant » : le style
// seulement. Texte, variante, état et lien restent propres à l'instance.
export const STYLE_FIELDS = [
  'fill',
  'text',
  'radius',
  'paddingX',
  'paddingY',
  'fontSize',
] as const satisfies OverrideField[];

// Paramètres pertinents selon l'élément : sous-élément texte, bouton, conteneur.
export function editableFields(
  masterId: string,
  part: string | undefined,
  instance: boolean,
): OverrideField[] {
  if (part) return ['text', 'fontSize', 'label'];
  if (masterId.startsWith('button/'))
    return [
      'fill',
      'text',
      'radius',
      'paddingX',
      'paddingY',
      'fontSize',
      'label',
      ...(instance ? (['variant', 'disabled', 'link'] as const) : []),
    ];
  return ['fill', 'radius', 'paddingX', 'paddingY'];
}

export function overrideCss(o: StyleOverride): Record<string, string> {
  const css: Record<string, string | undefined> = {
    background: o.fill && colorCss(o.fill),
    color: o.text && colorCss(o.text),
    borderRadius: o.radius && lengthCss(o.radius),
    paddingLeft: o.paddingX && lengthCss(o.paddingX),
    paddingRight: o.paddingX && lengthCss(o.paddingX),
    paddingTop: o.paddingY && lengthCss(o.paddingY),
    paddingBottom: o.paddingY && lengthCss(o.paddingY),
    fontSize: o.fontSize && lengthCss(o.fontSize),
  };
  return Object.fromEntries(
    Object.entries(css).filter(([, v]) => v !== undefined),
  ) as Record<string, string>;
}
// Valeur libre (hex ou px) plutôt qu'une référence au DS.
export const offToken = (value: unknown) =>
  !!value && typeof value === 'object' && !('token' in value);

// Composant créé à la main : mêmes champs, traduits dans son propre modèle.
export const CUSTOM_FIELDS: OverrideField[] = [...STYLE_FIELDS, 'label'];
export function patchComponent(
  c: DSComponent,
  patch: StyleOverride,
): DSComponent {
  const next = structuredClone(c);
  if (patch.fill) next.fill = patch.fill;
  if (patch.text) next.text = patch.text;
  if (patch.radius)
    next.radius = {
      topLeft: patch.radius,
      topRight: patch.radius,
      bottomRight: patch.radius,
      bottomLeft: patch.radius,
    };
  if (patch.paddingX)
    next.layout.padding = {
      ...next.layout.padding,
      left: patch.paddingX,
      right: patch.paddingX,
    };
  if (patch.paddingY)
    next.layout.padding = {
      ...next.layout.padding,
      top: patch.paddingY,
      bottom: patch.paddingY,
    };
  if (patch.fontSize) next.typography.size = patch.fontSize;
  if (patch.label !== undefined) next.label = patch.label;
  return next;
}
