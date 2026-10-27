import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../app/server/store.js';
import { tokensSchema } from '../app/shared/model.js';
import { createStudioServer } from '../app/server/http.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seed = tokensSchema.parse(
  JSON.parse(
    await readFile(
      path.join(root, 'workspace/design-system.tokens.json'),
      'utf8',
    ),
  ),
);
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
  const pre = await fetch(origin + '/plugin/figma/live', {
    method: 'OPTIONS',
    headers: { Origin: 'null', 'Access-Control-Request-Method': 'POST' },
  });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'null');
});

test('nouveau code d’appairage : l’ancien est révoqué', async (t) => {
  const { api, plugin, info } = await fixture(t);
  const next = await (await api('figma/pair-reset', {})).json();
  assert.notEqual(next.pairCode, info.pairCode);
  assert.equal((await plugin('ping', undefined, info.pairCode)).status, 401);
  assert.equal((await plugin('ping', undefined, next.pairCode)).status, 200);
});
