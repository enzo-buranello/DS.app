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
