import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fetchFigma, fileKey } from '../app/main/figma.js';
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

test('lien Figma', () => {
  assert.equal(
    fileKey('https://www.figma.com/design/AbC123/Nom?node-id=1'),
    'AbC123',
  );
  assert.equal(fileKey('https://exemple.com'), null);
});

test('Figma : styles et composants publiés, puis leurs seuls nœuds', async () => {
  const calls: string[] = [];
  const responses: Record<string, object> = {
    '/styles': {
      meta: {
        styles: [{ node_id: '1:1', name: 'Primaire', style_type: 'FILL' }],
      },
    },
    '/components': {
      meta: { components: [{ node_id: '2:2', name: 'Bouton' }] },
    },
    '/nodes?ids=1%3A1%2C2%3A2': {
      nodes: {
        '1:1': {
          document: {
            type: 'RECTANGLE',
            name: 'Primaire',
            fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }],
          },
        },
        '2:2': {
          document: {
            type: 'COMPONENT',
            name: 'Bouton',
            layoutMode: 'HORIZONTAL',
            absoluteBoundingBox: {},
            children: [
              {
                type: 'TEXT',
                name: 'Label',
                characters: 'OK',
                style: { fontFamily: 'Inter', fontSize: 14, fontWeight: 500 },
              },
            ],
          },
        },
      },
    },
  };
  const get = (async (url: string, init: RequestInit) => {
    assert.equal(
      (init.headers as Record<string, string>)['X-Figma-Token'],
      'secret',
    );
    const path = url.replace('https://api.figma.com/v1/files/KEY', '');
    calls.push(path);
    return { ok: true, json: async () => responses[path] };
  }) as unknown as typeof fetch;
  const out = await fetchFigma('KEY', 'secret', get);
  assert.deepEqual(calls.sort(), Object.keys(responses).sort());
  assert.equal(out.styles[0].node?.fills[0], '#ff0000');
  assert.equal(out.components[0].node?.children[0].characters, 'OK');
  assert.equal(out.components[0].node?.absoluteBoundingBox, undefined);
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
