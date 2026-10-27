// DS-Studio Bridge — code principal du plugin (bac à sable Figma).
// Aucune écriture sans clic : l'export est d'abord prévisualisé, puis appliqué
// seulement si les tokens n'ont pas changé entre-temps, puis relu.

figma.showUI(__html__, { width: 380, height: 560, themeColors: true });

const COLLECTION = 'DS-Studio';
const PAGE = 'DS-Studio';
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

// ---------- Import ----------
async function resolveValue(value, depth) {
  if (value && value.type === 'VARIABLE_ALIAS' && depth < 10) {
    const target = await figma.variables.getVariableByIdAsync(value.id);
    if (!target) return null;
    const col = await figma.variables.getVariableCollectionByIdAsync(
      target.variableCollectionId,
    );
    return resolveValue(target.valuesByMode[col.defaultModeId], depth + 1);
  }
  return value;
}

async function collectImport() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = [];
  for (const v of await figma.variables.getLocalVariablesAsync()) {
    if (!['COLOR', 'FLOAT', 'STRING'].includes(v.resolvedType)) continue;
    const col = collections.find((c) => c.id === v.variableCollectionId);
    if (!col || col.name === COLLECTION) continue; // ne pas réimporter nos propres variables
    const raw = await resolveValue(v.valuesByMode[col.defaultModeId], 0);
    if (raw === null || raw === undefined) continue;
    const value = v.resolvedType === 'COLOR' ? toHex(raw) : raw;
    variables.push({
      name: v.name.slice(0, 200),
      collection: col.name.slice(0, 200),
      type: v.resolvedType,
      value,
    });
  }
  const paintStyles = [];
  for (const s of await figma.getLocalPaintStylesAsync()) {
    const p = s.paints[0];
    if (p && p.type === 'SOLID')
      paintStyles.push({ name: s.name.slice(0, 200), hex: toHex(p.color) });
  }
  const textStyles = [];
  for (const s of await figma.getLocalTextStylesAsync())
    textStyles.push({
      name: s.name.slice(0, 200),
      fontFamily: s.fontName.family,
      fontStyle: s.fontName.style,
      fontSize: s.fontSize,
    });
  const images = [];
  for (const node of figma.currentPage.selection.slice(0, 12)) {
    if (!('exportAsync' in node)) continue;
    let bytes = await node.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: 2 },
    });
    if (bytes.length > 2900000)
      bytes = await node.exportAsync({
        format: 'PNG',
        constraint: { type: 'SCALE', value: 1 },
      });
    if (bytes.length > 2900000) continue;
    images.push({
      name: node.name.slice(0, 200),
      width: Math.round(node.width),
      height: Math.round(node.height),
      png: figma.base64Encode(bytes),
    });
  }
  return {
    fileName: figma.root.name.slice(0, 200),
    variables,
    paintStyles,
    textStyles,
    images,
  };
}

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

async function applyExport(data, previewTokensJson) {
  if (JSON.stringify(data.tokens) !== previewTokensJson)
    throw new Error(
      'Les tokens ont changé depuis la prévisualisation. Relancez « Prévisualiser ».',
    );
  post({ type: 'progress', message: 'Variables…' });
  const { byKey } = await applyVariables(data.tokens);
  let page = figma.root.children.find((p) => p.name === PAGE);
  if (!page) {
    page = figma.createPage();
    page.name = PAGE;
  }
  await page.loadAsync();
  const created = [];
  let x = 0;
  for (const screen of data.screens) {
    post({ type: 'progress', message: 'Écran ' + screen.name + '…' });
    const old = page.children.find((n) => n.name === screen.name);
    const frame = await build(screen.root, data.tokens, byKey);
    frame.clipsContent = true;
    page.appendChild(frame);
    if (old) {
      frame.x = old.x;
      frame.y = old.y;
      old.remove();
    } else {
      const right = page.children.reduce(
        (m, n) => (n === frame ? m : Math.max(m, n.x + n.width)),
        -200,
      );
      frame.x = Math.max(x, right + 200);
      frame.y = 0;
    }
    x = frame.x + frame.width + 200;
    created.push(frame);
  }
  await figma.setCurrentPageAsync(page);
  figma.viewport.scrollAndZoomIntoView(created);
  // Relecture : les valeurs des variables doivent correspondre aux tokens.
  const check = await previewExport(data);
  const mismatched = check.rows
    .filter((r) => r.action !== '=')
    .map((r) => r.name);
  return {
    screens: created.length,
    variables: Object.keys(byKey).length,
    mismatched,
  };
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
async function listComponents(pageId) {
  const page = await pageById(pageId);
  const nodes = page
    .findAllWithCriteria({ types: ['COMPONENT_SET', 'COMPONENT'] })
    .filter(
      (n) =>
        n.type === 'COMPONENT_SET' ||
        !n.parent ||
        n.parent.type !== 'COMPONENT_SET',
    )
    .slice(0, 300);
  const items = [];
  for (const n of nodes) {
    let thumbnail = null;
    try {
      const bytes = await n.exportAsync({
        format: 'PNG',
        constraint: { type: 'HEIGHT', value: 96 },
      });
      if (bytes.length < 250000)
        thumbnail = 'data:image/png;base64,' + figma.base64Encode(bytes);
    } catch (e) {
      /* Miniature facultative. */
    }
    items.push({
      id: n.id,
      name: n.name.slice(0, 200),
      type: n.type,
      variants: n.type === 'COMPONENT_SET' ? Math.max(1, n.children.length) : 1,
      thumbnail,
    });
  }
  return { items };
}
const num = (v, fallback) =>
  typeof v === 'number' && isFinite(v) ? v : fallback;
async function variableName(alias) {
  const a = Array.isArray(alias) ? alias[0] : alias;
  if (!a || !a.id) return null;
  const v = await figma.variables.getVariableByIdAsync(a.id);
  return v ? v.name.slice(0, 200) : null;
}
async function paintOf(paints) {
  if (!Array.isArray(paints)) return null; // figma.mixed
  const p = paints.find((x) => x.type === 'SOLID' && x.visible !== false);
  if (!p) return null;
  return {
    hex: toHex(p.color),
    opacity: num(p.opacity, 1),
    variable: await variableName(p.boundVariables && p.boundVariables.color),
  };
}
const first = (node, key, getter) =>
  node[key] === figma.mixed ? node[getter](0, 1) : node[key];
// Description neutre d'un composant : la conversion vers DS-Studio se fait côté serveur.
async function serialize(node, set) {
  const bv = node.boundVariables || {};
  const auto = node.layoutMode && node.layoutMode !== 'NONE';
  const weight = num(
    node.strokeWeight === figma.mixed
      ? node.strokeTopWeight
      : node.strokeWeight,
    0,
  );
  const effects = Array.isArray(node.effects) ? node.effects : [];
  const shadow = effects.find(
    (e) => e.type === 'DROP_SHADOW' && e.visible !== false,
  );
  const blur = effects.find(
    (e) => e.type === 'LAYER_BLUR' && e.visible !== false,
  );
  const text = node.findOne ? node.findOne((c) => c.type === 'TEXT') : null;
  let textData = null;
  if (text) {
    const lh = first(text, 'lineHeight', 'getRangeLineHeight');
    textData = {
      characters: text.characters.slice(0, 2000),
      fontFamily: first(text, 'fontName', 'getRangeFontName').family.slice(
        0,
        100,
      ),
      fontWeight: num(first(text, 'fontWeight', 'getRangeFontWeight'), 400),
      fontSize: num(first(text, 'fontSize', 'getRangeFontSize'), 16),
      fontSizeVariable: await variableName(
        text.boundVariables && text.boundVariables.fontSize,
      ),
      lineHeight:
        lh.unit === 'AUTO'
          ? { unit: 'AUTO' }
          : { unit: lh.unit, value: num(lh.value, 0) },
      color: await paintOf(text.fills),
    };
  }
  const corners = [
    'topLeftRadius',
    'topRightRadius',
    'bottomRightRadius',
    'bottomLeftRadius',
  ];
  const sides = ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'];
  return {
    nodeId: node.id,
    name: node.name.slice(0, 200),
    set,
    properties: node.variantProperties || {},
    fill: await paintOf(node.fills),
    stroke: await paintOf(node.strokes),
    strokeWeight: weight,
    dash:
      node.dashPattern && node.dashPattern.length
        ? node.dashPattern[0] <= weight
          ? 'dotted'
          : 'dashed'
        : 'solid',
    radii: corners.map((c) => num(node[c], 0)),
    radiusVariables: await Promise.all(corners.map((c) => variableName(bv[c]))),
    layout: auto
      ? {
          direction: node.layoutMode,
          gap: num(node.itemSpacing, 0),
          gapVariable: await variableName(bv.itemSpacing),
          padding: sides.map((side) => num(node[side], 0)),
          paddingVariables: await Promise.all(
            sides.map((side) => variableName(bv[side])),
          ),
          primary: node.primaryAxisAlignItems || 'MIN',
          counter: node.counterAxisAlignItems || 'MIN',
          sizingH: node.layoutSizingHorizontal || 'FIXED',
          sizingV: node.layoutSizingVertical || 'FIXED',
        }
      : null,
    width: num(node.width, 0),
    height: num(node.height, 0),
    minWidth: num(node.minWidth, null),
    maxWidth: num(node.maxWidth, null),
    minHeight: num(node.minHeight, null),
    maxHeight: num(node.maxHeight, null),
    shadow: shadow
      ? {
          x: num(shadow.offset && shadow.offset.x, 0),
          y: num(shadow.offset && shadow.offset.y, 0),
          blur: num(shadow.radius, 0),
          spread: num(shadow.spread, 0),
          color: {
            hex: toHex(shadow.color),
            opacity: num(shadow.color.a, 1),
            variable: null,
          },
        }
      : null,
    blur: blur ? num(blur.radius, 0) : 0,
    text: textData,
  };
}
async function importComponents(pageId, ids) {
  await pageById(pageId);
  const items = [];
  for (const id of ids) {
    const node = await figma.getNodeByIdAsync(id);
    if (!node) throw new Error('Composant introuvable : ' + id + '.');
    if (node.type === 'COMPONENT_SET') {
      const set = { id: node.id, name: node.name.slice(0, 120) };
      for (const v of node.children)
        if (v.type === 'COMPONENT') items.push(await serialize(v, set));
    } else if (node.type === 'COMPONENT') {
      items.push(await serialize(node, null));
    }
  }
  return { items: items.slice(0, 300) };
}
async function runCommand(command) {
  if (command.type === 'components') return listComponents(command.args.pageId);
  if (command.type === 'import')
    return importComponents(command.args.pageId, command.args.ids);
  if (command.type === 'export') return exportNative(command.args);
  throw new Error('Commande inconnue.');
}

// ---------- Export natif : composants, component sets, instances ----------
const KEY = 'dsStudioKey';
function findByKey(page, type, key) {
  return page.findOne((n) => n.type === type && n.getPluginData(KEY) === key);
}
async function upsertComponent(def, tokens, vars, ctx) {
  const root = Object.assign({}, def.root, { component: undefined });
  let comp = findByKey(ctx.page, 'COMPONENT', def.key);
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
    findByKey(ctx.page, 'COMPONENT', ref.key) ||
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
function upsertSets(ctx) {
  for (const name of Object.keys(ctx.sets)) {
    const members = ctx.sets[name];
    let set = findByKey(ctx.page, 'COMPONENT_SET', 'set:' + name);
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
    const old = findByKey(page, 'FRAME', key);
    const frame = await build(screen.root, data.tokens, byKey, ctx);
    frame.name = screen.name;
    frame.clipsContent = true;
    frame.setPluginData(KEY, key);
    page.appendChild(frame);
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
  upsertSets(ctx);
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
    } else if (msg.type === 'collect-import') {
      post({ type: 'import-data', payload: await collectImport() });
    } else if (msg.type === 'preview-export') {
      post({ type: 'export-preview', ...(await previewExport(msg.data)) });
    } else if (msg.type === 'apply-export') {
      post({
        type: 'export-done',
        summary: await applyExport(msg.data, msg.previewTokens),
      });
    } else if (msg.type === 'notify') {
      figma.notify(msg.message);
    }
  } catch (e) {
    post({ type: 'error', message: String((e && e.message) || e) });
  }
};
