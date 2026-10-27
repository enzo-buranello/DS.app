// DS-Studio Bridge — code principal du plugin (bac à sable Figma).
// Le plugin n'écrit que sur demande de DS-Studio (clic « Exporter »), dans la
// page choisie, puis relit les variables écrites.

figma.showUI(__html__, { width: 380, height: 560, themeColors: true });

const COLLECTION = 'DS-Studio';
const STYLE_BY_WEIGHT = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi Bold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
};
const SYSTEM_FONTS = [
  'system-ui',
  '-apple-system',
  'BlinkMacSystemFont',
  'ui-sans-serif',
  'sans-serif',
  'Segoe UI',
  'Helvetica Neue',
];

const toHex = (c) =>
  '#' +
  [c.r, c.g, c.b]
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase();
const toRgb = (hex) => ({
  r: parseInt(hex.slice(1, 3), 16) / 255,
  g: parseInt(hex.slice(3, 5), 16) / 255,
  b: parseInt(hex.slice(5, 7), 16) / 255,
});
const varName = (key) => key.replace('.', '/');
const post = (msg) => figma.ui.postMessage(msg);

// ---------- Export : variables ----------
function tokenType(token) {
  return token.$type === 'color'
    ? 'COLOR'
    : token.$type === 'dimension'
      ? 'FLOAT'
      : 'STRING';
}
function tokenFigmaValue(token) {
  return token.$type === 'color' ? toRgb(token.$value) : token.$value;
}
function displayValue(type, value) {
  if (value === undefined || value === null) return '—';
  return type === 'COLOR' && typeof value === 'object'
    ? toHex(value)
    : String(value);
}
async function findCollection() {
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  return cols.find((c) => c.name === COLLECTION) || null;
}
async function existingVariables(collection) {
  const map = {};
  if (!collection) return map;
  for (const id of collection.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (v) map[v.name] = v;
  }
  return map;
}

async function previewExport(data) {
  const collection = await findCollection();
  const vars = await existingVariables(collection);
  const rows = [];
  for (const key of Object.keys(data.tokens)) {
    const token = data.tokens[key];
    const type = tokenType(token);
    const v = vars[varName(key)];
    const after = displayValue(type, tokenFigmaValue(token));
    const before = v
      ? displayValue(type, v.valuesByMode[collection.defaultModeId])
      : '—';
    rows.push({
      name: varName(key),
      before,
      after,
      action: !v ? 'créer' : before === after ? '=' : 'modifier',
    });
  }
  return {
    rows,
    screens: data.screens.map((s) => s.name),
    collectionExists: !!collection,
  };
}

async function applyVariables(tokens) {
  let collection = await findCollection();
  if (!collection)
    collection = figma.variables.createVariableCollection(COLLECTION);
  const mode = collection.defaultModeId;
  const vars = await existingVariables(collection);
  const byKey = {};
  for (const key of Object.keys(tokens)) {
    const token = tokens[key];
    const type = tokenType(token);
    let v = vars[varName(key)];
    if (v && v.resolvedType !== type)
      throw new Error(
        `Variable ${varName(key)} : type ${v.resolvedType} incompatible.`,
      );
    if (!v) v = figma.variables.createVariable(varName(key), collection, type);
    v.setValueForMode(mode, tokenFigmaValue(token));
    byKey[key] = v;
  }
  return { collection, byKey };
}

// ---------- Export : écrans ----------
const fontCache = {};
async function loadFont(family, weight) {
  const fam = SYSTEM_FONTS.includes(family) ? 'Inter' : family;
  const style = STYLE_BY_WEIGHT[Math.round(weight / 100) * 100] || 'Regular';
  const bold = weight >= 600 ? 'Bold' : 'Regular';
  const tries = [
    { family: fam, style },
    { family: fam, style: bold },
    { family: 'Inter', style },
    { family: 'Inter', style: bold },
    { family: 'Inter', style: 'Regular' },
  ];
  for (const f of tries) {
    const id = f.family + '|' + f.style;
    if (fontCache[id] === false) continue;
    if (fontCache[id]) return f;
    try {
      await figma.loadFontAsync(f);
      fontCache[id] = true;
      return f;
    } catch (e) {
      fontCache[id] = false;
    }
  }
  throw new Error('Aucune police utilisable (Inter introuvable).');
}

function makePaint(fill, vars) {
  let paint = { type: 'SOLID', color: toRgb(fill.hex), opacity: fill.opacity };
  if (fill.token && vars[fill.token])
    paint = figma.variables.setBoundVariableForPaint(
      paint,
      'color',
      vars[fill.token],
    );
  return paint;
}
function bind(node, field, key, value, tokens, vars) {
  // On ne lie que si la valeur dessinée est exactement celle du token.
  if (key && vars[key] && tokens[key].$value === value) {
    try {
      node.setBoundVariable(field, vars[key]);
    } catch (e) {
      /* Champ non liable sur cette version de Figma : valeur brute conservée. */
    }
  }
}

async function buildText(node, tokens, vars) {
  const t = node.text;
  const text = figma.createText();
  text.fontName = await loadFont(t.fontFamily, t.fontWeight);
  text.characters = t.characters;
  text.name = node.name || t.characters.slice(0, 40);
  text.fontSize = t.fontSize;
  text.lineHeight = { value: t.lineHeight, unit: 'PIXELS' };
  text.letterSpacing = { value: t.letterSpacing, unit: 'PIXELS' };
  text.textAlignHorizontal = t.align;
  if (t.uppercase) text.textCase = 'UPPER';
  text.fills = [makePaint(t.color, vars)];
  bind(text, 'fontSize', t.fontSizeToken, t.fontSize, tokens, vars);
  const singleLine = node.h <= t.lineHeight * 1.5;
  if (singleLine) {
    text.textAutoResize = 'WIDTH_AND_HEIGHT';
  } else {
    text.resize(Math.max(1, node.w), Math.max(1, node.h));
    text.textAutoResize = 'HEIGHT';
  }
  return text;
}

// ctx (export natif) : les composants DS marqués deviennent des instances.
// target : nœud existant à remplir sur place (mise à jour d'un composant).
async function build(node, tokens, vars, ctx, target) {
  if (!target && ctx && node.component)
    return instanceFor(node, tokens, vars, ctx);
  if (
    !target &&
    node.text &&
    !node.children.length &&
    !node.fill &&
    !node.stroke
  )
    return buildText(node, tokens, vars);
  const frame = target || figma.createFrame();
  if (target) for (const c of frame.children.slice()) c.remove();
  frame.name = node.name;
  frame.clipsContent = false;
  frame.resize(Math.max(1, node.w), Math.max(1, node.h));
  frame.fills = node.fill ? [makePaint(node.fill, vars)] : [];
  if (node.stroke) {
    frame.strokes = [makePaint(node.stroke, vars)];
    frame.strokeWeight = node.stroke.weight;
    frame.strokeAlign = 'INSIDE';
  } else if (target) frame.strokes = [];
  if (target && !node.radius) frame.cornerRadius = 0;
  if (target && !node.layout) frame.layoutMode = 'NONE';
  if (node.radius) {
    frame.cornerRadius = node.radius;
    for (const corner of [
      'topLeftRadius',
      'topRightRadius',
      'bottomLeftRadius',
      'bottomRightRadius',
    ])
      bind(frame, corner, node.radiusToken, node.radius, tokens, vars);
  }
  const auto = node.layout;
  if (auto) {
    frame.layoutMode = auto.mode;
    frame.primaryAxisSizingMode = 'FIXED';
    frame.counterAxisSizingMode = 'FIXED';
    frame.itemSpacing = auto.primary === 'SPACE_BETWEEN' ? 0 : auto.gap;
    frame.primaryAxisAlignItems = auto.primary;
    frame.counterAxisAlignItems = auto.counter;
    const sides = [
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
    ];
    sides.forEach((side, i) => {
      frame[side] = auto.padding[i];
      bind(frame, side, auto.paddingTokens[i], auto.padding[i], tokens, vars);
    });
    if (auto.primary !== 'SPACE_BETWEEN')
      bind(frame, 'itemSpacing', auto.gapToken, auto.gap, tokens, vars);
  }
  for (const child of node.children) {
    const c = await build(child, tokens, vars, ctx);
    frame.appendChild(c);
    if (auto) {
      // Taille mesurée dans le navigateur, conservée telle quelle.
      if (c.type !== 'TEXT' || c.textAutoResize !== 'WIDTH_AND_HEIGHT') {
        c.layoutSizingHorizontal = 'FIXED';
        c.layoutSizingVertical = c.type === 'TEXT' ? 'HUG' : 'FIXED';
      }
    } else {
      c.x = child.x;
      c.y = child.y;
    }
  }
  return frame;
}

// ---------- Lien direct : DS-Studio commande, le plugin ouvert exécute ----------
function liveInfo() {
  return {
    file: {
      name: figma.root.name.slice(0, 200),
      // Disponible pour un plugin de développement ; null sinon.
      key: typeof figma.fileKey === 'string' ? figma.fileKey : null,
    },
    pages: figma.root.children
      .slice(0, 500)
      .map((p) => ({ id: p.id, name: p.name.slice(0, 200) })),
  };
}
async function pageById(id) {
  const page = figma.root.children.find((p) => p.id === id);
  if (!page)
    throw new Error(
      'Page introuvable dans le fichier ouvert. Rechargez la liste des pages.',
    );
  await page.loadAsync();
  return page;
}
async function runCommand(command) {
  if (command.type === 'export') return exportNative(command.args);
  throw new Error('Commande inconnue.');
}

// ---------- Export natif : composants, component sets, instances ----------
const KEY = 'dsStudioKey';
// Identifiant stocké côté app d'abord, pluginData ensuite (nœud copié, app réinstallée…).
async function findByKey(ctx, type, key) {
  const id = ctx.nodes[key];
  if (id) {
    const node = await figma.getNodeByIdAsync(id);
    if (node && node.type === type && node.getPluginData(KEY) === key)
      return node;
  }
  return ctx.page.findOne(
    (n) => n.type === type && n.getPluginData(KEY) === key,
  );
}
async function upsertComponent(def, tokens, vars, ctx) {
  const root = Object.assign({}, def.root, { component: undefined });
  let comp = await findByKey(ctx, 'COMPONENT', def.key);
  if (comp) ctx.updated++;
  else {
    comp = figma.createComponent();
    comp.setPluginData(KEY, def.key);
    ctx.page.appendChild(comp);
    ctx.placed.push(comp);
    ctx.created++;
  }
  // Mise à jour sur place : les instances déjà posées restent liées.
  await build(root, tokens, vars, ctx, comp);
  comp.name = def.variant || def.name;
  ctx.components[def.key] = comp;
  ctx.touched[def.key] = comp.id;
  if (def.set) {
    ctx.sets[def.set] = ctx.sets[def.set] || [];
    if (!ctx.sets[def.set].includes(comp)) ctx.sets[def.set].push(comp);
  }
  return comp;
}
async function overrideTexts(instance, node) {
  const want = [];
  (function collect(n) {
    if (n.text) want.push(n.text.characters);
    n.children.forEach(collect);
  })(node);
  const have = instance.findAll((n) => n.type === 'TEXT');
  if (have.length !== want.length) return;
  for (let i = 0; i < have.length; i++) {
    if (have[i].characters === want[i] || have[i].fontName === figma.mixed)
      continue;
    await figma.loadFontAsync(have[i].fontName);
    have[i].characters = want[i];
  }
}
async function instanceFor(node, tokens, vars, ctx) {
  const ref = node.component;
  // Composant déjà exporté (ce passage ou un précédent), sinon créé maintenant.
  const comp =
    ctx.components[ref.key] ||
    (await findByKey(ctx, 'COMPONENT', ref.key)) ||
    (await upsertComponent(
      Object.assign({}, ref, { root: node }),
      tokens,
      vars,
      ctx,
    ));
  ctx.components[ref.key] = comp;
  const instance = comp.createInstance();
  instance.name = node.name;
  await overrideTexts(instance, node);
  if (
    Math.abs(instance.width - node.w) > 1 ||
    Math.abs(instance.height - node.h) > 1
  )
    instance.resize(Math.max(1, node.w), Math.max(1, node.h));
  return instance;
}
async function upsertSets(ctx) {
  for (const name of Object.keys(ctx.sets)) {
    const members = ctx.sets[name];
    let set = await findByKey(ctx, 'COMPONENT_SET', 'set:' + name);
    if (!set) {
      set = figma.combineAsVariants(members, ctx.page);
      set.setPluginData(KEY, 'set:' + name);
      ctx.placed.push(set);
      ctx.created++;
    } else {
      for (const m of members) if (m.parent !== set) set.appendChild(m);
    }
    ctx.placed = ctx.placed.filter((n) => !members.includes(n));
    set.name = name;
    ctx.touched['set:' + name] = set.id;
    set.layoutMode = 'HORIZONTAL';
    set.primaryAxisSizingMode = 'AUTO';
    set.counterAxisSizingMode = 'AUTO';
    set.itemSpacing = 16;
    set.paddingTop =
      set.paddingRight =
      set.paddingBottom =
      set.paddingLeft =
        16;
    ctx.setCount++;
  }
}
// Les nouveaux éléments s'alignent à droite du contenu existant de la page.
function place(page, nodes) {
  let x =
    page.children
      .filter((n) => !nodes.includes(n))
      .reduce((m, n) => Math.max(m, n.x + n.width), -200) + 200;
  for (const n of nodes) {
    n.x = x;
    n.y = 0;
    x += n.width + 120;
  }
}
async function exportNative(data) {
  const page = await pageById(data.pageId);
  post({ type: 'progress', message: 'Export DS-Studio : variables…' });
  const { byKey } = await applyVariables(data.tokens);
  const ctx = {
    page,
    nodes: data.nodes || {},
    touched: {},
    components: {},
    sets: {},
    placed: [],
    created: 0,
    updated: 0,
    setCount: 0,
  };
  for (const def of data.definitions)
    await upsertComponent(def, data.tokens, byKey, ctx);
  for (const screen of data.screens) {
    post({ type: 'progress', message: 'Écran ' + screen.name + '…' });
    const key = 'screen:' + screen.key;
    const old = await findByKey(ctx, 'FRAME', key);
    const frame = await build(screen.root, data.tokens, byKey, ctx);
    frame.name = screen.name;
    frame.clipsContent = true;
    frame.setPluginData(KEY, key);
    page.appendChild(frame);
    ctx.touched[key] = frame.id;
    if (old) {
      frame.x = old.x;
      frame.y = old.y;
      old.remove();
      ctx.updated++;
    } else {
      ctx.placed.push(frame);
      ctx.created++;
    }
  }
  await upsertSets(ctx);
  place(page, ctx.placed);
  await figma.setCurrentPageAsync(page);
  // Relecture : les variables écrites doivent correspondre aux tokens envoyés.
  const check = await previewExport({ tokens: data.tokens, screens: [] });
  return {
    pageId: page.id,
    pageName: page.name.slice(0, 200),
    created: ctx.created,
    updated: ctx.updated,
    components: Object.keys(ctx.components).length,
    sets: ctx.setCount,
    screens: data.screens.length,
    variables: Object.keys(byKey).length,
    mismatched: check.rows.filter((r) => r.action !== '=').map((r) => r.name),
    nodes: ctx.touched,
  };
}

// ---------- Messages ----------
figma.ui.onmessage = async (msg) => {
  // Requêtes numérotées de l'interface (lien direct) : réponse avec le même rid.
  if (msg.rid) {
    try {
      const data =
        msg.type === 'live-info' ? liveInfo() : await runCommand(msg.command);
      post({ type: 'reply', rid: msg.rid, ok: true, data });
    } catch (e) {
      post({
        type: 'reply',
        rid: msg.rid,
        ok: false,
        error: String((e && e.message) || e),
      });
    }
    return;
  }
  try {
    if (msg.type === 'init') {
      post({
        type: 'settings',
        pair: (await figma.clientStorage.getAsync('pair')) || '',
        server:
          (await figma.clientStorage.getAsync('server')) ||
          'http://127.0.0.1:4310',
      });
    } else if (msg.type === 'save-settings') {
      await figma.clientStorage.setAsync('pair', msg.pair);
      await figma.clientStorage.setAsync('server', msg.server);
    } else if (msg.type === 'notify') {
      figma.notify(msg.message);
    }
  } catch (e) {
    post({ type: 'error', message: String((e && e.message) || e) });
  }
};
