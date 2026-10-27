import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ComponentStore } from '../app/server/components.js';
import {
  componentCss,
  componentSchema,
  newComponent,
} from '../app/shared/component.js';

test('composant : les valeurs liées restent des références de token', () => {
  const c = newComponent(randomUUID(), 1);
  const css = componentCss(c);
  assert.equal(css.background, 'var(--color-brand)');
  assert.equal(css.color, 'var(--color-onBrand)');
  assert.equal(css.borderRadius, 'var(--radius-control) '.repeat(4).trim());
  assert.equal(
    css.padding,
    'var(--space-sm) var(--space-md) var(--space-sm) var(--space-md)',
  );
  assert.equal(css.fontFamily, 'var(--font-family)');
  assert.equal(css.fontSize, 'var(--font-body)');
  assert.equal(css.width, 'fit-content');
  const free = componentCss({
    ...c,
    fill: { hex: '#112233', opacity: 0.5 },
    stroke: { token: 'color.border', opacity: 1 },
    radius: { ...c.radius, topLeft: { px: 20 } },
    layout: {
      ...c.layout,
      direction: 'vertical',
      sizingX: 'fill',
      sizingY: 'fixed',
    },
    border: { width: 2, style: 'dashed' },
    effects: {
      shadow: {
        x: 1,
        y: 2,
        blur: 3,
        spread: 4,
        color: { token: 'color.text', opacity: 0.25 },
      },
      blur: 2,
    },
    size: { ...c.size, height: 48, maxWidth: 300 },
  });
  assert.equal(free.background, 'color-mix(in srgb, #112233 50%, transparent)');
  assert.equal(free.borderColor, 'var(--color-border)');
  assert.match(String(free.borderRadius), /^20px var\(--radius-control\)/);
  assert.equal(free.flexDirection, 'column');
  assert.equal(free.width, '100%');
  assert.equal(free.height, '48px');
  assert.equal(free.maxWidth, '300px');
  assert.equal(free.borderStyle, 'dashed');
  assert.equal(
    free.boxShadow,
    '1px 2px 3px 4px color-mix(in srgb, var(--color-text) 25%, transparent)',
  );
  assert.equal(free.filter, 'blur(2px)');
  assert.throws(() =>
    componentSchema.parse({ ...c, fill: { token: 'space.md', opacity: 1 } }),
  );
  assert.throws(() => componentSchema.parse({ ...c, extra: true }));
});

test('composants : sauvegarde, mise à jour, suppression, fichier préservé', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ds-components-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new ComponentStore(directory);
  assert.deepEqual(await store.read(), { components: [] });
  const a = newComponent(randomUUID(), 1);
  const b = newComponent(randomUUID(), 2);
  await Promise.all([store.save(a), store.save(b)]);
  await store.save({ ...a, name: 'Bouton principal' });
  const saved = await new ComponentStore(directory).read();
  assert.deepEqual(
    saved.components.map((c) => c.name),
    ['Bouton principal', 'Bouton 2'],
  );
  assert.throws(() =>
    store.save({ ...a, layout: { ...a.layout, gap: { px: -1 } } }),
  );
  await store.remove(b.id);
  assert.equal((await store.read()).components.length, 1);
  await writeFile(path.join(directory, 'components.json'), '{broken');
  await assert.rejects(() => store.read(), /Original préservé/);
  assert.equal(
    await readFile(path.join(directory, 'components.json'), 'utf8'),
    '{broken',
  );
});
