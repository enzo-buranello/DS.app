import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyProject, type Project } from '../app/shared/project.js';
import {
  renameCollection,
  renameField,
  renamePage,
} from '../app/shared/rename.js';

const base = (): Project => ({
  ...emptyProject('Site'),
  pages: {
    'page-1': {
      name: 'Accueil',
      root: {
        id: 'root',
        kind: 'box',
        children: [
          { id: 'a', kind: 'text', text: 'Voir', href: '/page-2' },
          {
            id: 'l',
            kind: 'list',
            bind: { collection: 'collection-1' },
            children: [
              {
                id: 't',
                kind: 'text',
                bind: { collection: 'collection-1', field: 'champ-2' },
              },
            ],
          },
        ],
      },
    },
    'page-2': { name: 'Page 2', root: { id: 'root', kind: 'box' } },
  },
  collections: {
    'collection-1': {
      name: 'Collection 1',
      fields: [
        { id: 'nom', name: 'Nom', type: 'text' },
        { id: 'champ-2', name: 'Champ 2', type: 'number' },
      ],
      items: [{ id: 'item-1', values: { nom: 'Bol', 'champ-2': 48 } }],
    },
  },
});

test('page : un identifiant par défaut suit le nom, les liens suivent', () => {
  const out = renamePage(base(), 'page-2', 'L’atelier');
  assert.equal(out.id, 'l-atelier');
  assert.deepEqual(Object.keys(out.project.pages), ['page-1', 'l-atelier']);
  assert.equal(
    out.project.pages['page-1'].root.children![0].href,
    '/l-atelier',
  );
});

test('page : un identifiant choisi ne change pas', () => {
  const p = base();
  p.pages = { accueil: p.pages['page-1'] };
  const out = renamePage(p, 'accueil', 'Maison');
  assert.equal(out.id, 'accueil');
  assert.equal(out.project.pages.accueil.name, 'Maison');
});

test('collection et champ : liaisons et valeurs suivent', () => {
  const c = renameCollection(base(), 'collection-1', 'Produits');
  assert.equal(c.id, 'produits');
  const list = c.project.pages['page-1'].root.children![1];
  assert.equal(list.bind!.collection, 'produits');
  const f = renameField(c.project, 'produits', 'champ-2', 'Prix');
  assert.equal(f.id, 'prix');
  assert.deepEqual(f.project.collections.produits.items[0].values, {
    nom: 'Bol',
    prix: 48,
  });
  const t = f.project.pages['page-1'].root.children![1].children![0];
  assert.deepEqual(t.bind, { collection: 'produits', field: 'prix' });
});
