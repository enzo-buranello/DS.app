import { z } from 'zod';
import {
  colorValueSchema,
  fontFamilies,
  fontSizeValueSchema,
  lengthValueSchema,
} from './component.js';

// Document de nœuds (version 2) : aperçu, catalogue et composants sont des
// nœuds génériques, comme dans Figma. Stockage à plat (id → nœud) : chaque
// opération, annulation ou patch d'agent vise un id, sans parcours d'arbre.
// Chaque valeur scalaire est soit liée à un token ({ token }), soit libre.

export const DOC_VERSION = 2;
export const MAX_NODES = 5000;
export const MAX_DEPTH = 32;
export const MAX_DOC_BYTES = 2_000_000;

export const nodeIdSchema = z
  .string()
  .max(120)
  .regex(/^[A-Za-z0-9]+([./-][A-Za-z0-9]+)*$/);
export type NodeId = string;

const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const visible = z.boolean().default(true);

// --- Valeurs ---
export const colorSchema = colorValueSchema;
export const lengthSchema = lengthValueSchema;
export const fontSizeSchema = fontSizeValueSchema;
export type Color = z.infer<typeof colorSchema>;
export type Length = z.infer<typeof lengthSchema>;

const stopSchema = z
  .object({ position: num(0, 1), color: colorSchema })
  .strict();
export const paintSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('solid'), color: colorSchema, visible }).strict(),
  z
    .object({
      type: z.literal('linear'),
      angle: num(-360, 360),
      stops: z.array(stopSchema).min(2).max(8),
      opacity: num(0, 1).default(1),
      visible,
    })
    .strict(),
  z
    .object({
      type: z.literal('radial'),
      stops: z.array(stopSchema).min(2).max(8),
      opacity: num(0, 1).default(1),
      visible,
    })
    .strict(),
  z
    .object({
      type: z.literal('image'),
      /** Fichier de .ds-studio/assets/ (nom haché). */
      asset: z.string().regex(/^[a-f0-9]{16,64}\.(png|jpe?g|webp)$/),
      fit: z.enum(['fill', 'fit', 'tile']).default('fill'),
      opacity: num(0, 1).default(1),
      visible,
    })
    .strict(),
]);
export type Paint = z.infer<typeof paintSchema>;

const sides = <T extends z.ZodTypeAny>(v: T) =>
  z.object({ top: v, right: v, bottom: v, left: v }).strict();

export const strokeSchema = z
  .object({
    color: colorSchema,
    /** Épaisseur uniforme, ou par côté. */
    weight: z.union([num(0, 64), sides(num(0, 64))]),
    style: z.enum(['solid', 'dashed', 'dotted']).default('solid'),
    align: z.enum(['inside', 'center', 'outside']).default('inside'),
    visible,
  })
  .strict();
export type Stroke = z.infer<typeof strokeSchema>;

export const effectSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.enum(['drop-shadow', 'inner-shadow']),
      x: num(-500, 500),
      y: num(-500, 500),
      blur: num(0, 500),
      spread: num(-500, 500),
      color: colorSchema,
      visible,
    })
    .strict(),
  z
    .object({
      type: z.enum(['layer-blur', 'background-blur']),
      radius: num(0, 250),
      visible,
    })
    .strict(),
]);
export type Effect = z.infer<typeof effectSchema>;

const sizeAxis = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('hug') }).strict(),
  z.object({ mode: z.literal('fill') }).strict(),
  z.object({ mode: z.literal('fixed'), px: num(0, 10_000) }).strict(),
]);
const optionalPx = num(0, 10_000).nullable();
const align3 = z.enum(['start', 'center', 'end']);

// --- Propriétés, groupées comme le panneau Design de Figma ---
export const propsSchema = z
  .object({
    layer: z
      .object({
        visible: z.boolean(),
        locked: z.boolean(),
        opacity: num(0, 1),
        blend: z.enum([
          'normal',
          'multiply',
          'screen',
          'overlay',
          'darken',
          'lighten',
          'color-dodge',
          'color-burn',
          'hard-light',
          'soft-light',
          'difference',
          'exclusion',
          'hue',
          'saturation',
          'color',
          'luminosity',
        ]),
        clip: z.boolean(),
        cursor: z.enum(['auto', 'pointer', 'not-allowed', 'text']),
      })
      .partial()
      .strict(),
    position: z
      .object({
        mode: z.enum(['auto', 'absolute']),
        x: num(-10_000, 10_000),
        y: num(-10_000, 10_000),
        /** Décalage de fin (contraintes « droite », « bas », « étirer »). */
        xEnd: num(-10_000, 10_000),
        yEnd: num(-10_000, 10_000),
        rotation: num(-360, 360),
        constraintX: z.enum(['left', 'right', 'center', 'stretch']),
        constraintY: z.enum(['top', 'bottom', 'center', 'stretch']),
        /** Alignement propre dans un parent en auto-layout (axe secondaire). */
        alignSelf: z.enum(['auto', 'start', 'center', 'end', 'stretch']),
      })
      .partial()
      .strict(),
    size: z
      .object({
        width: sizeAxis,
        height: sizeAxis,
        minWidth: optionalPx,
        maxWidth: optionalPx,
        minHeight: optionalPx,
        maxHeight: optionalPx,
        lockRatio: z.boolean(),
      })
      .partial()
      .strict(),
    layout: z
      .object({
        mode: z.enum(['none', 'horizontal', 'vertical']),
        wrap: z.boolean(),
        /** Gap fixe (token ou px) ou « auto » (space-between). */
        gap: z.union([lengthSchema, z.literal('auto')]),
        rowGap: lengthSchema,
        padding: sides(lengthSchema),
        alignMain: align3,
        alignCross: z.enum(['start', 'center', 'end', 'stretch', 'baseline']),
        /** Inversion de l'ordre d'empilement (le premier passe devant). */
        reverseZ: z.boolean(),
      })
      .partial()
      .strict(),
    radius: z
      .object({
        topLeft: lengthSchema,
        topRight: lengthSchema,
        bottomRight: lengthSchema,
        bottomLeft: lengthSchema,
        /** Lissage des coins : exporté vers Figma, sans rendu CSS fidèle. */
        smoothing: num(0, 1),
      })
      .partial()
      .strict(),
    fills: z.array(paintSchema).max(8),
    stroke: strokeSchema.nullable(),
    effects: z.array(effectSchema).max(8),
    text: z
      .object({
        family: z.union([
          z.object({ token: z.literal('font.family') }).strict(),
          z
            .object({ value: z.enum(fontFamilies as [string, ...string[]]) })
            .strict(),
        ]),
        weight: z.number().int().min(100).max(900).multipleOf(50),
        size: fontSizeSchema,
        color: colorSchema,
        /** Interlignage : multiple (1.5) ou px. */
        lineHeight: z.union([
          z.object({ ratio: num(0.5, 4) }).strict(),
          z.object({ px: num(0, 400) }).strict(),
        ]),
        letterSpacing: num(-20, 40),
        align: z.enum(['left', 'center', 'right', 'justify']),
        valign: z.enum(['top', 'center', 'bottom']),
        case: z.enum(['none', 'upper', 'lower', 'title']),
        decoration: z.enum(['none', 'underline', 'strike']),
        resize: z.enum(['auto-width', 'auto-height', 'fixed']),
        maxLines: z.number().int().min(1).max(50).nullable(),
        truncate: z.boolean(),
      })
      .partial()
      .strict(),
  })
  .partial()
  .strict();
export type Props = z.infer<typeof propsSchema>;
export type PropGroup = keyof Props;

export const stateNames = [
  'hover',
  'pressed',
  'focus',
  'disabled',
  'invalid',
] as const;
export type StateName = (typeof stateNames)[number];
export const statesSchema = z
  .object(
    Object.fromEntries(stateNames.map((s) => [s, propsSchema])) as Record<
      StateName,
      typeof propsSchema
    >,
  )
  .partial()
  .strict();
export type States = z.infer<typeof statesSchema>;

// Prototype : naviguer vers un écran, changer la variante de l'instance
// englobante (composant interactif), basculer une propriété de variante.
export const interactionSchema = z
  .object({
    trigger: z.enum(['click', 'submit']),
    action: z.discriminatedUnion('type', [
      z.object({ type: z.literal('navigate'), screen: nodeIdSchema }).strict(),
      z.object({ type: z.literal('back') }).strict(),
      z
        .object({
          type: z.literal('change-to'),
          variant: z.record(z.string().max(60), z.string().max(60)),
        })
        .strict(),
    ]),
  })
  .strict();
export type Interaction = z.infer<typeof interactionSchema>;

// Élément HTML rendu : nécessaire à un vrai prototype (rôles, formulaire).
export const tags = [
  'div',
  'span',
  'p',
  'h1',
  'h2',
  'h3',
  'button',
  'article',
  'section',
  'header',
  'main',
  'footer',
  'nav',
  'form',
  'label',
  'strong',
] as const;
export const semanticsSchema = z
  .object({
    tag: z.enum(tags),
    role: z.enum(['status', 'alert', 'group']),
    ariaLabel: z.string().max(200),
    ariaLive: z.enum(['polite', 'assertive']),
    ariaCurrent: z.enum(['page', 'true']),
    ariaHidden: z.boolean(),
    buttonType: z.enum(['button', 'submit']),
    disabled: z.boolean(),
    /** Repère technique (tests, export), sans style associé. */
    className: z
      .string()
      .regex(/^[a-z][a-z0-9-]{0,40}( [a-z][a-z0-9-]{0,40}){0,3}$/),
  })
  .partial()
  .strict();

// Champ de saisie natif (prototype réel en mode Test).
export const fieldSchema = z
  .object({
    input: z.enum(['text', 'email', 'checkbox']),
    placeholder: z.string().max(200),
    required: z.boolean(),
    disabled: z.boolean(),
  })
  .partial()
  .strict();

const propValue = z.union([z.string().max(200), z.boolean()]);
export const componentPropSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), default: z.string().max(200) }).strict(),
  z.object({ type: z.literal('boolean'), default: z.boolean() }).strict(),
  z
    .object({ type: z.literal('instance-swap'), default: nodeIdSchema })
    .strict(),
]);

// Override d'une instance, par chemin dans le composant (ids joints par « > »).
export const overrideSchema = z
  .object({
    props: propsSchema,
    states: statesSchema,
    characters: z.string().max(2000),
    variant: z.record(z.string().max(60), z.string().max(60)),
    interactions: z.array(interactionSchema).max(8),
    semantics: semanticsSchema,
  })
  .partial()
  .strict();
export type Override = z.infer<typeof overrideSchema>;
export const overridePathSchema = z
  .string()
  .max(400)
  .regex(/^[A-Za-z0-9./-]+(>[A-Za-z0-9./-]+)*$/);

export const nodeTypes = [
  'frame',
  'text',
  'rect',
  'image',
  'vector',
  'field',
  'component',
  'component-set',
  'instance',
  'page',
] as const;
export type NodeType = (typeof nodeTypes)[number];

export const nodeSchema = z
  .object({
    id: nodeIdSchema,
    type: z.enum(nodeTypes),
    name: z.string().trim().min(1).max(120),
    parent: nodeIdSchema.nullable(),
    children: z.array(nodeIdSchema).max(500).default([]),
    props: propsSchema.default({}),
    states: statesSchema.optional(),
    semantics: semanticsSchema.optional(),
    interactions: z.array(interactionSchema).max(8).optional(),
    /** Texte (nœud text). */
    characters: z.string().max(2000).optional(),
    field: fieldSchema.optional(),
    /** Vecteur importé : arbre validé (voir vector.ts), jamais de HTML brut. */
    vector: z.unknown().optional(),
    /** Composant : propriétés exposées ; variante dans un component set. */
    componentProps: z
      .record(z.string().max(60), componentPropSchema)
      .optional(),
    variant: z.record(z.string().max(60), z.string().max(60)).optional(),
    /** Calque lié à une propriété du composant englobant. */
    bind: z
      .object({
        characters: z.string().max(60),
        visible: z.string().max(60),
        swap: z.string().max(60),
      })
      .partial()
      .strict()
      .optional(),
    /** Instance : composant source, valeurs de propriétés, overrides. */
    componentId: nodeIdSchema.optional(),
    propValues: z.record(z.string().max(60), propValue).optional(),
    overrides: z.record(overridePathSchema, overrideSchema).optional(),
  })
  .strict();
export type DocNode = z.infer<typeof nodeSchema>;

export const docSchema = z
  .object({
    version: z.literal(DOC_VERSION),
    /** Page des composants puis écrans de l'aperçu, dans l'ordre. */
    components: nodeIdSchema,
    screens: z.array(nodeIdSchema).min(1).max(50),
    nodes: z.record(nodeIdSchema, nodeSchema),
    migratedFrom: z
      .object({
        edits: z.string().max(80).nullable(),
        /** Empreinte de components.json importé (absent : pas encore fait). */
        components: z.string().max(80).nullable().optional(),
        at: z.string().max(40),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((doc, ctx) => {
    for (const problem of docProblems(doc))
      ctx.addIssue({ code: 'custom', message: problem });
  });
export type Doc = z.infer<typeof docSchema>;

// Cohérence de l'arbre : ids, parents, cycles, profondeur, références.
export function docProblems(doc: {
  components: string;
  screens: string[];
  nodes: Record<string, DocNode>;
}): string[] {
  const problems: string[] = [];
  const nodes = doc.nodes;
  const ids = Object.keys(nodes);
  if (ids.length > MAX_NODES) problems.push(`${MAX_NODES} nœuds maximum.`);
  for (const [id, n] of Object.entries(nodes)) {
    if (n.id !== id) problems.push(`Id incohérent : ${id}.`);
    for (const c of n.children) {
      if (!nodes[c]) problems.push(`Enfant inconnu ${c} dans ${id}.`);
      else if (nodes[c].parent !== id)
        problems.push(`Parent incohérent pour ${c}.`);
    }
    if (n.parent && !nodes[n.parent]?.children.includes(id))
      problems.push(`${id} absent des enfants de ${n.parent}.`);
    if (n.type === 'instance') {
      const target = n.componentId && nodes[n.componentId];
      if (!target || target.type !== 'component')
        problems.push(`Instance ${id} : composant introuvable.`);
    }
  }
  const roots = [doc.components, ...doc.screens];
  for (const r of roots)
    if (!nodes[r] || nodes[r].parent !== null)
      problems.push(`Racine invalide : ${r}.`);
  // Chaque nœud est atteint une seule fois depuis une racine, sans cycle.
  const seen = new Set<string>();
  const walk = (id: string, depth: number) => {
    if (depth > MAX_DEPTH) return problems.push(`Profondeur > ${MAX_DEPTH}.`);
    if (seen.has(id)) return problems.push(`Nœud atteint deux fois : ${id}.`);
    seen.add(id);
    for (const c of nodes[id]?.children ?? []) walk(c, depth + 1);
  };
  for (const r of roots) if (nodes[r]) walk(r, 0);
  for (const id of ids)
    if (!seen.has(id)) problems.push(`Nœud orphelin ${id}.`);
  // Une instance ne peut pas se contenir elle-même (directement ou non).
  for (const [id, n] of Object.entries(nodes))
    if (
      n.type === 'instance' &&
      n.componentId &&
      within(nodes, id, n.componentId)
    )
      problems.push(`Instance récursive : ${id}.`);
  return [...new Set(problems)].slice(0, 20);
}
function within(nodes: Record<string, DocNode>, id: string, ancestor: string) {
  for (let p: string | null = id; p; p = nodes[p]?.parent ?? null)
    if (p === ancestor) return true;
  return false;
}

// Écran de l'aperçu : id « screen.<slug> », le slug sert d'URL (?scenario=).
export const screenSlug = (id: string) => id.replace(/^screen\./, '');
export const screenOf = (doc: Doc, slug: string) =>
  doc.screens.find((s) => s === slug || screenSlug(s) === slug) ??
  doc.screens[0];

// Composant englobant d'un nœud (lui-même s'il en est un).
export function componentOf(doc: Doc, id: string): DocNode | null {
  for (let p: string | null = id; p; p = doc.nodes[p]?.parent ?? null)
    if (doc.nodes[p]?.type === 'component') return doc.nodes[p];
  return null;
}
export function descendants(doc: Doc, id: string): string[] {
  const out: string[] = [];
  const walk = (n: string) => {
    out.push(n);
    for (const c of doc.nodes[n]?.children ?? []) walk(c);
  };
  walk(id);
  return out;
}
// Variante d'un component set qui correspond à la combinaison demandée.
export function variantOf(
  doc: Doc,
  component: DocNode,
  wanted: Record<string, string> | undefined,
): DocNode {
  const set = component.parent && doc.nodes[component.parent];
  if (!wanted || !set || set.type !== 'component-set') return component;
  const target = { ...component.variant, ...wanted };
  const match = set.children
    .map((c) => doc.nodes[c])
    .find(
      (c) =>
        c?.type === 'component' &&
        Object.entries(target).every(([k, v]) => c.variant?.[k] === v),
    );
  return match ?? component;
}

// Fusion d'un patch de propriétés : groupe par groupe, champ par champ.
// Les listes (fills, effects) et stroke sont remplacées en bloc.
export function mergeProps(base: Props, patch: Props | undefined): Props {
  if (!patch) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const prev = out[k];
    out[k] =
      Array.isArray(v) || v === null || typeof v !== 'object'
        ? v
        : { ...(prev && typeof prev === 'object' ? prev : {}), ...v };
  }
  return out as Props;
}
export function mergeStates(base: States | undefined, patch?: States) {
  if (!patch) return base;
  const out: States = { ...base };
  for (const s of stateNames)
    if (patch[s]) out[s] = mergeProps(out[s] ?? {}, patch[s]);
  return out;
}
// Valeur libre plutôt qu'une référence au DS (badge « hors token »).
export const offToken = (value: unknown) =>
  !!value &&
  typeof value === 'object' &&
  !('token' in value) &&
  ('hex' in value || 'px' in value);
