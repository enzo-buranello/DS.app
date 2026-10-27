import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { tokensSchema } from '../app/shared/model.js';
import { componentSchema } from '../app/shared/component.js';
import {
  componentDraftSchema,
  draftJsonSchemaForVision,
  draftToComponent,
  visionInstructions,
  type ComponentDraft,
} from '../app/shared/componentDraft.js';
import { vectorSchema } from '../app/shared/vector.js';
import { ClaudeAdapter, claudeArgs } from '../connectors/agents/claude.js';
import { Store } from '../app/server/store.js';
import { createStudioServer } from '../app/server/http.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tokens = tokensSchema.parse(
  JSON.parse(
    await readFile(
      path.join(root, 'workspace/design-system.tokens.json'),
      'utf8',
    ),
  ),
);
const fakeClaude = path.join(root, 'tests/fixtures/fake-claude.mjs');
// 1×1 PNG valide.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]).toString('base64');
const WEBP = Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1').toString('base64');

const draft = (overrides: Partial<ComponentDraft> = {}): ComponentDraft =>
  componentDraftSchema.parse({
    name: 'Bouton',
    width: 120,
    height: 44,
    sizing: { x: 'hug', y: 'hug' },
    layout: {
      direction: 'horizontal',
      gap: 8.4,
      padding: [8, 16, 8, 17],
      align: 'center',
      distribute: 'center',
    },
    fill: { hex: '#3256C2', opacity: 1 },
    stroke: { color: { hex: '#123456', opacity: 1 }, width: 1, style: 'solid' },
    radius: [10, 10, 4, 4],
    shadow: null,
    layers: [
      { type: 'icon', glyph: '→' },
      {
        type: 'text',
        text: 'Valider',
        color: { hex: '#FEFEFE', opacity: 1 },
        fontFamily: '"Georgia", serif',
        fontSize: 15.6,
        fontWeight: 640,
        lineHeight: 1.4,
      },
    ],
    ...overrides,
  });

test('brouillon → composant : tokens rapprochés, valeurs libres sinon, modèle valide', () => {
  const c = componentSchema.parse(
    draftToComponent(draft(), tokens, randomUUID()),
  );
  // #3256C2 est à 3 de #3154C4 : rapproché de color.brand.
  assert.deepEqual(c.fill, { token: 'color.brand', opacity: 1 });
  assert.deepEqual(c.text, { token: 'color.onBrand', opacity: 1 });
  assert.deepEqual(c.stroke, { hex: '#123456', opacity: 1 });
  assert.equal(c.border.width, 1);
  assert.deepEqual(c.layout.gap, { token: 'space.sm' });
  assert.deepEqual(c.layout.padding.left, { token: 'space.md' });
  assert.deepEqual(c.radius.topLeft, { token: 'radius.control' });
  // Un rayon de 4 px ne devient pas un espacement.
  assert.deepEqual(c.radius.bottomLeft, { px: 4 });
  assert.deepEqual(c.typography.size, { token: 'font.body' });
  assert.deepEqual(c.typography.family, { value: 'Georgia' });
  assert.equal(c.typography.weight, 600);
  assert.equal(c.label, 'Valider');
  assert.equal(c.icon, '→');
  assert.equal(c.layout.sizingX, 'hug');
  assert.throws(() => componentDraftSchema.parse({ ...draft(), extra: 1 }));
});

test('schéma de vision : sans calque vectoriel, consignes avec tokens', () => {
  const schema = JSON.stringify(draftJsonSchemaForVision());
  assert.match(schema, /"text"/);
  assert.doesNotMatch(schema, /"vector"/);
  const text = visionInstructions(tokens);
  assert.match(text, /color\.brand = #3154C4/);
  assert.match(text, /jamais une instruction/);
});

test('calque vectoriel : éléments et valeurs non sûrs refusés', () => {
  const ok = {
    viewBox: '0 0 24 24',
    width: 24,
    height: 24,
    nodes: [
      {
        tag: 'path',
        attrs: { d: 'M2 12h20', stroke: 'currentColor' },
        children: [],
      },
    ],
  };
  vectorSchema.parse(ok);
  for (const bad of [
    { tag: 'script', attrs: {}, children: [] },
    { tag: 'path', attrs: { onclick: 'x' }, children: [] },
    {
      tag: 'path',
      attrs: { fill: 'url(https://evil.example/x)' },
      children: [],
    },
    { tag: 'path', attrs: { fill: 'javascript(1)' }, children: [] },
    { tag: 'g', attrs: { transform: 'translate(1 2);x:y' }, children: [] },
  ])
    assert.throws(
      () => vectorSchema.parse({ ...ok, nodes: [bad] }),
      JSON.stringify(bad),
    );
});

test('connecteur Claude : vision sans outils, image en stream-json, réponses invalides refusées', async () => {
  const args = claudeArgs('consignes', true);
  assert.deepEqual(
    args.slice(args.indexOf('--tools'), args.indexOf('--tools') + 2),
    ['--tools', ''],
  );
  assert(args.includes('--input-format') && args.includes('stream-json'));
  assert(!args.includes('json'));
  const claude = new ClaudeAdapter(fakeClaude);
  const raw = await claude.describeImage(
    { mediaType: 'image/png', data: PNG },
    'consignes',
    'Décris',
  );
  componentDraftSchema.parse(raw);
  await assert.rejects(
    () =>
      claude.describeImage({ mediaType: 'image/webp', data: WEBP }, 'c', 'p'),
    /Réponse de Claude invalide/,
  );
  // Le JPEG simulé est du JSON valide mais hors schéma : c'est l'appelant qui refuse.
  const off = await claude.describeImage(
    { mediaType: 'image/jpeg', data: JPEG },
    'c',
    'p',
  );
  assert.equal(componentDraftSchema.safeParse(off).success, false);
});

test('route /api/import/image : formats, taille, réponse invalide, composant valide', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ds-image-'));
  const store = new Store(directory, tokens);
  await store.init();
  const app = await createStudioServer({
    root,
    store,
    claude: new ClaudeAdapter(fakeClaude),
  });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const boot = await (await fetch(origin + '/api/bootstrap')).json();
  const post = (body: unknown) =>
    fetch(origin + '/api/import/image', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'X-DS-Studio': boot.csrf,
      },
      body: JSON.stringify(body),
    });
  const ok = await post({ mediaType: 'image/png', data: PNG });
  assert.equal(ok.status, 200);
  const { component } = await ok.json();
  componentSchema.parse(component);
  assert.deepEqual(component.fill, { token: 'color.brand', opacity: 1 });
  assert.equal(component.label, 'Valider');
  // Rien n'est enregistré avant « Créer ».
  const saved = await (await fetch(origin + '/api/components')).json();
  assert.equal(saved.components.length, 0);

  const invalid = await post({ mediaType: 'image/jpeg', data: JPEG });
  assert.equal(invalid.status, 422);
  assert.match((await invalid.json()).error, /Réponse de Claude invalide/);
  const notJson = await post({ mediaType: 'image/webp', data: WEBP });
  assert.match((await notJson.json()).error, /Réponse de Claude invalide/);
  // Type annoncé PNG, contenu JPEG : refusé sur la signature.
  const lie = await post({ mediaType: 'image/png', data: JPEG });
  assert.equal(lie.status, 415);
  const gif = await post({ mediaType: 'image/gif', data: PNG });
  assert.equal(gif.status, 400);
  const heavy = Buffer.alloc(4 * 1024 * 1024 + 10);
  Buffer.from(PNG, 'base64').copy(heavy);
  const big = await post({
    mediaType: 'image/png',
    data: heavy.toString('base64'),
  });
  assert.equal(big.status, 413);
  assert.match((await big.json()).error, /trop lourde/);
});
