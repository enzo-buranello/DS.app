import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  componentize,
  detach,
  parentOf,
  setOverride,
  target,
} from '../app/shared/instances.js';
import { ids } from '../app/shared/nodes.js';
import {
  emptyProject,
  type Node,
  type Project,
} from '../app/shared/project.js';

const base = (): Project => ({
  ...emptyProject('A'),
  foundations: {
    ...emptyProject('A').foundations,
    colors: {
      primary: { name: 'Primaire', light: '#C8803E', dark: '#000000' },
    },
    spacing: { m: { name: 'M', value: 16 } },
  },
});
const page: Node = {
  id: 'root',
  kind: 'box',
  style: { desktop: { direction: 'free' } },
  children: [
    {
      id: 'box-1',
      kind: 'box',
      style: {
        desktop: { x: 40, y: 20, background: '#c8803e', padding: 16, gap: 7 },
      },
      children: [
        { id: 'text-1', kind: 'text', text: 'Pain de campagne' },
        { id: 'text-2', kind: 'text', text: '4,80 €' },
      ],
    },
  ],
};

test('créer un composant : tokens retrouvés, instance à la même place', () => {
  const out = componentize(base(), page, 'box-1')!;
  const c = out.project.components[out.id];
  assert.equal(out.id, 'pain-de-campagne');
  assert.deepEqual(c.root.style?.desktop, {
    background: 'primary',
    padding: 'm',
    gap: 7,
  });
  const inst = out.root.children![0];
  assert.deepEqual(inst, {
    id: 'box-1',
    kind: 'component',
    component: 'pain-de-campagne',
    style: { desktop: { x: 40, y: 20 } },
  });
  assert.equal(componentize(base(), page, 'root'), null);
});

test('ajustement local, parent et détachement', () => {
  const out = componentize(base(), page, 'box-1')!;
  const root = setOverride(
    out.root,
    'box-1/text-2',
    { text: '5 €' },
    {
      bp: 'desktop',
      patch: { color: 'primary' },
    },
  );
  const t = target(out.project, root, 'box-1/text-2')!;
  assert.equal(t.node.text, '5 €');
  assert.equal(t.node.style?.desktop?.color, 'primary');
  assert.equal(parentOf(out.project, root, 'box-1/text-2'), 'box-1');
  const free = detach(out.project, root, 'box-1');
  const n = free.children![0];
  assert.equal(n.kind, 'box');
  assert.equal(n.style?.desktop?.x, 40);
  assert.equal(n.children![1].text, '5 €');
  const all = ids(free);
  assert.equal(new Set(all).size, all.length);
});
