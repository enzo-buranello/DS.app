import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { importFigma } from '../app/main/agent.js';
import { parseLink } from '../app/main/figma.js';
import { contains, flatten, tree } from '../app/shared/folders.js';
import {
  brokenReferences,
  designSchema,
  emptyProject,
  references,
  slug,
} from '../app/shared/project.js';

const fixture = async () =>
  designSchema.parse(
    JSON.parse(await readFile('tests/fixtures/design.json', 'utf8')),
  );

test('un design system généré est valide et sans référence cassée', async () => {
  const p = { ...emptyProject('A'), ...(await fixture()) };
  assert.deepEqual(brokenReferences(p), []);
  assert.ok(references(p).has('colors:primary'));
});

test('une fondation retirée casse les références qui la visent', async () => {
  const p = { ...emptyProject('A'), ...(await fixture()) };
  const { primary: _, ...colors } = p.foundations.colors;
  const broken = { ...p, foundations: { ...p.foundations, colors } };
  assert.ok(brokenReferences(broken).includes('colors:primary'));
});

test('identifiants lisibles et uniques', () => {
  assert.equal(slug('Couleur 1', {}), 'couleur-1');
  assert.equal(slug('Écart', { ecart: 1 }), 'ecart-2');
});

test('lien Figma : fichier, page ou frame', () => {
  assert.deepEqual(parseLink('https://www.figma.com/design/AbC123/Nom'), {
    fileKey: 'AbC123',
  });
  assert.deepEqual(
    parseLink('https://www.figma.com/design/AbC123/Nom?node-id=12-34&t=x'),
    { fileKey: 'AbC123', nodeId: '12:34' },
  );
  assert.equal(parseLink('https://exemple.com'), null);
});

test('import Figma : met à jour sans doublon, garde les ajouts manuels', async () => {
  process.env.STUDIO_FAKE_FIGMA = 'tests/fixtures/figma.json';
  const base = emptyProject('A');
  const before = {
    ...base,
    foundations: {
      ...base.foundations,
      colors: {
        primary: { name: 'Ancienne', light: '#000000', dark: '#000000' },
        brand: { name: 'Marque', light: '#c8803e', dark: '#c8803e' },
      },
    },
  };
  const out = await importFigma(before, { fileKey: 'KEY' });
  assert.equal(out.foundations.colors.brand.name, 'Marque');
  assert.notEqual(out.foundations.colors.primary.name, 'Ancienne');
  assert.equal(out.figma?.fileKey, 'KEY');
  assert.deepEqual(brokenReferences(out), []);

  process.env.STUDIO_FAKE_FIGMA = 'tests/fixtures/figma-missing.json';
  await assert.rejects(
    importFigma(before, { fileKey: 'KEY' }),
    /figma:notfound/,
  );
  delete process.env.STUDIO_FAKE_FIGMA;
});

test('dossiers : « dossier/nom » regroupe les éléments', () => {
  const t = tree([
    ['a', { name: 'Primaire/500' }],
    ['b', { name: 'Primaire/Survol/600' }],
    ['c', { name: 'Texte' }],
  ]);
  assert.deepEqual(t.leaves, [['c', 'Texte']]);
  assert.equal(t.folders[0].name, 'Primaire');
  assert.deepEqual(t.folders[0].leaves, [['a', '500']]);
  assert.equal(t.folders[0].folders[0].path, 'Primaire/Survol');
  assert.ok(contains(t.folders[0], 'b'));
  assert.deepEqual(
    flatten(t).map((f) => f.path),
    ['', 'Primaire', 'Primaire/Survol'],
  );
});
