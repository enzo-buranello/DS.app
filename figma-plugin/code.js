// DS-Studio Bridge — exécute dans Figma les commandes reçues de l'app.
// L'interface (ui.html) tient la connexion WebSocket ; ce fichier n'a accès
// qu'à l'API Plugin et répond { id, ok, result | error }.

figma.showUI(__html__, { width: 300, height: 180, themeColors: true });

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
const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

function fills(node) {
  if (!('fills' in node) || !Array.isArray(node.fills)) return null;
  return node.fills
    .filter((p) => p.type === 'SOLID')
    .map((p) => ({ color: toHex(p.color), opacity: num(p.opacity) ?? 1 }));
}
function summary(node) {
  return {
    id: node.id,
    type: node.type,
    name: node.name,
    width: num(node.width),
    height: num(node.height),
  };
}
function details(node) {
  return Object.assign(summary(node), {
    x: num(node.x),
    y: num(node.y),
    visible: node.visible !== false,
    rotation: num(node.rotation),
    opacity: num(node.opacity),
    fills: fills(node),
    characters: node.type === 'TEXT' ? node.characters : undefined,
    parentId: node.parent ? node.parent.id : null,
    children:
      'children' in node ? node.children.slice(0, 100).map(summary) : undefined,
  });
}
async function nodeById(id) {
  const node = await figma.getNodeByIdAsync(id);
  if (!node) throw new Error('Nœud introuvable : ' + id + '.');
  return node;
}
// Toutes les polices du texte doivent être chargées avant de le modifier.
async function loadFonts(text) {
  const fonts =
    text.fontName === figma.mixed
      ? text.getRangeAllFontNames(0, text.characters.length)
      : [text.fontName];
  for (const font of fonts) await figma.loadFontAsync(font);
}

const commands = {
  ping: async () => ({ pong: true, time: Date.now() }),
  get_document_info: async () => ({
    name: figma.root.name,
    fileKey: typeof figma.fileKey === 'string' ? figma.fileKey : null,
    currentPage: { id: figma.currentPage.id, name: figma.currentPage.name },
    pages: figma.root.children.map((p) => ({ id: p.id, name: p.name })),
  }),
  get_selection: async () => figma.currentPage.selection.map(summary),
  get_node: async ({ id }) => details(await nodeById(id)),
  create_frame: async ({ x, y, width, height, name, color }) => {
    const frame = figma.createFrame();
    frame.x = x;
    frame.y = y;
    frame.resize(width, height);
    frame.name = name || 'Frame DS-Studio';
    frame.fills = [{ type: 'SOLID', color: toRgb(color) }];
    figma.currentPage.appendChild(frame);
    figma.currentPage.selection = [frame];
    figma.viewport.scrollAndZoomIntoView([frame]);
    return details(frame);
  },
  set_text: async ({ id, text }) => {
    const node = await nodeById(id);
    if (node.type !== 'TEXT')
      throw new Error('Ce nœud n’est pas un texte (' + node.type + ').');
    await loadFonts(node);
    node.characters = text;
    return details(node);
  },
  delete_node: async ({ id }) => {
    const node = await nodeById(id);
    if (node.type === 'DOCUMENT' || node.type === 'PAGE')
      throw new Error('Suppression d’une page ou du document refusée.');
    node.remove();
    return { deleted: id };
  },
};

figma.ui.onmessage = async (msg) => {
  if (!msg || typeof msg.id !== 'string') return;
  const run = commands[msg.command];
  try {
    if (!run) throw new Error('Commande inconnue : ' + msg.command + '.');
    const result = await run(msg.params || {});
    figma.ui.postMessage({ id: msg.id, ok: true, result });
  } catch (e) {
    figma.ui.postMessage({
      id: msg.id,
      ok: false,
      error: String((e && e.message) || e),
    });
  }
};
