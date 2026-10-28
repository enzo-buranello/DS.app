import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Doc, DocNode } from '../app/shared/doc.js';
import {
  exportPayloadSchema,
  type SceneNode,
} from '../app/shared/figmaExport.js';
import {
  designSystemScene,
  screenScene,
  type Measures,
} from '../app/shared/figmaScene.js';
import { tokensSchema } from '../app/shared/model.js';
import { seedDoc } from '../app/shared/seedDoc.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tokens = tokensSchema.parse(
  JSON.parse(
    await readFile(
      path.join(root, 'workspace/design-system.tokens.json'),
      'utf8',
    ),
  ),
);
// Mesures simulées : chaque calque à 10 px de son parent, 100 × 40.
const measures: Measures = {
  box: (key) => {
    const depth = key.split(/[>/.]/).length;
    return { x: depth * 10, y: depth * 10, w: 100, h: 40 };
  },
};
const find = (
  n: SceneNode,
  pred: (x: SceneNode) => boolean,
): SceneNode | null =>
  pred(n)
    ? n
    : n.children.reduce<SceneNode | null>((f, c) => f ?? find(c, pred), null);
const patch = (doc: Doc, id: string, fn: (n: DocNode) => void) => {
  const n = structuredClone(doc.nodes[id]);
  fn(n);
  doc.nodes[id] = n;
};

test('scène DS : variables liées, propriétés de composant, états en variantes', () => {
  const { payload } = designSystemScene(
    seedDoc(),
    tokens,
    { mode: 'current' },
    measures,
  );
  // Le payload est valide pour le plugin.
  exportPayloadSchema.parse(payload);
  const def = (id: string) => payload.components.find((d) => d.id === id)!;
  const primary = def('button/primary');
  assert.equal(primary.set, 'Button');
  assert.equal(
    primary.variant,
    'Variante=Principal, État=Défaut, Interaction=Défaut',
  );
  assert.deepEqual(
    primary.properties.map((p) => [p.name, p.type, typeof p.default]),
    [['Texte', 'TEXT', 'string']],
  );
  assert.equal(primary.root.fills?.[0].type, 'SOLID');
  assert.equal(
    primary.root.fills?.[0].type === 'SOLID' && primary.root.fills[0].variable,
    'color.brand',
  );
  assert.ok(primary.root.radiusVariables?.every((v) => v === 'radius.control'));
  assert.ok(
    primary.root.layout?.paddingVariables.some((v) => v?.startsWith('space.')),
  );
  const label = primary.root.children[0];
  assert.equal(label.kind, 'TEXT');
  assert.deepEqual(label.refs, { characters: 'Texte' });
  assert.equal(label.text?.color.variable, 'color.onBrand');
  assert.equal(label.text?.fontFamilyVariable, 'font.family');
  // État « survol » : une variante de plus, fond du token de survol.
  const hover = def('button/primary::hover');
  assert.equal(
    hover.variant,
    'Variante=Principal, État=Défaut, Interaction=Survol',
  );
  assert.equal(
    hover.root.fills?.[0].type === 'SOLID' && hover.root.fills[0].variable,
    'color.brandHover',
  );
  // Tous les membres du set partagent la propriété « Interaction ».
  for (const d of payload.components.filter((x) => x.set === 'Button'))
    assert.match(d.variant!, /Interaction=/);
  // Composant qui contient une instance : liée au composant du bouton.
  const card = def('booking-card');
  const cta = find(card.root, (n) => !!n.instanceOf);
  assert.equal(cta?.instanceOf, 'button/primary');
  assert.ok(payload.textStyles.length > 0);
});

test('scène d’écran : overrides d’instance, propriétés, valeurs natives', () => {
  const doc = seedDoc();
  // Override du titre de la carte, propriétés riches sur des calques réels.
  patch(doc, 'cards.booking', (n) => {
    n.overrides = { 'booking-card/title': { characters: 'Local' } };
  });
  patch(doc, 'cards.title', (n) => {
    n.props = {
      ...n.props,
      layer: { opacity: 0.5, blend: 'multiply' },
      text: {
        ...n.props.text,
        case: 'upper',
        decoration: 'underline',
        maxLines: 2,
        lineHeight: { ratio: 1.25 },
      },
    };
  });
  patch(doc, 'cards.main', (n) => {
    n.props = {
      ...n.props,
      fills: [
        {
          type: 'linear',
          angle: 180,
          stops: [
            { position: 0, color: { token: 'color.brand', opacity: 1 } },
            { position: 1, color: { hex: '#FFFFFF', opacity: 0.5 } },
          ],
          opacity: 1,
          visible: true,
        },
        {
          type: 'image',
          asset: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png',
          fit: 'fit',
          opacity: 0.8,
          visible: true,
        },
      ],
      stroke: {
        color: { token: 'color.border', opacity: 1 },
        weight: { top: 1, right: 0, bottom: 2, left: 0 },
        style: 'dashed',
        align: 'outside',
        visible: true,
      },
      effects: [
        { type: 'layer-blur', radius: 4, visible: true },
        {
          type: 'inner-shadow',
          x: 0,
          y: 1,
          blur: 2,
          spread: 0,
          color: { token: 'color.text', opacity: 0.2 },
          visible: true,
        },
      ],
      radius: { topLeft: { px: 12 }, smoothing: 0.6 },
    };
  });
  patch(doc, 'cards.kicker', (n) => {
    n.props = {
      ...n.props,
      position: {
        mode: 'absolute',
        x: 8,
        y: 4,
        rotation: 15,
        constraintX: 'right',
        constraintY: 'center',
      },
    };
  });
  const { payload, assets } = screenScene(
    doc,
    tokens,
    { mode: 'current' },
    { node: 'screen.cards', id: 'cards', label: 'Découvrir', width: 390 },
    measures,
    measures,
  );
  exportPayloadSchema.parse({ ...payload, images: [] });
  assert.deepEqual(assets, ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png']);
  assert.equal(payload.kind, 'preview');
  if (payload.kind !== 'preview') return;
  assert.equal(payload.screen.id, 'screen/cards/390');
  const r = payload.screen.root;
  assert.equal(r.w, 390);
  const by = (key: string) => find(r, (n) => n.key === key)!;
  // Instance : seul le titre modifié est un override.
  const booking = by('cards.booking');
  assert.equal(booking.instanceOf, 'booking-card');
  const title = by('cards.booking>booking-card/title');
  assert.equal(title.overridden, true);
  assert.equal(title.text?.characters, 'Local');
  assert.equal(by('cards.booking>booking-card/meta').overridden, undefined);
  // Valeurs de propriété du bouton (texte).
  const cta = by('cards.rhythm.cta');
  assert.equal(typeof cta.propValues?.Texte, 'string');
  // Typographie, calque.
  const t = by('cards.title');
  assert.equal(t.opacity, 0.5);
  assert.equal(t.blendMode, 'MULTIPLY');
  assert.equal(t.text?.textCase, 'UPPER');
  assert.equal(t.text?.decoration, 'UNDERLINE');
  assert.equal(t.text?.autoResize, 'TRUNCATE');
  assert.equal(t.text?.maxLines, 2);
  assert.deepEqual(t.text?.lineHeight, { unit: 'PERCENT', value: 125 });
  // Fonds empilés, contour par côté, effets, rayons.
  const main = by('cards.main');
  assert.equal(main.fills?.[0].type, 'GRADIENT_LINEAR');
  if (main.fills?.[0].type === 'GRADIENT_LINEAR') {
    assert.equal(main.fills[0].angle, 180);
    assert.equal(main.fills[0].stops[0].variable, 'color.brand');
  }
  assert.deepEqual(main.fills?.[1], {
    type: 'IMAGE',
    asset: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png',
    scaleMode: 'FIT',
    opacity: 0.8,
    visible: true,
  });
  assert.deepEqual(main.strokes?.[0].weight, [1, 0, 2, 0]);
  assert.equal(main.strokes?.[0].align, 'OUTSIDE');
  assert.deepEqual(main.strokes?.[0].dash, [4, 4]);
  assert.equal(main.strokes?.[0].paint.variable, 'color.border');
  assert.deepEqual(
    main.effects?.map((e) => e.type),
    ['LAYER_BLUR', 'INNER_SHADOW'],
  );
  assert.ok(main.effectStyle);
  assert.equal(main.radius?.[0], 12);
  assert.equal(main.cornerSmoothing, 0.6);
  // Position absolue dans l'auto layout : contraintes et rotation Figma.
  const kicker = by('cards.kicker');
  assert.deepEqual(kicker.absolute, { h: 'MAX', v: 'CENTER' });
  assert.equal(kicker.rotation, -15);
  // Grille : auto layout avec retour à la ligne.
  const grid = by('cards.grid');
  assert.equal(grid.layout?.wrap, true);
  assert.equal(grid.layout?.gapVariable, 'space.md');
  // Composants envoyés : ceux de l'écran, avec tout leur set.
  const ids = payload.components.map((d) => d.id);
  assert.ok(ids.includes('booking-card'));
  assert.ok(ids.includes('button/primary'));
  assert.ok(ids.includes('button/danger'), 'set complet');
});
