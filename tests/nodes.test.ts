import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  duplicate,
  find,
  ids,
  insert,
  move,
  placeFor,
  remove,
} from '../app/shared/nodes.js';
import type { Node } from '../app/shared/project.js';

const page: Node = {
  id: 'root',
  kind: 'box',
  children: [
    {
      id: 'box-1',
      kind: 'box',
      children: [{ id: 'text-1', kind: 'text', text: 'A' }],
    },
    { id: 'text-2', kind: 'text', text: 'B' },
  ],
};

test('insérer dans un bloc, avant et après', () => {
  const n: Node = { id: 'x', kind: 'text' };
  assert.deepEqual(ids(insert(page, n, { target: 'box-1', where: 'inside' })), [
    'root',
    'box-1',
    'text-1',
    'x',
    'text-2',
  ]);
  assert.deepEqual(
    ids(insert(page, n, { target: 'text-2', where: 'before' })),
    ['root', 'box-1', 'text-1', 'x', 'text-2'],
  );
  assert.deepEqual(ids(insert(page, n, { target: 'box-1', where: 'after' })), [
    'root',
    'box-1',
    'text-1',
    'x',
    'text-2',
  ]);
  assert.deepEqual(ids(page), ['root', 'box-1', 'text-1', 'text-2']);
});

test('déplacer, sans jamais entrer dans soi-même', () => {
  assert.deepEqual(
    ids(move(page, 'text-2', { target: 'box-1', where: 'inside' })),
    ['root', 'box-1', 'text-1', 'text-2'],
  );
  assert.equal(
    move(page, 'box-1', { target: 'text-1', where: 'inside' }),
    page,
  );
  assert.equal(move(page, 'root', { target: 'text-2', where: 'after' }), page);
});

test('dupliquer donne de nouveaux identifiants', () => {
  const { root, id } = duplicate(page, 'box-1');
  assert.equal(id, 'box-2');
  assert.deepEqual(ids(root), [
    'root',
    'box-1',
    'text-1',
    'box-2',
    'text-3',
    'text-2',
  ]);
  assert.equal(find(root, 'text-3')?.node.text, 'A');
});

test('supprimer et choisir où ajouter', () => {
  assert.deepEqual(ids(remove(page, 'box-1')), ['root', 'text-2']);
  assert.deepEqual(placeFor(page, 'box-1'), {
    target: 'box-1',
    where: 'inside',
  });
  assert.deepEqual(placeFor(page, 'text-2'), {
    target: 'text-2',
    where: 'after',
  });
  assert.deepEqual(placeFor(page, null), { target: 'root', where: 'inside' });
});
