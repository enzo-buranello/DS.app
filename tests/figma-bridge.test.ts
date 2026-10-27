import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FigmaBridge } from '../app/server/figmaBridge.js';
import { Store } from '../app/server/store.js';
import { createStudioServer } from '../app/server/http.js';
import { tokensSchema } from '../app/shared/model.js';

const until = async (check: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('Condition non atteinte.');
    await new Promise((r) => setTimeout(r, 10));
  }
};
// Plugin simulé : même protocole que figma-plugin/ui.html + code.js.
function fakePlugin(
  port: number,
  handlers: Record<string, (params: Record<string, unknown>) => unknown>,
) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  ws.onmessage = (event) => {
    const { id, command, params } = JSON.parse(String(event.data));
    const handler = handlers[command];
    if (!handler) return; // pas de réponse : sert à tester le délai.
    try {
      ws.send(JSON.stringify({ id, ok: true, result: handler(params) }));
    } catch (e) {
      ws.send(JSON.stringify({ id, ok: false, error: (e as Error).message }));
    }
  };
  return new Promise<WebSocket>((resolve, reject) => {
    ws.onopen = () => resolve(ws);
    ws.onerror = () => reject(new Error('connexion refusée'));
  });
}
const handlers = (name: string) => ({
  ping: () => ({ pong: true }),
  get_document_info: () => ({ name, pages: [{ id: '0:1', name: 'Page 1' }] }),
  get_node: ({ id }: Record<string, unknown>) => {
    if (id !== '1:2') throw new Error('Nœud introuvable : ' + id + '.');
    return { id, type: 'FRAME', big: 'x'.repeat(200_000) };
  },
});

test('pont Figma : état, aller-retour, erreur, délai, paramètres, gros message', async (t) => {
  const bridge = new FigmaBridge(0, 300);
  await bridge.listen();
  t.after(() => bridge.close());
  const port = bridge.status.port;
  assert.deepEqual(bridge.status, {
    state: 'waiting',
    port,
    fileName: null,
    error: null,
  });
  await assert.rejects(
    () => bridge.request('ping', {}),
    /Plugin Figma non connecté/,
  );

  const ws = await fakePlugin(port, handlers('Nosh'));
  await until(() => bridge.status.fileName === 'Nosh');
  assert.equal(bridge.status.state, 'connected');
  assert.deepEqual(await bridge.request('ping', {}), { pong: true });
  // Réponse de 200 Ko : longueur de trame sur 64 bits.
  const node = (await bridge.request('get_node', { id: '1:2' })) as {
    big: string;
  };
  assert.equal(node.big.length, 200_000);
  await assert.rejects(
    () => bridge.request('get_node', { id: '9:9' }),
    (e: Error & { status?: number }) =>
      e.status === 502 && /Figma : Nœud introuvable/.test(e.message),
  );
  await assert.rejects(
    () => bridge.request('get_selection', {}),
    (e: Error & { status?: number }) =>
      e.status === 504 && /n’a pas répondu/.test(e.message),
  );
  assert.throws(() => bridge.request('create_frame', { x: 'a' } as never));

  // Déconnexion : retour à « en attente », sans nom de fichier.
  ws.close();
  await until(() => bridge.status.state === 'waiting');
  assert.equal(bridge.status.fileName, null);
});

test('pont Figma : reconnexion, une seule connexion, origine web refusée, port occupé', async (t) => {
  const bridge = new FigmaBridge(0, 500);
  await bridge.listen();
  t.after(() => bridge.close());
  const port = bridge.status.port;
  const first = await fakePlugin(port, handlers('Ancien'));
  await until(() => bridge.status.fileName === 'Ancien');
  const closed = new Promise((r) => (first.onclose = r));
  await fakePlugin(port, handlers('Nosh'));
  await closed;
  await until(() => bridge.status.fileName === 'Nosh');
  assert.deepEqual(await bridge.request('ping', {}), { pong: true });

  // Une page web (vraie origine) ne peut pas se faire passer pour le plugin.
  const status = await new Promise<number>((resolve) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        Origin: 'https://site-quelconque.example',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        'Sec-WebSocket-Version': '13',
      },
    });
    req.on('response', (res) => resolve(res.statusCode!));
    req.on('upgrade', () => resolve(101));
    req.end();
  });
  assert.equal(status, 403);
  assert.equal(bridge.status.fileName, 'Nosh');

  const busy = new FigmaBridge(port);
  await busy.listen();
  assert.equal(busy.status.state, 'disconnected');
  assert.match(busy.status.error!, new RegExp(`Port ${port} occupé`));
});

test('routes HTTP du pont : état et commande relayée', async (t) => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const seed = tokensSchema.parse(
    JSON.parse(
      await readFile(
        path.join(root, 'workspace/design-system.tokens.json'),
        'utf8',
      ),
    ),
  );
  const dir = await mkdtemp(path.join(tmpdir(), 'ds-bridge-'));
  const store = new Store(dir, seed);
  await store.init();
  const figma = new FigmaBridge(0, 500);
  await figma.listen();
  const app = await createStudioServer({ root, store, figma });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await app.close();
    await figma.close();
    await rm(dir, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const boot = await (await fetch(origin + '/api/bootstrap')).json();
  const command = (body: unknown) =>
    fetch(origin + '/api/figma/command', {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'X-DS-Studio': boot.csrf,
      },
      body: JSON.stringify(body),
    });
  const before = await (await fetch(origin + '/api/figma/status')).json();
  assert.equal(before.state, 'waiting');
  assert.equal((await command({ command: 'ping', params: {} })).status, 503);
  await fakePlugin(figma.status.port, handlers('Nosh'));
  await until(() => figma.status.fileName === 'Nosh');
  const status = await (await fetch(origin + '/api/figma/status')).json();
  assert.deepEqual(
    { state: status.state, fileName: status.fileName },
    { state: 'connected', fileName: 'Nosh' },
  );
  const ping = await command({ command: 'ping', params: {} });
  assert.deepEqual(await ping.json(), { ok: true, result: { pong: true } });
  assert.equal((await command({ command: 'rm_rf', params: {} })).status, 400);
  assert.equal(
    (await command({ command: 'create_frame', params: { color: 'rouge' } }))
      .status,
    400,
  );
});
