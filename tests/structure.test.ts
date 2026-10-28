import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docProblems, docSchema, type Doc } from '../app/shared/doc.js';
import { seedDoc } from '../app/shared/seedDoc.js';
import {
  addComponentProp,
  addVariant,
  autoLayout,
  copy,
  createComponent,
  createScreen,
  deleteScreen,
  detach,
  duplicate,
  duplicateScreen,
  group,
  insert,
  insertionPoint,
  move,
  paste,
  remove,
  renameVariantProp,
  type Change,
} from '../app/shared/docOps.js';
import { renderTree, walk, type RNode } from '../app/shared/render.js';

const apply = (doc: Doc, changes: Change[], screens?: string[]) => {
  const next: Doc = { ...doc, nodes: { ...doc.nodes } };
  for (const c of changes)
    if (c.after) next.nodes[c.id] = c.after;
    else delete next.nodes[c.id];
  if (screens) next.screens = screens;
  // Toujours un document valide pour le serveur.
  assert.deepEqual(docProblems(next), []);
  docSchema.parse(next);
  return next;
};
const keys = (doc: Doc, root: string) => {
  const out: RNode[] = [];
  const t = renderTree(doc, root);
  if (t) walk(t, (r) => void out.push(r));
  return out;
};

test('insertion : cadre, texte, rectangle, image et instance, au bon endroit', () => {
  let doc = seedDoc();
  // Dans un conteneur sélectionné : à la fin ; sinon juste après.
  let at = insertionPoint(doc, 'cards.rhythm', 'screen.cards');
  assert.deepEqual(at, { parent: 'cards.rhythm', index: undefined });
  at = insertionPoint(doc, 'cards.rhythm.title', 'screen.cards');
  assert.deepEqual(at, { parent: 'cards.rhythm', index: 2 });
  for (const kind of ['frame', 'text', 'rect', 'image'] as const) {
    const r = insert(doc, at, kind);
    doc = apply(doc, r.changes);
    assert.equal(doc.nodes['cards.rhythm'].children[2], r.id);
    assert.equal(doc.nodes[r.id].type, kind);
  }
  const r = insert(doc, { parent: 'cards.main' }, 'instance', 'button/danger');
  doc = apply(doc, r.changes);
  assert.equal(
    keys(doc, 'screen.cards').find((x) => x.key === r.id)?.marks['data-ds-id'],
    'button/danger',
  );
  // Une instance dans son propre composant : refusée.
  assert.throws(
    () => insert(doc, { parent: 'booking-card' }, 'instance', 'booking-card'),
    /son composant/,
  );
});

test('supprimer, dupliquer, copier/coller avec des ids neufs', () => {
  let doc = seedDoc();
  const dup = duplicate(doc, ['cards.rhythm']);
  doc = apply(doc, dup.changes);
  const copyId = dup.ids[0];
  assert.equal(doc.nodes['cards.grid'].children[2], copyId);
  assert.equal(doc.nodes[copyId].children.length, 4);
  assert.ok(
    !doc.nodes[copyId].children.some((c) => c.startsWith('cards.rhythm')),
  );
  const pasted = paste(doc, copy(doc, ['cards.title']), {
    parent: 'cards.main',
    index: 0,
  });
  doc = apply(doc, pasted.changes);
  assert.equal(doc.nodes['cards.main'].children[0], pasted.ids[0]);
  assert.equal(
    doc.nodes[pasted.ids[0]].characters,
    'De petites idées.\nDe vrais liens.',
  );
  doc = apply(doc, remove(doc, [copyId]));
  assert.equal(doc.nodes[copyId], undefined);
  assert.equal(doc.nodes['cards.grid'].children.length, 2);
  // Composant encore utilisé : la suppression est refusée.
  assert.throws(() => remove(doc, ['button/secondary']), /utilisé par/);
  assert.throws(() => remove(doc, ['screen.cards']), /écran/);
});

test('déplacer, imbriquer, refuser les cycles', () => {
  let doc = seedDoc();
  doc = apply(doc, move(doc, 'cards.intro', 'cards.main', 0));
  assert.equal(doc.nodes['cards.main'].children[0], 'cards.intro');
  doc = apply(doc, move(doc, 'cards.intro', 'cards.rhythm'));
  assert.equal(doc.nodes['cards.intro'].parent, 'cards.rhythm');
  // Même parent, vers le bas : l'index tient compte du retrait.
  const before = doc.nodes['cards.rhythm'].children;
  doc = apply(doc, move(doc, before[0], 'cards.rhythm', 2));
  assert.equal(doc.nodes['cards.rhythm'].children[1], before[0]);
  assert.throws(() => move(doc, 'cards.main', 'cards.grid'), /lui-même/);
  assert.throws(() => move(doc, 'cards.title', 'cards.intro'), /enfants/);
});

test('grouper et auto-layout (Cmd+G, Maj+A)', () => {
  let doc = seedDoc();
  const g = group(doc, ['cards.intro', 'cards.title']);
  doc = apply(doc, g.changes);
  assert.deepEqual(doc.nodes[g.id].children, ['cards.title', 'cards.intro']);
  assert.equal(doc.nodes['cards.main'].children[1], g.id);
  const a = autoLayout(doc, ['cards.kicker']);
  doc = apply(doc, a.changes);
  assert.equal(doc.nodes[a.id].props.layout?.mode, 'vertical');
  assert.deepEqual(doc.nodes[a.id].children, ['cards.kicker']);
  const off = autoLayout(doc, [a.id]);
  doc = apply(doc, off.changes);
  assert.equal(doc.nodes[a.id].props.layout?.mode, 'none');
  assert.throws(
    () => group(doc, ['cards.kicker', 'cards.rhythm.title']),
    /même parent/,
  );
});

test('créer un composant : maître dans « Mes composants », instance à sa place', () => {
  let doc = seedDoc();
  const r = createComponent(doc, ['cards.rhythm']);
  doc = apply(doc, r.changes);
  const comp = doc.nodes[r.component];
  assert.equal(comp.type, 'component');
  assert.equal(comp.parent, 'catalogue.custom');
  assert.equal(comp.props.size, undefined);
  const inst = doc.nodes[r.instance];
  assert.equal(inst.parent, 'cards.grid');
  assert.equal(doc.nodes['cards.grid'].children[1], r.instance);
  assert.deepEqual(inst.props.size, { width: { mode: 'fill' }, minWidth: 260 });
  // Le rendu reste le même : texte et bouton via l'instance.
  const rendered = keys(doc, 'screen.cards');
  assert.ok(rendered.some((x) => x.characters === 'Un quartier qui inspire.'));
  assert.throws(() => createComponent(doc, [r.component]), /déjà un composant/);
});

test('variantes et propriétés de composant (texte, booléen, échange)', () => {
  let doc = seedDoc();
  const made = createComponent(doc, ['cards.rhythm']);
  doc = apply(doc, made.changes);
  const v = addVariant(doc, made.component);
  doc = apply(doc, v.changes);
  const set = doc.nodes[doc.nodes[made.component].parent!];
  assert.equal(set.type, 'component-set');
  assert.deepEqual(doc.nodes[made.component].variant, { Propriété: 'Défaut' });
  assert.deepEqual(doc.nodes[v.id].variant, { Propriété: 'Variante 2' });
  doc = apply(doc, renameVariantProp(doc, set.id, 'Propriété', 'Style'));
  assert.deepEqual(doc.nodes[v.id].variant, { Style: 'Variante 2' });
  // L'instance passe d'une variante à l'autre.
  doc.nodes[made.instance] = {
    ...doc.nodes[made.instance],
    variant: { Style: 'Variante 2' },
  };
  assert.equal(
    keys(doc, 'screen.cards').find((x) => x.key === made.instance)?.marks[
      'data-ds-id'
    ],
    v.id,
  );
  // Propriétés liées aux calques du composant.
  const comp = doc.nodes[made.component];
  const [kicker, title, , cta] = comp.children;
  doc = apply(doc, addComponentProp(doc, comp.id, title, 'text', 'Titre'));
  doc = apply(
    doc,
    addComponentProp(doc, comp.id, kicker, 'boolean', 'Surtitre'),
  );
  doc = apply(
    doc,
    addComponentProp(doc, comp.id, cta, 'instance-swap', 'Action'),
  );
  doc.nodes[made.instance] = {
    ...doc.nodes[made.instance],
    variant: undefined,
    propValues: {
      Titre: 'Titre local',
      Surtitre: false,
      Action: 'button/danger',
    },
  };
  const out = keys(doc, 'screen.cards');
  assert.equal(
    out.find((x) => x.key === `${made.instance}>${title}`)?.characters,
    'Titre local',
  );
  assert.equal(
    out.find((x) => x.key === `${made.instance}>${kicker}`)?.props.layer
      ?.visible,
    false,
  );
  assert.equal(
    out.find((x) => x.key === `${made.instance}>${cta}`)?.marks['data-ds-id'],
    'button/danger',
  );
  assert.throws(
    () => addComponentProp(doc, comp.id, kicker, 'instance-swap', 'X'),
    /instance/,
  );
});

test('détacher une instance : calques ordinaires, instances imbriquées gardées', () => {
  let doc = seedDoc();
  doc.nodes['cards.booking'] = {
    ...doc.nodes['cards.booking'],
    overrides: {
      'booking-card/title': { characters: 'Local' },
      'booking-card/cta>button/primary/label': { characters: 'Go' },
    },
  };
  const text = (d: Doc) => {
    const out: string[] = [];
    const card = keys(d, 'screen.cards').find(
      (x) => x.key === 'cards.booking',
    )!;
    walk(card, (x) => void (x.characters && out.push(x.characters)));
    return out;
  };
  const before = text(doc);
  const r = detach(doc, 'cards.booking');
  doc = apply(doc, r.changes);
  const card = doc.nodes['cards.booking'];
  assert.equal(card.type, 'frame');
  assert.equal(card.componentId, undefined);
  assert.equal(card.overrides, undefined);
  // Même rendu, et le bouton reste une instance avec son libellé local.
  assert.deepEqual(text(doc), before);
  const cta = card.children
    .map((c) => doc.nodes[c])
    .find((n) => n.type === 'instance')!;
  assert.equal(cta.componentId, 'button/primary');
  assert.equal(cta.overrides?.['button/primary/label']?.characters, 'Go');
  assert.throws(() => detach(doc, 'cards.booking'), /pas une instance/);
});

test('écrans : créer, dupliquer, supprimer (liens retirés)', () => {
  let doc = seedDoc();
  const c = createScreen(doc, 'Profil détaillé');
  doc = apply(doc, c.changes, c.screens);
  assert.equal(c.id, 'screen.profil-detaille');
  assert.deepEqual(doc.screens, ['screen.cards', 'screen.form', c.id]);
  const d = duplicateScreen(doc, 'screen.form');
  doc = apply(doc, d.changes, d.screens);
  assert.equal(doc.nodes[d.id].name, 'Inscription copie');
  assert.equal(
    doc.nodes[d.id].children.length,
    doc.nodes['screen.form'].children.length,
  );
  // Supprimer « Inscription » retire le lien du bouton qui y menait.
  const x = deleteScreen(doc, 'screen.form');
  doc = apply(doc, x.changes, x.screens);
  assert.deepEqual(doc.nodes['cards.rhythm.cta'].interactions, []);
  assert.ok(!doc.screens.includes('screen.form'));
  let only = doc;
  for (const s of only.screens.slice(1)) {
    const del = deleteScreen(only, s);
    only = apply(only, del.changes, del.screens);
  }
  assert.throws(() => deleteScreen(only, only.screens[0]), /au moins un écran/);
});
