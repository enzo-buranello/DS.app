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

test('plugin : lien direct, liste des composants et sérialisation des variantes', async () => {
  const { figma, messages, page } = mockFigma();
  figma.mixed = Symbol('mixed');
  figma.fileKey = 'AbCdEf123456';
  figma.base64Encode = () => 'AAAA';
  const nodes: Any = {};
  const make = (type: string, props: Any): Any => {
    const n: Any = {
      type,
      parent: null,
      children: [],
      exportAsync: async () => new Uint8Array(10),
      findOne(fn: (c: Any) => boolean): Any | null {
        for (const c of n.children) {
          if (fn(c)) return c;
          const deep = c.findOne?.(fn);
          if (deep) return deep;
        }
        return null;
      },
      ...props,
    };
    for (const c of n.children) c.parent = n;
    nodes[n.id] = n;
    return n;
  };
  const label = (characters: string) =>
    make('TEXT', {
      id: 't' + characters,
      characters,
      fontName: { family: 'Inter', style: 'Bold' },
      fontWeight: 700,
      fontSize: 16,
      lineHeight: { unit: 'PERCENT', value: 150 },
      fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }],
      boundVariables: {},
    });
  const variant = (id: string, size: string) =>
    make('COMPONENT', {
      id,
      name: `Taille=${size}`,
      variantProperties: { Taille: size },
      fills: [{ type: 'SOLID', color: { r: 0.192, g: 0.329, b: 0.769 } }],
      strokes: [],
      strokeWeight: 0,
      dashPattern: [],
      topLeftRadius: 10,
      topRightRadius: 10,
      bottomRightRadius: 10,
      bottomLeftRadius: 10,
      layoutMode: 'HORIZONTAL',
      itemSpacing: 8,
      paddingTop: 8,
      paddingRight: 16,
      paddingBottom: 8,
      paddingLeft: 16,
      primaryAxisAlignItems: 'CENTER',
      counterAxisAlignItems: 'CENTER',
      layoutSizingHorizontal: 'HUG',
      layoutSizingVertical: 'HUG',
      width: 120,
      height: 44,
      minWidth: null,
      maxWidth: null,
      minHeight: null,
      maxHeight: null,
      effects: [],
      boundVariables: { itemSpacing: { id: 'vgap' } },
      children: [label(size)],
    });
  const set = make('COMPONENT_SET', {
    id: '1:1',
    name: 'Bouton',
    children: [variant('1:2', 'S'), variant('1:3', 'L')],
  });
  const card = make('COMPONENT', {
    ...variant('2:1', 'X'),
    name: 'Carte',
    variantProperties: null,
  });
  const all = [set, ...set.children, card];
  page.id = 'p1';
  page.findAllWithCriteria = () => all;
  const empty = {
    id: 'p2',
    name: 'Vide',
    loadAsync: async () => {},
    findAllWithCriteria: () => [],
  };
  figma.root.children.push(empty);
  figma.getNodeByIdAsync = async (id: string) => nodes[id] ?? null;
  const vget = figma.variables.getVariableByIdAsync;
  figma.variables.getVariableByIdAsync = async (id: string) =>
    id === 'vgap' ? { name: 'space/sm' } : vget(id);
  vm.runInNewContext(code, { figma, __html__: '', console });

  // Objets venus du contexte vm : on les normalise avant comparaison.
  const plain = (v: unknown): Any => JSON.parse(JSON.stringify(v));
  const [info] = (
    await run(figma, { rid: 1, type: 'live-info' }, messages)
  ).map(plain);
  assert.deepEqual(info.data.file, {
    name: 'Fichier test',
    key: 'AbCdEf123456',
  });
  assert.deepEqual(
    info.data.pages.map((p: Any) => p.name),
    ['Page 1', 'Vide'],
  );

  const [list] = (
    await run(
      figma,
      {
        rid: 2,
        type: 'command',
        command: { type: 'components', args: { pageId: 'p1' } },
      },
      messages,
    )
  ).map(plain);
  assert.equal(list.ok, true, list.error);
  // Les variantes sont regroupées sous leur set, pas listées à part.
  assert.deepEqual(
    list.data.items.map((i: Any) => [i.name, i.type, i.variants]),
    [
      ['Bouton', 'COMPONENT_SET', 2],
      ['Carte', 'COMPONENT', 1],
    ],
  );
  assert.equal(list.data.items[0].thumbnail, 'data:image/png;base64,AAAA');
  const [none] = (
    await run(
      figma,
      {
        rid: 3,
        type: 'command',
        command: { type: 'components', args: { pageId: 'p2' } },
      },
      messages,
    )
  ).map(plain);
  assert.deepEqual(none.data.items, []);

  const [imported] = (
    await run(
      figma,
      {
        rid: 4,
        type: 'command',
        command: {
          type: 'import',
          args: { pageId: 'p1', ids: ['1:1', '2:1'] },
        },
      },
      messages,
    )
  ).map(plain);
  assert.equal(imported.ok, true, imported.error);
  const items = imported.data.items;
  assert.equal(items.length, 3);
  assert.deepEqual(items[0].set, { id: '1:1', name: 'Bouton' });
  assert.deepEqual(items[1].properties, { Taille: 'L' });
  assert.equal(items[0].fill.hex, '#3154C4');
  assert.equal(items[0].layout.gapVariable, 'space/sm');
  assert.equal(items[0].text.characters, 'S');
  assert.equal(items[2].set, null);

  const [missing] = (
    await run(
      figma,
      {
        rid: 5,
        type: 'command',
        command: { type: 'components', args: { pageId: 'nope' } },
      },
      messages,
    )
  ).map(plain);
  assert.equal(missing.ok, false);
  assert.match(missing.error, /Page introuvable/);
});
