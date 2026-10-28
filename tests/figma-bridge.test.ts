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
import { EXPORT_VERSION as CURRENT_EXPORT } from '../app/shared/figmaExport.js';

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
    connections: [],
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
  // Onglet resté sur l'ancien client : format v1 refusé avec la marche à suivre.
  const old = await fetch(origin + '/api/figma/export', {
    method: 'POST',
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      'X-DS-Studio': boot.csrf,
    },
    body: JSON.stringify({ version: 1, kind: 'design_system' }),
  });
  assert.equal(old.status, 409);
  assert.match((await old.json()).error, /Rechargez la page/);
});

test('export : lots réassemblés, progression relayée, annulation propagée', async (t) => {
  const { EXPORT_VERSION, CHUNK_SIZE } =
    await import('../app/shared/figmaExport.js');
  const bridge = new FigmaBridge(0, 2000);
  await bridge.listen();
  t.after(() => bridge.close());
  const leaf = (i: number) => ({
    id: `custom/${i}`,
    name: `Composant ${i}`,
    set: null,
    variant: null,
    properties: [],
    root: {
      name: 'x'.repeat(150),
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      sizingH: 'FIXED' as const,
      sizingV: 'FIXED' as const,
      children: Array.from({ length: 6 }, () => ({
        name: 'y'.repeat(150),
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        sizingH: 'FIXED' as const,
        sizingV: 'FIXED' as const,
        children: [],
      })),
    },
  });
  const payload: import('../app/shared/figmaExport.js').ExportPayload = {
    version: EXPORT_VERSION as 2,
    kind: 'design_system' as const,
    page: { mode: 'current' as const },
    variables: [],
    textStyles: [],
    effectStyles: [],
    components: Array.from({ length: 300 }, (_, i) => leaf(i)),
    images: [],
  };
  assert.ok(JSON.stringify(payload).length > CHUNK_SIZE, 'au moins deux lots');
  // Plugin simulé : réassemble, publie l'avancement, respecte l'annulation.
  let chunks = 0;
  let stopAt = Infinity;
  const parts: string[] = [];
  const cancelled = new Set<string>();
  const ws = new WebSocket(`ws://127.0.0.1:${bridge.status.port}`);
  ws.onmessage = async (event) => {
    const { id, command, params } = JSON.parse(String(event.data));
    const reply = (body: object) => ws.send(JSON.stringify({ id, ...body }));
    if (command === 'get_document_info')
      return reply({ ok: true, result: { name: 'Nosh' } });
    if (command === 'export_chunk') {
      chunks++;
      parts[params.index] = params.data;
      return reply({ ok: true, result: {} });
    }
    if (command === 'cancel') {
      cancelled.add(params.target);
      return reply({ ok: true, result: {} });
    }
    if (command === 'export_design_system') {
      const received = JSON.parse(parts.join(''));
      for (let done = 1; done <= 5; done++) {
        await new Promise((r) => setTimeout(r, 30));
        if (cancelled.has(id) || done > stopAt)
          return reply({ ok: false, error: 'Export annulé.' });
        reply({ progress: { done, total: 5, label: `Élément ${done}` } });
      }
      return reply({
        ok: true,
        result: {
          pageId: '0:1',
          pageName: 'DS',
          created: received.components.length,
          createdIds: [],
          updated: 0,
          warnings: [],
          orphans: [],
        },
      });
    }
  };
  await new Promise((r) => (ws.onopen = r));
  await until(() => bridge.status.fileName === 'Nosh');

  const job = bridge.startExport(payload);
  assert.equal(job.state, 'running');
  assert.throws(() => bridge.startExport(payload), /déjà en cours/);
  const seen: number[] = [];
  await until(() => {
    const j = bridge.job(job.id);
    if (j.done) seen.push(j.done);
    return j.state !== 'running';
  }, 5000);
  const done = bridge.job(job.id);
  assert.equal(done.state, 'done', String(done.error));
  assert.equal((done.result as { created: number }).created, 300);
  assert.ok(chunks >= 2);
  assert.ok(seen.length >= 2 && seen.at(-1) === 5, `progression : ${seen}`);

  // Annulation pendant l'export : l'app s'arrête et le plugin est prévenu.
  parts.length = 0;
  stopAt = 5;
  const second = bridge.startExport(payload);
  await until(() => bridge.job(second.id).done >= 1, 5000);
  const cancelledJob = bridge.cancelExport(second.id);
  assert.equal(cancelledJob.state, 'cancelled');
  await until(() => cancelled.size === 1);
  assert.equal(bridge.job(second.id).state, 'cancelled');
  ws.close();
});

test('plugin d’une version antérieure : export refusé avant envoi', async (t) => {
  const bridge = new FigmaBridge(0, 500);
  await bridge.listen();
  t.after(() => bridge.close());
  const payload = {
    version: CURRENT_EXPORT as 2,
    kind: 'design_system' as const,
    page: { mode: 'current' as const },
    variables: [],
    textStyles: [],
    effectStyles: [],
    components: [],
    images: [],
  };
  const ws = await fakePlugin(bridge.status.port, handlers('Nosh'));
  // Plugin d'avant le format v2 : il s'annonce sans version.
  ws.send(JSON.stringify({ hello: { fileKey: 'old', fileName: 'Nosh' } }));
  await until(() => bridge.status.connections[0]?.fileKey === 'old');
  assert.equal(bridge.status.connections[0].exportVersion, null);
  assert.throws(
    () => bridge.startExport(payload),
    /date d’avant la mise à jour \(format v1, attendu v2\)/,
  );
  // Relancé : il annonce le format courant, l'export part.
  ws.send(
    JSON.stringify({
      hello: {
        fileKey: 'old',
        fileName: 'Nosh',
        exportVersion: CURRENT_EXPORT,
      },
    }),
  );
  await until(() => bridge.status.connections.at(-1)?.exportVersion === 2);
  const job = bridge.startExport(payload);
  assert.equal(job.state, 'running');
  ws.close();
});
