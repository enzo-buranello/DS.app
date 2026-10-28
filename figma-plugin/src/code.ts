// DS-Studio Bridge — exécute dans Figma les commandes reçues de l'app.
// ui.html tient la connexion WebSocket ; ce code n'a accès qu'à l'API Plugin.
// Réponses : { id, ok, result | error } ; progression : { id, progress }.
// Source TypeScript compilée en figma-plugin/code.js (npm run build:plugin).
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  COLLECTION_NAME,
  EXPORT_VERSION,
  exportPayloadSchema,
  PLUGIN_DATA_KEY as KEY,
  type ExportPayload,
  type Effect,
  type ExportResult,
  type Fill,
  type LineHeight,
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
post({
  hello: {
    fileKey: fileKey(),
    fileName: String(figma.root.name),
    exportVersion: EXPORT_VERSION,
  },
});

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
  const raw = JSON.parse(parts.join(''));
  // Plugin et app de versions différentes : message clair, rien d'écrit.
  if (raw?.version !== EXPORT_VERSION)
    throw new Error(
      `Format d’export v${raw?.version} reçu, ce plugin attend v${EXPORT_VERSION}. Relancez le plugin DS-Studio Bridge dans Figma et rechargez DS-Studio.`,
    );
  const payload = exportPayloadSchema.parse(raw);
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
const CORNERS = [
  'topLeftRadius',
  'topRightRadius',
  'bottomRightRadius',
  'bottomLeftRadius',
];
const lineHeight = (l: LineHeight) =>
  l.unit === 'AUTO' ? { unit: 'AUTO' } : { value: l.value, unit: l.unit };
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
  private images = new Map<string, string>();
  private bindings: { target: any; refs: NonNullable<Scene['refs']> }[] = [];
  private pendingProps: {
    instance: any;
    values: Record<string, string | boolean>;
  }[] = [];
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
      this.loadImages();
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
  // Styles de texte (liés aux variables de taille et de police) et d'effets.
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
      style.lineHeight = lineHeight(t.lineHeight);
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
      style.effects = e.effects.map((x) => this.effect(x));
      this.mark(style, e.id, isNew);
      this.effectStyles.set(e.id, style);
    }
  }
  // Images de fond : créées une fois, retrouvées par leur empreinte Figma.
  private loadImages() {
    for (const img of this.payload.images) {
      try {
        const image = figma.createImage(figma.base64Decode(img.data));
        this.images.set(img.asset, image.hash);
      } catch {
        this.warnings.add(`Image ${img.asset} illisible par Figma.`);
      }
    }
  }

  // ---------- Propriétés natives ----------
  private fill(f: Fill): any {
    if (f.type === 'SOLID') {
      const paint = {
        type: 'SOLID',
        color: toRgb(f.hex),
        opacity: f.opacity,
        visible: f.visible,
      };
      const v = f.variable && this.vars.get(f.variable);
      return v
        ? figma.variables.setBoundVariableForPaint(paint, 'color', v)
        : paint;
    }
    if (f.type === 'IMAGE') {
      const imageHash = this.images.get(f.asset);
      if (!imageHash) {
        this.warnings.add(
          `Image ${f.asset} absente de l’export : fond ignoré.`,
        );
        return null;
      }
      return {
        type: 'IMAGE',
        imageHash,
        scaleMode: f.scaleMode,
        opacity: f.opacity,
        visible: f.visible,
      };
    }
    const gradientStops = f.stops.map((s) => ({
      position: s.position,
      color: { ...toRgb(s.hex), a: s.opacity },
    }));
    // Angle CSS → matrice Figma (rotation autour du centre).
    const t =
      f.type === 'GRADIENT_LINEAR' ? ((f.angle - 90) * Math.PI) / 180 : 0;
    const c = Math.cos(t);
    const s = Math.sin(t);
    return {
      type: f.type,
      gradientStops,
      gradientTransform: [
        [c, s, 0.5 - 0.5 * c - 0.5 * s],
        [-s, c, 0.5 + 0.5 * s - 0.5 * c],
      ],
      opacity: f.opacity,
      visible: f.visible,
    };
  }
  private effect(e: Effect): any {
    if ('radius' in e)
      return { type: e.type, radius: e.radius, visible: e.visible };
    const effect = {
      type: e.type,
      color: { ...toRgb(e.color.hex), a: e.color.opacity },
      offset: { x: e.x, y: e.y },
      radius: e.blur,
      spread: e.spread,
      visible: e.visible,
      blendMode: 'NORMAL',
    };
    const v = e.color.variable && this.vars.get(e.color.variable);
    if (v && figma.variables.setBoundVariableForEffect)
      try {
        return figma.variables.setBoundVariableForEffect(effect, 'color', v);
      } catch {
        /* Effet gardé sans liaison. */
      }
    return effect;
  }
  // Fonds, contours, rayons, effets : nœud créé ou instance (override).
  private async decorate(target: any, node: Scene) {
    if (target.type !== 'TEXT')
      target.fills = (node.fills ?? [])
        .map((f) => this.fill(f))
        .filter(Boolean);
    const s = node.strokes?.[0];
    if (s) {
      const paint = this.paint(s.paint);
      target.strokes = [{ ...paint, visible: s.visible }];
      if (typeof s.weight === 'number') target.strokeWeight = s.weight;
      else
        [
          'strokeTopWeight',
          'strokeRightWeight',
          'strokeBottomWeight',
          'strokeLeftWeight',
        ].forEach((side, i) => (target[side] = (s.weight as number[])[i]));
      target.strokeAlign = s.align;
      target.dashPattern = s.dash;
    } else if ('strokes' in target) target.strokes = [];
    if (target.type !== 'TEXT') {
      CORNERS.forEach((corner, i) => {
        target[corner] = node.radius?.[i] ?? 0;
        this.bind(target, corner, node.radiusVariables?.[i]);
      });
      target.cornerSmoothing = node.cornerSmoothing ?? 0;
    }
    const style = node.effectStyle && this.effectStyles.get(node.effectStyle);
    if (style) await target.setEffectStyleIdAsync(style.id);
    else target.effects = (node.effects ?? []).map((e) => this.effect(e));
  }
  // Calque : visibilité, verrou, opacité, fusion (sur tout type de nœud).
  private layer(target: any, node: Scene) {
    target.visible = node.visible !== false;
    target.locked = !!node.locked;
    target.opacity = node.opacity ?? 1;
    target.blendMode =
      node.blendMode ??
      (target.type === 'FRAME' || target.type === 'COMPONENT'
        ? 'PASS_THROUGH'
        : 'NORMAL');
  }
  // Après insertion dans le parent : position, contraintes, limites, rotation.
  private place(c: any, child: Scene, parentLayout: boolean) {
    if (parentLayout && child.absolute) {
      try {
        c.layoutPositioning = 'ABSOLUTE';
        c.constraints = {
          horizontal: child.absolute.h,
          vertical: child.absolute.v,
        };
      } catch {
        this.warnings.add(`Position absolue impossible sur ${child.name}.`);
      }
      c.x = child.x;
      c.y = child.y;
    } else if (parentLayout) this.size(c, child);
    else {
      c.x = child.x;
      c.y = child.y;
    }
    for (const [field, value] of [
      ['minWidth', child.minW],
      ['maxWidth', child.maxW],
      ['minHeight', child.minH],
      ['maxHeight', child.maxH],
    ] as const)
      if (value !== undefined)
        try {
          c[field] = value;
        } catch {
          /* Limite réservée aux calques d'auto layout. */
        }
    if (child.rotation) c.rotation = child.rotation;
  }

  // Construit un nœud ; « target » : nœud existant mis à jour sur place.
  private async build(node: Scene, target?: any): Promise<any> {
    if (!target && node.instanceOf) {
      const instance = await this.instance(node);
      if (instance) return instance;
    }
    if (!target && node.text && (node.kind === 'TEXT' || !node.kind))
      return this.text(node);
    if (!target && node.kind === 'VECTOR' && node.svg) {
      try {
        const v = figma.createNodeFromSvg(node.svg);
        v.name = node.name;
        v.resize(Math.max(1, node.w), Math.max(1, node.h));
        this.layer(v, node);
        this.refer(v, node);
        return v;
      } catch {
        this.warnings.add(`Vecteur ${node.name} non importé : cadre vide.`);
      }
    }
    const frame =
      target ??
      (node.kind === 'RECTANGLE' && !node.children.length
        ? figma.createRectangle()
        : figma.createFrame());
    if (target) for (const c of frame.children.slice()) c.remove();
    frame.name = node.name;
    if ('clipsContent' in frame) frame.clipsContent = !!node.clip;
    await this.decorate(frame, node);
    this.layer(frame, node);
    const l = node.layout;
    if (l && frame.type !== 'RECTANGLE') {
      frame.layoutMode = l.direction;
      frame.layoutWrap = l.wrap ? 'WRAP' : 'NO_WRAP';
      frame.itemSpacing = l.primary === 'SPACE_BETWEEN' ? 0 : l.gap;
      if (l.primary !== 'SPACE_BETWEEN')
        this.bind(frame, 'itemSpacing', l.gapVariable);
      if (l.wrap && l.counterGap !== undefined) {
        frame.counterAxisSpacing = l.counterGap;
        this.bind(frame, 'counterAxisSpacing', l.counterGapVariable);
      }
      ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach(
        (side, i) => {
          frame[side] = l.padding[i];
          this.bind(frame, side, l.paddingVariables[i]);
        },
      );
      frame.primaryAxisAlignItems = l.primary;
      frame.counterAxisAlignItems = l.counter;
      frame.itemReverseZIndex = l.reverseZ;
    } else if (frame.type !== 'RECTANGLE') frame.layoutMode = 'NONE';
    frame.resize(Math.max(1, node.w), Math.max(1, node.h));
    for (const child of node.children) {
      const c = await this.build(child);
      frame.appendChild(c);
      this.place(c, child, !!l);
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
    this.refer(frame, node);
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
  // Calque lié à une propriété de composant : liaison posée après création.
  private refer(target: any, node: Scene) {
    if (node.refs && Object.keys(node.refs).length)
      this.bindings.push({ target, refs: node.refs });
  }
  private async text(node: Scene) {
    const t = node.text!;
    const text = figma.createText();
    text.fontName = await this.font(t.fontFamily, t.fontWeight);
    text.characters = t.characters;
    text.name = node.name || t.characters.slice(0, 40);
    text.fontSize = t.fontSize;
    text.lineHeight = lineHeight(t.lineHeight);
    text.letterSpacing = { value: t.letterSpacing, unit: 'PIXELS' };
    text.textAlignHorizontal = t.align;
    text.textAlignVertical = t.valign;
    text.textCase = t.textCase;
    text.textDecoration = t.decoration;
    const style = t.style && this.textStyles.get(t.style);
    if (style) await text.setTextStyleIdAsync(style.id);
    else {
      this.bind(text, 'fontSize', t.fontSizeVariable);
      if (text.fontName.family === t.fontFamily)
        this.bind(text, 'fontFamily', t.fontFamilyVariable);
    }
    text.fills = [this.paint(t.color)];
    if (t.autoResize === 'WIDTH_AND_HEIGHT')
      text.textAutoResize = 'WIDTH_AND_HEIGHT';
    else {
      text.resize(Math.max(1, node.w), Math.max(1, node.h));
      text.textAutoResize = t.autoResize === 'HEIGHT' ? 'HEIGHT' : 'NONE';
    }
    if (t.autoResize === 'TRUNCATE') {
      text.textTruncation = 'ENDING';
      if (t.maxLines) text.maxLines = t.maxLines;
    }
    this.layer(text, node);
    this.refer(text, node);
    return text;
  }
  private async instance(node: Scene) {
    const comp =
      this.components.get(node.instanceOf!) ??
      this.found(node.instanceOf!, 'COMPONENT');
    if (!comp) return null;
    const instance = comp.createInstance();
    instance.name = node.name;
    await this.overrides(instance, node, true);
    if (node.propValues)
      this.pendingProps.push({ instance, values: node.propValues });
    this.refer(instance, node);
    return instance;
  }
  // Overrides d'instance : seuls les calques marqués diffèrent du composant.
  // Les calques de l'instance suivent ceux du composant, dans le même ordre.
  private async overrides(target: any, node: Scene, root = false) {
    if (node.overridden) {
      if (target.type === 'TEXT' && node.text) {
        if (target.fontName !== figma.mixed)
          await figma.loadFontAsync(target.fontName);
        if (target.characters !== node.text.characters)
          target.characters = node.text.characters;
        target.fills = [this.paint(node.text.color)];
        if (target.fontSize !== node.text.fontSize) {
          target.fontSize = node.text.fontSize;
          this.bind(target, 'fontSize', node.text.fontSizeVariable);
        }
      } else await this.decorate(target, node);
      if (!root) target.visible = node.visible !== false;
      target.opacity = node.opacity ?? 1;
      const l = node.layout;
      if (l && target.layoutMode && target.layoutMode !== 'NONE')
        ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach(
          (side, i) => {
            target[side] = l.padding[i];
            this.bind(target, side, l.paddingVariables[i]);
          },
        );
    }
    const kids = target.children ?? [];
    if (kids.length !== node.children.length) {
      if (node.children.length)
        this.warnings.add(
          `Instance ${node.name} : structure différente du composant, overrides internes ignorés.`,
        );
      return;
    }
    for (let i = 0; i < kids.length; i++) {
      const child = node.children[i];
      // Instance imbriquée : ses propres valeurs de propriétés.
      if (child.instanceOf && child.propValues && kids[i].type === 'INSTANCE')
        this.pendingProps.push({ instance: kids[i], values: child.propValues });
      await this.overrides(kids[i], child);
    }
  }
  private found(key: string, type: string) {
    const n = this.index.get(key);
    return n && n.type === type && !n.removed ? n : null;
  }
  // Propriétés de composant (sur le set s'il existe) et calques liés.
  private properties(
    def: ExportPayload['components'][number],
    comp: any,
    bindings: { target: any; refs: NonNullable<Scene['refs']> }[],
  ) {
    const holder = comp.parent?.type === 'COMPONENT_SET' ? comp.parent : comp;
    const keyOf = (name: string) =>
      Object.keys(holder.componentPropertyDefinitions ?? {}).find(
        (k) => k.split('#')[0] === name,
      );
    for (const p of def.properties) {
      if (keyOf(p.name)) continue;
      let value = p.default;
      if (p.type === 'INSTANCE_SWAP') {
        const c =
          this.components.get(String(value)) ??
          this.found(String(value), 'COMPONENT');
        if (!c) {
          this.warnings.add(
            `Propriété « ${p.name} » : composant par défaut introuvable.`,
          );
          continue;
        }
        value = c.id;
      }
      try {
        holder.addComponentProperty(p.name, p.type, value);
      } catch {
        this.warnings.add(`Propriété « ${p.name} » non créée sur ${def.name}.`);
      }
    }
    const FIELD = {
      characters: 'characters',
      visible: 'visible',
      mainComponent: 'mainComponent',
    } as const;
    for (const b of bindings) {
      const refs: Record<string, string> = {};
      for (const [field, name] of Object.entries(b.refs)) {
        const key = name && keyOf(name);
        if (key) refs[FIELD[field as keyof typeof FIELD]] = key;
      }
      if (!Object.keys(refs).length) continue;
      try {
        b.target.componentPropertyReferences = {
          ...b.target.componentPropertyReferences,
          ...refs,
        };
      } catch {
        this.warnings.add(
          `Liaison de propriété impossible sur ${b.target.name}.`,
        );
      }
    }
  }
  // Valeurs de propriétés des instances, une fois les propriétés créées.
  private applyProps() {
    for (const { instance, values } of this.pendingProps.splice(0)) {
      const defs = instance.componentProperties ?? {};
      const out: Record<string, string | boolean> = {};
      for (const [name, v] of Object.entries(values)) {
        const key = Object.keys(defs).find((k) => k.split('#')[0] === name);
        if (!key) continue;
        if (defs[key].type === 'INSTANCE_SWAP') {
          const c =
            this.components.get(String(v)) ??
            this.found(String(v), 'COMPONENT');
          if (c) out[key] = c.id;
        } else out[key] = v;
      }
      if (!Object.keys(out).length) continue;
      try {
        instance.setProperties(out);
      } catch {
        this.warnings.add(`Propriétés non appliquées sur ${instance.name}.`);
      }
    }
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
    const built: {
      def: (typeof defs)[number];
      comp: any;
      bindings: { target: any; refs: NonNullable<Scene['refs']> }[];
    }[] = [];
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
      const before = this.bindings.length;
      await this.build({ ...def.root, instanceOf: undefined }, comp);
      built.push({ def, comp, bindings: this.bindings.splice(before) });
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
    // Propriétés après les sets : Figma les porte sur le set.
    for (const b of built) this.properties(b.def, b.comp, b.bindings);
    this.applyProps();
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
    this.bindings = [];
    this.applyProps();
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
