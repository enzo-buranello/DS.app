import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createProject,
  moveProject,
  projectFile,
  readProject,
  Recents,
  writeProject,
} from '../app/main/projects.js';
import { projectSchema } from '../app/shared/project.js';

const temp = () => mkdtemp(path.join(tmpdir(), 'studio-'));

test('crée un projet vide puis le relit', async () => {
  const dir = await temp();
  const p = await createProject(dir, 'Boutique');
  assert.equal(p.name, 'Boutique');
  assert.deepEqual(p.pages, {});
  assert.deepEqual(await readProject(dir), p);
});

test('un dossier qui contient déjà un projet est ouvert tel quel', async () => {
  const dir = await temp();
  await createProject(dir, 'Premier');
  assert.equal((await createProject(dir, 'Second')).name, 'Premier');
});

test('un fichier invalide est refusé sans être écrasé', async () => {
  const dir = await temp();
  await createProject(dir, 'A');
  await writeFile(projectFile(dir), '{"version":1}');
  await assert.rejects(readProject(dir));
  await assert.rejects(createProject(dir, 'B'));
  assert.equal(await readFile(projectFile(dir), 'utf8'), '{"version":1}');
});

test('les styles ne contiennent que des identifiants de tokens', () => {
  const base = { version: 1, name: 'A', updatedAt: new Date().toISOString() };
  const empty = { colors: {}, fonts: {}, spacing: {}, radius: {}, shadows: {} };
  const page = (style: object) => ({
    ...base,
    foundations: empty,
    components: {},
    collections: {},
    pages: { home: { name: 'Accueil', root: { id: 'r', kind: 'box', style } } },
  });
  assert.ok(projectSchema.safeParse(page({ desktop: { gap: 'm' } })).success);
  assert.ok(
    !projectSchema.safeParse(page({ desktop: { gap: '#fff' } })).success,
  );
  assert.ok(!projectSchema.safeParse(page({ desktop: { left: 'm' } })).success);
});

test('changer de dossier copie le projet et met à jour la liste', async () => {
  const [a, b, data] = await Promise.all([temp(), temp(), temp()]);
  const recents = new Recents(path.join(data, 'projects.json'));
  await writeProject(a, await createProject(a, 'Site'));
  await recents.add(a);
  await moveProject(a, b);
  await recents.add(b, a);
  assert.deepEqual(
    (await recents.list()).map((p) => p.path),
    [b],
  );
  assert.equal((await readProject(a)).name, 'Site');
});
