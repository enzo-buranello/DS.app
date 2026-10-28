import type { DSComponent } from './component.js';
import {
  DOC_VERSION,
  docProblems,
  type Doc,
  type DocNode,
  type Props,
} from './doc.js';
import type { EditsFile } from './edits.js';
import { renderedText, writeLegacy, type Legacy } from './legacy.js';

// Migration v1 → v2 : les modifications de edits.json (maîtres et overrides
// par champ) sont rejouées sur le document de départ. Les fichiers v1 ne sont
// jamais modifiés. Une clé v1 peut viser plusieurs nœuds : un maître vaut pour
// toutes ses variantes, une instance de navigation pour chaque écran.
const MASTER_TARGETS: Record<string, string[]> = {
  'booking-card': ['booking-card', 'booking-card-booked'],
  form: ['form', 'form-sent'],
  navigation: ['navigation', 'navigation-favorites', 'navigation-profile'],
};
const PART: Record<string, string> = {
  kicker: 'kicker',
  title: 'title',
  body: 'body',
  badge: 'badge',
};
function masterKeys(key: string): string[] {
  const [id, part] = key.split('#');
  const ids = MASTER_TARGETS[id] ?? [id];
  return part ? ids.map((i) => `${i}/${PART[part] ?? part}`) : ids;
}
const INSTANCE: Record<string, string[]> = {
  nav: ['nav', 'form.nav'],
  'cards.booking.cta': ['cards.booking>booking-card/cta'],
  'form.signup.submit': ['form.signup>form/submit'],
};
function instanceKeys(key: string): string[] {
  const [id, part] = key.split('#');
  if (part) {
    const owner = id === 'cards.booking' ? 'booking-card' : null;
    return owner ? [`${id}>${owner}/${PART[part] ?? part}`] : [];
  }
  return INSTANCE[id] ?? [id];
}

export interface MigrationReport {
  applied: string[];
  skipped: string[];
}
export function migrateEdits(
  seed: Doc,
  edits: EditsFile,
): { doc: Doc; report: MigrationReport } {
  const doc = structuredClone(seed);
  const report: MigrationReport = { applied: [], skipped: [] };
  const apply = (v1: string, keys: string[], value: Legacy) => {
    let done = false;
    for (const key of keys) {
      const v: Legacy = { ...value };
      // Texte identique à celui déjà affiché : sans effet, non migré.
      if (v.label !== undefined && v.label === renderedText(doc, key))
        delete v.label;
      if (!Object.keys(v).length) continue;
      const changed = writeLegacy(doc, key, v, false);
      for (const n of changed) doc.nodes[n.id] = n;
      done ||= changed.length > 0;
    }
    (done ? report.applied : report.skipped).push(v1);
  };
  for (const [key, value] of Object.entries(edits.masters))
    apply(`masters:${key}`, masterKeys(key), value);
  for (const [key, value] of Object.entries(edits.instances))
    apply(`instances:${key}`, instanceKeys(key), value);
  return { doc, report };
}

// Composant créé à la main (components.json) → nœuds du document. Le rendu
// passe ainsi par la même fonction nœud → CSS que le reste du DS.
export function componentNodes(c: DSComponent): Record<string, DocNode> {
  const id = `custom/${c.id}`;
  const { layout, typography: t, size, effects } = c;
  const axis = (mode: typeof layout.sizingX, fixed: number | null) =>
    mode === 'fixed' && fixed !== null
      ? { mode: 'fixed' as const, px: fixed }
      : mode === 'fill'
        ? { mode: 'fill' as const }
        : { mode: 'hug' as const };
  const props: Props = {
    layout: {
      mode: layout.direction,
      gap: layout.distribute === 'space-between' ? 'auto' : layout.gap,
      padding: layout.padding,
      alignCross: layout.align,
      ...(layout.distribute !== 'space-between'
        ? {
            alignMain:
              layout.distribute === 'center'
                ? 'center'
                : layout.distribute === 'end'
                  ? 'end'
                  : 'start',
          }
        : {}),
    },
    size: {
      width: axis(layout.sizingX, size.width),
      height: axis(layout.sizingY, size.height),
      minWidth: size.minWidth,
      maxWidth: size.maxWidth,
      minHeight: size.minHeight,
      maxHeight: size.maxHeight,
    },
    fills: c.fill ? [{ type: 'solid', color: c.fill, visible: true }] : [],
    stroke: c.border.width
      ? {
          color: c.stroke ?? { hex: '#000000', opacity: 0 },
          weight: c.border.width,
          style: c.border.style,
          align: 'inside',
          visible: true,
        }
      : null,
    radius: c.radius,
    text: {
      family: t.family,
      size: t.size,
      weight: t.weight,
      lineHeight: { ratio: t.lineHeight },
      color: c.text,
    },
    effects: [
      ...(effects.shadow
        ? [{ type: 'drop-shadow' as const, ...effects.shadow, visible: true }]
        : []),
      ...(effects.blur
        ? [{ type: 'layer-blur' as const, radius: effects.blur, visible: true }]
        : []),
    ],
    layer: { clip: true },
  };
  const nodes: Record<string, DocNode> = {};
  const root: DocNode = {
    id,
    type: 'component',
    name: c.name,
    parent: null,
    children: [],
    props,
    semantics: { tag: 'div', className: 'ds-custom' },
    ...(c.set ? { variant: c.set.properties } : {}),
  };
  nodes[id] = root;
  const child = (
    key: string,
    n: Omit<DocNode, 'id' | 'parent' | 'children'>,
  ) => {
    nodes[`${id}/${key}`] = {
      ...n,
      id: `${id}/${key}`,
      parent: id,
      children: [],
    };
    root.children.push(`${id}/${key}`);
  };
  if (c.vector)
    child('vector', {
      type: 'vector',
      name: 'Vecteur',
      props: { size: { width: { mode: 'hug' } } },
      vector: c.vector,
    });
  if (c.icon)
    child('icon', {
      type: 'text',
      name: 'Icône',
      props: {},
      characters: c.icon,
      semantics: { tag: 'span', ariaHidden: true },
    });
  child('label', {
    type: 'text',
    name: 'Texte',
    props: {},
    characters: c.label,
    semantics: { tag: 'span' },
  });
  return nodes;
}
// Document minimal pour rendre un composant créé seul (catalogue, export).
export function componentDoc(c: DSComponent): Doc {
  const nodes = componentNodes(c);
  const id = `custom/${c.id}`;
  const pageId = `custom/${c.id}/page`;
  // Variante d'un component set : un parent set porte le nom du set.
  if (c.set) {
    const setId = `custom/${c.id}/set`;
    nodes[setId] = {
      id: setId,
      type: 'component-set',
      name: c.set.name,
      parent: pageId,
      children: [id],
      props: {},
    };
    nodes[id].parent = setId;
  } else nodes[id].parent = pageId;
  nodes[pageId] = {
    id: pageId,
    type: 'page',
    name: c.name,
    parent: null,
    children: [c.set ? `custom/${c.id}/set` : id],
    props: {},
  };
  return {
    version: DOC_VERSION,
    components: pageId,
    screens: [pageId],
    nodes,
  };
}

// Section « Mes composants » de la page des composants (créée au besoin).
export const CUSTOM_SECTION = 'catalogue.custom';
export const customSectionNodes = (doc: Doc): DocNode[] => {
  const label = `${CUSTOM_SECTION}.label`;
  const border = {
    color: { token: 'color.border' as const, opacity: 1 },
    weight: 1,
    style: 'solid' as const,
    align: 'inside' as const,
    visible: true,
  };
  const pad = { token: 'space.lg' as const };
  const r = { token: 'radius.control' as const };
  return [
    {
      id: CUSTOM_SECTION,
      type: 'frame',
      name: '05 / MES COMPOSANTS',
      parent: doc.components,
      children: [label],
      props: {
        layout: {
          mode: 'horizontal',
          wrap: true,
          gap: { token: 'space.md' },
          padding: { top: pad, right: pad, bottom: pad, left: pad },
          alignCross: 'start',
        },
        stroke: border,
        radius: { topLeft: r, topRight: r, bottomRight: r, bottomLeft: r },
      },
      semantics: { tag: 'section', className: 'catalogue-custom' },
    },
    {
      id: label,
      type: 'text',
      name: 'Libellé',
      parent: CUSTOM_SECTION,
      children: [],
      characters: '05 / MES COMPOSANTS',
      props: {
        size: { width: { mode: 'fill' } },
        text: {
          size: { px: 10 },
          weight: 650,
          letterSpacing: 1.3,
          color: { token: 'color.muted', opacity: 1 },
        },
      },
      semantics: { className: 'section-label' },
    },
  ];
};
const slug = (v: string) =>
  v.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'set';

/**
 * Nœuds à écrire pour ajouter un composant créé (main ou import d'image) au
 * document : la section « Mes composants » et son component set au besoin.
 * Renvoie les nœuds nouveaux ou modifiés (valeurs après).
 */
export function addComponent(doc: Doc, c: DSComponent): DocNode[] {
  const id = `custom/${c.id}`;
  if (doc.nodes[id]) return [];
  const out = new Map<string, DocNode>();
  const get = (n: string) => out.get(n) ?? structuredClone(doc.nodes[n]);
  const put = (n: DocNode) => out.set(n.id, n);
  if (!doc.nodes[CUSTOM_SECTION]) {
    for (const n of customSectionNodes(doc)) put(n);
    const page = get(doc.components);
    page.children = [...page.children, CUSTOM_SECTION];
    put(page);
  }
  let parent = CUSTOM_SECTION;
  if (c.set) {
    const setId = `custom/set/${slug(c.set.id)}`;
    if (!doc.nodes[setId] && !out.has(setId)) {
      put({
        id: setId,
        type: 'component-set',
        name: c.set.name,
        parent: CUSTOM_SECTION,
        children: [],
        props: {
          layout: {
            mode: 'horizontal',
            wrap: true,
            gap: { token: 'space.sm' },
          },
        },
      });
      const section = get(CUSTOM_SECTION);
      section.children = [...section.children, setId];
      put(section);
    }
    parent = setId;
  }
  const nodes = componentNodes(c);
  nodes[id].parent = parent;
  const p = get(parent);
  p.children = [...p.children, id];
  put(p);
  for (const n of Object.values(nodes)) put(n);
  return [...out.values()];
}
/** Import de components.json dans le document (idempotent). */
export function importComponents(doc: Doc, list: DSComponent[]): Doc {
  let next = structuredClone(doc);
  for (const c of list) {
    const nodes = addComponent(next, c);
    const candidate = structuredClone(next);
    for (const n of nodes) candidate.nodes[n.id] = n;
    // Composant incompatible avec le document : ignoré, jamais bloquant.
    if (!docProblems(candidate).length) next = candidate;
  }
  return next;
}
