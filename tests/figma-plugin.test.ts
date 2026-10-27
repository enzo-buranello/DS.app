// Exécute figma-plugin/code.js contre une imitation minimale de l'API Plugin.
// Vérifie la logique de chaque commande, pas le rendu réel de Figma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = await readFile(path.join(root, 'figma-plugin/code.js'), 'utf8');
type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function mockFigma() {
  let id = 10;
  const nodes: Record<string, Any> = {};
  const loaded: string[] = [];
  const mixed = Symbol('mixed');
  const node = (type: string, props: Any = {}): Any => {
    const n: Any = {
      id: `1:${++id}`,
      type,
      name: type,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      parent: null,
      children: [],
      resize(w: number, h: number) {
        n.width = w;
        n.height = h;
      },
      appendChild(c: Any) {
        c.parent = n;
        n.children.push(c);
      },
      remove() {
        n.parent?.children.splice(n.parent.children.indexOf(n), 1);
        // Comme Figma : le nœud reste accessible par son id, marqué supprimé.
        n.parent = null;
        n.removed = true;
      },
      ...props,
    };
    nodes[n.id] = n;
    return n;
  };
  const page = node('PAGE', { id: '0:1', name: 'Composants' });
  nodes['0:1'] = page;
  page.selection = [];
  const text = node('TEXT', { name: 'Titre', fontName: mixed });
  let chars = 'Bonjour';
  Object.defineProperty(text, 'characters', {
    get: () => chars,
    set: (v: string) => {
      if (!loaded.includes('Inter|Bold') || !loaded.includes('Inter|Regular'))
        throw new Error('police non chargée');
      chars = v;
    },
  });
  text.getRangeAllFontNames = () => [
    { family: 'Inter', style: 'Regular' },
    { family: 'Inter', style: 'Bold' },
  ];
  page.appendChild(text);
  const messages: Any[] = [];
  const figma: Any = {
    mixed,
    root: { name: 'Nosh', children: [page, { id: '0:2', name: 'Écrans' }] },
    fileKey: 'iUWEVG8MtolVVF3uv2f24U',
    currentPage: page,
    showUI() {},
    ui: { postMessage: (m: Any) => messages.push(m), onmessage: null },
    viewport: { scrollAndZoomIntoView() {} },
    createFrame: () => node('FRAME', { fills: [] }),
    getNodeByIdAsync: async (i: string) => nodes[i] ?? null,
    loadFontAsync: async (f: Any) => {
      loaded.push(`${f.family}|${f.style}`);
    },
  };
  vm.runInNewContext(code, { figma, __html__: '', console });
  const send = async (command: string, params: Any = {}) => {
    const before = messages.length;
    await figma.ui.onmessage({ id: 'r' + before, command, params });
    return JSON.parse(JSON.stringify(messages[before]));
  };
  return { send, page, text, figma };
}

test('plugin : ping, document, sélection, nœud', async () => {
  const { send, page, text } = mockFigma();
  assert.equal((await send('ping')).result.pong, true);
  const doc = (await send('get_document_info')).result;
  assert.equal(doc.name, 'Nosh');
  assert.deepEqual(
    doc.pages.map((p: Any) => p.name),
    ['Composants', 'Écrans'],
  );
  page.selection = [text];
  const selection = await send('get_selection');
  assert.deepEqual(selection.result, [
    { id: text.id, type: 'TEXT', name: 'Titre', width: 100, height: 100 },
  ]);
  const node = (await send('get_node', { id: text.id })).result;
  assert.equal(node.characters, 'Bonjour');
  assert.equal(node.parentId, '0:1');
  const missing = await send('get_node', { id: '9:9' });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /Nœud introuvable/);
  assert.match((await send('inconnue')).error, /Commande inconnue/);
});

test('plugin : créer une frame, modifier un texte (polices chargées), supprimer', async () => {
  const { send, page, text } = mockFigma();
  const created = await send('create_frame', {
    x: 10,
    y: 20,
    width: 320,
    height: 200,
    name: 'Carte',
    color: '#3154C4',
  });
  assert.equal(created.ok, true);
  const frame = created.result;
  assert.deepEqual(
    [frame.type, frame.name, frame.x, frame.y, frame.width, frame.height],
    ['FRAME', 'Carte', 10, 20, 320, 200],
  );
  assert.deepEqual(frame.fills, [{ color: '#3154C4', opacity: 1 }]);
  assert.equal(page.selection[0].id, frame.id);

  const edited = await send('set_text', { id: text.id, text: 'Bonsoir' });
  assert.equal(edited.ok, true, edited.error);
  assert.equal(edited.result.characters, 'Bonsoir');
  const notText = await send('set_text', { id: frame.id, text: 'x' });
  assert.match(notText.error, /n’est pas un texte/);

  assert.deepEqual((await send('delete_node', { id: frame.id })).result, {
    deleted: frame.id,
  });
  assert.equal(
    page.children.some((c: Any) => c.id === frame.id),
    false,
  );
  assert.match((await send('delete_node', { id: '0:1' })).error, /refusée/);
  // Nœud supprimé encore renvoyé par Figma : introuvable.
  const ghost = await send('create_frame', {
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    name: 'g',
    color: '#000000',
  });
  await send('delete_node', { id: ghost.result.id });
  assert.match(
    (await send('get_node', { id: ghost.result.id })).error,
    /Nœud introuvable/,
  );
});

test('manifest : réseau limité à ws://localhost:3055', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(root, 'figma-plugin/manifest.json'), 'utf8'),
  );
  assert.deepEqual(manifest.networkAccess.devAllowedDomains, [
    'ws://localhost:3055',
  ]);
  assert.deepEqual(manifest.networkAccess.allowedDomains, ['none']);
  const ui = await readFile(path.join(root, 'figma-plugin/ui.html'), 'utf8');
  assert.match(ui, /ws:\/\/localhost:3055/);
});
