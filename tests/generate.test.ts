import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { safePath } from '../app/main/generate.js';

test('un plan de fichiers reste dans la cible', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'studio-plan-'));
  assert.equal(safePath(out, 'index.html'), true);
  assert.equal(safePath(out, 'src/App.tsx'), true);
  assert.equal(safePath(out, '../hors.txt'), false);
  assert.equal(safePath(out, '/tmp/hors.txt'), false);
  assert.equal(safePath(out, 'node_modules/x.js'), false);
  assert.equal(safePath(out, ''), false);
});
