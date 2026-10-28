// Export natif : figma-plugin/code.js (compilé) contre une imitation de l'API
// Plugin. Vérifie la logique (liaisons, mise à jour sans doublon, annulation),
// pas le rendu réel de Figma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  CHUNK_SIZE,
  EXPORT_VERSION,
  type ExportPayload,
  type SceneNode,
} from '../app/shared/figmaExport.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = await readFile(path.join(root, 'figma-plugin/code.js'), 'utf8');
type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function mockFigma() {
  let seq = 0;
  const nodes = new Map<string, Any>();
  const mixed = Symbol('mixed');
  const messages: Any[] = [];
  const data = () => {
    const store: Record<string, string> = {};
    return {
      setPluginData: (k: string, v: string) => (store[k] = v),
      getPluginData: (k: string) => store[k] ?? '',
    };
  };
  const node = (type: string, props: Any = {}): Any => {
    const n: Any = {
      id: `${type === 'PAGE' ? 0 : 1}:${++seq}`,
      type,
      name: type,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      parent: null,
      children: [],
      removed: false,
      bound: {} as Any,
      ...data(),
      resize(w: number, h: number) {
        n.width = w;
        n.height = h;
      },
      appendChild(c: Any) {
        c.parent?.children.splice(c.parent.children.indexOf(c), 1);
        c.parent = n;
        n.children.push(c);
      },
      insertChild(i: number, c: Any) {
        c.parent?.children.splice(c.parent.children.indexOf(c), 1);
        c.parent = n;
        n.children.splice(i, 0, c);
      },
      remove() {
        n.parent?.children.splice(n.parent.children.indexOf(n), 1);
        n.parent = null;
        n.removed = true;
      },
      findAllWithCriteria: (c: Any): Any[] =>
        n.findAll((x: Any) =>
          c.pluginData.keys.some((k: string) => x.getPluginData(k)),
        ),
      findAll(fn: (c: Any) => boolean): Any[] {
        return n.children.flatMap((c: Any) => [
          ...(fn(c) ? [c] : []),
          ...c.findAll(fn),
        ]);
      },
      setBoundVariable(field: string, v: Any) {
        n.bound[field] = v.name;
      },
      async setTextStyleIdAsync(id: string) {
        n.textStyleId = id;
      },
      async setEffectStyleIdAsync(id: string) {
        n.effectStyleId = id;
      },
      ...props,
    };
    nodes.set(n.id, n);
    return n;
  };
  // Propriétés de composant, comme Figma : « Nom#id » sur le set ou le composant.
  const withProperties = (n: Any) => {
    n.componentPropertyDefinitions = {} as Any;
    n.addComponentProperty = (name: string, type: string, value: unknown) => {
      const key = `${name}#${++seq}`;
      n.componentPropertyDefinitions[key] = { type, defaultValue: value };
      return key;
    };
    return n;
  };
  // Instance : copie la structure du composant (calques dans le même ordre).
  const clone = (x: Any): Any => {
    const c = node(x.type, {
      name: x.name,
      characters: x.characters,
      fontName: x.fontName,
      layoutMode: x.layoutMode,
      mainComponent: x.mainComponent,
    });
    for (const k of x.children) c.appendChild(clone(k));
    return c;
  };
  const component = () => {
    const c = withProperties(node('COMPONENT'));
    c.createInstance = () => {
      const inst = node('INSTANCE', {
        mainComponent: c,
        width: c.width,
        height: c.height,
      });
      // Comme Figma : une instance porte les pluginData de son composant.
      inst.getPluginData = (k: string) => c.getPluginData(k);
      for (const k of c.children) inst.appendChild(clone(k));
      const owner = () => (c.parent?.type === 'COMPONENT_SET' ? c.parent : c);
      Object.defineProperty(inst, 'componentProperties', {
        get: () => owner().componentPropertyDefinitions,
      });
      inst.setProperties = (values: Any) =>
        (inst.properties = { ...inst.properties, ...values });
      return inst;
    };
    return c;
  };
  const page = node('PAGE', { name: 'DS' });
  page.loadAsync = async () => {};
  const docRoot: Any = {
    ...data(),
    name: 'Nosh',
    children: [page],
    findAll: (fn: (c: Any) => boolean) =>
      docRoot.children.flatMap((p: Any) => p.findAll(fn)),
  };
  const collections: Any[] = [];
  const variables: Any[] = [];
  const textStyles: Any[] = [];
  const effectStyles: Any[] = [];
  const fonts: string[] = [];
  const figma: Any = {
    mixed,
    root: docRoot,
    currentPage: page,
    showUI() {},
    ui: { postMessage: (m: Any) => messages.push(m), onmessage: null },
    viewport: { scrollAndZoomIntoView() {} },
    loadAllPagesAsync: async () => {},
    setCurrentPageAsync: async (p: Any) => (figma.currentPage = p),
    getNodeByIdAsync: async (id: string) => nodes.get(id) ?? null,
    createPage() {
      const p = node('PAGE');
      p.loadAsync = async () => {};
      docRoot.children.push(p);
      return p;
    },
    createFrame: () => node('FRAME', { fills: [] }),
    createImage: (bytes: Uint8Array) => ({ hash: `img-${bytes.length}` }),
    base64Decode: (data: string) => Buffer.from(data, 'base64'),
    createNodeFromSvg: (svg: string) => node('FRAME', { svg }),
    createRectangle: () => node('RECTANGLE', { fills: [] }),
    createText: () => node('TEXT', { characters: '' }),
    createComponent: component,
    combineAsVariants(members: Any[], parent: Any) {
      const set = withProperties(node('COMPONENT_SET'));
      parent.appendChild(set);
      for (const m of members) set.appendChild(m);
      return set;
    },
    loadFontAsync: async (f: Any) => {
      if (f.family !== 'Inter') throw new Error('police absente');
      fonts.push(f.style);
    },
    createTextStyle() {
      const s: Any = {
        id: 'S:' + ++seq,
        type: 'TEXT_STYLE',
        bound: {},
        ...data(),
      };
      s.setBoundVariable = (f: string, v: Any) => (s.bound[f] = v.name);
      textStyles.push(s);
      return s;
    },
    createEffectStyle() {
      const s: Any = { id: 'E:' + ++seq, type: 'EFFECT_STYLE', ...data() };
      effectStyles.push(s);
      return s;
    },
    getLocalTextStylesAsync: async () => textStyles,
    getLocalEffectStylesAsync: async () => effectStyles,
    variables: {
      getLocalVariableCollectionsAsync: async () => collections,
      getVariableByIdAsync: async (id: string) =>
        variables.find((v) => v.id === id) ?? null,
      createVariableCollection(name: string) {
        const c: Any = {
          name,
          modes: [{ modeId: 'm1', name: 'Mode 1' }],
          defaultModeId: 'm1',
          variableIds: [] as string[],
          renameMode(id: string, n: string) {
            c.modes.find((m: Any) => m.modeId === id).name = n;
          },
        };
        collections.push(c);
        return c;
      },
      createVariable(name: string, c: Any, resolvedType: string) {
        const v: Any = {
          id: 'V:' + ++seq,
          name,
          resolvedType,
          valuesByMode: {},
          ...data(),
          setValueForMode(m: string, val: unknown) {
            v.valuesByMode[m] = val;
          },
        };
        variables.push(v);
        c.variableIds.push(v.id);
        return v;
      },
      setBoundVariableForPaint: (p: Any, _f: string, v: Any) => ({
        ...p,
        boundVariables: { color: v.name },
      }),
      setBoundVariableForEffect: (e: Any, _f: string, v: Any) => ({
        ...e,
        boundVariables: { color: v.name },
      }),
    },
  };
  vm.runInNewContext(code, { figma, __html__: '', console, setTimeout });
  let rid = 0;
  const call = async (command: string, params: Any) => {
    const id = 'r' + ++rid;
    await figma.ui.onmessage({ id, command, params });
    return JSON.parse(
      JSON.stringify(messages.find((m) => m.id === id && 'ok' in m)),
    );
  };
  // Envoi comme le serveur : lots de CHUNK_SIZE, puis la commande d'export.
  const exportPayload = async (payload: ExportPayload) => {
    const json = JSON.stringify(payload);
    const transfer = 't' + ++rid;
    const total = Math.max(1, Math.ceil(json.length / CHUNK_SIZE));
    for (let index = 0; index < total; index++)
      await call('export_chunk', {
        transfer,
        index,
        total,
        data: json.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
      });
    return call(
      payload.kind === 'design_system'
        ? 'export_design_system'
        : 'export_preview',
      { transfer },
    );
  };
  return {
    figma,
    page,
    messages,
    nodes,
    variables,
    textStyles,
    effectStyles,
    collections,
    exportPayload,
    call,
    docRoot,
  };
}

const text = (characters: string, style = 'text/corps-400'): SceneNode => ({
  kind: 'TEXT',
  name: characters,
  x: 0,
  y: 0,
  w: 80,
  h: 24,
  sizingH: 'HUG',
  sizingV: 'HUG',
  text: {
    characters,
    fontFamily: 'system-ui',
    fontWeight: 400,
    fontSize: 16,
    fontSizeVariable: 'font.body',
    lineHeight: { unit: 'PIXELS', value: 24 },
    letterSpacing: 0,
    align: 'LEFT',
    valign: 'TOP',
    textCase: 'ORIGINAL',
    decoration: 'NONE',
    autoResize: 'WIDTH_AND_HEIGHT',
    maxLines: null,
    color: { hex: '#FFFFFF', opacity: 1, variable: 'color.onBrand' },
    style,
  },
  children: [],
});
const box = (
  name: string,
  children: SceneNode[],
  extra: Partial<SceneNode> = {},
): SceneNode => ({
  name,
  x: 0,
  y: 0,
  w: 160,
  h: 44,
  sizingH: 'HUG',
  sizingV: 'HUG',
  fills: [
    {
      type: 'SOLID',
      hex: '#3154C4',
      opacity: 1,
      variable: 'color.brand',
      visible: true,
    },
  ],
  radius: [10, 10, 10, 10],
  radiusVariables: [
    'radius.control',
    'radius.control',
    'radius.control',
    'radius.control',
  ],
  layout: {
    direction: 'HORIZONTAL',
    wrap: false,
    reverseZ: false,
    gap: 8,
    gapVariable: 'space.sm',
    padding: [8, 16, 8, 16],
    paddingVariables: ['space.sm', 'space.md', 'space.sm', 'space.md'],
    primary: 'CENTER',
    counter: 'CENTER',
  },
  children,
  ...extra,
});
const SHADOW = {
  type: 'DROP_SHADOW' as const,
  x: 0,
  y: 4,
  blur: 12,
  spread: 0,
  color: { hex: '#000000', opacity: 0.2 },
  visible: true,
};
function dsPayload(overrides: Partial<ExportPayload> = {}): ExportPayload {
  return {
    version: EXPORT_VERSION,
    kind: 'design_system',
    page: { mode: 'new', name: 'DS-Studio – Design system' },
    variables: [
      {
        token: 'color.brand',
        name: 'color/brand',
        type: 'COLOR',
        value: '#3154C4',
        category: 'color',
      },
      {
        token: 'color.onBrand',
        name: 'color/onBrand',
        type: 'COLOR',
        value: '#FFFFFF',
        category: 'color',
      },
      {
        token: 'space.sm',
        name: 'space/sm',
        type: 'FLOAT',
        value: 8,
        category: 'space',
      },
      {
        token: 'space.md',
        name: 'space/md',
        type: 'FLOAT',
        value: 16,
        category: 'space',
      },
      {
        token: 'radius.control',
        name: 'radius/control',
        type: 'FLOAT',
        value: 10,
        category: 'radius',
      },
      {
        token: 'font.body',
        name: 'font/body',
        type: 'FLOAT',
        value: 16,
        category: 'typography',
      },
      {
        token: 'font.family',
        name: 'font/family',
        type: 'STRING',
        value: 'system-ui',
        category: 'typography',
      },
    ],
    textStyles: [
      {
        id: 'text/corps-400',
        name: 'DS-Studio/Corps',
        fontFamily: 'system-ui',
        fontFamilyVariable: 'font.family',
        fontWeight: 400,
        fontSize: 16,
        fontSizeVariable: 'font.body',
        lineHeight: { unit: 'PIXELS', value: 24 },
        letterSpacing: 0,
        sample: 'Corps',
      },
    ],
    effectStyles: [
      {
        id: 'effect/1',
        name: 'DS-Studio/Effet 1',
        effects: [SHADOW],
      },
    ],
    components: [
      {
        id: 'button/primary',
        name: 'Button',
        set: 'Button',
        variant: 'Variante=Principal',
        properties: [],
        root: box('Variante=Principal', [text('Action')]),
      },
      {
        id: 'button/secondary',
        name: 'Button',
        set: 'Button',
        variant: 'Variante=Secondaire',
        properties: [],
        root: box('Variante=Secondaire', [text('Secondaire')]),
      },
      {
        id: 'booking-card',
        name: 'Carte réservation',
        set: null,
        variant: null,
        properties: [],
        root: box(
          'Carte réservation',
          [
            text('Faire moins'),
            box(
              'Variante=Principal',
              [{ ...text('Réserver une place'), overridden: true }],
              {
                instanceOf: 'button/primary',
                sizingH: 'FILL',
              },
            ),
          ],
          { effects: [SHADOW], effectStyle: 'effect/1' },
        ),
      },
    ],
    images: [],
    ...overrides,
  } as ExportPayload;
}
const plain = (v: unknown): Any => JSON.parse(JSON.stringify(v));
// Éléments exportés (les instances portent aussi l'id de leur composant).
const byKey = (m: ReturnType<typeof mockFigma>, key: string) =>
  m.docRoot.findAll(
    (n: Any) => n.type !== 'INSTANCE' && n.getPluginData('dsStudioId') === key,
  );

test('export DS : variables liées, styles, component set, instance, planches, progression', async () => {
  const m = mockFigma();
  const r = await m.exportPayload(dsPayload());
  assert.equal(r.ok, true, r.error);
  const res = r.result;
  assert.equal(res.pageName, 'DS-Studio – Design system');
  assert.ok(res.created > 10);
  assert.equal(res.updated, 0);
  assert.match(
    res.warnings.join(),
    /Police « system-ui » absente dans Figma : Inter utilisée/,
  );
  // Variables : collection « DS-Studio », mode « Défaut », valeurs écrites.
  assert.equal(m.collections[0].name, 'DS-Studio');
  assert.equal(m.collections[0].modes[0].name, 'Défaut');
  assert.deepEqual(
    plain(m.variables.find((v) => v.name === 'color/brand')!.valuesByMode.m1),
    { r: 49 / 255, g: 84 / 255, b: 196 / 255, a: 1 },
  );
  assert.deepEqual(
    plain(m.variables.find((v) => v.name === 'space/sm')!.scopes),
    ['GAP', 'WIDTH_HEIGHT'],
  );
  // Styles : taille liée à la variable ; famille non liée (police absente).
  assert.equal(m.textStyles[0].name, 'DS-Studio/Corps');
  assert.equal(m.textStyles[0].bound.fontSize, 'font/body');
  assert.equal(m.textStyles[0].bound.fontFamily, undefined);
  assert.equal(m.effectStyles[0].effects[0].type, 'DROP_SHADOW');
  // Composants : variantes regroupées, liaisons, auto layout.
  const [set] = byKey(m, 'set/Button');
  assert.equal(set.type, 'COMPONENT_SET');
  assert.deepEqual(
    set.children.map((c: Any) => c.name),
    ['Variante=Principal', 'Variante=Secondaire'],
  );
  const [primary] = byKey(m, 'button/primary');
  assert.equal(primary.fills[0].boundVariables.color, 'color/brand');
  assert.equal(primary.bound.itemSpacing, 'space/sm');
  assert.equal(primary.bound.paddingLeft, 'space/md');
  assert.equal(primary.bound.topLeftRadius, 'radius/control');
  assert.equal(primary.layoutMode, 'HORIZONTAL');
  assert.equal(primary.layoutSizingHorizontal, 'HUG');
  assert.equal(primary.children[0].textStyleId, m.textStyles[0].id);
  const [card] = byKey(m, 'booking-card');
  assert.equal(card.effectStyleId, m.effectStyles[0].id);
  const inner = card.children.find((c: Any) => c.type === 'INSTANCE');
  assert.equal(inner.mainComponent, primary);
  assert.equal(inner.children[0].characters, 'Réserver une place');
  assert.equal(inner.layoutSizingHorizontal, 'FILL');
  // Planches : une par catégorie, pastilles liées aux variables.
  for (const key of [
    'board/colors',
    'board/typography',
    'board/spacing',
    'board/components',
  ])
    assert.equal(byKey(m, key).length, 1, key);
  const [colors] = byKey(m, 'board/colors');
  const swatch = colors.findAll((n: Any) => n.type === 'RECTANGLE')[0];
  assert.equal(swatch.fills[0].boundVariables.color, 'color/brand');
  const [spacing] = byKey(m, 'board/spacing');
  assert.equal(
    spacing.findAll((n: Any) => n.type === 'RECTANGLE')[0].bound.width,
    'space/sm',
  );
  assert.equal(
    set.parent.getPluginData('dsStudioId'),
    'board/components/content',
  );
  // Progression : de 1 à total, dans l'ordre.
  // Lecture des pages (done = 0), puis un pas par élément, dans l'ordre.
  const all: Any[] = m.messages
    .filter((x) => x.progress)
    .map((x) => x.progress);
  assert.match(all[0].label, /Lecture de la page/);
  const progress = all.filter((p) => p.done > 0);
  assert.equal(progress.at(-1)!.done, progress.at(-1)!.total);
  assert.ok(progress.every((p, i) => p.done === i + 1));
});

test('ré-export : mise à jour sur place, aucun doublon, orphelins signalés sans suppression', async () => {
  const m = mockFigma();
  await m.exportPayload(dsPayload());
  const [primary] = byKey(m, 'button/primary');
  const counts = () => ({
    variables: m.variables.length,
    styles: m.textStyles.length + m.effectStyles.length,
    components: m.docRoot.findAll((n: Any) => n.type === 'COMPONENT').length,
    sets: m.docRoot.findAll((n: Any) => n.type === 'COMPONENT_SET').length,
    boards: m.docRoot.findAll((n: Any) =>
      /^board\/[a-z]+$/.test(n.getPluginData('dsStudioId')),
    ).length,
    pages: m.docRoot.children.length,
  });
  const before = counts();
  const payload = dsPayload();
  payload.variables[0].value = '#8A3B20';
  // La carte n'est plus dans l'app : elle doit être signalée, pas supprimée.
  payload.components = payload.components.filter(
    (c) => c.id !== 'booking-card',
  );
  const r = await m.exportPayload(payload);
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(counts(), before);
  assert.equal(r.result.created, 0);
  assert.deepEqual(r.result.createdIds, []);
  assert.ok(r.result.updated > 10);
  assert.match(r.result.warnings.join(), /existait : elle a été réutilisée/);
  assert.equal(byKey(m, 'button/primary')[0], primary);
  assert.deepEqual(
    m.variables.find((v) => v.name === 'color/brand')!.valuesByMode.m1.r,
    0x8a / 255,
  );
  assert.deepEqual(r.result.orphans, [
    { id: 'booking-card', name: 'Carte réservation' },
  ]);
  assert.equal(byKey(m, 'booking-card')[0].removed, false);
});

test('aperçu : instances des composants existants, création des manquants, page courante', async () => {
  const m = mockFigma();
  await m.exportPayload(dsPayload());
  const [primary] = byKey(m, 'button/primary');
  const screen = box(
    'DS-Studio / Découvrir / 375',
    [
      box(
        'Variante=Principal',
        [{ ...text('Voir les ateliers'), overridden: true }],
        { instanceOf: 'button/primary' },
      ),
      box('Badge', [text('Nouveau')], { instanceOf: 'custom/badge' }),
    ],
    { sizingH: 'FIXED', sizingV: 'HUG', w: 375 },
  );
  const payload: ExportPayload = {
    ...dsPayload({ page: { mode: 'current' } }),
    kind: 'preview',
    components: [
      dsPayload().components[0],
      {
        id: 'custom/badge',
        name: 'Badge',
        set: null,
        variant: null,
        properties: [],
        root: box('Badge', [text('Nouveau')]),
      },
    ],
    screen: {
      id: 'screen/cards/375',
      name: 'DS-Studio / Découvrir / 375',
      root: screen,
    },
  } as ExportPayload;
  m.figma.currentPage = m.page;
  const r = await m.exportPayload(payload);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.result.pageName, 'DS');
  const [frame] = byKey(m, 'screen/cards/375');
  const instances = frame.children.filter((c: Any) => c.type === 'INSTANCE');
  assert.equal(instances.length, 2);
  assert.equal(
    instances[0].mainComponent,
    primary,
    'composant existant réutilisé',
  );
  assert.equal(instances[0].children[0].characters, 'Voir les ateliers');
  // Le badge manquait : créé, rangé dans la planche Composants de la page.
  const [badge] = byKey(m, 'custom/badge');
  assert.equal(instances[1].mainComponent, badge);
  assert.equal(
    badge.parent.getPluginData('dsStudioId'),
    'board/components/content',
  );
  // Ré-export de l'aperçu : même frame, pas de doublon.
  const again = await m.exportPayload(payload);
  assert.equal(again.ok, true, again.error);
  assert.equal(byKey(m, 'screen/cards/375').length, 1);
  assert.equal(byKey(m, 'screen/cards/375')[0], frame);
});

test('export : page existante par id, page introuvable, annulation propagée', async () => {
  const m = mockFigma();
  const target = m.figma.createPage();
  target.name = 'Cible';
  const ok = await m.exportPayload(
    dsPayload({ page: { mode: 'existing', id: target.id } }),
  );
  assert.equal(ok.result.pageName, 'Cible');
  const missing = await m.exportPayload(
    dsPayload({ page: { mode: 'existing', id: '0:999' } }),
  );
  assert.equal(missing.ok, false);
  assert.match(missing.error, /Page cible introuvable/);

  // Annulation : la commande en cours s'arrête avant l'élément suivant.
  const json = JSON.stringify(dsPayload());
  await m.call('export_chunk', {
    transfer: 'tc',
    index: 0,
    total: 1,
    data: json,
  });
  const running = m.figma.ui.onmessage({
    id: 'job',
    command: 'export_design_system',
    params: { transfer: 'tc' },
  });
  await m.figma.ui.onmessage({
    id: 'c',
    command: 'cancel',
    params: { target: 'job' },
  });
  await running;
  const reply = m.messages.find((x) => x.id === 'job' && 'ok' in x)!;
  assert.equal(reply.ok, false);
  assert.match(reply.error, /Export annulé/);
  // Lot manquant : refus clair.
  await m.call('export_chunk', {
    transfer: 'tm',
    index: 0,
    total: 2,
    data: '{',
  });
  const partial = await m.call('export_design_system', { transfer: 'tm' });
  assert.match(partial.error, /Export incomplet/);
});

test('export : page impossible à charger (réseau Figma) signalée, export poursuivi', async () => {
  const m = mockFigma();
  await m.exportPayload(dsPayload());
  // Une page déjà utilisée par DS-Studio devient inaccessible.
  const used = m.docRoot.children.find(
    (p: Any) => p.name === 'DS-Studio – Design system',
  );
  used.loadAsync = async () => {
    throw new Error('Unable to establish connection to Figma after 10 seconds');
  };
  const other = m.figma.createPage();
  other.name = 'Ailleurs';
  // Une page jamais utilisée n'est pas chargée du tout.
  other.loadAsync = async () => {
    throw new Error('ne doit pas être chargée');
  };
  m.figma.currentPage = m.page;
  const r = await m.exportPayload(dsPayload({ page: { mode: 'current' } }));
  assert.equal(r.ok, true, r.error);
  assert.match(
    r.result.warnings.join(),
    /Page « DS-Studio – Design system » non chargée/,
  );
  assert.doesNotMatch(r.result.warnings.join(), /Ailleurs/);
  // La cible elle-même inaccessible : erreur claire.
  m.figma.currentPage = used;
  const fail = await m.exportPayload(dsPayload({ page: { mode: 'current' } }));
  assert.equal(fail.ok, false);
  assert.match(fail.error, /Figma n’arrive pas à charger la page/);
});

test('doublons d’un ancien export : signalés, le premier est mis à jour, rien supprimé', async () => {
  const m = mockFigma();
  await m.exportPayload(dsPayload());
  const [primary] = byKey(m, 'button/primary');
  // Simule le doublon laissé par une version précédente du plugin.
  const copy = m.figma.createComponent();
  copy.setPluginData('dsStudioId', 'button/primary');
  primary.parent.appendChild(copy);
  const r = await m.exportPayload(dsPayload());
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.result.createdIds, []);
  assert.match(
    r.result.warnings.join(),
    new RegExp(
      `Doublon : 2 éléments portent l’id « button/primary » \\(${primary.id}, ${copy.id}\\)`,
    ),
  );
  assert.equal(copy.removed, false);
});

test('aperçu : override d’instance (fond, rayon, texte) reporté sur l’instance seule', async () => {
  const m = mockFigma();
  await m.exportPayload(dsPayload());
  const [primary] = byKey(m, 'button/primary');
  // Variables du payload de test : color.brand (#3154C4) et color.onBrand.
  const red = { hex: '#B4233E', opacity: 1 };
  const label = { ...text('S’inscrire'), overridden: true };
  label.text!.color = { hex: '#3154C4', opacity: 1, variable: 'color.brand' };
  const screen = box(
    'DS-Studio / Découvrir / 375',
    [
      box('Variante=Principal', [label], {
        instanceOf: 'button/primary',
        overridden: true,
        fills: [{ type: 'SOLID', ...red, visible: true }],
        radius: [24, 24, 24, 24],
        radiusVariables: [null, null, null, null],
      }),
      box('Variante=Principal', [text('Voir')], {
        instanceOf: 'button/primary',
      }),
    ],
    { sizingH: 'FIXED', sizingV: 'HUG', w: 375 },
  );
  const r = await m.exportPayload({
    ...dsPayload({ page: { mode: 'current' } }),
    kind: 'preview',
    components: [dsPayload().components[0]],
    screen: { id: 'screen/cards/375', name: screen.name, root: screen },
  } as ExportPayload);
  assert.equal(r.ok, true, r.error);
  const [frame] = byKey(m, 'screen/cards/375');
  const [changed, untouched] = frame.children;
  assert.equal(changed.mainComponent, primary);
  assert.deepEqual(plain(changed.fills[0].color), {
    r: 0xb4 / 255,
    g: 0x23 / 255,
    b: 0x3e / 255,
  });
  assert.equal(changed.topLeftRadius, 24);
  assert.equal(changed.children[0].characters, 'S’inscrire');
  assert.equal(
    changed.children[0].fills[0].boundVariables.color,
    'color/brand',
  );
  // L'instance sans override garde les valeurs du composant.
  assert.equal(untouched.fills, undefined);
  assert.equal(untouched.children[0].characters, 'Action');
});

test('export v2 : fonds, contours, effets, contraintes, typo, propriétés de composant, états', async () => {
  const m = mockFigma();
  const label: SceneNode = {
    ...text('Action'),
    refs: { characters: 'Texte' },
    text: {
      ...text('Action').text!,
      textCase: 'UPPER',
      decoration: 'UNDERLINE',
      autoResize: 'TRUNCATE',
      maxLines: 2,
      lineHeight: { unit: 'PERCENT', value: 125 },
    },
  };
  const rich = box('Variante=Principal, Interaction=Défaut', [label], {
    fills: [
      {
        type: 'GRADIENT_LINEAR',
        angle: 180,
        stops: [
          { position: 0, hex: '#3154C4', opacity: 1, variable: 'color.brand' },
          { position: 1, hex: '#FFFFFF', opacity: 0.5 },
        ],
        opacity: 1,
        visible: true,
      },
      {
        type: 'IMAGE',
        asset: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png',
        scaleMode: 'FIT',
        opacity: 0.8,
        visible: true,
      },
    ],
    strokes: [
      {
        paint: { hex: '#3154C4', opacity: 1, variable: 'color.brand' },
        weight: [1, 0, 2, 0],
        align: 'OUTSIDE',
        dash: [4, 4],
        visible: true,
      },
    ],
    effects: [
      { type: 'LAYER_BLUR', radius: 4, visible: true },
      { ...SHADOW, type: 'INNER_SHADOW' },
    ],
    cornerSmoothing: 0.6,
    opacity: 0.5,
    blendMode: 'MULTIPLY',
    children: [
      label,
      {
        ...box('Pastille', []),
        kind: 'RECTANGLE',
        absolute: { h: 'MAX', v: 'CENTER' },
        x: 4,
        y: 2,
        rotation: -15,
        minW: 20,
      },
    ],
  });
  const hover = box('Variante=Principal, Interaction=Survol', [
    { ...text('Action'), refs: { characters: 'Texte' } },
  ]);
  const props = [{ name: 'Texte', type: 'TEXT' as const, default: 'Action' }];
  const payload = dsPayload({
    effectStyles: [],
    images: [
      {
        asset: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png',
        data: Buffer.from('png!').toString('base64'),
      },
    ],
    components: [
      {
        id: 'button/primary',
        name: 'Button',
        set: 'Button',
        variant: 'Variante=Principal, Interaction=Défaut',
        properties: props,
        root: rich,
      },
      {
        id: 'button/primary::hover',
        name: 'Button',
        set: 'Button',
        variant: 'Variante=Principal, Interaction=Survol',
        properties: props,
        root: hover,
      },
    ],
  });
  const r = await m.exportPayload(payload);
  assert.equal(r.ok, true, r.error);
  const [set] = byKey(m, 'set/Button');
  assert.deepEqual(
    set.children.map((c: Any) => c.name),
    [
      'Variante=Principal, Interaction=Défaut',
      'Variante=Principal, Interaction=Survol',
    ],
  );
  // Propriété créée une fois, sur le set ; textes liés dans chaque variante.
  const keys = Object.keys(set.componentPropertyDefinitions);
  assert.equal(keys.length, 1);
  assert.match(keys[0], /^Texte#/);
  const [primary] = byKey(m, 'button/primary');
  const [hoverComp] = byKey(m, 'button/primary::hover');
  assert.deepEqual(plain(primary.children[0].componentPropertyReferences), {
    characters: keys[0],
  });
  assert.equal(
    hoverComp.children[0].componentPropertyReferences.characters,
    keys[0],
  );
  // Fonds : dégradé (matrice de l'angle), image par empreinte.
  const [gradient, image] = primary.fills;
  assert.equal(gradient.type, 'GRADIENT_LINEAR');
  assert.equal(gradient.gradientStops.length, 2);
  // 180° CSS (haut → bas) : rotation de 90° de la matrice Figma.
  assert.ok(Math.abs(gradient.gradientTransform[0][1] - 1) < 1e-9);
  assert.deepEqual(plain(image), {
    type: 'IMAGE',
    imageHash: 'img-4',
    scaleMode: 'FIT',
    opacity: 0.8,
    visible: true,
  });
  // Contour par côté, extérieur, tirets, couleur liée.
  assert.equal(primary.strokes[0].boundVariables.color, 'color/brand');
  assert.equal(primary.strokeTopWeight, 1);
  assert.equal(primary.strokeBottomWeight, 2);
  assert.equal(primary.strokeAlign, 'OUTSIDE');
  assert.deepEqual(plain(primary.dashPattern), [4, 4]);
  // Effets : flou de calque et ombre intérieure liée à sa variable.
  assert.deepEqual(plain(primary.effects.map((e: Any) => e.type)), [
    'LAYER_BLUR',
    'INNER_SHADOW',
  ]);
  assert.equal(primary.cornerSmoothing, 0.6);
  assert.equal(primary.opacity, 0.5);
  assert.equal(primary.blendMode, 'MULTIPLY');
  // Typographie complète.
  const t = primary.children[0];
  assert.equal(t.textCase, 'UPPER');
  assert.equal(t.textDecoration, 'UNDERLINE');
  assert.equal(t.textTruncation, 'ENDING');
  assert.equal(t.maxLines, 2);
  assert.deepEqual(plain(t.lineHeight), { value: 125, unit: 'PERCENT' });
  // Calque absolu dans l'auto layout : contraintes, position, rotation.
  const dot = primary.children[1];
  assert.equal(dot.type, 'RECTANGLE');
  assert.equal(dot.layoutPositioning, 'ABSOLUTE');
  assert.deepEqual(plain(dot.constraints), {
    horizontal: 'MAX',
    vertical: 'CENTER',
  });
  assert.deepEqual([dot.x, dot.y, dot.rotation, dot.minWidth], [4, 2, -15, 20]);

  // Aperçu : la valeur de propriété de l'instance est appliquée.
  const screen = box(
    'Écran',
    [
      box('Variante=Principal', [{ ...text('Go'), overridden: true }], {
        instanceOf: 'button/primary',
        propValues: { Texte: 'Go' },
      }),
    ],
    { sizingH: 'FIXED', sizingV: 'HUG', w: 375 },
  );
  const p = await m.exportPayload({
    ...payload,
    page: { mode: 'current' },
    kind: 'preview',
    screen: { id: 'screen/cards/375', name: 'Écran', root: screen },
  } as ExportPayload);
  assert.equal(p.ok, true, p.error);
  const [frame] = byKey(m, 'screen/cards/375');
  assert.deepEqual(plain(frame.children[0].properties), { [keys[0]]: 'Go' });
});

test('plugin d’une autre version : format refusé avec la marche à suivre', async () => {
  const m = mockFigma();
  const r = await m.exportPayload({
    ...dsPayload(),
    version: 1,
  } as unknown as ExportPayload);
  assert.equal(r.ok, false);
  assert.match(r.error, /Relancez le plugin DS-Studio Bridge/);
  assert.equal(m.variables.length, 0);
});
