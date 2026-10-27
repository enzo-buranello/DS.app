import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { tokensSchema } from '../app/shared/model.js';
import {
  convertFigmaNode,
  figmaFileKey,
  figmaNodeSchema,
  type FigmaNode,
} from '../app/shared/figmaComponents.js';
import { componentSchema } from '../app/shared/component.js';
import { ComponentStore } from '../app/server/components.js';

const tokens = tokensSchema.parse(
  JSON.parse(
    await readFile(
      path.resolve(
        import.meta.dirname,
        '../workspace/design-system.tokens.json',
      ),
      'utf8',
    ),
  ),
);
const file = { key: 'AbCdEf123456', name: 'Kit UI' };
function figmaButton(overrides: Partial<FigmaNode> = {}): FigmaNode {
  return figmaNodeSchema.parse({
    nodeId: '12:34',
    name: 'Taille=Grand, État=Défaut',
    set: { id: '12:30', name: 'Bouton' },
    properties: { Taille: 'Grand', État: 'Défaut' },
    fill: { hex: '#3154c4', opacity: 1, variable: null },
    stroke: { hex: '#ABCDEF', opacity: 0.5, variable: null },
    strokeWeight: 2,
    dash: 'dashed',
    radii: [10, 8, 0, 0],
    radiusVariables: [null, null, null, null],
    layout: {
      direction: 'HORIZONTAL',
      gap: 8,
      gapVariable: null,
      padding: [8, 16, 8, 16],
      paddingVariables: [null, 'space/lg', null, null],
      primary: 'SPACE_BETWEEN',
      counter: 'CENTER',
      sizingH: 'HUG',
      sizingV: 'FIXED',
    },
    width: 140.4,
    height: 44,
    minWidth: null,
    maxWidth: 320,
    minHeight: null,
    maxHeight: null,
    shadow: {
      x: 0,
      y: 2,
      blur: 6,
      spread: 0,
      color: { hex: '#000000', opacity: 0.2, variable: null },
    },
    blur: 0,
    text: {
      characters: 'Réserver',
      fontFamily: 'Inter',
      fontWeight: 600,
      fontSize: 16,
      fontSizeVariable: null,
      lineHeight: { unit: 'PIXELS', value: 24 },
      color: { hex: '#000000', opacity: 1, variable: 'color/onBrand' },
    },
    ...overrides,
  });
}

test('import Figma : conversion, variantes et liaison aux tokens', () => {
  const c = convertFigmaNode(figmaButton(), tokens, randomUUID(), file);
  componentSchema.parse(c);
  assert.equal(c.name, 'Bouton · Taille=Grand, État=Défaut');
  assert.deepEqual(c.set, {
    id: '12:30',
    name: 'Bouton',
    properties: { Taille: 'Grand', État: 'Défaut' },
  });
  assert.deepEqual(c.source, {
    nodeId: '12:34',
    ...{ fileKey: file.key, fileName: file.name },
  });
  // Valeur égale au token → lié ; variable DS-Studio → lié même si la valeur diffère.
  assert.deepEqual(c.fill, { token: 'color.brand', opacity: 1 });
  assert.deepEqual(c.text, { token: 'color.onBrand', opacity: 1 });
  assert.deepEqual(c.stroke, { hex: '#ABCDEF', opacity: 0.5 });
  assert.deepEqual(c.radius.topLeft, { token: 'radius.control' });
  assert.deepEqual(c.radius.topRight, { px: 8 });
  assert.deepEqual(c.radius.bottomRight, { px: 0 });
  assert.deepEqual(c.layout.gap, { token: 'space.sm' });
  assert.deepEqual(c.layout.padding.right, { token: 'space.lg' });
  assert.deepEqual(c.layout.padding.left, { token: 'space.md' });
  assert.equal(c.layout.distribute, 'space-between');
  assert.equal(c.layout.align, 'center');
  assert.equal(c.layout.sizingX, 'hug');
  assert.equal(c.layout.sizingY, 'fixed');
  assert.equal(c.size.width, 140);
  assert.equal(c.size.maxWidth, 320);
  assert.deepEqual(c.typography.family, { token: 'font.family' });
  assert.deepEqual(c.typography.size, { token: 'font.body' });
  assert.equal(c.typography.weight, 600);
  assert.equal(c.typography.lineHeight, 1.5);
  assert.deepEqual(c.border, { width: 2, style: 'dashed' });
  assert.equal(c.effects.shadow?.blur, 6);
  assert.equal(c.label, 'Réserver');

  // Sans auto layout ni texte : tailles fixes, valeurs par défaut sûres.
  const bare = convertFigmaNode(
    figmaButton({
      layout: null,
      text: null,
      set: null,
      properties: {},
      name: 'Icône',
    }),
    tokens,
    randomUUID(),
    file,
  );
  componentSchema.parse(bare);
  assert.equal(bare.name, 'Icône');
  assert.equal(bare.layout.sizingX, 'fixed');
  assert.equal(bare.set, null);
});

test('import Figma : clé de fichier depuis une URL', () => {
  assert.equal(
    figmaFileKey(
      'https://www.figma.com/design/AbCdEf123456/Kit-UI?node-id=1-2',
    ),
    'AbCdEf123456',
  );
  assert.equal(
    figmaFileKey('https://www.figma.com/file/AbCdEf123456/x'),
    'AbCdEf123456',
  );
  assert.equal(figmaFileKey('https://evil.example/design/AbCdEf123456'), null);
  assert.equal(figmaFileKey('pas une url'), null);
});

test('import Figma : un ré-import met à jour sans dupliquer', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ds-figma-import-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new ComponentStore(directory);
  const first = await store.upsertBySource([
    convertFigmaNode(figmaButton(), tokens, randomUUID(), file),
  ]);
  assert.equal(first.created, 1);
  const id = first.components[0].id;
  const again = await store.upsertBySource([
    convertFigmaNode(
      figmaButton({ text: { ...figmaButton().text!, characters: 'Payer' } }),
      tokens,
      randomUUID(),
      file,
    ),
  ]);
  assert.equal(again.created, 0);
  assert.equal(again.updated, 1);
  assert.equal(again.components.length, 1);
  assert.equal(again.components[0].id, id);
  assert.equal(again.components[0].label, 'Payer');
});
