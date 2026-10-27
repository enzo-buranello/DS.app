import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../app/server/store.js';
import { tokensSchema } from '../app/shared/model.js';
import { createStudioServer } from '../app/server/http.js';
import { importItems, type StoredImport } from '../app/shared/figma.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seed = tokensSchema.parse(
  JSON.parse(
    await readFile(
      path.join(root, 'workspace/design-system.tokens.json'),
      'utf8',
    ),
  ),
);
// PNG 1×1 transparent.
const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ds-figma-'));
  const store = new Store(directory, seed);
  await store.init();
  const app = await createStudioServer({ root, store });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const boot = await (await fetch(origin + '/api/bootstrap')).json();
  const api = async (route: string, body?: unknown) =>
    fetch(origin + '/api/' + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers:
        body === undefined
          ? {}
          : {
              Origin: origin,
              'Content-Type': 'application/json',
              'X-DS-Studio': boot.csrf,
            },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const info = await (await api('figma')).json();
  const plugin = (
    route: string,
    body?: unknown,
    code = info.pairCode,
    extra: Record<string, string> = {},
  ) =>
    fetch(origin + '/plugin/figma/' + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Origin: 'null',
        Authorization: 'Bearer ' + code,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { origin, api, plugin, store, info };
}

const payload = {
  fileName: 'Mon DS',
  variables: [
    {
      name: 'color/brand',
      collection: 'Tokens',
      type: 'COLOR',
      value: '#C2185B',
    },
    {
      name: 'Brand/Hover',
      collection: 'Tokens',
      type: 'COLOR',
      value: '#8E1244',
    },
    { name: 'space/md', collection: 'Tokens', type: 'FLOAT', value: 20 },
  ],
  paintStyles: [{ name: 'Danger', hex: '#D32F2F' }],
  textStyles: [
    { name: 'Body', fontFamily: 'Georgia', fontStyle: 'Regular', fontSize: 17 },
  ],
  images: [{ name: 'Bouton', width: 1, height: 1, png: PNG }],
};

test('plugin : appairage obligatoire, origine « null » seule acceptée, CORS', async (t) => {
  const { origin, plugin } = await fixture(t);
  assert.equal((await plugin('ping')).status, 200);
  assert.equal((await plugin('ping', undefined, 'mauvais-code')).status, 401);
  assert.equal(
    (
      await plugin('ping', undefined, undefined, {
        Origin: 'https://evil.invalid',
      })
    ).status,
    403,
  );
  const pre = await fetch(origin + '/plugin/figma/import', {
    method: 'OPTIONS',
    headers: { Origin: 'null', 'Access-Control-Request-Method': 'POST' },
  });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'null');
});

test('import Figma : stockage, correspondances suggérées, proposition « figma » sans écriture', async (t) => {
  const { api, plugin, store } = await fixture(t);
  const res = await plugin('import', payload);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    variables: 3,
    paintStyles: 1,
    textStyles: 1,
    images: 1,
  });
  const info = await (await api('figma')).json();
  const byLabel = Object.fromEntries(
    info.import.items.map((i: { label: string; suggested: string | null }) => [
      i.label,
      i.suggested,
    ]),
  );
  assert.equal(byLabel['Tokens · color/brand'], 'color.brand');
  assert.equal(byLabel['Tokens · Brand/Hover'], 'color.brandHover');
  assert.equal(byLabel['Tokens · space/md'], 'space.md');
  assert.equal(byLabel['Danger'], 'color.danger');
  assert.equal(byLabel['Body · taille'], 'font.body');
  assert.equal(byLabel['Body · police'], 'font.family');
  const img = await api('figma/image/' + info.import.images[0].id);
  assert.equal(img.headers.get('content-type'), 'image/png');
  // Rien n'est appliqué tant que le diff n'est pas validé.
  const proposal = await (
    await api('figma/propose', {
      revision: 0,
      changes: [{ key: 'color.brand', value: '#C2185B' }],
    })
  ).json();
  assert.equal(proposal.source, 'figma');
  assert.equal(store.snapshot().revision, 0);
  assert.equal((await api('commit', { id: proposal.id })).status, 200);
  assert.equal(store.snapshot().tokens['color.brand'].$value, '#C2185B');
  assert.equal(store.snapshot().history.at(-1)?.source, 'figma');
});

test('import Figma : image non PNG et données hors bornes refusées', async (t) => {
  const { plugin } = await fixture(t);
  const fake = Buffer.from('<svg/>').toString('base64');
  assert.equal(
    (
      await plugin('import', {
        ...payload,
        images: [{ name: 'x', width: 1, height: 1, png: fake }],
      })
    ).status,
    400,
  );
  assert.equal(
    (await plugin('import', { ...payload, extra: true })).status,
    400,
  );
  assert.equal(
    (
      await plugin('import', {
        ...payload,
        variables: [{ name: 'x', collection: '', type: 'COLOR', value: 'red' }],
      })
    ).status,
    400,
  );
});

test('export : écrans préparés par l’app, relus par le plugin avec les tokens du disque', async (t) => {
  const { api, plugin } = await fixture(t);
  assert.equal((await plugin('export')).status, 404);
  const screen = {
    name: 'DS-Studio / Découvrir / 375',
    width: 375,
    root: {
      name: 'DS-Studio / Découvrir / 375',
      x: 0,
      y: 0,
      w: 375,
      h: 600,
      fill: { hex: '#F3F5FA', opacity: 1, token: 'color.canvas' },
      layout: {
        mode: 'VERTICAL',
        gap: 16,
        padding: [16, 16, 16, 16],
        paddingTokens: [undefined, undefined, undefined, undefined],
        primary: 'MIN',
        counter: 'MIN',
      },
      children: [],
    },
  };
  assert.equal((await api('figma/screens', { screens: [screen] })).status, 200);
  const data = await (await plugin('export')).json();
  assert.equal(data.screens[0].name, screen.name);
  assert.equal(data.tokens['color.brand'].$value, '#3154C4');
  assert.equal((await api('figma/screens', { screens: [] })).status, 400);
});

test('nouveau code d’appairage : l’ancien est révoqué', async (t) => {
  const { api, plugin, info } = await fixture(t);
  const next = await (await api('figma/pair-reset', {})).json();
  assert.notEqual(next.pairCode, info.pairCode);
  assert.equal((await plugin('ping', undefined, info.pairCode)).status, 401);
  assert.equal((await plugin('ping', undefined, next.pairCode)).status, 200);
});

test('correspondances : polices hors liste et valeurs incompatibles ignorées', () => {
  const data: StoredImport = {
    date: new Date().toISOString(),
    fileName: 'x',
    variables: [
      { name: 'radius/control', collection: '', type: 'FLOAT', value: 500 },
    ],
    paintStyles: [],
    textStyles: [
      { name: 'Heading', fontFamily: 'Inter', fontStyle: 'Bold', fontSize: 32 },
    ],
    images: [],
  };
  const items = importItems(data, seed);
  assert.equal(items[0].suggested, null); // 500 > 128
  assert.equal(items[1].suggested, 'font.heading');
  assert.equal(items[2].suggested, null); // Inter hors schéma v1
});
