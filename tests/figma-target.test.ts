import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFigmaUrl } from '../app/shared/figmaTarget.js';
import { FigmaBridge } from '../app/server/figmaBridge.js';
import { Store } from '../app/server/store.js';
import { createStudioServer } from '../app/server/http.js';
import { tokensSchema } from '../app/shared/model.js';

const KEY_A = 'iUWEVG8MtolVVF3uv2f24U';
const KEY_B = 'Zx9QpL2mN7rT4vW8yB1cD3';
const until = async (check: () => boolean, ms = 2000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('Condition non atteinte.');
    await new Promise((r) => setTimeout(r, 10));
  }
};

test('URL Figma : fileKey, node-id converti, /file/, branche, erreurs', () => {
  assert.deepEqual(
    parseFigmaUrl(
      `https://www.figma.com/design/${KEY_A}/Nosh-App?node-id=12-34&t=abc`,
    ),
    {
      ok: true,
      fileKey: KEY_A,
      nodeId: '12:34',
      url: `https://www.figma.com/design/${KEY_A}/Nosh-App?node-id=12-34&t=abc`,
    },
  );
  const file = parseFigmaUrl(`  https://www.figma.com/file/${KEY_B}/Old  `);
  assert.ok(file.ok);
  assert.equal(file.fileKey, KEY_B);
  assert.equal(file.nodeId, null);
  // node-id déjà au format « : » (encodé) accepté aussi.
  const encoded = parseFigmaUrl(
    `https://figma.com/design/${KEY_A}/x?node-id=0%3A1`,
  );
  assert.ok(encoded.ok && encoded.nodeId === '0:1');
  const branch = parseFigmaUrl(
    `https://www.figma.com/design/${KEY_A}/branch/${KEY_B}/Nosh`,
  );
  assert.ok(branch.ok && branch.fileKey === KEY_B);
  for (const [input, message] of [
    ['pas une url', /URL invalide/],
    [`http://www.figma.com/design/${KEY_A}/x`, /https:\/\/www\.figma\.com/],
    [`https://www.figma.com.evil.example/design/${KEY_A}/x`, /figma\.com/],
    [`https://user:pw@www.figma.com/design/${KEY_A}/x`, /figma\.com/],
    [`https://www.figma.com/proto/${KEY_A}/x`, /\/design\//],
    ['https://www.figma.com/design/', /\/design\//],
    ['https://www.figma.com/design/abc/x', /Clé de fichier/],
    [`https://www.figma.com/design/${KEY_A}/x?node-id=abc`, /node-id invalide/],
  ] as const) {
    const r = parseFigmaUrl(input);
    assert.equal(r.ok, false, input);
    assert.match((r as { error: string }).error, message, input);
  }
});

// Plugin simulé qui s'annonce (hello) comme figma-plugin/ui.html.
function plugin(
  port: number,
  fileKey: string,
  fileName: string,
  pages: Record<string, string> = { '0:1': 'Page 1', '5:1': 'Écrans' },
  nodes: Record<string, string> = { '5:7': '5:1' },
) {
  let current = '0:1';
  const ws = new WebSocket(`ws://127.0.0.1:${port}`);
  const calls: string[] = [];
  ws.onmessage = (event) => {
    const { id, command, params } = JSON.parse(String(event.data));
    calls.push(command);
    const reply = (result: unknown) =>
      ws.send(JSON.stringify({ id, ok: true, result }));
    const info = () => ({
      fileKey,
      name: fileName,
      currentPage: { id: current, name: pages[current] },
      pages: Object.entries(pages).map(([id, name]) => ({ id, name })),
    });
    if (command === 'get_document_info' || command === 'get_file_info')
      return reply(info());
    if (command === 'ping') return reply({ file: fileName });
    if (command === 'set_target_page') {
      const page = params.nodeId
        ? pages[params.nodeId]
          ? params.nodeId
          : nodes[params.nodeId]
        : null;
      if (page) current = page;
      return reply({
        pageId: current,
        pageName: pages[current],
        warning:
          params.nodeId && !page
            ? `Nœud ${params.nodeId} introuvable : page courante « ${pages[current]} » utilisée.`
            : null,
      });
    }
  };
  return new Promise<{ ws: WebSocket; calls: string[] }>((resolve) => {
    ws.onopen = () => {
      ws.send(JSON.stringify({ hello: { fileKey, fileName } }));
      resolve({ ws, calls });
    };
  });
}

test('pont : plusieurs fichiers connectés, routage par fileKey, remplacement', async (t) => {
  const bridge = new FigmaBridge(0, 500);
  await bridge.listen();
  t.after(() => bridge.close());
  const port = bridge.status.port;
  const seen: string[] = [];
  bridge.onFile = (k) => seen.push(k);
  const a = await plugin(port, KEY_A, 'Nosh');
  await plugin(port, KEY_B, 'Marketing');
  await until(() => bridge.status.connections.length === 2 && seen.length >= 2);
  assert.deepEqual(bridge.status.connections.map((c) => c.fileName).sort(), [
    'Marketing',
    'Nosh',
  ]);
  assert.ok(bridge.has(KEY_A) && bridge.has(KEY_B));
  assert.deepEqual(await bridge.request('ping', {}, KEY_A), { file: 'Nosh' });
  assert.deepEqual(await bridge.request('ping', {}, KEY_B), {
    file: 'Marketing',
  });
  await assert.rejects(
    () => bridge.request('ping', {}, 'Absent0000000000'),
    /Fichier Figma cible non ouvert/,
  );
  // Plugin relancé dans le même fichier : l'ancienne connexion est fermée.
  const closed = new Promise((r) => (a.ws.onclose = r));
  await plugin(port, KEY_A, 'Nosh (relancé)');
  await closed;
  await until(() => bridge.status.connections.length === 2);
  assert.deepEqual(await bridge.request('ping', {}, KEY_A), {
    file: 'Nosh (relancé)',
  });
  // La fermeture d'un fichier ne touche pas l'autre.
  assert.deepEqual(await bridge.request('ping', {}, KEY_B), {
    file: 'Marketing',
  });
});

async function studio(dir: string, figma: FigmaBridge, opened: string[]) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const seed = tokensSchema.parse(
    JSON.parse(
      await readFile(
        path.join(root, 'workspace/design-system.tokens.json'),
        'utf8',
      ),
    ),
  );
  const store = new Store(dir, seed);
  await store.init();
  const app = await createStudioServer({
    root,
    store,
    figma,
    openUrl: (url) => {
      opened.push(url);
      return { opened: true };
    },
  });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const boot = await (await fetch(origin + '/api/bootstrap')).json();
  const post = async (route: string, body: unknown) => {
    const r = await fetch(origin + '/api/' + route, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        'X-DS-Studio': boot.csrf,
      },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  const status = async () => (await fetch(origin + '/api/figma/status')).json();
  return { app, post, status };
}

test('cible par URL : validée, en attente puis ouverte, page résolue, mémorisée', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ds-target-'));
  const figma = new FigmaBridge(0, 500);
  await figma.listen();
  const opened: string[] = [];
  let s = await studio(dir, figma, opened);
  t.after(async () => {
    await s.app.close();
    await figma.close();
    await rm(dir, { recursive: true, force: true });
  });
  const urlA = `https://www.figma.com/design/${KEY_A}/Nosh?node-id=5-7`;
  const urlB = `https://www.figma.com/design/${KEY_B}/Marketing?node-id=9-9`;

  // URL invalide : refusée avec le message à afficher sous le champ.
  const bad = await s.post('figma/target', { url: 'https://example.com/x' });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /figma\.com/);
  assert.equal(
    (await s.post('figma/open', { url: 'file:///etc' })).status,
    400,
  );

  // Fichier absent : attente, l'app demande l'ouverture système.
  const waiting = await s.post('figma/target', { url: urlA });
  assert.deepEqual(waiting.body, { state: 'waiting', fileKey: KEY_A });
  assert.deepEqual((await s.post('figma/open', { url: urlA })).body, {
    opened: true,
  });
  assert.deepEqual(opened, [urlA]);

  // Le plugin arrive dans ce fichier : cible validée, page du nœud 5:7.
  await plugin(figma.status.port, KEY_A, 'Nosh');
  await plugin(figma.status.port, KEY_B, 'Marketing');
  await until(() => figma.has(KEY_A) && figma.has(KEY_B));
  const ok = await s.post('figma/target', { url: urlA });
  assert.equal(ok.body.state, 'ok');
  assert.deepEqual(
    [ok.body.target.fileName, ok.body.target.pageName, ok.body.target.nodeId],
    ['Nosh', 'Écrans', '5:7'],
  );
  assert.equal(ok.body.warning, null);
  let st = await s.status();
  assert.equal(st.target.fileKey, KEY_A);
  assert.equal(st.targetConnected, true);
  // Le panneau de test suit la cible, pas le dernier plugin connecté.
  const ping = await s.post('figma/command', { command: 'ping', params: {} });
  assert.deepEqual(ping.body.result, { file: 'Nosh' });

  // Bascule vers l'autre fichier ; nœud introuvable : page courante + avertissement.
  const other = await s.post('figma/target', { url: urlB });
  assert.equal(other.body.target.fileKey, KEY_B);
  assert.equal(other.body.target.pageName, 'Page 1');
  assert.match(other.body.warning, /introuvable/);

  // Mémorisée par projet : relue au redémarrage de DS-Studio.
  await s.app.close();
  s = await studio(dir, figma, opened);
  st = await s.status();
  assert.equal(st.target.fileKey, KEY_B);
  assert.equal(st.target.pageName, 'Page 1');
  const saved = JSON.parse(
    await readFile(path.join(dir, 'figma.json'), 'utf8'),
  );
  assert.equal(saved.target.fileKey, KEY_B);

  await s.post('figma/target/clear', {});
  assert.equal((await s.status()).target, null);
});
