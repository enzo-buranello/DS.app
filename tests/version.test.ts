import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  clientBuild,
  serverFingerprint,
  versionWatch,
} from '../app/server/version.js';
import { versionState } from '../app/client/useVersion.js';

test('serveur périmé : empreinte du code relue, changement détecté', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'ds-version-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'app/server'), { recursive: true });
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  const server = path.join(root, 'app/server/http.ts');
  await writeFile(server, 'export {};');
  await writeFile(path.join(root, 'scripts/runtime.mjs'), '');
  // Un script hors du serveur (lanceur) ne compte pas.
  await writeFile(path.join(root, 'scripts/launcher.mjs'), '');
  const first = await serverFingerprint(root);
  await writeFile(path.join(root, 'scripts/launcher.mjs'), 'changé');
  assert.equal(await serverFingerprint(root), first);
  const watch = await versionWatch(root);
  assert.equal(await watch.stale(), false);
  const later = new Date(Date.now() + 60_000);
  await utimes(server, later, later);
  assert.notEqual(await serverFingerprint(root), first);
  // Relu au plus toutes les 2 s : encore à jour juste après.
  assert.equal(await watch.stale(), false);
  const fresh = await versionWatch(root);
  await writeFile(server, 'export const changed = 1;');
  await new Promise((r) => setTimeout(r, 2100));
  assert.equal(await fresh.stale(), true);
});

test('bundle client publié, et décision de l’onglet', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'ds-version-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(await clientBuild(root), null);
  await mkdir(path.join(root, 'dist'));
  await writeFile(
    path.join(root, 'dist/index.html'),
    '<script type="module" src="/assets/index-AbC_12-x.js"></script>',
  );
  assert.equal(await clientBuild(root), 'assets/index-AbC_12-x.js');
  const body = (client: string | null, serverStale = false) => ({
    status: 200,
    body: { client, serverStale },
  });
  // Même bundle : rien à faire ; bundle plus récent publié : recharger.
  assert.deepEqual(
    versionState('assets/index-A.js', body('assets/index-A.js')),
    {
      reload: false,
      serverStale: false,
    },
  );
  assert.equal(
    versionState('assets/index-A.js', body('assets/index-B.js')).reload,
    true,
  );
  // Développement (pas de bundle) : jamais de rechargement demandé.
  assert.equal(versionState(null, body('assets/index-B.js')).reload, false);
  assert.equal(versionState('assets/index-A.js', body(null)).reload, false);
  assert.equal(
    versionState('assets/index-A.js', body('assets/index-A.js', true))
      .serverStale,
    true,
  );
  // Serveur sans /api/version : antérieur à ce contrôle, donc périmé.
  assert.deepEqual(versionState('assets/index-A.js', { status: 404 }), {
    reload: false,
    serverStale: true,
  });
});
