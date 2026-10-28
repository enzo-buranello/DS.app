import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  docProblems,
  docSchema,
  mergeProps,
  type Doc,
  type Props,
} from '../app/shared/doc.js';
import { nodeCss, nodeRules } from '../app/shared/nodeCss.js';
import { renderTree, walk, locate, type RNode } from '../app/shared/render.js';
import { seedDoc } from '../app/shared/seedDoc.js';
import {
  applyToComponent,
  readOwn,
  writeLegacy,
} from '../app/shared/legacy.js';
import { componentDoc } from '../app/shared/migrate.js';
import { newComponent } from '../app/shared/component.js';

const css = (props: Props, parent: Props | null = null, type = 'frame') =>
  nodeCss(props, { type: type as never, parent, base: true });
const brand = { token: 'color.brand', opacity: 1 } as const;
const find = (tree: RNode, key: string) => {
  let out: RNode | null = null;
  walk(tree, (r) => void (r.key === key && (out = r)));
  return out as RNode | null;
};
const apply = (doc: Doc, nodes: { id: string }[]) => {
  for (const n of nodes) doc.nodes[n.id] = n as Doc['nodes'][string];
  return doc;
};

test('nodeCss : auto-layout, wrap, gap auto, padding, alignement', () => {
  assert.deepEqual(
    css({
      layout: {
        mode: 'horizontal',
        wrap: true,
        gap: { token: 'space.sm' },
        rowGap: { px: 4 },
        padding: {
          top: { px: 1 },
          right: { px: 2 },
          bottom: { px: 3 },
          left: { token: 'space.md' },
        },
        alignMain: 'center',
        alignCross: 'end',
      },
    }),
    {
      display: 'flex',
      'flex-direction': 'row',
      'flex-wrap': 'wrap',
      'column-gap': 'var(--space-sm)',
      'row-gap': '4px',
      padding: '1px 2px 3px var(--space-md)',
      'justify-content': 'center',
      'align-items': 'flex-end',
    },
  );
  assert.equal(
    css({ layout: { mode: 'vertical', gap: 'auto', alignMain: 'end' } })[
      'justify-content'
    ],
    'space-between',
  );
});

test('nodeCss : Fixe / Hug / Fill selon le parent, min et max', () => {
  const row: Props = { layout: { mode: 'horizontal' } };
  const col: Props = { layout: { mode: 'vertical' } };
  assert.deepEqual(css({ size: { width: { mode: 'fill' } } }, row), {
    flex: '1 1 0',
    'min-width': '0',
  });
  assert.deepEqual(css({ size: { width: { mode: 'fill' } } }, col), {
    'align-self': 'stretch',
  });
  assert.deepEqual(css({ size: { width: { mode: 'fill' } } }, null), {
    width: '100%',
  });
  assert.deepEqual(css({ size: { width: { mode: 'hug' } } }, row), {
    width: 'fit-content',
    flex: 'none',
  });
  assert.deepEqual(
    css(
      {
        size: {
          height: { mode: 'fixed', px: 40 },
          minWidth: 10,
          maxWidth: 200,
          minHeight: 5,
          maxHeight: null,
        },
      },
      col,
    ),
    {
      height: '40px',
      'flex-shrink': '0',
      'min-width': '10px',
      'max-width': '200px',
      'min-height': '5px',
    },
  );
});

test('nodeCss : position absolue, contraintes, rotation', () => {
  assert.deepEqual(
    css({
      position: {
        mode: 'absolute',
        x: 10,
        y: 20,
        constraintX: 'right',
        constraintY: 'bottom',
      },
    }),
    { position: 'absolute', right: '10px', bottom: '20px' },
  );
  assert.deepEqual(
    css({
      position: {
        mode: 'absolute',
        x: 4,
        y: 0,
        xEnd: 8,
        constraintX: 'stretch',
        constraintY: 'center',
        rotation: 45,
      },
    }),
    {
      position: 'absolute',
      left: '4px',
      right: '8px',
      top: 'calc(50% + 0px)',
      transform: 'translateY(-50%) rotate(45deg)',
    },
  );
});

test('nodeCss : rayons, fonds multiples, dégradés, image, contours', () => {
  assert.equal(
    css({
      radius: {
        topLeft: { px: 1 },
        topRight: { token: 'radius.control' },
        bottomRight: { px: 3 },
        bottomLeft: { px: 4 },
      },
    })['border-radius'],
    '1px var(--radius-control) 3px 4px',
  );
  // Un seul aplat : background-color (lu par l'export Figma).
  assert.deepEqual(
    css({ fills: [{ type: 'solid', color: brand, visible: true }] }),
    {
      'background-color': 'var(--color-brand)',
    },
  );
  assert.equal(
    css({
      fills: [
        {
          type: 'solid',
          color: { hex: '#ff0000', opacity: 0.5 },
          visible: true,
        },
        {
          type: 'linear',
          angle: 90,
          opacity: 1,
          visible: true,
          stops: [
            { position: 0, color: brand },
            { position: 1, color: { hex: '#000000', opacity: 1 } },
          ],
        },
        { type: 'solid', color: brand, visible: false },
        {
          type: 'image',
          asset: 'a'.repeat(16) + '.png',
          fit: 'fit',
          opacity: 1,
          visible: true,
        },
      ],
    }).background,
    'linear-gradient(color-mix(in srgb, #ff0000 50%, transparent), color-mix(in srgb, #ff0000 50%, transparent)), ' +
      'linear-gradient(90deg, var(--color-brand) 0%, #000000 100%), ' +
      `url("/api/assets/${'a'.repeat(16)}.png") center / contain no-repeat`,
  );
  assert.equal(css({ fills: [] }).background, 'none');
  assert.deepEqual(
    css({
      stroke: {
        color: brand,
        weight: 2,
        style: 'dashed',
        align: 'inside',
        visible: true,
      },
    }),
    { border: '2px dashed var(--color-brand)' },
  );
  assert.deepEqual(
    css({
      stroke: {
        color: brand,
        weight: { top: 1, right: 0, bottom: 2, left: 0 },
        style: 'solid',
        align: 'inside',
        visible: true,
      },
    }),
    {
      'border-style': 'solid',
      'border-color': 'var(--color-brand)',
      'border-width': '1px 0px 2px 0px',
    },
  );
  assert.deepEqual(
    css({
      stroke: {
        color: brand,
        weight: 4,
        style: 'solid',
        align: 'center',
        visible: true,
      },
    }),
    {
      border: '0',
      outline: '4px solid var(--color-brand)',
      'outline-offset': '-2px',
    },
  );
});

test('nodeCss : effets empilés, calque, typographie complète', () => {
  assert.deepEqual(
    css({
      effects: [
        {
          type: 'drop-shadow',
          x: 0,
          y: 2,
          blur: 4,
          spread: 0,
          color: brand,
          visible: true,
        },
        {
          type: 'inner-shadow',
          x: 1,
          y: 1,
          blur: 0,
          spread: 1,
          color: brand,
          visible: true,
        },
        { type: 'layer-blur', radius: 3, visible: true },
        { type: 'background-blur', radius: 8, visible: true },
      ],
      layer: { opacity: 0.5, blend: 'multiply', clip: true, visible: true },
    }),
    {
      'box-shadow':
        '0px 2px 4px 0px var(--color-brand), inset 1px 1px 0px 1px var(--color-brand)',
      filter: 'blur(3px)',
      'backdrop-filter': 'blur(8px)',
      opacity: '0.5',
      'mix-blend-mode': 'multiply',
      overflow: 'hidden',
    },
  );
  assert.equal(css({ layer: { visible: false } }).display, 'none');
  const text = css(
    {
      text: {
        family: { token: 'font.family' },
        weight: 650,
        size: { token: 'font.body' },
        color: brand,
        lineHeight: { px: 20 },
        letterSpacing: -0.5,
        align: 'center',
        case: 'upper',
        decoration: 'strike',
        maxLines: 2,
      },
    },
    null,
    'text',
  );
  assert.deepEqual(text, {
    'font-family': 'var(--font-family)',
    'font-weight': '650',
    'font-size': 'var(--font-body)',
    color: 'var(--color-brand)',
    'line-height': '20px',
    'letter-spacing': '-0.5px',
    'text-align': 'center',
    'text-transform': 'uppercase',
    'text-decoration': 'line-through',
    display: '-webkit-box',
    '-webkit-box-orient': 'vertical',
    '-webkit-line-clamp': '2',
    overflow: 'hidden',
    'white-space': 'pre-wrap',
  });
  assert.equal(
    css({ text: { resize: 'auto-width' } }, null, 'text').width,
    'max-content',
  );
  assert.equal(
    css({ text: { truncate: true } }, null, 'text')['text-overflow'],
    'ellipsis',
  );
});

test('états : règles distinctes, la base ne masque plus le hover', () => {
  const rules = nodeRules(
    'b',
    {
      fills: [
        { type: 'solid', color: { hex: '#111111', opacity: 1 }, visible: true },
      ],
    },
    {
      hover: { fills: [{ type: 'solid', color: brand, visible: true }] },
      disabled: { layer: { opacity: 0.4 } },
    },
    { type: 'frame', parent: null },
  ).split('\n');
  assert.equal(rules[0], '.ds [data-ds-node="b"]{background-color:#111111}');
  assert.equal(
    rules[1],
    '.ds [data-ds-node="b"]:hover:not(:disabled),.ds [data-ds-node="b"][data-ds-preview="hover"]{background-color:var(--color-brand)}',
  );
  assert.equal(
    rules[2],
    '.ds [data-ds-node="b"]:disabled,.ds [data-ds-node="b"][data-ds-preview="disabled"]{opacity:0.4}',
  );
});

test('mergeProps : groupe par groupe, listes remplacées en bloc', () => {
  const base: Props = {
    layout: { mode: 'horizontal', gap: { px: 4 } },
    fills: [{ type: 'solid', color: brand, visible: true }],
  };
  assert.deepEqual(
    mergeProps(base, { layout: { gap: { px: 8 } }, fills: [] }),
    {
      layout: { mode: 'horizontal', gap: { px: 8 } },
      fills: [],
    },
  );
});

test("seed : document valide, ids stables, marqueurs pour l'export", () => {
  const doc = docSchema.parse(seedDoc());
  const tree = renderTree(doc, 'screen.cards')!;
  const cta = find(tree, 'cards.rhythm.cta')!;
  assert.equal(cta.marks['data-ds-id'], 'button/secondary');
  assert.equal(cta.marks['data-ds-inst'], 'cards.rhythm.cta');
  assert.equal(
    cta.marks['data-ds-variant'],
    'Variante=Secondaire, État=Défaut',
  );
  assert.equal(cta.marks['data-ds-set'], 'Button');
  assert.equal(cta.marks['data-ds-override'], undefined);
  // Propriété de composant « Texte » : valeur de l'instance.
  assert.equal(
    find(tree, 'cards.rhythm.cta>button/secondary/label')?.characters,
    'Voir les ateliers',
  );
  // Instance imbriquée : clé rendue = chemin.
  const nested = find(tree, 'cards.booking>booking-card/cta')!;
  assert.equal(nested.marks['data-ds-id'], 'button/primary');
  assert.deepEqual(
    locate(doc, 'cards.booking>booking-card/cta>button/primary/label'),
    {
      kind: 'override',
      instance: 'cards.booking',
      path: 'booking-card/cta>button/primary/label',
      id: 'button/primary/label',
    },
  );
  // Maître : valeur par défaut de la propriété.
  const page = renderTree(doc, doc.components)!;
  assert.equal(
    find(page, 'button/primary/label')?.characters,
    'Action principale',
  );
});

test('instances : variante, override par chemin et correspondance par nom', () => {
  const doc = seedDoc();
  doc.nodes['cards.booking'].overrides = {
    'booking-card/title': {
      characters: 'Titre local',
      props: { text: { size: { px: 30 } } },
    },
    'booking-card/cta>button/primary/label': { characters: 'Go' },
  };
  let tree = renderTree(doc, 'screen.cards')!;
  assert.equal(
    find(tree, 'cards.booking>booking-card/title')?.characters,
    'Titre local',
  );
  assert.equal(find(tree, 'cards.booking')?.marks['data-ds-override'], '');
  assert.equal(
    find(tree, 'cards.booking>booking-card/cta>button/primary/label')
      ?.characters,
    'Go',
  );
  // Variante choisie en mode Test : l'override du titre suit (même nom).
  tree = renderTree(doc, 'screen.cards', {
    'cards.booking': { Réservé: 'Oui' },
  })!;
  const title = find(tree, 'cards.booking>booking-card-booked/title')!;
  assert.equal(title.characters, 'Titre local');
  assert.deepEqual(title.props.text?.size, { px: 30 });
  assert.match(
    find(tree, 'cards.booking>booking-card-booked/feedback')?.characters ?? '',
    /Inscription de démonstration/,
  );
});

test('cohérence : cycle, orphelin, instance récursive, composant manquant', () => {
  const ok = seedDoc();
  assert.deepEqual(docProblems(ok), []);
  const orphan = seedDoc();
  orphan.nodes['cards.grid'].children = [];
  assert.ok(
    docProblems(orphan).some(
      (p) => p.includes('Parent incohérent') || p.includes('orphelin'),
    ),
  );
  const loop = seedDoc();
  loop.nodes['booking-card/body'] = {
    ...loop.nodes['booking-card/body'],
    type: 'instance',
    componentId: 'booking-card',
  };
  assert.ok(docProblems(loop).some((p) => p.includes('récursive')));
  const missing = seedDoc();
  missing.nodes['cards.booking'].componentId = 'nope';
  assert.ok(docProblems(missing).some((p) => p.includes('introuvable')));
});

test('panneau v1 : écrire et relire un override, réinitialiser', () => {
  const doc = seedDoc();
  const fill = { token: 'color.danger', opacity: 1 } as const;
  // Le panneau envoie toujours toutes les valeurs propres (lien compris).
  apply(
    doc,
    writeLegacy(doc, 'cards.rhythm.cta', { fill, label: 'Hop', link: 'form' }),
  );
  assert.deepEqual(readOwn(doc, 'cards.rhythm.cta'), {
    fill,
    label: 'Hop',
    link: 'form',
  });
  // Sous-élément d'instance : override sur l'instance de premier niveau.
  apply(
    doc,
    writeLegacy(doc, 'cards.booking>booking-card/title', {
      fontSize: { px: 22 },
    }),
  );
  assert.deepEqual(
    doc.nodes['cards.booking'].overrides?.['booking-card/title'],
    {
      props: { text: { size: { px: 22 } } },
    },
  );
  apply(doc, writeLegacy(doc, 'cards.booking>booking-card/title', null));
  assert.equal(doc.nodes['cards.booking'].overrides, undefined);
});

test('Appliquer au composant : style, états, texte et lien reportés', () => {
  const doc = seedDoc();
  const fill = { token: 'color.danger', opacity: 1 } as const;
  apply(
    doc,
    writeLegacy(doc, 'cards.rhythm.cta', {
      fill,
      label: 'Je m’inscris',
      link: 'form',
    }),
  );
  apply(doc, applyToComponent(doc, 'cards.rhythm.cta'));
  const master = doc.nodes['button/secondary'];
  assert.deepEqual(master.props.fills?.[0], {
    type: 'solid',
    color: fill,
    visible: true,
  });
  // Le hover du composant est conservé.
  assert.ok(master.states?.hover);
  const p = master.componentProps?.Texte;
  assert.equal(p?.type === 'text' && p.default, 'Je m’inscris');
  assert.equal(master.interactions?.[0]?.action.type, 'navigate');
  const inst = doc.nodes['cards.rhythm.cta'];
  assert.equal(inst.overrides, undefined);
  assert.equal(inst.propValues?.Texte, 'Je m’inscris');
  // Plus aucun override : le lien vient maintenant du composant.
  assert.deepEqual(readOwn(doc, 'cards.rhythm.cta'), {});
  for (const n of Object.values(doc.nodes)) assert.ok(n.props, n.id);
  const tree = renderTree(doc, 'screen.cards')!;
  assert.equal(
    find(tree, 'cards.rhythm.cta')?.interactions[0]?.action.type,
    'navigate',
  );
  assert.deepEqual(docProblems(doc), []);
});

test('composant créé : converti en nœuds, rendu par la même fonction', () => {
  const c = newComponent('3f6c2a1e-8a7b-4c2d-9e10-123456789abc', 1);
  const doc = componentDoc(c);
  const root = renderTree(doc, `custom/${c.id}`)!;
  assert.equal(root.marks['data-ds-id'], `custom/${c.id}`);
  assert.equal(root.semantics.className, 'ds-custom');
  const rule = nodeCss(root.props, { type: 'component', parent: null });
  assert.equal(rule['background-color'], 'var(--color-brand)');
  assert.equal(
    rule.padding,
    'var(--space-sm) var(--space-md) var(--space-sm) var(--space-md)',
  );
  assert.equal(root.children.at(-1)?.characters, 'Bouton');
});
