import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  common,
  insertionLine,
  marqueeHits,
  measureGuides,
  MIXED,
  moveAbsolute,
  rectFrom,
  reorderIndex,
  resize,
  sizeAfterResize,
  spacingBands,
  union,
} from '../app/shared/canvas.js';
import { docProblems, type Doc, type DocNode } from '../app/shared/doc.js';
import { move } from '../app/shared/docOps.js';
import { select, setPropMany } from '../app/shared/edit.js';
import { seedDoc } from '../app/shared/seedDoc.js';

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const patch = (doc: Doc, nodes: DocNode[]): Doc => ({
  ...doc,
  nodes: { ...doc.nodes, ...Object.fromEntries(nodes.map((n) => [n.id, n])) },
});

test('rectangle de sélection : calques touchés, quel que soit le sens', () => {
  const area = rectFrom({ x: 50, y: 50 }, { x: 0, y: 0 });
  assert.deepEqual(area, box(0, 0, 50, 50));
  const hits = marqueeHits(
    [
      { item: 'a', box: box(10, 10, 10, 10) },
      { item: 'b', box: box(45, 45, 100, 100) },
      { item: 'c', box: box(60, 0, 10, 10) },
    ],
    area,
  );
  assert.deepEqual(hits, ['a', 'b']);
  assert.deepEqual(
    union([box(0, 0, 10, 10), box(20, 5, 10, 20)]),
    box(0, 0, 30, 25),
  );
  assert.equal(union([]), null);
});

test('poignées : taille, origine des poignées gauche/haut, ratio', () => {
  const start = { w: 100, h: 50 };
  assert.deepEqual(resize(start, 'e', 20, 99), {
    w: 120,
    h: 50,
    dx: 0,
    dy: 0,
    width: true,
    height: false,
  });
  const nw = resize(start, 'nw', 10, 10);
  assert.deepEqual([nw.w, nw.h, nw.dx, nw.dy], [90, 40, 10, 10]);
  // Ratio gardé (Maj) : 2:1.
  const r = resize(start, 'se', 100, 0, true);
  assert.deepEqual([r.w, r.h, r.width, r.height], [200, 100, true, true]);
  // Jamais moins de 1 px.
  assert.equal(resize(start, 'w', 500, 0).w, 1);
  assert.deepEqual(
    sizeAfterResize({ width: { mode: 'fill' }, minWidth: 10 }, nw),
    {
      width: { mode: 'fixed', px: 90 },
      height: { mode: 'fixed', px: 40 },
      minWidth: 10,
    },
  );
});

test('déplacement absolu selon les contraintes', () => {
  assert.deepEqual(moveAbsolute({ mode: 'absolute', x: 10, y: 5 }, 4, -2), {
    mode: 'absolute',
    x: 14,
    y: 3,
  });
  // Ancré à droite et en bas : les décalages comptent depuis ces bords.
  const p = moveAbsolute(
    {
      mode: 'absolute',
      x: 10,
      y: 10,
      constraintX: 'right',
      constraintY: 'bottom',
    },
    5,
    5,
  );
  assert.deepEqual([p.x, p.y], [5, 5]);
  const s = moveAbsolute(
    { mode: 'absolute', x: 10, xEnd: 10, constraintX: 'stretch' },
    3,
    0,
  );
  assert.deepEqual([s.x, s.xEnd], [13, 7]);
});

test('réordonner dans un auto-layout : index d’insertion et trait', () => {
  const row = [box(0, 0, 40, 20), box(50, 0, 40, 20), box(100, 0, 40, 20)];
  assert.equal(reorderIndex(row, { x: 5, y: 10 }, 'horizontal'), 0);
  assert.equal(reorderIndex(row, { x: 80, y: 10 }, 'horizontal'), 2);
  assert.equal(reorderIndex(row, { x: 500, y: 10 }, 'horizontal'), 3);
  const col = [box(0, 0, 40, 20), box(0, 30, 40, 20)];
  assert.equal(reorderIndex(col, { x: 0, y: 45 }, 'vertical'), 2);
  // Retour à la ligne : ligne puis colonne.
  const grid = [box(0, 0, 40, 20), box(50, 0, 40, 20), box(0, 30, 40, 20)];
  assert.equal(reorderIndex(grid, { x: 5, y: 40 }, 'horizontal', true), 2);
  assert.equal(reorderIndex(grid, { x: 30, y: 40 }, 'horizontal', true), 3);
  assert.deepEqual(insertionLine(row, 1, 'horizontal', box(0, 0, 140, 20)), {
    x1: 45,
    y1: 0,
    x2: 45,
    y2: 20,
  });
  assert.deepEqual(insertionLine(col, 2, 'vertical', box(0, 0, 40, 50)), {
    x1: 0,
    y1: 50,
    x2: 40,
    y2: 50,
  });
  // Même résultat que le panneau Calques : `move` reçoit l'index d'origine.
  let doc = seedDoc();
  const kids = doc.nodes['cards.rhythm'].children;
  doc = patch(
    doc,
    move(doc, kids[0], 'cards.rhythm', 2).map((c) => c.after!),
  );
  assert.equal(doc.nodes['cards.rhythm'].children[1], kids[0]);
});

test('repères Alt : écarts entre calques et marges dans le parent', () => {
  // Côte à côte : un écart horizontal.
  assert.deepEqual(measureGuides(box(0, 0, 10, 10), box(30, 0, 10, 10)), [
    { x1: 10, y1: 5, x2: 30, y2: 5, value: 20 },
  ]);
  // En diagonale : un écart par axe.
  assert.equal(measureGuides(box(0, 0, 10, 10), box(20, 40, 10, 10)).length, 2);
  // Dans le parent : les quatre marges.
  const inner = measureGuides(box(10, 20, 30, 30), box(0, 0, 100, 100));
  assert.deepEqual(
    inner.map((g) => g.value),
    [10, 60, 20, 50],
  );
});

test('repères d’espacement : marges intérieures et écarts', () => {
  const bands = spacingBands(
    box(0, 0, 100, 60),
    { top: 8, right: 8, bottom: 8, left: 8 },
    [box(8, 8, 30, 44), box(54, 8, 38, 44)],
    'horizontal',
  );
  assert.deepEqual(
    bands.map((b) => [b.kind, b.value]),
    [
      ['padding', 8],
      ['padding', 8],
      ['padding', 8],
      ['padding', 8],
      ['gap', 16],
    ],
  );
  // Sans marge ni écart : rien.
  assert.deepEqual(
    spacingBands(
      box(0, 0, 10, 20),
      { top: 0, right: 0, bottom: 0, left: 0 },
      [box(0, 0, 10, 10), box(0, 10, 10, 10)],
      'vertical',
    ),
    [],
  );
});

test('multi-sélection : valeur « Mixte » et écriture sur tous les calques', () => {
  assert.equal(common([1, 1, 1]), 1);
  assert.equal(common([{ px: 4 }, { px: 4 }])?.toString(), '[object Object]');
  assert.equal(common([1, 2]), MIXED);
  let doc = seedDoc();
  // Deux calques réels et un calque d'instance de la même carte.
  const keys = [
    'cards.title',
    'cards.intro',
    'cards.booking>booking-card/title',
    'cards.booking>booking-card/meta',
  ];
  const nodes = setPropMany(doc, keys, null, 'layer', 'opacity', 0.5);
  // L'instance n'est écrite qu'une fois, avec les deux overrides.
  assert.equal(nodes.length, 3);
  doc = patch(doc, nodes);
  assert.deepEqual(docProblems(doc), []);
  for (const k of keys)
    assert.equal(select(doc, k)?.resolved.props.layer?.opacity, 0.5, k);
  // Valeur calculée par calque.
  const sized = setPropMany(
    doc,
    keys.slice(0, 2),
    null,
    'layer',
    'opacity',
    (s) => (s.key === 'cards.title' ? 1 : 0.2),
  );
  doc = patch(doc, sized);
  assert.equal(select(doc, 'cards.intro')?.resolved.props.layer?.opacity, 0.2);
});
