import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bindings,
  convert,
  display,
  listAbove,
} from '../app/shared/content.js';
import { emptyProject, type Node } from '../app/shared/project.js';

test('valeurs : conversion et affichage', () => {
  assert.equal(convert('4,80', 'number'), 4.8);
  assert.equal(convert('abc', 'number'), undefined);
  assert.equal(convert('oui', 'boolean'), true);
  assert.equal(convert(12, 'text'), '12');
  assert.equal(display(true, 'boolean'), 'Oui');
  assert.equal(display('2026-10-29', 'date'), '29/10/2026');
});

test('liaisons et liste englobante', () => {
  const root: Node = {
    id: 'root',
    kind: 'box',
    children: [
      {
        id: 'list-1',
        kind: 'list',
        bind: { collection: 'produits' },
        children: [
          {
            id: 'text-1',
            kind: 'text',
            bind: { collection: 'produits', field: 'nom' },
          },
        ],
      },
    ],
  };
  const p = { ...emptyProject('A'), pages: { home: { name: 'A', root } } };
  assert.deepEqual([...bindings(p)].sort(), ['produits', 'produits:nom']);
  assert.equal(listAbove(root, 'text-1'), 'produits');
  assert.equal(listAbove(root, 'list-1'), null);
});
