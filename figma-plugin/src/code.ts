// DS-Studio Bridge — exécute dans Figma les commandes reçues de l'app.
// ui.html tient la connexion WebSocket ; ce code n'a accès qu'à l'API Plugin.
// Réponses : { id, ok, result | error } ; progression : { id, progress }.
// Source TypeScript compilée en figma-plugin/code.js (npm run build:plugin).
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  COLLECTION_NAME,
  exportPayloadSchema,
  PLUGIN_DATA_KEY as KEY,
  type ExportPayload,
  type ExportResult,
  type Paint,
  type SceneNode as Scene,
} from '../../app/shared/figmaExport';

figma.showUI(__html__, { width: 300, height: 180, themeColors: true });

const toHex = (c: { r: number; g: number; b: number }) =>
  '#' +
  [c.r, c.g, c.b]
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase();
const toRgb = (hex: string) => ({
  r: parseInt(hex.slice(1, 3), 16) / 255,
  g: parseInt(hex.slice(3, 5), 16) / 255,
  b: parseInt(hex.slice(5, 7), 16) / 255,
});
const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null);
const post = (msg: unknown) => figma.ui.postMessage(msg);
// figma.fileKey n'existe que pour un plugin privé (enablePrivatePluginApi).
const fileKey = () =>
  typeof figma.fileKey === 'string' ? figma.fileKey : null;
// Annonce du fichier : ui.html la renvoie à chaque (re)connexion au pont.
post({ hello: { fileKey: fileKey(), fileName: String(figma.root.name) } });

// ---------- Commandes de base ----------
function fills(node: any) {
  if (!('fills' in node) || !Array.isArray(node.fills)) return null;
  return node.fills
    .filter((p: any) => p.type === 'SOLID')
    .map((p: any) => ({ color: toHex(p.color), opacity: num(p.opacity) ?? 1 }));
}
function summary(node: any) {
  return {
    id: node.id,
    type: node.type,
    name: node.name,
    width: num(node.width),
    height: num(node.height),
  };
}
function details(node: any) {
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
async function nodeById(id: string) {
  const node = await figma.getNodeByIdAsync(id);
  // Figma renvoie encore un nœud supprimé (removed = true) : traité comme absent.
  if (!node || node.removed) throw new Error('Nœud introuvable : ' + id + '.');
  return node;
}
// Toutes les polices du texte doivent être chargées avant de le modifier.
async function loadFonts(text: any) {
  const fonts =
    text.fontName === figma.mixed
      ? text.getRangeAllFontNames(0, text.characters.length)
      : [text.fontName];
  for (const font of fonts) await figma.loadFontAsync(font);
}

const commands: Record<string, (params: any, id: string) => Promise<unknown>> =
  {
    ping: async () => ({ pong: true, time: Date.now() }),
    get_document_info: async () => ({
      name: figma.root.name,
      fileKey: fileKey(),
      currentPage: { id: figma.currentPage.id, name: figma.currentPage.name },
      pages: figma.root.children.map((p: any) => ({ id: p.id, name: p.name })),
    }),
    get_file_info: async () => ({
      fileKey: fileKey(),
      name: figma.root.name,
      currentPage: { id: figma.currentPage.id, name: figma.currentPage.name },
      pages: figma.root.children.map((p: any) => ({ id: p.id, name: p.name })),
    }),
    // Page parente du nœud de l'URL ; nœud introuvable : page courante.
    set_target_page: async ({ nodeId }) => {
      let page: any = null;
      let warning: string | null = null;
      if (nodeId) {
        const node = await figma.getNodeByIdAsync(nodeId);
        for (let n = node; n && !n.removed; n = n.parent)
          if (n.type === 'PAGE') {
            page = n;
            break;
          }
        if (!page)
          warning = `Nœud ${nodeId} introuvable : page courante « ${figma.currentPage.name} » utilisée.`;
      }
      page = page ?? figma.currentPage;
      if (page !== figma.currentPage) await figma.setCurrentPageAsync(page);
      return { pageId: page.id, pageName: page.name, warning };
    },
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

// ---------- Export : réception par lots, annulation ----------
const transfers = new Map<string, string[]>();
const cancelled = new Set<string>();
class Cancelled extends Error {}

commands.export_chunk = async ({ transfer, index, total, data }) => {
  const parts = transfers.get(transfer) ?? new Array(total).fill(null);
  parts[index] = data;
  transfers.set(transfer, parts);
  return { received: index + 1, total };
};
commands.cancel = async ({ target }) => {
  cancelled.add(target);
  return { cancelled: target };
};
function payloadOf(transfer: string, kind: ExportPayload['kind']) {
  const parts = transfers.get(transfer);
  transfers.delete(transfer);
  if (!parts || parts.some((p) => p === null))
    throw new Error('Export incomplet : des lots manquent.');
  const payload = exportPayloadSchema.parse(JSON.parse(parts.join('')));
  if (payload.kind !== kind) throw new Error('Type d’export inattendu.');
  return payload;
}
commands.export_design_system = async ({ transfer }, id) =>
  new Exporter(id, payloadOf(transfer, 'design_system')).run();
commands.export_preview = async ({ transfer }, id) =>
  new Exporter(id, payloadOf(transfer, 'preview')).run();

// ---------- Export : moteur ----------
function insideInstance(node: any) {
  for (let n = node; n && n.type !== 'PAGE'; n = n.parent)
    if (n.type === 'INSTANCE') return true;
  return false;
}
const STYLE_BY_WEIGHT: Record<number, string> = {
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
const SCOPES: Record<string, string[]> = {
  color: ['ALL_FILLS', 'STROKE_COLOR', 'EFFECT_COLOR'],
  space: ['GAP', 'WIDTH_HEIGHT'],
  radius: ['CORNER_RADIUS'],
  typographyFLOAT: ['FONT_SIZE'],
  typographySTRING: ['FONT_FAMILY'],
};
const fontCache = new Map<string, any>();
const PAGES_KEY = 'dsStudioPages';

class Exporter {
  private created = 0;
  private createdIds: string[] = [];
  private updated = 0;
  private warnings = new Set<string>();
  private step = 0;
  private total: number;
  private page: any;
  private mode = '';
  private index = new Map<string, any>();
  private vars = new Map<string, any>();
  private textStyles = new Map<string, any>();
  private effectStyles = new Map<string, any>();
  private components = new Map<string, any>();
  private touched: any[] = [];
  private duplicates = new Map<string, any[]>();
  constructor(
    private id: string,
    private payload: ExportPayload,
  ) {
    const p = payload;
    this.total =
      p.variables.length +
      p.textStyles.length +
      p.effectStyles.length +
      p.components.length +
      (p.kind === 'design_system' ? 4 : 1);
  }
  // Vérifie l'annulation et publie l'avancement avant chaque élément.
  // Pas de minuteur pour céder la main : Figma les ralentit fortement quand sa
  // fenêtre est en arrière-plan. Ses propres appels async laissent passer les messages.
  private async tick(label: string) {
    await Promise.resolve();
    if (cancelled.has(this.id)) throw new Cancelled('Export annulé.');
    this.step += 1;
    post({
      id: this.id,
      progress: { done: this.step, total: this.total, label },
    });
  }
  private mark(node: any, key: string, isNew: boolean) {
    node.setPluginData(KEY, key);
    this.index.set(key, node);
    if (isNew) {
      this.created += 1;
      this.createdIds.push(key);
    } else this.updated += 1;
  }
  private async font(family: string, weight: number) {
    const style = STYLE_BY_WEIGHT[Math.round(weight / 100) * 100] ?? 'Regular';
    const tries = [
      { family, style },
      { family, style: weight >= 600 ? 'Bold' : 'Regular' },
      { family: 'Inter', style },
      { family: 'Inter', style: weight >= 600 ? 'Bold' : 'Regular' },
      { family: 'Inter', style: 'Regular' },
    ];
    for (const f of tries) {
      const key = f.family + '|' + f.style;
      if (fontCache.get(key) === false) continue;
      try {
        if (!fontCache.get(key)) await figma.loadFontAsync(f);
        fontCache.set(key, true);
        if (f.family !== family)
          this.warnings.add(
            `Police « ${family} » absente dans Figma : Inter utilisée.`,
          );
        return f;
      } catch {
        fontCache.set(key, false);
      }
    }
    throw new Error('Aucune police utilisable (Inter introuvable).');
  }
  private paint(p: Paint) {
    const paint = { type: 'SOLID', color: toRgb(p.hex), opacity: p.opacity };
    const v = p.variable && this.vars.get(p.variable);
    return v
      ? figma.variables.setBoundVariableForPaint(paint, 'color', v)
      : paint;
  }
  private bind(node: any, field: string, token: string | null | undefined) {
    const v = token && this.vars.get(token);
    if (!v) return;
    try {
      node.setBoundVariable(field, v);
    } catch {
      this.warnings.add(`Liaison « ${field} » impossible sur ${node.name}.`);
    }
  }

  async run(): Promise<ExportResult> {
    try {
      this.page = await this.targetPage();
      await this.indexPages();
      await this.variables();
      await this.styles();
      await this.componentDefs(this.payload.kind === 'design_system');
      if (this.payload.kind === 'design_system') await this.boards();
      else await this.screen(this.payload.screen);
      this.rememberPage();
      await figma.setCurrentPageAsync(this.page);
      if (this.touched.length)
        figma.viewport.scrollAndZoomIntoView(this.touched);
      return {
        pageId: this.page.id,
        pageName: this.page.name,
        created: this.created,
        updated: this.updated,
        createdIds: this.createdIds.slice(0, 1000),
        warnings: [...this.warnings].slice(0, 200),
        orphans:
          this.payload.kind === 'design_system' ? await this.orphans() : [],
      };
    } finally {
      cancelled.delete(this.id);
    }
  }
  // Éléments déjà exportés : seules les pages où DS-Studio a déjà écrit (liste
  // gardée dans le document) sont lues, plus la cible et la page courante.
  // Charger une page peut demander le réseau : un échec n'arrête pas l'export.
  private async indexPages() {
    let known: string[] = [];
    try {
      known = JSON.parse(figma.root.getPluginData(PAGES_KEY) || '[]');
    } catch {
      known = [];
    }
    const ids = [this.page.id, figma.currentPage.id, ...known].filter(
      (id, i, all) => all.indexOf(id) === i,
    );
    for (const id of ids) {
      const page = figma.root.children.find((p: any) => p.id === id);
      if (!page) continue;
      if (cancelled.has(this.id)) throw new Cancelled('Export annulé.');
      post({
        id: this.id,
        progress: {
          done: 0,
          total: this.total,
          label: `Lecture de la page ${page.name}…`,
        },
      });
      try {
        await page.loadAsync();
      } catch {
        if (page === this.page)
          throw new Error(
            `Figma n’arrive pas à charger la page « ${page.name} » (connexion de Figma à ses serveurs ?).`,
          );
        this.warnings.add(
          `Page « ${page.name} » non chargée par Figma : ses éléments DS-Studio n’ont pas été recherchés.`,
        );
        continue;
      }
      for (const n of page.findAllWithCriteria({
        pluginData: { keys: [KEY] },
      })) {
        // Une instance (et ses calques) porte les pluginData de son composant :
        // ce n'est jamais l'élément exporté lui-même.
        if (insideInstance(n)) continue;
        const key = n.getPluginData(KEY);
        const first = this.index.get(key);
        if (!first) this.index.set(key, n);
        else if (first.type === n.type)
          this.duplicates.set(key, [
            ...(this.duplicates.get(key) ?? [first]),
            n,
          ]);
      }
    }
    for (const [key, nodes] of this.duplicates)
      this.warnings.add(
        `Doublon : ${nodes.length} éléments portent l’id « ${key} » (${nodes.map((n: any) => n.id).join(', ')}) ; le premier est mis à jour, les autres sont à supprimer à la main.`,
      );
  }
  private rememberPage() {
    let known: string[] = [];
    try {
      known = JSON.parse(figma.root.getPluginData(PAGES_KEY) || '[]');
    } catch {
      known = [];
    }
    if (!known.includes(this.page.id))
      figma.root.setPluginData(
        PAGES_KEY,
        JSON.stringify([...known, this.page.id]),
      );
  }
  private async targetPage() {
    const t = this.payload.page;
    if (t.mode === 'current') return figma.currentPage;
    if (t.mode === 'existing') {
      const page = await figma.getNodeByIdAsync(t.id);
      if (!page || page.type !== 'PAGE')
        throw new Error('Page cible introuvable dans le fichier.');
      return page;
    }
    const same = figma.root.children.find((p: any) => p.name === t.name);
    if (same) {
      this.warnings.add(
        `La page « ${t.name} » existait : elle a été réutilisée.`,
      );
      return same;
    }
    const page = figma.createPage();
    page.name = t.name;
    return page;
  }

  // Tokens → variables de la collection « DS-Studio » (retrouvées par nom).
  private async variables() {
    const all = await figma.variables.getLocalVariableCollectionsAsync();
    let collection = all.find((c: any) => c.name === COLLECTION_NAME);
    if (!collection) {
      collection = figma.variables.createVariableCollection(COLLECTION_NAME);
      collection.renameMode(collection.modes[0].modeId, 'Défaut');
      this.created += 1;
    }
    this.mode = collection.defaultModeId ?? collection.modes[0].modeId;
    const byName = new Map<string, any>();
    for (const id of collection.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(id);
      if (v) byName.set(v.name, v);
    }
    for (const t of this.payload.variables) {
      await this.tick(`Variable ${t.name}`);
      let v = byName.get(t.name);
      if (v && v.resolvedType !== t.type) {
        this.warnings.add(
          `Variable ${t.name} : type ${v.resolvedType} incompatible, ignorée.`,
        );
        continue;
      }
      const isNew = !v;
      if (!v) v = figma.variables.createVariable(t.name, collection, t.type);
      v.setValueForMode(
        this.mode,
        t.type === 'COLOR' ? { ...toRgb(String(t.value)), a: 1 } : t.value,
      );
      try {
        v.scopes = SCOPES[t.category] ??
          SCOPES[t.category + t.type] ?? ['ALL_SCOPES'];
      } catch {
        /* Portée non modifiable : valeur par défaut conservée. */
      }
      this.mark(v, 'var/' + t.token, isNew);
      this.vars.set(t.token, v);
    }
  }
  // Styles de texte (liés aux variables de taille) et styles d'ombre.
  private async styles() {
    const texts = await figma.getLocalTextStylesAsync();
    for (const t of this.payload.textStyles) {
      await this.tick(`Style ${t.name}`);
      let style =
        texts.find((s: any) => s.getPluginData(KEY) === t.id) ??
        texts.find((s: any) => s.name === t.name);
      const isNew = !style;
      if (!style) style = figma.createTextStyle();
      style.name = t.name;
      const font = await this.font(t.fontFamily, t.fontWeight);
      style.fontName = font;
      style.fontSize = t.fontSize;
      style.lineHeight = { value: t.lineHeight, unit: 'PIXELS' };
      style.letterSpacing = { value: t.letterSpacing, unit: 'PIXELS' };
      this.bind(style, 'fontSize', t.fontSizeVariable);
      // La famille n'est liée que si la police du token existe vraiment.
      if (font.family === t.fontFamily)
        this.bind(style, 'fontFamily', t.fontFamilyVariable);
      this.mark(style, t.id, isNew);
      this.textStyles.set(t.id, style);
    }
    const effects = await figma.getLocalEffectStylesAsync();
    for (const e of this.payload.effectStyles) {
      await this.tick(`Style ${e.name}`);
      let style =
        effects.find((s: any) => s.getPluginData(KEY) === e.id) ??
        effects.find((s: any) => s.name === e.name);
      const isNew = !style;
      if (!style) style = figma.createEffectStyle();
      style.name = e.name;
      const s = e.shadow;
      style.effects = [
        {
          type: 'DROP_SHADOW',
          color: { ...toRgb(s.color.hex), a: s.color.opacity },
          offset: { x: s.x, y: s.y },
          radius: s.blur,
          spread: s.spread,
          visible: true,
          blendMode: 'NORMAL',
        },
      ];
      this.mark(style, e.id, isNew);
      this.effectStyles.set(e.id, style);
    }
  }

  // Construit un nœud ; « target » : nœud existant mis à jour sur place.
  private async build(node: Scene, target?: any): Promise<any> {
    if (!target && node.instanceOf) {
      const instance = await this.instance(node);
      if (instance) return instance;
    }
    if (
      !target &&
      node.text &&
      !node.children.length &&
      !node.fill &&
      !node.stroke
    )
      return this.text(node);
    const frame = target ?? figma.createFrame();
    if (target) for (const c of frame.children.slice()) c.remove();
    frame.name = node.name;
    frame.clipsContent = false;
    frame.fills = node.fill ? [this.paint(node.fill)] : [];
    if (node.stroke) {
      frame.strokes = [this.paint(node.stroke)];
      frame.strokeWeight = node.stroke.weight;
      frame.strokeAlign = 'INSIDE';
    } else frame.strokes = [];
    const corners = [
      'topLeftRadius',
      'topRightRadius',
      'bottomRightRadius',
      'bottomLeftRadius',
    ];
    corners.forEach((corner, i) => {
      frame[corner] = node.radius?.[i] ?? 0;
      this.bind(frame, corner, node.radiusVariables?.[i]);
    });
    const effect =
      node.shadow?.style && this.effectStyles.get(node.shadow.style);
    if (effect) await frame.setEffectStyleIdAsync(effect.id);
    else frame.effects = [];
    const l = node.layout;
    if (l) {
      frame.layoutMode = l.direction;
      frame.itemSpacing = l.primary === 'SPACE_BETWEEN' ? 0 : l.gap;
      if (l.primary !== 'SPACE_BETWEEN')
        this.bind(frame, 'itemSpacing', l.gapVariable);
      ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach(
        (side, i) => {
          frame[side] = l.padding[i];
          this.bind(frame, side, l.paddingVariables[i]);
        },
      );
      frame.primaryAxisAlignItems = l.primary;
      frame.counterAxisAlignItems = l.counter;
    } else frame.layoutMode = 'NONE';
    frame.resize(Math.max(1, node.w), Math.max(1, node.h));
    for (const child of node.children) {
      const c = await this.build(child);
      frame.appendChild(c);
      if (l) this.size(c, child);
      else {
        c.x = child.x;
        c.y = child.y;
      }
    }
    // Taille propre de la frame : HUG/FIXED ; FILL est appliqué par le parent.
    if (l) {
      try {
        frame.layoutSizingHorizontal = node.sizingH === 'HUG' ? 'HUG' : 'FIXED';
        frame.layoutSizingVertical = node.sizingV === 'HUG' ? 'HUG' : 'FIXED';
      } catch {
        /* Taille fixe conservée. */
      }
    }
    return frame;
  }
  private size(c: any, node: Scene) {
    const hugOk =
      c.type === 'TEXT' ||
      (c.layoutMode && c.layoutMode !== 'NONE') ||
      c.type === 'INSTANCE';
    const pick = (s: Scene['sizingH']) => (s === 'HUG' && !hugOk ? 'FIXED' : s);
    try {
      c.layoutSizingHorizontal = pick(node.sizingH);
      c.layoutSizingVertical = pick(node.sizingV);
    } catch {
      this.warnings.add(
        `Dimensionnement auto layout impossible sur ${node.name}.`,
      );
    }
  }
  private async text(node: Scene) {
    const t = node.text!;
    const text = figma.createText();
    text.fontName = await this.font(t.fontFamily, t.fontWeight);
    text.characters = t.characters;
    text.name = node.name || t.characters.slice(0, 40);
    text.fontSize = t.fontSize;
    text.lineHeight = { value: t.lineHeight, unit: 'PIXELS' };
    text.letterSpacing = { value: t.letterSpacing, unit: 'PIXELS' };
    text.textAlignHorizontal = t.align;
    const style = t.style && this.textStyles.get(t.style);
    if (style) await text.setTextStyleIdAsync(style.id);
    else this.bind(text, 'fontSize', t.fontSizeVariable);
    text.fills = [this.paint(t.color)];
    if (node.sizingH === 'HUG') text.textAutoResize = 'WIDTH_AND_HEIGHT';
    else {
      text.resize(Math.max(1, node.w), Math.max(1, node.h));
      text.textAutoResize = 'HEIGHT';
    }
    return text;
  }
  private async instance(node: Scene) {
    const comp =
      this.components.get(node.instanceOf!) ??
      this.found(node.instanceOf!, 'COMPONENT');
    if (!comp) return null;
    const instance = comp.createInstance();
    instance.name = node.name;
    // Textes propres à cet usage (ex. libellé du bouton), dans l'ordre.
    const want: string[] = [];
    (function collect(n: Scene) {
      if (n.text) want.push(n.text.characters);
      n.children.forEach(collect);
    })(node);
    const have = instance.findAll((n: any) => n.type === 'TEXT');
    if (have.length === want.length)
      for (let i = 0; i < have.length; i++) {
        if (have[i].characters === want[i] || have[i].fontName === figma.mixed)
          continue;
        await figma.loadFontAsync(have[i].fontName);
        have[i].characters = want[i];
      }
    return instance;
  }
  private found(key: string, type: string) {
    const n = this.index.get(key);
    return n && n.type === type && !n.removed ? n : null;
  }

  // Composants (variantes regroupées en component sets).
  private async componentDefs(update: boolean) {
    const defs = this.payload.components;
    // Un composant utilisé par un autre (bouton dans la carte) passe d'abord.
    const order: typeof defs = [];
    const visit = (d: (typeof defs)[number], seen = new Set<string>()) => {
      if (order.includes(d) || seen.has(d.id)) return;
      seen.add(d.id);
      const deps: string[] = [];
      (function collect(n: Scene) {
        if (n.instanceOf) deps.push(n.instanceOf);
        n.children.forEach(collect);
      })(d.root);
      for (const dep of deps) {
        const def = defs.find((x) => x.id === dep);
        if (def) visit(def, seen);
      }
      order.push(d);
    };
    defs.forEach((d) => visit(d));
    const sets = new Map<string, any[]>();
    for (const def of order) {
      await this.tick(`Composant ${def.variant ?? def.name}`);
      let comp = this.found(def.id, 'COMPONENT');
      // Aperçu : un composant déjà présent est utilisé tel quel.
      if (comp && !update) {
        this.components.set(def.id, comp);
        continue;
      }
      const isNew = !comp;
      if (!comp) {
        comp = figma.createComponent();
        this.page.appendChild(comp);
      }
      await this.build({ ...def.root, instanceOf: undefined }, comp);
      comp.name = def.variant ?? def.name;
      this.mark(comp, def.id, isNew);
      this.components.set(def.id, comp);
      if (def.set) sets.set(def.set, [...(sets.get(def.set) ?? []), comp]);
    }
    for (const [name, members] of sets) {
      let set = this.found('set/' + name, 'COMPONENT_SET');
      const isNew = !set;
      if (!set) set = figma.combineAsVariants(members, this.page);
      else for (const m of members) if (m.parent !== set) set.appendChild(m);
      set.name = name;
      set.layoutMode = 'HORIZONTAL';
      set.layoutWrap = 'WRAP';
      set.itemSpacing = 24;
      set.counterAxisSpacing = 24;
      set.paddingTop =
        set.paddingRight =
        set.paddingBottom =
        set.paddingLeft =
          24;
      set.primaryAxisSizingMode = 'AUTO';
      set.counterAxisSizingMode = 'AUTO';
      this.mark(set, 'set/' + name, isNew);
    }
  }

  // Planches du DS : Couleurs, Typographie, Espacements, Composants.
  private async board(key: string, title: string) {
    let board = this.found(key, 'FRAME');
    const isNew = !board;
    if (!board) {
      board = figma.createFrame();
      this.page.appendChild(board);
      const right = this.page.children
        .filter((n: any) => n !== board)
        .reduce((m: number, n: any) => Math.max(m, n.x + n.width), -200);
      board.x = right + 200;
      board.y = 0;
    }
    board.name = title;
    board.layoutMode = 'VERTICAL';
    board.itemSpacing = 24;
    board.paddingTop =
      board.paddingRight =
      board.paddingBottom =
      board.paddingLeft =
        40;
    board.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    board.cornerRadius = 16;
    board.layoutSizingHorizontal = 'HUG';
    board.layoutSizingVertical = 'HUG';
    let heading = board.children.find(
      (c: any) => c.getPluginData(KEY) === key + '/title',
    );
    if (!heading) {
      heading = figma.createText();
      heading.fontName = await this.font('Inter', 700);
      heading.setPluginData(KEY, key + '/title');
      board.insertChild(0, heading);
    }
    heading.characters = title;
    heading.fontSize = 32;
    let content = board.children.find(
      (c: any) => c.getPluginData(KEY) === key + '/content',
    );
    if (!content) {
      content = figma.createFrame();
      content.setPluginData(KEY, key + '/content');
      board.appendChild(content);
    }
    content.name = 'Contenu';
    content.fills = [];
    content.layoutMode = 'HORIZONTAL';
    content.layoutWrap = 'WRAP';
    content.itemSpacing = 24;
    content.counterAxisSpacing = 24;
    content.resize(1100, 100);
    content.layoutSizingHorizontal = 'FIXED';
    content.layoutSizingVertical = 'HUG';
    this.mark(board, key, isNew);
    this.touched.push(board);
    return content;
  }
  private async label(characters: string, size = 12, weight = 400) {
    const t = figma.createText();
    t.fontName = await this.font('Inter', weight);
    t.characters = characters;
    t.fontSize = size;
    return t;
  }
  private async boards() {
    const vars = this.payload.variables;
    await this.tick('Planche Couleurs');
    let content = await this.board('board/colors', 'Couleurs');
    for (const c of content.children.slice()) c.remove();
    for (const v of vars.filter((v) => v.type === 'COLOR')) {
      const cell = figma.createFrame();
      cell.name = v.name;
      cell.fills = [];
      cell.layoutMode = 'VERTICAL';
      cell.itemSpacing = 8;
      const swatch = figma.createRectangle();
      swatch.resize(160, 96);
      swatch.cornerRadius = 12;
      swatch.fills = [
        this.paint({ hex: String(v.value), opacity: 1, variable: v.token }),
      ];
      cell.appendChild(swatch);
      cell.appendChild(await this.label(v.name, 12, 600));
      cell.appendChild(await this.label(String(v.value)));
      cell.layoutSizingHorizontal = 'HUG';
      cell.layoutSizingVertical = 'HUG';
      content.appendChild(cell);
    }
    await this.tick('Planche Typographie');
    content = await this.board('board/typography', 'Typographie');
    for (const c of content.children.slice()) c.remove();
    content.layoutMode = 'VERTICAL';
    for (const s of this.payload.textStyles) {
      const style = this.textStyles.get(s.id);
      const sample = await this.label(
        `${s.name.replace('DS-Studio/', '')} — ${s.sample}`,
      );
      if (style) await sample.setTextStyleIdAsync(style.id);
      content.appendChild(sample);
    }
    await this.tick('Planche Espacements');
    content = await this.board('board/spacing', 'Espacements');
    for (const c of content.children.slice()) c.remove();
    content.layoutMode = 'VERTICAL';
    for (const v of vars.filter(
      (v) => v.category === 'space' || v.category === 'radius',
    )) {
      const row = figma.createFrame();
      row.name = v.name;
      row.fills = [];
      row.layoutMode = 'HORIZONTAL';
      row.itemSpacing = 16;
      row.counterAxisAlignItems = 'CENTER';
      const bar = figma.createRectangle();
      bar.resize(Math.max(1, Number(v.value)), 24);
      bar.fills = [
        this.paint({ hex: '#3154C4', opacity: 1, variable: 'color.brand' }),
      ];
      if (v.category === 'radius') {
        bar.resize(96, 48);
        bar.cornerRadius = Number(v.value);
        this.bind(bar, 'topLeftRadius', v.token);
        this.bind(bar, 'topRightRadius', v.token);
        this.bind(bar, 'bottomLeftRadius', v.token);
        this.bind(bar, 'bottomRightRadius', v.token);
      } else this.bind(bar, 'width', v.token);
      row.appendChild(bar);
      row.appendChild(await this.label(`${v.name} · ${v.value} px`));
      row.layoutSizingHorizontal = 'HUG';
      row.layoutSizingVertical = 'HUG';
      content.appendChild(row);
    }
    await this.tick('Planche Composants');
    content = await this.board('board/components', 'Composants');
    // Les composants restent où ils sont s'ils ont été déplacés à la main.
    for (const def of this.payload.components) {
      const comp = this.components.get(def.id);
      if (!comp) continue;
      const top = comp.parent?.type === 'COMPONENT_SET' ? comp.parent : comp;
      if (top.parent === this.page) content.appendChild(top);
    }
  }

  // Aperçu : écran en frames auto layout, composants DS en instances.
  private async screen(screen: { id: string; name: string; root: Scene }) {
    await this.tick(`Écran ${screen.name}`);
    let frame = this.found(screen.id, 'FRAME');
    const isNew = !frame;
    if (!frame) {
      frame = figma.createFrame();
      this.page.appendChild(frame);
      const right = this.page.children
        .filter((n: any) => n !== frame)
        .reduce((m: number, n: any) => Math.max(m, n.x + n.width), -200);
      frame.x = right + 200;
      frame.y = 0;
    }
    await this.build({ ...screen.root, instanceOf: undefined }, frame);
    frame.name = screen.name;
    frame.clipsContent = true;
    this.mark(frame, screen.id, isNew);
    this.touched.push(frame);
    // Composants créés pour l'occasion : rangés dans la planche Composants.
    const fresh = [...this.components.values()].filter(
      (c) => c.parent === this.page,
    );
    if (fresh.length) {
      const content = await this.board('board/components', 'Composants');
      for (const c of fresh) content.appendChild(c);
    }
  }

  // Éléments DS-Studio du fichier que l'app n'exporte plus : signalés seulement.
  private async orphans() {
    const p = this.payload;
    const expected = new Set<string>([
      ...p.variables.map((v) => 'var/' + v.token),
      ...p.textStyles.map((s) => s.id),
      ...p.effectStyles.map((s) => s.id),
      ...p.components.map((c) => c.id),
      ...p.components.filter((c) => c.set).map((c) => 'set/' + c.set),
    ]);
    const out: { id: string; name: string }[] = [];
    const check = (key: string, n: any) => {
      if (!key || expected.has(key) || /^(board|screen)\//.test(key)) return;
      if (/^(var|text|shadow|set)\//.test(key) || n.type === 'COMPONENT')
        out.push({ id: key, name: n.name });
    };
    for (const [key, n] of this.index) if (!n.removed) check(key, n);
    for (const s of await figma.getLocalTextStylesAsync())
      check(s.getPluginData(KEY), s);
    for (const s of await figma.getLocalEffectStylesAsync())
      check(s.getPluginData(KEY), s);
    const collection = (
      await figma.variables.getLocalVariableCollectionsAsync()
    ).find((c: any) => c.name === COLLECTION_NAME);
    for (const id of collection?.variableIds ?? []) {
      const v = await figma.variables.getVariableByIdAsync(id);
      if (v) check(v.getPluginData(KEY), v);
    }
    return out
      .filter((o, i) => out.findIndex((x) => x.id === o.id) === i)
      .slice(0, 500);
  }
}

figma.ui.onmessage = async (msg: any) => {
  if (!msg || typeof msg.id !== 'string') return;
  const run = commands[msg.command];
  try {
    if (!run) throw new Error('Commande inconnue : ' + msg.command + '.');
    const result = await run(msg.params || {}, msg.id);
    post({ id: msg.id, ok: true, result });
  } catch (e: any) {
    post({ id: msg.id, ok: false, error: String((e && e.message) || e) });
  }
};
