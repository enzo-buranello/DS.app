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

async function build(node, tokens, vars) {
  if (node.text && !node.children.length && !node.fill && !node.stroke)
    return buildText(node, tokens, vars);
  const frame = figma.createFrame();
  frame.name = node.name;
  frame.clipsContent = false;
  frame.resize(Math.max(1, node.w), Math.max(1, node.h));
  frame.fills = node.fill ? [makePaint(node.fill, vars)] : [];
  if (node.stroke) {
    frame.strokes = [makePaint(node.stroke, vars)];
    frame.strokeWeight = node.stroke.weight;
    frame.strokeAlign = 'INSIDE';
  }
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
    const c = await build(child, tokens, vars);
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

// ---------- Messages ----------
figma.ui.onmessage = async (msg) => {
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
