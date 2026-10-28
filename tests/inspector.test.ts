import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docProblems, docSchema, type Doc } from '../app/shared/doc.js';
import { seedDoc } from '../app/shared/seedDoc.js';
import {
  groupAt,
  isOwn,
  overrideCount,
  resetOverrides,
  select,
  setFacet,
  setProp,
} from '../app/shared/edit.js';
import { evaluate } from '../app/shared/expr.js';
import {
  addComponent,
  CUSTOM_SECTION,
  importComponents,
} from '../app/shared/migrate.js';
import { newComponent } from '../app/shared/component.js';
import { nodeRules } from '../app/shared/nodeCss.js';

const apply = (doc: Doc, nodes: Doc['nodes'][string][]) => {
  for (const n of nodes) doc.nodes[n.id] = n;
  return doc;
};
const brand = { token: 'color.brand', opacity: 1 } as const;
const solid = (color: object) => ({ type: 'solid', color, visible: true });

test('expressions : opérations, parenthèses, refus sans eval', () => {
  assert.equal(evaluate('16*2'), 32);
  assert.equal(evaluate('(24 - 4) / 2'), 10);
  assert.equal(evaluate('-3 + 1,5'), -1.5);
  assert.equal(evaluate('10/3'), 3.333);
  for (const bad of ['', '2*', '1/0', 'alert(1)', '2**3', '(1', '1e9'])
    assert.equal(evaluate(bad), null, bad);
});

test('inspecteur : maître modifié directement, champ par champ', () => {
  const doc = seedDoc();
  const key = 'booking-card';
  apply(doc, setProp(doc, key, null, 'layout', 'gap', { px: 12 }));
  apply(
    doc,
    setProp(doc, key, null, 'effects', null, [
      {
        type: 'drop-shadow',
        x: 0,
        y: 2,
        blur: 4,
        spread: 0,
        color: brand,
        visible: true,
      },
    ]),
  );
  const s = select(doc, key)!;
  assert.equal(s.inInstance, false);
  assert.deepEqual(s.node.props.layout?.gap, { px: 12 });
  // Les autres champs du groupe restent.
  assert.equal(s.node.props.layout?.mode, 'vertical');
  assert.equal(s.node.props.effects?.length, 1);
  assert.deepEqual(docProblems(doc), []);
  docSchema.parse(doc);
});

test('inspecteur : override d’instance, pastille, retour au composant', () => {
  const doc = seedDoc();
  const key = 'cards.booking>booking-card/title';
  apply(doc, setProp(doc, key, null, 'text', 'size', { px: 30 }));
  let s = select(doc, key)!;
  assert.equal(s.inInstance, true);
  assert.ok(isOwn(s, 'text', 'size', null));
  assert.ok(!isOwn(s, 'text', 'color', null));
  // Valeur rendue : override + reste du composant.
  assert.deepEqual(groupAt(s, 'text', null)?.size, { px: 30 });
  assert.deepEqual(groupAt(s, 'text', null)?.color, {
    token: 'color.text',
    opacity: 1,
  });
  assert.deepEqual(
    doc.nodes['cards.booking'].overrides?.['booking-card/title'],
    {
      props: { text: { size: { px: 30 } } },
    },
  );
  apply(doc, setFacet(doc, key, 'characters', 'Titre local'));
  s = select(doc, key)!;
  assert.equal(overrideCount(s), 2);
  // Retour au composant, champ par champ puis en bloc.
  apply(doc, setProp(doc, key, null, 'text', 'size', undefined));
  assert.equal(overrideCount(select(doc, key)!), 1);
  apply(doc, resetOverrides(doc, key));
  assert.equal(doc.nodes['cards.booking'].overrides, undefined);
  assert.equal(
    select(doc, key)!.resolved.characters,
    'Faire moins, mais mieux.',
  );
});

test('états : écrits à part, base intacte, règle forcée pour l’aperçu', () => {
  const doc = seedDoc();
  const key = 'cards.rhythm.cta';
  apply(doc, setProp(doc, key, 'pressed', 'fills', null, [solid(brand)]));
  apply(
    doc,
    setProp(doc, key, null, 'fills', null, [
      solid({ hex: '#111111', opacity: 1 }),
    ]),
  );
  const s = select(doc, key)!;
  assert.deepEqual(s.node.states?.pressed?.fills, [solid(brand)]);
  // Le survol du composant reste, l'état « appuyé » s'ajoute.
  assert.ok(s.resolved.states?.hover?.fills);
  assert.deepEqual(groupAt(s, 'fills', 'pressed'), [solid(brand)]);
  assert.deepEqual(groupAt(s, 'fills', null), [
    solid({ hex: '#111111', opacity: 1 }),
  ]);
  const rules = nodeRules(key, s.resolved.props, s.resolved.states, {
    type: 'instance',
    parent: null,
  });
  assert.match(
    rules,
    /\[data-ds-node="cards\.rhythm\.cta"\]:active:not\(:disabled\),.*\[data-ds-preview="pressed"\]/,
  );
});

test('instance : variante et propriété de texte', () => {
  const doc = seedDoc();
  const key = 'cards.rhythm.cta';
  apply(doc, setFacet(doc, key, 'variant', { Variante: 'Danger' }));
  const s = select(doc, key)!;
  assert.equal(s.resolved.marks['data-ds-id'], 'button/danger');
  // Les interactions de l'instance (navigation) sont conservées.
  assert.equal(s.resolved.interactions[0]?.action.type, 'navigate');
});

test('composants créés : section « Mes composants », component set, import idempotent', () => {
  const doc = seedDoc();
  const a = newComponent('11111111-1111-4111-8111-111111111111', 1);
  const b = {
    ...newComponent('22222222-2222-4222-8222-222222222222', 2),
    set: { id: 'Taille', name: 'Taille', properties: { Taille: 'Grand' } },
  };
  apply(doc, addComponent(doc, a));
  assert.ok(doc.nodes[CUSTOM_SECTION]);
  assert.ok(doc.nodes[doc.components].children.includes(CUSTOM_SECTION));
  assert.deepEqual(docProblems(doc), []);
  const next = importComponents(doc, [a, b]);
  assert.equal(
    next.nodes['custom/22222222-2222-4222-8222-222222222222'].parent,
    'custom/set/Taille',
  );
  assert.equal(next.nodes['custom/set/Taille'].type, 'component-set');
  assert.deepEqual(docProblems(next), []);
  // Deuxième import : rien de nouveau.
  assert.deepEqual(importComponents(next, [a, b]), next);
  docSchema.parse(next);
});
