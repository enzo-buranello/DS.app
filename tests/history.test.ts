import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { History } from '../app/main/history.js';
import { changeOf } from '../app/shared/history.js';
import { emptyProject, type Project } from '../app/shared/project.js';

const withPage = (text: string, extra = false): Project => ({
  ...emptyProject('A'),
  pages: {
    home: {
      name: 'Accueil',
      root: {
        id: 'root',
        kind: 'box',
        children: [
          { id: 'text-1', kind: 'text', text },
          ...(extra
            ? [{ id: 'text-2', kind: 'text' as const, text: 'B' }]
            : []),
        ],
      },
    },
  },
});

test('portée : un élément, ou le projet', () => {
  assert.deepEqual(changeOf(withPage('A'), withPage('B')), {
    scope: 'element',
    target: 'pages:home:text-1',
  });
  assert.equal(changeOf(withPage('A'), withPage('A', true)).scope, 'global');
});

test('regroupement, restauration, retrait', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'studio-h-'));
  const h = new History(dir);
  const p0 = withPage('A');
  await h.record(null, p0, { kind: 'create', label: 'Création' });
  await h.record(p0, withPage('B'), { kind: 'manual' });
  await h.record(withPage('B'), withPage('C'), { kind: 'manual' });
  assert.equal((await h.list()).length, 2);
  const ai = await h.record(withPage('C'), withPage('C', true), {
    kind: 'ai',
    label: 'Ajoute un texte',
  });
  const [latest, manual] = await h.list();
  assert.equal(latest.label, 'Ajoute un texte');
  assert.equal((await h.get(manual.id)).pages.home.root.children![0].text, 'C');
  const back = await h.discard(ai.id);
  assert.equal(back?.pages.home.root.children!.length, 1);
  assert.equal((await h.list()).length, 2);
});
