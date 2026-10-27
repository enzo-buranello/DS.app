import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../app/server/store.js';
import { tokensSchema } from '../app/shared/model.js';
import { createStudioServer } from '../app/server/http.js';
import {
  FigmaAccount,
  fileVault,
  figmaFileKey,
  keychainVault,
} from '../app/server/figmaAccount.js';
// @ts-expect-error module de test JavaScript sans types
import { startFakeFigma } from '../scripts/fake-figma.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seed = tokensSchema.parse(
  JSON.parse(
    await readFile(
      path.join(root, 'workspace/design-system.tokens.json'),
      'utf8',
    ),
  ),
);

test('trousseau : le secret passe par stdin, jamais par les arguments', async () => {
  const calls: { args: string[]; input?: string }[] = [];
  let stored = '';
  const vault = keychainVault(
    async (args, input) => {
      calls.push({ args, input });
      if (args[0] === '-i') {
        stored = input!.trim().split(' ').at(-1)!;
        return { code: 0, stdout: '' };
      }
      if (args[0] === 'find-generic-password')
        return stored
          ? { code: 0, stdout: stored + '\n' }
          : { code: 44, stdout: '' };
      stored = '';
      return { code: 0, stdout: '' };
    },
    'svc',
    'moi',
  );
  assert.equal(await vault.read(), null);
  await vault.write('{"accessToken":"SECRET-123"}');
  assert(calls.every((c) => !c.args.join(' ').includes('SECRET')));
  assert.match(
    calls[1].input!,
    /^add-generic-password -U -s svc -a moi -w [A-Za-z0-9+/=]+\n$/,
  );
  assert.equal(await vault.read(), '{"accessToken":"SECRET-123"}');
  await vault.clear();
  assert.equal(await vault.read(), null);
});

test('coffre fichier : privé (0600) et effaçable', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ds-vault-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const vault = fileVault(path.join(dir, 'oauth.json'));
  await vault.write('{"a":1}');
  assert.equal((await stat(path.join(dir, 'oauth.json'))).mode & 0o777, 0o600);
  assert.equal(await vault.read(), '{"a":1}');
  await vault.clear();
  assert.equal(await vault.read(), null);
});

test('lien de fichier Figma', () => {
  assert.equal(
    figmaFileKey('https://www.figma.com/design/AbCdEf123456/Kit?node-id=0-1'),
    'AbCdEf123456',
  );
  assert.equal(
    figmaFileKey('https://evil.example/design/AbCdEf123456/x'),
    null,
  );
  assert.equal(
    figmaFileKey('http://www.figma.com/design/AbCdEf123456/x'),
    null,
  );
});

async function fixture(
  t: { after: (fn: () => Promise<void>) => void },
  configured = true,
) {
  const dir = await mkdtemp(path.join(tmpdir(), 'ds-oauth-'));
  const figmaServer = await startFakeFigma(0);
  const store = new Store(dir, seed);
  await store.init();
  const account = new FigmaAccount(
    fileVault(path.join(dir, 'oauth.json')),
    configured
      ? {
          FIGMA_CLIENT_ID: 'test',
          FIGMA_CLIENT_SECRET: 'test',
          FIGMA_OAUTH_URL: `${figmaServer.url}/oauth`,
          FIGMA_API_BASE: figmaServer.url,
        }
      : {},
  );
  const app = await createStudioServer({ root, store, figmaAccount: account });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    await app.close();
    await figmaServer.close();
    await rm(dir, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const boot = await (await fetch(origin + '/api/bootstrap')).json();
  const api = (route: string, body?: unknown) =>
    fetch(origin + '/api/' + route, {
      method: body === undefined ? 'GET' : 'POST',
      redirect: 'manual',
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
  const status = async () => (await api('figma')).json();
  const { pairCode } = await status();
  // Parcours navigateur : DS-Studio → Figma → retour (navigation « cross-site »).
  const login = async () => {
    const start = await api('figma/oauth/start');
    assert.equal(start.status, 302);
    const authorize = new URL(start.headers.get('location')!);
    const back = await fetch(authorize, { redirect: 'manual' });
    const callback = back.headers.get('location')!;
    const done = await fetch(callback, {
      headers: { 'Sec-Fetch-Site': 'cross-site' },
    });
    return { authorize, callback, html: await done.text() };
  };
  const plugin = (route: string, body: unknown) =>
    fetch(origin + '/plugin/figma/' + route, {
      method: 'POST',
      headers: {
        Origin: 'null',
        Authorization: 'Bearer ' + pairCode,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  return { api, status, login, plugin, figmaServer, dir };
}

test('OAuth : PKCE, state à usage unique, rafraîchissement, déconnexion', async (t) => {
  const { api, status, login, figmaServer, dir } = await fixture(t);
  assert.deepEqual((await status()).account, {
    configured: true,
    connected: false,
    user: null,
    storage: 'file',
  });
  const { authorize, callback, html } = await login();
  assert.equal(
    authorize.searchParams.get('scope'),
    'current_user:read file_content:read',
  );
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  assert.match(
    authorize.searchParams.get('code_challenge')!,
    /^[A-Za-z0-9_-]{43}$/,
  );
  assert.match(html, /Figma connecté/);
  const s = await status();
  assert.equal(s.account.connected, true);
  assert.equal(s.account.user.handle, 'Camille');
  // Le token n'apparaît jamais dans les réponses de l'app.
  assert.doesNotMatch(JSON.stringify(s), /at-\d/);
  assert.equal((await stat(path.join(dir, 'oauth.json'))).mode & 0o777, 0o600);
  // Rejouer le retour OAuth : refusé.
  const replay = await (await fetch(callback)).text();
  assert.match(replay, /expiré ou inconnu/);

  // Fichier : pages lues par l'API ; le token (120 s) est rafraîchi avant l'appel.
  const before = figmaServer.stats.refreshes;
  const file = await (
    await api('figma/file', {
      url: 'https://www.figma.com/design/AbCdEf123456/Kit-UI',
    })
  ).json();
  assert.equal(file.name, 'Kit UI');
  assert.deepEqual(
    file.pages.map((p: { name: string }) => p.name),
    ['Composants', 'Écrans'],
  );
  assert(figmaServer.stats.refreshes > before);
  assert.equal((await api('figma/file', { url: 'pas un lien' })).status, 400);
  const missing = await api('figma/file', {
    url: 'https://www.figma.com/design/Inconnu12345/x',
  });
  assert.equal(missing.status, 404);
  // Dernier choix mémorisé.
  await api('figma/page', { pageId: '0:2', pageName: 'Écrans' });
  assert.equal((await status()).selection.pageId, '0:2');

  await api('figma/logout', {});
  assert.equal((await status()).account.connected, false);
  const after = await api('figma/file', {
    url: 'https://www.figma.com/design/AbCdEf123456/x',
  });
  assert.equal(after.status, 401);
  assert.match((await after.json()).error, /Non connecté à Figma/);
});

test('OAuth non configuré : message clair, aucune redirection', async (t) => {
  const { api, status } = await fixture(t, false);
  assert.equal((await status()).account.configured, false);
  const start = await api('figma/oauth/start');
  assert.equal(start.status, 503);
  assert.match((await start.json()).error, /FIGMA_CLIENT_ID/);
});

test('export : plugin non lancé, fichier non ouvert, droits, correspondances conservées', async (t) => {
  const { api, login, plugin } = await fixture(t);
  await login();
  const body = { pageId: '0:1', kind: 'ds', definitions: [], screens: [] };
  await api('figma/file', {
    url: 'https://www.figma.com/design/AbCdEf123456/Kit-UI',
  });
  await api('figma/page', { pageId: '0:1', pageName: 'Composants' });
  const notLaunched = await api('figma/export', body);
  assert.equal(notLaunched.status, 409);
  assert.match((await notLaunched.json()).error, /Plugin Figma non lancé/);

  const other = { file: { name: 'Autre', key: 'Zzzzzzzzzz99' }, pages: [] };
  await plugin('live', other);
  const wrongFile = await api('figma/export', body);
  assert.equal(wrongFile.status, 409);
  assert.match(
    (await wrongFile.json()).error,
    /Fichier non ouvert dans Figma : ouvrez « Kit UI »/,
  );

  // Plugin sur le bon fichier : il reçoit les correspondances connues et en renvoie.
  const info = { file: { name: 'Kit UI', key: 'AbCdEf123456' }, pages: [] };
  const answer = async (nodes: Record<string, string>) => {
    for (;;) {
      const { command } = await (await plugin('live', info)).json();
      if (command) {
        await plugin('result', {
          id: command.id,
          ok: true,
          data: {
            pageId: '0:1',
            pageName: 'Composants',
            created: 1,
            updated: 0,
            components: 1,
            sets: 0,
            screens: 0,
            variables: 18,
            mismatched: [],
            nodes,
          },
        });
        return command.args;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  await plugin('live', info);
  const [first, args1] = await Promise.all([
    api('figma/export', body),
    answer({ BookingCard: '10:1' }),
  ]);
  assert.equal(first.status, 200);
  const r1 = await first.json();
  assert.equal(
    r1.link,
    'https://www.figma.com/design/AbCdEf123456/?node-id=0-1',
  );
  assert.deepEqual(args1.nodes, {});
  assert.equal(args1.tokens['color.brand'].$value, '#3154C4');
  const [, args2] = await Promise.all([api('figma/export', body), answer({})]);
  assert.deepEqual(args2.nodes, { BookingCard: '10:1' });

  // Fichier en lecture seule : refusé avant tout envoi au plugin.
  await api('figma/file', {
    url: 'https://www.figma.com/design/ViewOnly12345/x',
  });
  await api('figma/page', { pageId: '0:1', pageName: 'Page 1' });
  const viewer = await api('figma/export', body);
  assert.equal(viewer.status, 403);
  assert.match((await viewer.json()).error, /Droits insuffisants/);
});
