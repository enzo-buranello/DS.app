// Exécute plugins/figma-bridge/code.js contre une imitation minimale de l'API Figma.
// Vérifie la logique (variables, liaisons, frames, relecture), pas le rendu réel de Figma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { tokensSchema } from '../app/shared/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = await readFile(
  path.join(root, 'plugins/figma-bridge/code.js'),
  'utf8',
);
const tokens = tokensSchema.parse(
  JSON.parse(
    await readFile(
      path.join(root, 'workspace/design-system.tokens.json'),
      'utf8',
    ),
  ),
);

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
function mockFigma() {
  let id = 0;
  const vars: Any[] = [];
  const collections: Any[] = [];
  const messages: Any[] = [];
  const node = (type: string): Any => {
    const n: Any = {
      id: String(++id),
      type,
      name: '',
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      children: [],
      bound: {} as Any,
      parent: null,
      resize(w: number, h: number) {
        if (!(w > 0 && h > 0)) throw new Error('resize invalide');
        n.width = w;
        n.height = h;
      },
      appendChild(c: Any) {
        c.parent?.children.splice(c.parent.children.indexOf(c), 1);
        c.parent = n;
        n.children.push(c);
      },
      remove() {
        n.parent?.children.splice(n.parent.children.indexOf(n), 1);
        n.parent = null;
      },
      setBoundVariable(field: string, v: Any) {
        n.bound[field] = v.name;
      },
      pluginData: {} as Record<string, string>,
      setPluginData(k: string, v: string) {
        n.pluginData[k] = v;
      },
      getPluginData: (k: string) => n.pluginData[k] ?? '',
      findAll(fn: (c: Any) => boolean): Any[] {
        return n.children.flatMap((c: Any) => [
          ...(fn(c) ? [c] : []),
          ...(c.findAll ? c.findAll(fn) : []),
        ]);
      },
      findOne: (fn: (c: Any) => boolean): Any => n.findAll(fn)[0] ?? null,
    };
    if (type === 'COMPONENT')
      n.createInstance = () => {
        const inst = node('INSTANCE');
        inst.mainComponent = n;
        inst.width = n.width;
        inst.height = n.height;
        // Copie des textes : suffisant pour vérifier les remplacements de contenu.
        for (const t of n.findAll((c: Any) => c.type === 'TEXT')) {
          const copy = node('TEXT');
          copy.fontName = t.fontName;
          copy.characters = t.characters;
          inst.appendChild(copy);
        }
        return inst;
      };
    if (type === 'TEXT') {
      let chars = '';
      Object.defineProperty(n, 'characters', {
        get: () => chars,
        set: (v: string) => {
          if (!n.fontName) throw new Error('police non chargée');
          chars = v;
        },
      });
    }
    return n;
  };
  const page = node('PAGE');
  page.name = 'Page 1';
  page.loadAsync = async () => {};
  const docRoot: Any = { name: 'Fichier test', children: [page] };
  const figma: Any = {
    root: docRoot,
    currentPage: page,
    showUI() {},
    notify() {},
    ui: { postMessage: (m: Any) => messages.push(m), onmessage: null },
    clientStorage: {
      getAsync: async () => undefined,
      setAsync: async () => {},
    },
    viewport: { scrollAndZoomIntoView() {} },
    loadFontAsync: async (f: Any) => {
      if (f.family !== 'Inter') throw new Error('absente');
    },
    setCurrentPageAsync: async (p: Any) => {
      figma.currentPage = p;
    },
    createPage() {
      const p = node('PAGE');
      p.loadAsync = async () => {};
      docRoot.children.push(p);
      return p;
    },
    createFrame: () => node('FRAME'),
    createComponent: () => node('COMPONENT'),
    combineAsVariants(members: Any[], parent: Any) {
      const set = node('COMPONENT_SET');
      parent.appendChild(set);
      for (const m of members) set.appendChild(m);
      return set;
    },
    createText: () => node('TEXT'),
    getLocalPaintStylesAsync: async () => [],
    getLocalTextStylesAsync: async () => [],
    base64Encode: () => '',
    variables: {
      getLocalVariableCollectionsAsync: async () => collections,
      getLocalVariablesAsync: async () => vars,
      getVariableByIdAsync: async (i: string) =>
        vars.find((v) => v.id === i) ?? null,
      getVariableCollectionByIdAsync: async (i: string) =>
        collections.find((c) => c.id === i) ?? null,
      createVariableCollection(name: string) {
        const c = {
          id: 'c' + ++id,
          name,
          defaultModeId: 'm1',
          variableIds: [] as string[],
        };
        collections.push(c);
        return c;
      },
      createVariable(name: string, c: Any, resolvedType: string) {
        const v: Any = {
          id: 'v' + ++id,
          name,
          resolvedType,
          variableCollectionId: c.id,
          valuesByMode: {},
          setValueForMode(m: string, val: unknown) {
            v.valuesByMode[m] = val;
          },
        };
        vars.push(v);
        c.variableIds.push(v.id);
        return v;
      },
      setBoundVariableForPaint: (p: Any, _f: string, v: Any) => ({
        ...p,
        boundVariables: { color: v.name },
      }),
    },
  };
  return { figma, messages, page, vars };
}

async function run(figma: Any, msg: Any, messages: Any[]) {
  const before = messages.length;
  await figma.ui.onmessage(msg);
  return messages.slice(before);
}

test('plugin : prévisualisation, application, liaisons et relecture', async () => {
  const { figma, messages, vars } = mockFigma();
  vm.runInNewContext(code, { figma, __html__: '', console });
  const text = (characters: string, fontSize: number, color: Any) => ({
    name: characters,
    x: 0,
    y: 0,
    w: 100,
    h: 20,
    children: [],
    text: {
      characters,
      fontFamily: 'system-ui',
      fontWeight: 700,
      fontSize,
      fontSizeToken: 'font.body',
      lineHeight: 20,
      letterSpacing: 0,
      align: 'LEFT',
      color,
      uppercase: false,
    },
  });
  const data = {
    tokens,
    screens: [
      {
        name: 'DS-Studio / Découvrir / 375',
        width: 375,
        root: {
          name: 'DS-Studio / Découvrir / 375',
          x: 0,
          y: 0,
          w: 375,
          h: 400,
          fill: { hex: '#F3F5FA', opacity: 1, token: 'color.canvas' },
          children: [
            {
              name: 'ds-button',
              x: 24,
              y: 40,
              w: 120,
              h: 44,
              fill: { hex: '#3154C4', opacity: 1, token: 'color.brand' },
              radius: tokens['radius.control'].$value,
              radiusToken: 'radius.control',
              layout: {
                mode: 'HORIZONTAL',
                gap: 8,
                padding: [12, 16, 12, 16],
                paddingTokens: [null, null, null, null],
                primary: 'CENTER',
                counter: 'CENTER',
              },
              children: [
                text('Réserver', tokens['font.body'].$value, {
                  hex: '#FFFFFF',
                  opacity: 1,
                  token: 'color.onBrand',
                }),
              ],
            },
          ],
        },
      },
    ],
  };
  const preview = (
    await run(figma, { type: 'preview-export', data }, messages)
  )[0];
  assert.equal(preview.type, 'export-preview', JSON.stringify(preview));
  assert.equal(
    preview.rows.filter((r: Any) => r.action === 'créer').length,
    Object.keys(tokens).length,
  );
  assert.equal(vars.length, 0, 'la prévisualisation n’écrit rien');

  // Refus si les tokens ont changé depuis la prévisualisation.
  const stale = await run(
    figma,
    { type: 'apply-export', data, previewTokens: '{}' },
    messages,
  );
  assert.equal(stale.at(-1)!.type, 'error');
  assert.equal(vars.length, 0);

  const done = await run(
    figma,
    { type: 'apply-export', data, previewTokens: JSON.stringify(tokens) },
    messages,
  );
  const summary = done.at(-1)!;
  assert.equal(summary.type, 'export-done', JSON.stringify(summary));
  assert.equal(
    summary.summary.mismatched.length,
    0,
    summary.summary.mismatched.join(),
  );
  assert.equal(vars.length, Object.keys(tokens).length);
  const page = figma.root.children.find((p: Any) => p.name === 'DS-Studio');
  const frame = page.children[0];
  assert.equal(frame.name, 'DS-Studio / Découvrir / 375');
  assert.equal(frame.fills[0].boundVariables.color, 'color/canvas');
  const button = frame.children[0];
  assert.equal(button.layoutMode, 'HORIZONTAL');
  assert.equal(button.bound.topLeftRadius, 'radius/control');
  const label = button.children[0];
  assert.equal(label.characters, 'Réserver');
  assert.equal(label.fontName.family, 'Inter');
  assert.equal(label.bound.fontSize, 'font/body');

  // Second export : l'écran est remplacé, pas dupliqué ; les variables sont réutilisées.
  await run(
    figma,
    { type: 'apply-export', data, previewTokens: JSON.stringify(tokens) },
    messages,
  );
  assert.equal(page.children.length, 1);
  assert.equal(vars.length, Object.keys(tokens).length);
});

test('plugin : lien direct, fichier ouvert et pages annoncés', async () => {
  const { figma, messages } = mockFigma();
  figma.fileKey = 'AbCdEf123456';
  figma.root.children.push({
    id: 'p2',
    name: 'Vide',
    loadAsync: async () => {},
  });
  vm.runInNewContext(code, { figma, __html__: '', console });
  const [info] = (
    await run(figma, { rid: 1, type: 'live-info' }, messages)
  ).map((m: Any) => JSON.parse(JSON.stringify(m)));
  assert.deepEqual(info.data.file, {
    name: 'Fichier test',
    key: 'AbCdEf123456',
  });
  assert.deepEqual(
    info.data.pages.map((p: Any) => p.name),
    ['Page 1', 'Vide'],
  );
  const [unknown] = await run(
    figma,
    { rid: 2, type: 'command', command: { type: 'components', args: {} } },
    messages,
  );
  assert.equal(unknown.ok, false);
  assert.match(unknown.error, /Commande inconnue/);
});

const leaf = (characters: string): Any => ({
  name: characters,
  x: 0,
  y: 0,
  w: 100,
  h: 20,
  children: [],
  text: {
    characters,
    fontFamily: 'system-ui',
    fontWeight: 600,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0,
    align: 'LEFT',
    color: { hex: '#FFFFFF', opacity: 1, token: 'color.onBrand' },
    uppercase: false,
  },
});
const box = (
  name: string,
  component: Any | undefined,
  children: Any[],
): Any => ({
  name,
  x: 0,
  y: 0,
  w: 160,
  h: 44,
  fill: { hex: '#3154C4', opacity: 1, token: 'color.brand' },
  radius: 10,
  radiusToken: 'radius.control',
  layout: {
    mode: 'HORIZONTAL',
    gap: 8,
    padding: [8, 16, 8, 16],
    paddingTokens: ['space.sm', 'space.md', 'space.sm', 'space.md'],
    primary: 'CENTER',
    counter: 'CENTER',
  },
  component,
  children,
});
const ref = (key: string, set: string | null, variant: string | null) => ({
  key,
  name: set ?? key,
  set,
  variant,
});

test('plugin : export natif DS, component sets, instances et ré-export sans doublon', async () => {
  const { figma, messages, page } = mockFigma();
  page.id = 'p1';
  vm.runInNewContext(code, { figma, __html__: '', console });
  const primary = ref(
    'Button|Variante=Principal',
    'Button',
    'Variante=Principal',
  );
  const secondary = ref(
    'Button|Variante=Secondaire',
    'Button',
    'Variante=Secondaire',
  );
  const card = ref('BookingCard', null, null);
  const definitions = [
    { ...primary, root: box('Variante=Principal', primary, [leaf('Action')]) },
    {
      ...secondary,
      root: box('Variante=Secondaire', secondary, [leaf('Secondaire')]),
    },
    {
      ...card,
      root: box('BookingCard', card, [
        leaf('Faire moins'),
        box('Variante=Principal', primary, [leaf('Réserver une place')]),
      ]),
    },
  ];
  const exportOnce = async () => {
    const [reply] = await run(
      figma,
      {
        rid: 1,
        type: 'command',
        command: {
          type: 'export',
          args: { pageId: 'p1', kind: 'ds', tokens, definitions, screens: [] },
        },
      },
      messages,
    ).then((r) => r.filter((m: Any) => m.type === 'reply'));
    assert.equal(reply.ok, true, reply.error);
    return JSON.parse(JSON.stringify(reply.data));
  };
  const first = await exportOnce();
  assert.deepEqual(
    { created: first.created, updated: first.updated, sets: first.sets },
    { created: 4, updated: 0, sets: 1 },
  );
  assert.deepEqual(first.mismatched, []);
  const set = page.findOne((n: Any) => n.type === 'COMPONENT_SET');
  assert.equal(set.name, 'Button');
  assert.equal(set.layoutMode, 'HORIZONTAL');
  assert.deepEqual(
    set.children.map((c: Any) => c.name),
    ['Variante=Principal', 'Variante=Secondaire'],
  );
  const button = set.children[0];
  assert.equal(button.type, 'COMPONENT');
  assert.equal(button.layoutMode, 'HORIZONTAL');
  assert.equal(button.fills[0].boundVariables.color, 'color/brand');
  assert.equal(button.bound.paddingLeft, 'space/md');
  // Le bouton de la carte est une instance du variant, avec son propre texte.
  const cardComp = page.findOne(
    (n: Any) => n.type === 'COMPONENT' && n.name === 'BookingCard',
  );
  const inner = cardComp.children.find((c: Any) => c.type === 'INSTANCE');
  assert.equal(inner.mainComponent, button);
  assert.equal(inner.children[0].characters, 'Réserver une place');

  // Ré-export : mêmes nœuds mis à jour, aucun doublon.
  definitions[0].root.children = [leaf('Action modifiée')];
  const second = await exportOnce();
  assert.deepEqual(
    { created: second.created, updated: second.updated },
    { created: 0, updated: 3 },
  );
  assert.equal(page.findAll((n: Any) => n.type === 'COMPONENT_SET').length, 1);
  assert.equal(page.findAll((n: Any) => n.type === 'COMPONENT').length, 3);
  // Même nœud qu'au premier export : les instances existantes restent liées.
  assert.equal(set.children[0], button);
  assert.equal(button.children[0].characters, 'Action modifiée');
});

test('plugin : export d’un aperçu, composants créés si absents puis réutilisés', async () => {
  const { figma, messages, page } = mockFigma();
  page.id = 'p1';
  vm.runInNewContext(code, { figma, __html__: '', console });
  const primary = ref(
    'Button|Variante=Principal',
    'Button',
    'Variante=Principal',
  );
  const screen = {
    key: 'cards:375',
    name: 'DS-Studio / Découvrir / 375',
    root: {
      ...box('DS-Studio / Découvrir / 375', undefined, [
        box('Variante=Principal', primary, [leaf('Réserver')]),
        box('Variante=Principal', primary, [leaf('Voir')]),
      ]),
      component: undefined,
      layout: undefined,
    },
  };
  const exportPreview = async () => {
    const replies = (
      await run(
        figma,
        {
          rid: 2,
          type: 'command',
          command: {
            type: 'export',
            args: {
              pageId: 'p1',
              kind: 'preview',
              tokens,
              definitions: [],
              screens: [screen],
            },
          },
        },
        messages,
      )
    ).filter((m: Any) => m.type === 'reply');
    assert.equal(replies[0].ok, true, replies[0].error);
    return JSON.parse(JSON.stringify(replies[0].data));
  };
  const first = await exportPreview();
  // Écran + composant créé + son set.
  assert.equal(first.created, 3);
  const frame = page.findOne(
    (n: Any) => n.type === 'FRAME' && n.name === screen.name,
  );
  const instances = frame.children.filter((c: Any) => c.type === 'INSTANCE');
  assert.equal(instances.length, 2);
  assert.equal(instances[0].mainComponent, instances[1].mainComponent);
  assert.deepEqual(
    instances.map((i: Any) => i.children[0].characters),
    ['Réserver', 'Voir'],
  );
  const second = await exportPreview();
  assert.equal(second.created, 0);
  assert.equal(
    page.findAll((n: Any) => n.type === 'FRAME' && n.name === screen.name)
      .length,
    1,
  );
  assert.equal(page.findAll((n: Any) => n.type === 'COMPONENT').length, 1);

  const [missing] = (
    await run(
      figma,
      {
        rid: 3,
        type: 'command',
        command: {
          type: 'export',
          args: {
            pageId: 'nope',
            kind: 'ds',
            tokens,
            definitions: [],
            screens: [],
          },
        },
      },
      messages,
    )
  ).filter((m: Any) => m.type === 'reply');
  assert.equal(missing.ok, false);
  assert.match(missing.error, /Page introuvable/);
});
