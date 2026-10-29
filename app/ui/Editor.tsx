import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowsHorizontal,
  ArrowsOutCardinal,
  ArrowsVertical,
  BoundingBox,
  CaretRight,
  Circle,
  Copy,
  CornersOut,
  Cube,
  DesktopTower,
  DeviceMobile,
  DeviceTablet,
  Diamond,
  Eye,
  EyeSlash,
  GridFour,
  Database,
  Hexagon,
  ImageSquare,
  ListBullets,
  LinkBreak,
  Minus,
  Plus,
  Rectangle,
  Square,
  TextAlignCenter,
  TextAlignLeft,
  TextAlignRight,
  TextT,
  Trash,
  X,
} from '@phosphor-icons/react';
import { listAbove } from '../shared/content.js';
import {
  canHold,
  duplicate,
  find,
  ids,
  insert,
  move,
  newId,
  placeFor,
  remove,
  update,
  type Place,
} from '../shared/nodes.js';
import {
  detach,
  parentOf,
  setOverride,
  split,
  target,
} from '../shared/instances.js';
import {
  isToken,
  type Breakpoint,
  type FoundationKind,
  type Node,
  type Project,
  type Style,
} from '../shared/project.js';
import { foundationVars, Render, resolve, type Theme } from './render.js';

// Éditeur d'éléments, commun aux pages et aux composants : canevas au centre,
// menu Ajouter et Structure à gauche, paramètres à droite.

export const formats: {
  bp: Breakpoint;
  label: string;
  width: number;
  icon: typeof DesktopTower;
}[] = [
  { bp: 'desktop', label: 'Bureau', width: 1280, icon: DesktopTower },
  { bp: 'tablet', label: 'Tablette', width: 768, icon: DeviceTablet },
  { bp: 'mobile', label: 'Mobile', width: 375, icon: DeviceMobile },
];
const kindLabels: Record<Node['kind'], string> = {
  box: 'Bloc',
  shape: 'Forme',
  text: 'Texte',
  image: 'Image',
  component: 'Composant',
  list: 'Liste',
};
const kindIcons = {
  box: Square,
  shape: Rectangle,
  text: TextT,
  image: ImageSquare,
  component: Diamond,
  list: ListBullets,
};

export const label = (n: Node, p: Project) =>
  n.name ||
  (n.id === 'root' && 'Page') ||
  (n.kind === 'text' && n.text?.trim().slice(0, 32)) ||
  (n.kind === 'component' && n.component && p.components[n.component]?.name) ||
  kindLabels[n.kind];

/** Valeurs à écrire ; `undefined` retire la valeur. */
export type StylePatch = { [K in keyof Style]?: Style[K] | undefined };

export type EditorProps = {
  project: Project;
  root: Node;
  onRoot: (root: Node) => void;
  /** Élément sélectionné sur le canevas. */
  sel: string;
  /** Élément dont les paramètres sont ouverts. */
  edited: string;
  /** `edit` faux : sélection seule, le panneau ne change pas. */
  onSelect: (id: string, edit?: boolean) => void;
  bp: Breakpoint;
  base: string;
  /** Écrit des valeurs de style pour le format (ou l'état) en cours. */
  onStyle: (id: string, patch: StylePatch) => void;
  /** Style propre à l'élément pour le format (ou l'état) en cours. */
  own: (id: string) => Style | undefined;
  /** Transforme un élément en composant ; l'élément devient une instance. */
  onComponentize: (id: string) => void;
  onRenameComponent: (id: string, name: string) => void;
};

/** Écrit des valeurs de style pour un format ; une valeur vide est retirée. */
export function setStyles(
  root: Node,
  id: string,
  bp: Breakpoint,
  patch: StylePatch,
) {
  return update(root, id, (n) => {
    const at: Record<string, unknown> = { ...n.style?.[bp], ...patch };
    for (const k of Object.keys(patch)) if (at[k] === undefined) delete at[k];
    return { ...n, style: { ...n.style, [bp]: at } };
  });
}

/** Style d'un élément réel ou d'un élément d'instance (ajustement local). */
const writeStyle = (props: EditorProps, id: string, patch: StylePatch) =>
  split(id)
    ? props.onRoot(setOverride(props.root, id, {}, { bp: props.bp, patch }))
    : props.onStyle(id, patch);

const layoutOf = (n: Node | null | undefined, bp: Breakpoint) =>
  n ? (resolve(n, bp).direction ?? 'column') : null;

export function FormatSwitch(props: {
  bp: Breakpoint;
  onChange: (bp: Breakpoint) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label="Format">
      {formats.map(({ bp, label, icon: Icon }) => (
        <button
          key={bp}
          className="icon-btn"
          aria-label={label}
          aria-pressed={props.bp === bp}
          onClick={() => props.onChange(bp)}
        >
          <Icon />
        </button>
      ))}
    </div>
  );
}

// --- Actions communes : clavier, clic droit, bouton du panneau ---

type Action = { label: string; run: () => void };
function actionsFor(props: EditorProps, id: string): Action[] {
  const { project, root } = props;
  if (id === root.id) return [];
  const t = target(project, root, id);
  if (!t || split(id)) return [];
  const out: Action[] = [];
  if (t.node.kind === 'component')
    out.push({
      label: 'Détacher l’instance',
      run: () => props.onRoot(detach(project, root, id)),
    });
  else
    out.push({
      label: 'Créer un composant',
      run: () => props.onComponentize(id),
    });
  out.push(
    {
      label: 'Dupliquer',
      run: () => {
        const copy = duplicate(root, id);
        props.onRoot(copy.root);
        props.onSelect(copy.id);
      },
    },
    {
      label: 'Supprimer',
      run: () => {
        props.onRoot(remove(root, id));
        props.onSelect(root.id);
      },
    },
  );
  return out;
}

type Menu = { x: number; y: number; id: string } | null;
function ContextMenu(props: EditorProps & { menu: Menu; onClose: () => void }) {
  useEffect(() => {
    if (!props.menu) return;
    const close = () => props.onClose();
    addEventListener('click', close);
    addEventListener('blur', close);
    return () => {
      removeEventListener('click', close);
      removeEventListener('blur', close);
    };
  });
  if (!props.menu) return null;
  const items = actionsFor(props, props.menu.id);
  if (!items.length) return null;
  return (
    <div
      className="menu context"
      role="menu"
      style={{ left: props.menu.x, top: props.menu.y }}
    >
      {items.map((a) => (
        <button key={a.label} role="menuitem" className="ghost" onClick={a.run}>
          {a.label}
        </button>
      ))}
    </div>
  );
}

// Supprimer, dupliquer, créer un composant (⌘K) et remonter (Échap).
function useShortcuts(props: EditorProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      // Échap dans un champ le quitte ; le suivant remonte au parent.
      if (t.closest('input, textarea, select, dialog')) {
        if (e.key === 'Escape' && !t.closest('dialog')) t.blur();
        return;
      }
      const { sel, root, project } = props;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') {
        props.onSelect(parentOf(project, root, sel) ?? root.id);
        return;
      }
      const act = (name: string) =>
        actionsFor(props, sel)
          .find((a) => a.label === name)
          ?.run();
      if (e.key === 'Delete' || e.key === 'Backspace') act('Supprimer');
      else if (mod && e.key === 'd') act('Dupliquer');
      else if (mod && e.key === 'k') act('Créer un composant');
      else return;
      e.preventDefault();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });
}

// --- Canevas : sélection par niveau, glisser selon la disposition du parent ---

type Rect = { x: number; y: number; w: number; h: number };
type Line = { x: number; y: number; w: number; h: number };
type Drag = {
  ghost: Rect;
  guides: Line[];
  marker: Line | null;
  into: Rect | null;
};

/** Identifiants des éléments sous le pointeur, du plus haut au plus profond. */
function chainAt(el: Element | null): string[] {
  const out: string[] = [];
  for (
    let e = el?.closest('[data-node]');
    e;
    e = e.parentElement?.closest('[data-node]') ?? null
  )
    out.unshift(e.getAttribute('data-node')!);
  return out;
}

const SNAP = 6;

export function Canvas(
  props: EditorProps & {
    theme: Theme;
    patches?: Record<string, Style>;
    /** Un composant s'affiche à sa taille, au centre du format. */
    component?: boolean;
  },
) {
  const { root, sel, bp, project } = props;
  const stage = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  // Zoom : ajusté à la largeur, ou choisi (pincer, ⌘ + molette, − / +).
  const [fit, setFit] = useState(1);
  const [scale, setScale] = useState<number | null>(null);
  const zoom = scale ?? fit;
  const [rect, setRect] = useState<Rect | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  // Un composant s'affiche en taille réelle ; au format bureau, il prend la
  // largeur du canevas.
  const width = formats.find((f) => f.bp === bp)!.width;
  const shown = props.component && bp === 'desktop' ? undefined : width;
  useLayoutEffect(() => {
    const el = stage.current!;
    const fit = () =>
      setFit(props.component ? 1 : Math.min(1, (el.clientWidth - 64) / width));
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    setScale(null);
    return () => ro.disconnect();
  }, [width, props.component]);
  const zoomTo = (z: number) =>
    setScale(Math.min(4, Math.max(0.1, Math.round(z * 100) / 100)));
  useEffect(() => {
    const el = stage.current!;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setScale((s) =>
        Math.min(4, Math.max(0.1, (s ?? fit) * Math.exp(-e.deltaY / 200))),
      );
    };
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        e.metaKey ||
        e.ctrlKey ||
        t.closest('input, textarea, select, dialog')
      )
        return;
      if (e.key === '+' || e.key === '=') zoomTo(zoom * 1.25);
      else if (e.key === '-') zoomTo(zoom / 1.25);
      else if (e.key === '0') setScale(null);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('wheel', onWheel);
      removeEventListener('keydown', onKey);
    };
  });

  const nodeEl = (id: string) =>
    board.current?.querySelector(`[data-node="${CSS.escape(id)}"]`) ?? null;
  // Rectangle d'un élément, dans les coordonnées du canevas.
  const rectOf = (el: Element): Rect => {
    const s = stage.current!;
    const r = el.getBoundingClientRect();
    const o = s.getBoundingClientRect();
    return {
      x: r.left - o.left + s.scrollLeft,
      y: r.top - o.top + s.scrollTop,
      w: r.width,
      h: r.height,
    };
  };
  const measure = () => {
    const el = nodeEl(sel);
    const next = el && stage.current ? rectOf(el) : null;
    setRect((p) =>
      p &&
      next &&
      p.x === next.x &&
      p.y === next.y &&
      p.w === next.w &&
      p.h === next.h
        ? p
        : next,
    );
  };
  useLayoutEffect(measure);
  useShortcuts(props);

  // Un clic choisit un élément au niveau en cours : enfant du parent de la
  // sélection. Un élément hors de ce niveau ramène au premier niveau.
  function pick(chain: string[]) {
    if (!chain.length) return root.id;
    if (chain.includes(sel) && sel !== root.id) return sel;
    const scope = parentOf(project, root, sel) ?? root.id;
    const i = chain.indexOf(scope);
    if (i >= 0 && chain[i + 1]) return chain[i + 1];
    return chain[1] ?? chain[0];
  }

  // Poignée : redimensionne l'élément sélectionné.
  function resize(e: React.PointerEvent, r: Rect) {
    e.stopPropagation();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const onMove = (m: PointerEvent) =>
      writeStyle(props, sel, {
        width: Math.max(8, Math.round((r.w + m.clientX - x0) / zoom)),
        height: Math.max(8, Math.round((r.h + m.clientY - y0) / zoom)),
      });
    const onUp = () => {
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
    };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
  }

  // Glisser : placement libre (aimanté) ou rangement dans un parent en flux ;
  // le conteneur survolé devient le nouveau parent.
  function startDrag(e: React.PointerEvent, id: string) {
    const el = nodeEl(id);
    const s = stage.current;
    if (!el || !s) return;
    const start = rectOf(el);
    const o = s.getBoundingClientRect();
    const at = (m: PointerEvent) => ({
      x: m.clientX - o.left + s.scrollLeft,
      y: m.clientY - o.top + s.scrollTop,
    });
    const p0 = at(e.nativeEvent);
    const grab = { x: p0.x - start.x, y: p0.y - start.y };
    const parent0 = find(root, id)?.parent?.id ?? root.id;
    let moved = false;
    let drop: {
      parent: string;
      x?: number;
      y?: number;
      index?: number;
    } | null = null;

    const containerAt = (m: PointerEvent) => {
      for (const hit of document.elementsFromPoint(m.clientX, m.clientY)) {
        const cid = hit.getAttribute('data-node');
        if (!cid || split(cid) || el.contains(hit)) continue;
        const n = find(root, cid)?.node;
        if (n && canHold(n)) return n;
      }
      return root;
    };

    const onMove = (m: PointerEvent) => {
      const p = at(m);
      if (!moved && Math.hypot(p.x - p0.x, p.y - p0.y) < 3) return;
      moved = true;
      const parent = containerAt(m);
      const pel = nodeEl(parent.id);
      if (!pel) return;
      const box = rectOf(pel);
      let ghost = { x: p.x - grab.x, y: p.y - grab.y, w: start.w, h: start.h };
      const siblings = (parent.children ?? [])
        .filter((c) => c.id !== id)
        .map((c) => nodeEl(c.id))
        .filter((x): x is Element => !!x)
        .map(rectOf);

      if (layoutOf(parent, bp) === 'free') {
        // Aimantation sur les bords et centres des voisins et du parent.
        const guides: Line[] = [];
        const targets = [box, ...siblings];
        const snap = (axis: 'x' | 'y') => {
          const size = axis === 'x' ? ghost.w : ghost.h;
          const pos = axis === 'x' ? ghost.x : ghost.y;
          let best: { d: number; line: number } | null = null;
          for (const t of targets) {
            const a = axis === 'x' ? t.x : t.y;
            const len = axis === 'x' ? t.w : t.h;
            for (const line of [a, a + len / 2, a + len])
              for (const edge of [0, size / 2, size]) {
                const d = line - (pos + edge);
                if (
                  Math.abs(d) < SNAP &&
                  (!best || Math.abs(d) < Math.abs(best.d))
                )
                  best = { d, line };
              }
          }
          if (!best) return;
          ghost = { ...ghost, [axis]: pos + best.d };
          guides.push(
            axis === 'x'
              ? { x: best.line, y: box.y, w: 1, h: box.h }
              : { x: box.x, y: best.line, w: box.w, h: 1 },
          );
        };
        snap('x');
        snap('y');
        const x = Math.round((ghost.x - box.x) / zoom);
        const y = Math.round((ghost.y - box.y) / zoom);
        drop = { parent: parent.id, x, y };
        if (parent.id === parent0) {
          writeStyle(props, id, { x, y });
          setDrag({ ghost, guides, marker: null, into: null });
        } else setDrag({ ghost, guides, marker: null, into: box });
        return;
      }

      // Parent en flux : emplacement d'insertion d'après le pointeur.
      const layout = layoutOf(parent, bp);
      let index = siblings.findIndex((r) =>
        layout === 'row'
          ? p.x < r.x + r.w / 2
          : layout === 'grid'
            ? p.y < r.y + r.h && (p.y < r.y || p.x < r.x + r.w / 2)
            : p.y < r.y + r.h / 2,
      );
      if (index < 0) index = siblings.length;
      const row = layout === 'row';
      const ref = siblings[Math.min(index, siblings.length - 1)];
      const after = index >= siblings.length;
      const marker: Line = !ref
        ? { x: box.x + 4, y: box.y + 4, w: box.w - 8, h: 2 }
        : row
          ? {
              x: after ? ref.x + ref.w + 1 : ref.x - 3,
              y: ref.y,
              w: 2,
              h: ref.h,
            }
          : {
              x: ref.x,
              y: after ? ref.y + ref.h + 1 : ref.y - 3,
              w: ref.w,
              h: 2,
            };
      drop = { parent: parent.id, index };
      setDrag({
        ghost,
        guides: [],
        marker,
        into: parent.id === parent0 ? null : box,
      });
    };

    const onUp = () => {
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
      setDrag(null);
      if (!moved) return props.onSelect(id, true);
      if (!drop || (drop.parent === parent0 && drop.index === undefined))
        return;
      const parent = find(root, drop.parent)!.node;
      const kids = (parent.children ?? []).filter((c) => c.id !== id);
      const place: Place =
        drop.index !== undefined && drop.index < kids.length
          ? { target: kids[drop.index].id, where: 'before' }
          : { target: parent.id, where: 'inside' };
      let next = move(root, id, place);
      // Le nouvel élément adopte la disposition de son parent.
      next =
        drop.x !== undefined
          ? setStyles(next, id, bp, { x: drop.x, y: drop.y })
          : update(next, id, (n) => ({
              ...n,
              style:
                n.style &&
                Object.fromEntries(
                  Object.entries(n.style).map(([b, st]) => {
                    const { x: _x, y: _y, ...rest } = st ?? {};
                    return [b, rest];
                  }),
                ),
            }));
      props.onRoot(next);
    };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
  }

  return (
    <div className="stage-wrap">
      <div
        className="stage"
        ref={stage}
        onScroll={measure}
        onPointerDown={(e) => {
          if (
            e.button !== 0 ||
            (e.target as HTMLElement).closest('.handle, .menu')
          )
            return;
          const id = pick(chainAt(e.target as HTMLElement));
          props.onSelect(id, id === root.id);
          if (id !== root.id && !split(id)) startDrag(e, id);
          else if (split(id)) props.onSelect(id, true);
        }}
        onDoubleClick={(e) => {
          // Double-clic : entre dans le conteneur ou l'instance.
          const chain = chainAt(e.target as HTMLElement);
          const i = chain.indexOf(sel);
          if (i >= 0 && chain[i + 1]) props.onSelect(chain[i + 1], true);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          const id = pick(chainAt(e.target as HTMLElement));
          props.onSelect(id, true);
          setMenu({ x: e.clientX, y: e.clientY, id });
        }}
      >
        <div
          className={props.component ? 'artboard component' : 'artboard'}
          ref={board}
          data-format={bp}
          style={{
            width: shown,
            zoom,
            ...foundationVars(project.foundations, props.theme),
          }}
        >
          <Render
            node={root}
            ctx={{ project, bp, base: props.base, patches: props.patches }}
          />
        </div>
        {drag ? (
          <>
            {drag.into && <div className="drop-into" style={box(drag.into)} />}
            <div className="drag-ghost" style={box(drag.ghost)} />
            {drag.guides.map((g, i) => (
              <div key={i} className="guide" style={box(g)} />
            ))}
            {drag.marker && <div className="marker" style={box(drag.marker)} />}
          </>
        ) : (
          rect && (
            <div className="sel-box" style={box(rect)}>
              <span className="sel-tag">
                {split(sel) && <Diamond size={12} />}
                {label(target(project, root, sel)?.node ?? root, project)}
              </span>
              {sel !== root.id && (
                <span
                  className="handle"
                  aria-label="Redimensionner"
                  onPointerDown={(e) => resize(e, rect)}
                />
              )}
            </div>
          )
        )}
        <ContextMenu {...props} menu={menu} onClose={() => setMenu(null)} />
      </div>
      <div
        className="zoom-ctl"
        role="group"
        aria-label="Zoom"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          className="icon-btn"
          aria-label="Zoom arrière"
          onClick={() => zoomTo(zoom / 1.25)}
        >
          <Minus />
        </button>
        <button
          className="ghost"
          aria-label="Ajuster"
          title="Ajuster"
          onClick={() => setScale(null)}
        >
          {Math.round(zoom * 100)} %
        </button>
        <button
          className="icon-btn"
          aria-label="Zoom avant"
          onClick={() => zoomTo(zoom * 1.25)}
        >
          <Plus />
        </button>
      </div>
    </div>
  );
}
const box = (r: Rect) => ({ left: r.x, top: r.y, width: r.w, height: r.h });

// --- Menu Ajouter : éléments de base, image importée, composants ---

/** Ajoute un élément là où il se place ; dans un conteneur libre, il est décalé. */
export function addNode(root: Node, sel: string, node: Node): Node {
  const at = placeFor(root, split(sel) ? split(sel)!.instance : sel);
  const hit = find(root, at.target)!;
  const parent = at.where === 'inside' ? hit.node : (hit.parent ?? hit.node);
  if (parent.style?.desktop?.direction !== 'free')
    return insert(root, node, at);
  const n = parent.children?.length ?? 0;
  const desktop = {
    x: 40 + ((n * 24) % 240),
    y: 40 + ((n * 24) % 240),
    ...(node.kind === 'box' && { width: 240, height: 160 }),
    ...node.style?.desktop,
    // Pleine largeur : collé au bord, sans dépasser.
    ...(node.style?.desktop?.width === 'fill' && { x: 0 }),
  };
  return insert(root, { ...node, style: { ...node.style, desktop } }, at);
}

export function AddMenu(props: EditorProps & { exclude?: string }) {
  const { project, root } = props;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    addEventListener('click', close);
    return () => removeEventListener('click', close);
  }, [open]);
  // L'élément ajouté est sélectionné, prêt à glisser ; le panneau ne change pas.
  function add(node: Omit<Node, 'id'>) {
    const id = newId(root, node.kind);
    props.onRoot(addNode(root, props.sel, { id, ...node } as Node));
    props.onSelect(id, false);
  }
  const shape = (name: string, radius?: number) =>
    add({
      kind: 'shape',
      name,
      style: {
        desktop: {
          width: 160,
          height: 120,
          background: '#d9d9d9',
          ...(radius && { radius }),
        },
      },
    });
  const components = Object.entries(project.components).filter(
    ([id]) => id !== props.exclude,
  );
  const item = (text: string, icon: React.ReactNode, run: () => void) => (
    <button key={text} role="menuitem" className="ghost" onClick={run}>
      {icon} {text}
    </button>
  );
  return (
    <div className="add">
      <button
        className="wide"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        <Plus /> Ajouter
      </button>
      {open && (
        <div className="menu" role="menu">
          {item('Bloc', <Square />, () =>
            add({
              kind: 'box',
              style: { desktop: { direction: 'column' } },
              children: [],
            }),
          )}
          {item('Texte', <TextT />, () => add({ kind: 'text', text: 'Texte' }))}
          {item('Rectangle', <Rectangle />, () => shape('Rectangle'))}
          {item('Ellipse', <Circle />, () => shape('Ellipse', 9999))}
          {item('Image', <ImageSquare />, async () => {
            const src = await window.studio.importImage(props.base);
            if (src)
              add({ kind: 'image', src, style: { desktop: { width: 320 } } });
          })}
          {Object.entries(project.collections).map(([cid, c]) =>
            // Liste : une carte par élément de la collection, champ texte lié.
            item(`Liste ${c.name}`, <ListBullets />, () => {
              const f = c.fields.find(
                (x) => x.type !== 'image' && x.type !== 'boolean',
              );
              const card = newId(
                root,
                'box',
                new Set([...ids(root), newId(root, 'list')]),
              );
              add({
                kind: 'list',
                bind: { collection: cid },
                style: {
                  desktop: {
                    direction: 'grid',
                    columns: 3,
                    gap: 16,
                    width: 'fill',
                  },
                  mobile: { columns: 1 },
                },
                children: [
                  {
                    id: card,
                    kind: 'box',
                    style: {
                      desktop: { direction: 'column', gap: 8, padding: 16 },
                    },
                    children: f
                      ? [
                          {
                            id: `${card}-text`,
                            kind: 'text',
                            bind: { collection: cid, field: f.id },
                          },
                        ]
                      : [],
                  },
                ],
              });
            }),
          )}
          {components.length > 0 && (
            <span className="menu-label">Composants</span>
          )}
          {components.map(([id, c]) =>
            item(c.name, <Cube />, () =>
              // Un composant pleine largeur le reste dans un cadre libre.
              add({
                kind: 'component',
                component: id,
                ...(c.root.style?.desktop?.width === 'fill' && {
                  style: { desktop: { x: 0, width: 'fill' } },
                }),
              }),
            ),
          )}
        </div>
      )}
    </div>
  );
}

// --- Structure : arbre de la page ou du composant ---

export function Structure(props: EditorProps) {
  const { project, root, sel } = props;
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<Place | null>(null);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<Menu>(null);
  const current = split(sel)?.instance ?? sel;

  // Moitié haute : avant ; moitié basse : après ; milieu d'un bloc : dedans.
  function where(e: React.DragEvent, n: Node): Place {
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    if (canHold(n) && (n.id === root.id || (y > 0.25 && y < 0.75)))
      return { target: n.id, where: 'inside' };
    return { target: n.id, where: y < 0.5 ? 'before' : 'after' };
  }
  const end = () => {
    setDrag(null);
    setDrop(null);
  };

  const row = (n: Node, depth: number): React.ReactNode => {
    const Icon = kindIcons[n.kind];
    const open = !closed.has(n.id);
    const mark = drop?.target === n.id ? `drop-${drop.where}` : '';
    return (
      <li key={n.id}>
        <div
          className={`tree-row ${mark}`}
          style={{ paddingLeft: `calc(${depth} * var(--ui-s-4))` }}
          aria-current={current === n.id ? 'true' : undefined}
          draggable={n.id !== root.id}
          onDragStart={(e) => {
            e.stopPropagation();
            setDrag(n.id);
          }}
          onDragOver={(e) => {
            if (!drag || drag === n.id) return;
            e.preventDefault();
            e.stopPropagation();
            setDrop(where(e, n));
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (drag) props.onRoot(move(root, drag, where(e, n)));
            end();
          }}
          onDragEnd={end}
          onContextMenu={(e) => {
            e.preventDefault();
            props.onSelect(n.id);
            setMenu({ x: e.clientX, y: e.clientY, id: n.id });
          }}
        >
          {n.children?.length ? (
            <button
              className="icon-btn caret-btn"
              aria-label={open ? 'Replier' : 'Déplier'}
              onClick={() => {
                const next = new Set(closed);
                if (open) next.add(n.id);
                else next.delete(n.id);
                setClosed(next);
              }}
            >
              <CaretRight className={open ? 'caret open' : 'caret'} />
            </button>
          ) : (
            <span className="caret-space" />
          )}
          <button className="ghost item" onClick={() => props.onSelect(n.id)}>
            <Icon /> {label(n, project)}
          </button>
        </div>
        {open && n.children?.length ? (
          <ul>{n.children.map((c) => row(c, depth + 1))}</ul>
        ) : null}
      </li>
    );
  };

  return (
    <section className="group">
      <h3>Structure</h3>
      <ul className="tree">{row(root, 0)}</ul>
      <ContextMenu {...props} menu={menu} onClose={() => setMenu(null)} />
    </section>
  );
}

// --- Paramètres : valeur libre ou token, comme dans Figma ---

type Opt = [string, string];

function Dot(p: { show: boolean; label: string; onClick: () => void }) {
  return p.show ? (
    <button
      className="override"
      aria-label={`Rétablir ${p.label}`}
      onClick={p.onClick}
    />
  ) : null;
}

/** Choix d'un token : une icône qui ouvre la liste. */
function Bind(p: {
  label: string;
  value: unknown;
  options: Opt[];
  onChange: (id: string) => void;
}) {
  if (!p.options.length) return null;
  return (
    <span className="bind" title="Tokens">
      <Hexagon />
      <select
        aria-label={`Token ${p.label}`}
        value={isToken(p.value) ? p.value : ''}
        onChange={(e) => p.onChange(e.target.value)}
      >
        <option value="" disabled>
          Tokens
        </option>
        {p.options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </span>
  );
}

function Chip(p: { text: string; label: string; onDetach: () => void }) {
  return (
    <span className="chip">
      <span className="chip-text">{p.text}</span>
      <button
        className="chip-x"
        aria-label={`Détacher ${p.label}`}
        onClick={p.onDetach}
      >
        <X size={12} />
      </button>
    </span>
  );
}

function NumInput(p: {
  label: string;
  value: number | undefined;
  placeholder?: string;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <input
      type="number"
      aria-label={p.label}
      placeholder={p.placeholder}
      value={p.value ?? ''}
      onChange={(e) => {
        const v = e.target.valueAsNumber;
        p.onChange(Number.isFinite(v) ? v : undefined);
      }}
    />
  );
}

/** Nom modifiable d'un double-clic. */
export function EditableName(p: {
  value: string;
  label: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing)
    return (
      <h2
        className="ellipsis"
        title={p.value}
        onDoubleClick={() => setEditing(true)}
      >
        {p.value}
      </h2>
    );
  return (
    <input
      className="name-input"
      aria-label={p.label}
      autoFocus
      defaultValue={p.value}
      onBlur={(e) => {
        const v = e.currentTarget.value.trim();
        if (v && v !== p.value) p.onChange(v);
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setEditing(false);
      }}
    />
  );
}

/**
 * Champ lié : dans une liste, les champs de sa collection ; ailleurs, ceux de
 * toutes les collections (le premier élément s'affiche).
 */
function FieldSelect(props: EditorProps & { node: Node }) {
  const { project, root, node } = props;
  const inList = listAbove(root, node.id);
  const fits = (t: string) =>
    node.kind === 'image' ? t === 'image' : t !== 'image';
  const options = Object.entries(project.collections)
    .filter(([k]) => !inList || k === inList)
    .flatMap(([k, c]) =>
      c.fields
        .filter((f) => fits(f.type))
        .map(
          (f) =>
            [
              `${k}:${f.id}`,
              inList ? f.name : `${c.name} · ${f.name}`,
            ] as const,
        ),
    );
  if (!options.length) return null;
  const value = node.bind?.field
    ? `${node.bind.collection}:${node.bind.field}`
    : '';
  return (
    <div className="num">
      <span className="num-icon" title="Champ">
        <Database />
      </span>
      <select
        aria-label="Champ"
        value={value}
        onChange={(e) => {
          const [collection, field] = e.target.value.split(':');
          props.onRoot(
            update(root, node.id, (n) => ({
              ...n,
              bind: e.target.value ? { collection, field } : undefined,
            })),
          );
        }}
      >
        <option value="">—</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ElementSettings(
  props: EditorProps & {
    /** En cours d'édition d'un état : seul le style change. */
    stateOnly?: boolean;
    header?: React.ReactNode;
  },
) {
  const { project, root, bp } = props;
  const id = props.edited;
  const t = target(project, root, id);
  if (!t) return null;
  const node = t.node;
  const part = split(id);
  const own =
    (part ? t.instance?.overrides?.[part.inner]?.style?.[bp] : props.own(id)) ??
    {};
  const s: Style = { ...resolve(node, bp), ...(part ? {} : own) };
  const f = project.foundations;
  const set = (patch: StylePatch) => writeStyle(props, id, patch);
  const setNode = (patch: {
    text?: string;
    src?: string;
    href?: string;
    component?: string;
  }) =>
    props.onRoot(
      part
        ? setOverride(root, id, patch)
        : update(root, id, (n) => ({ ...n, ...patch })),
    );
  const box = canHold(node);
  // Le parent d'un élément d'instance est dans le composant.
  const parentLayout = layoutOf(t.parent, bp);
  const marked = bp !== 'desktop' || !!props.stateOnly || !!part;
  const dot = (key: keyof Style, text: string) => (
    <Dot
      show={marked && own[key] !== undefined}
      label={text}
      onClick={() => set({ [key]: undefined })}
    />
  );
  const options = (kind: FoundationKind): Opt[] =>
    Object.entries(f[kind]).map(([k, v]) => [k, v.name]);
  const instance = node.kind === 'component' && !part;
  const component = instance ? project.components[node.component!] : undefined;
  const actions = actionsFor(props, id);
  const main = actions.find(
    (a) =>
      a.label === 'Créer un composant' || a.label === 'Détacher l’instance',
  );

  // Longueur : nombre libre, ou token d'espacement / d'arrondi.
  const length = (
    key: 'gap' | 'padding' | 'maxWidth' | 'radius',
    text: string,
    icon: React.ReactNode,
  ) => {
    const kind = key === 'radius' ? 'radius' : 'spacing';
    const v = s[key];
    return (
      <div className="num" key={key}>
        <span className="num-icon" title={text}>
          {icon}
        </span>
        {isToken(v) ? (
          <Chip
            text={f[kind][v]?.name ?? v}
            label={text}
            onDetach={() => set({ [key]: f[kind][v]?.value })}
          />
        ) : (
          <NumInput
            label={text}
            value={v as number | undefined}
            placeholder="—"
            onChange={(n) => set({ [key]: n })}
          />
        )}
        <Bind
          label={text}
          value={v}
          options={options(kind)}
          onChange={(k) => set({ [key]: k })}
        />
        {dot(key, text)}
      </div>
    );
  };
  // Couleur : pastille et code libre, ou token de couleur.
  const color = (key: 'background' | 'color' | 'border', text: string) => {
    const v = s[key];
    const hex = isToken(v) ? f.colors[v]?.light : v;
    return (
      <div className="paint" key={key}>
        <input
          type="color"
          className="swatch-input"
          aria-label={text}
          value={(hex ?? '#ffffff').slice(0, 7)}
          onChange={(e) => set({ [key]: e.target.value })}
        />
        {isToken(v) ? (
          <Chip
            text={f.colors[v]?.name ?? v}
            label={text}
            onDetach={() => set({ [key]: hex })}
          />
        ) : (
          <input
            key={String(v)}
            aria-label={`${text} hex`}
            placeholder={text}
            defaultValue={v ?? ''}
            onBlur={(e) => {
              const val = e.currentTarget.value.trim();
              if (!val) return set({ [key]: undefined });
              if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(val))
                set({ [key]: val });
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        )}
        <Bind
          label={text}
          value={v}
          options={options('colors')}
          onChange={(k) => set({ [key]: k })}
        />
        {dot(key, text)}
      </div>
    );
  };
  // Taille : fixe (nombre), ajustée au contenu ou remplir.
  const size = (key: 'width' | 'height', text: string, letter: string) => {
    const v = s[key];
    return (
      <div className="num" key={key}>
        <span className="num-icon" title={text}>
          {letter}
        </span>
        <NumInput
          label={text}
          value={typeof v === 'number' ? v : undefined}
          placeholder="—"
          onChange={(n) => set({ [key]: n })}
        />
        <select
          className="mode"
          aria-label={`${text} mode`}
          value={typeof v === 'number' ? 'fixed' : (v ?? '')}
          onChange={(e) => {
            const m = e.target.value;
            set({
              [key]:
                m === 'fixed' ? (key === 'width' ? 240 : 120) : m || undefined,
            });
          }}
        >
          <option value="">Auto</option>
          <option value="fixed">Fixe</option>
          <option value="hug">Ajustée</option>
          <option value="fill">Remplir</option>
        </select>
        {dot(key, text)}
      </div>
    );
  };

  // Alignement en grille 3 × 3 : l'axe horizontal suit la direction.
  const row = s.direction === 'row';
  const pos = ['start', 'center', 'end'] as const;
  const grid = (
    <div className="align-grid" role="group" aria-label="Alignement">
      {pos.map((v) =>
        pos.map((h) => {
          const justify = row ? h : v;
          const align = row ? v : h;
          const on =
            (s.justify ?? 'start') === justify &&
            (s.align === 'stretch' ? 'start' : (s.align ?? 'start')) === align;
          return (
            <button
              key={h + v}
              aria-label={`Aligner ${v} ${h}`}
              aria-pressed={on}
              onClick={() => set({ justify, align })}
            >
              <span />
            </button>
          );
        }),
      )}
    </div>
  );
  const layouts = [
    ['column', 'Colonne', <ArrowDown key="c" />],
    ['row', 'Ligne', <ArrowRight key="r" />],
    ['grid', 'Grille', <GridFour key="g" />],
    ['free', 'Libre', <ArrowsOutCardinal key="f" />],
  ] as const;
  const direction = s.direction ?? 'column';

  return (
    <>
      <div className="panel-head">
        {(instance || part) && (
          <Diamond className="instance-mark" aria-label="Instance" />
        )}
        {instance && component ? (
          <EditableName
            value={component.name}
            label="Nom du composant"
            onChange={(n) => props.onRenameComponent(node.component!, n)}
          />
        ) : (
          <EditableName
            value={label(node, project)}
            label="Nom"
            onChange={(n) =>
              !part &&
              props.onRoot(update(root, id, (x) => ({ ...x, name: n })))
            }
          />
        )}
        <div className="row">
          <button
            className="icon-btn"
            aria-label={s.hidden ? 'Afficher' : 'Masquer'}
            aria-pressed={!!s.hidden}
            onClick={() => set({ hidden: s.hidden ? undefined : true })}
          >
            {s.hidden ? <EyeSlash /> : <Eye />}
          </button>
          {!props.stateOnly &&
            actions
              .filter((a) => a !== main)
              .map((a) => (
                <button
                  key={a.label}
                  className="icon-btn"
                  aria-label={a.label}
                  onClick={a.run}
                >
                  {a.label === 'Dupliquer' ? <Copy /> : <Trash />}
                </button>
              ))}
        </div>
      </div>
      {!props.stateOnly && main && (
        <button className="ghost main-action" onClick={main.run}>
          {instance ? <LinkBreak /> : <Diamond />} {main.label}
        </button>
      )}
      {props.header}
      {!props.stateOnly && (
        <section className="group">
          <h3>Contenu</h3>
          {node.kind === 'list' && (
            <select
              aria-label="Collection"
              value={node.bind?.collection ?? ''}
              onChange={(e) =>
                props.onRoot(
                  update(root, id, (n) => ({
                    ...n,
                    bind: { collection: e.target.value },
                  })),
                )
              }
            >
              {Object.entries(project.collections).map(([k, c]) => (
                <option key={k} value={k}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {(node.kind === 'text' || node.kind === 'image') && !part && (
            <FieldSelect {...props} node={node} />
          )}
          {node.kind === 'text' && !node.bind?.field && (
            <textarea
              aria-label="Texte"
              rows={3}
              value={node.text ?? ''}
              onChange={(e) => setNode({ text: e.target.value })}
            />
          )}
          {node.kind === 'image' && !node.bind?.field && (
            <button
              onClick={async () => {
                const src = await window.studio.importImage(props.base);
                if (src) setNode({ src });
              }}
            >
              <ImageSquare /> {node.src ? 'Changer' : 'Choisir'}
            </button>
          )}
          {instance && (
            <select
              aria-label="Composant"
              value={node.component}
              onChange={(e) => setNode({ component: e.target.value })}
            >
              {Object.entries(project.components).map(([k, c]) => (
                <option key={k} value={k}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <input
            key={id + (node.href ?? '')}
            aria-label="Lien"
            placeholder="Lien"
            list="pages-list"
            defaultValue={node.href ?? ''}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim() || undefined;
              if (v !== node.href) setNode({ href: v });
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <datalist id="pages-list">
            {Object.keys(project.pages).map((p) => (
              <option key={p} value={`/${p}`} />
            ))}
          </datalist>
        </section>
      )}
      <section className="group">
        <h3>Disposition</h3>
        {parentLayout === 'free' && id !== root.id && (
          <div className="pair">
            {(['x', 'y'] as const).map((k) => (
              <div className="num" key={k}>
                <span className="num-icon">{k.toUpperCase()}</span>
                <NumInput
                  label={k.toUpperCase()}
                  value={s[k] ?? 0}
                  onChange={(n) => set({ [k]: n ?? 0 })}
                />
                {dot(k, k.toUpperCase())}
              </div>
            ))}
          </div>
        )}
        {parentLayout && parentLayout !== 'free' && id !== root.id && (
          <div className="num">
            <span className="num-icon" title="Aligner">
              <ArrowsHorizontal />
            </span>
            <select
              aria-label="Aligner"
              value={s.alignSelf ?? ''}
              onChange={(e) =>
                set({
                  alignSelf: (e.target.value ||
                    undefined) as Style['alignSelf'],
                })
              }
            >
              <option value="">Auto</option>
              <option value="start">Début</option>
              <option value="center">Centre</option>
              <option value="end">Fin</option>
              <option value="stretch">Étirer</option>
            </select>
            {dot('alignSelf', 'Aligner')}
          </div>
        )}
        {box && (
          <>
            <div
              className="segmented"
              role="group"
              aria-label="Disposition des enfants"
            >
              {layouts.map(([d, text, icon]) => (
                <button
                  key={d}
                  className="icon-btn"
                  aria-label={text}
                  aria-pressed={direction === d}
                  onClick={() => set({ direction: d })}
                >
                  {icon}
                </button>
              ))}
              {dot('direction', 'Disposition')}
            </div>
            {(direction === 'row' || direction === 'column') && (
              <div className="layout">
                {grid}
                <div className="layout-fields">
                  {length(
                    'gap',
                    'Écart',
                    row ? <ArrowsHorizontal /> : <ArrowsVertical />,
                  )}
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={s.justify === 'between'}
                      onChange={(e) =>
                        set({ justify: e.target.checked ? 'between' : 'start' })
                      }
                    />
                    Réparti
                  </label>
                </div>
              </div>
            )}
            {direction === 'grid' && (
              <div className="pair">
                <div className="num">
                  <span className="num-icon" title="Colonnes">
                    <GridFour />
                  </span>
                  <NumInput
                    label="Colonnes"
                    value={s.columns ?? 2}
                    onChange={(n) =>
                      set({
                        columns: n
                          ? Math.min(12, Math.max(1, Math.round(n)))
                          : undefined,
                      })
                    }
                  />
                </div>
                {length('gap', 'Écart', <ArrowsHorizontal />)}
              </div>
            )}
            {length('padding', 'Marge', <BoundingBox />)}
          </>
        )}
      </section>
      <section className="group">
        <h3>Taille</h3>
        <div className="pair">
          {size('width', 'Largeur', 'L')}
          {size('height', 'Hauteur', 'H')}
        </div>
        {length('maxWidth', 'Largeur max', <ArrowsHorizontal />)}
      </section>
      <section className="group">
        <h3>Style</h3>
        {node.kind !== 'text' && color('background', 'Fond')}
        {(node.kind === 'text' || box) && (
          <>
            {color('color', 'Couleur')}
            <div className="num">
              <span className="num-icon">
                <TextT />
              </span>
              <select
                aria-label="Typo"
                value={s.font ?? ''}
                onChange={(e) => set({ font: e.target.value || undefined })}
              >
                <option value="">—</option>
                {options('fonts').map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              {dot('font', 'Typo')}
            </div>
            <div className="pair">
              <div className="num">
                <span className="num-icon">Aa</span>
                <NumInput
                  label="Taille du texte"
                  value={s.fontSize}
                  placeholder="—"
                  onChange={(n) => set({ fontSize: n })}
                />
              </div>
              <select
                aria-label="Graisse"
                value={s.fontWeight ?? ''}
                onChange={(e) =>
                  set({ fontWeight: Number(e.target.value) || undefined })
                }
              >
                <option value="">—</option>
                {[300, 400, 500, 600, 700, 800].map((w) => (
                  <option key={w}>{w}</option>
                ))}
              </select>
            </div>
            <div
              className="segmented"
              role="group"
              aria-label="Alignement du texte"
            >
              {(
                [
                  ['left', 'Gauche', <TextAlignLeft key="l" />],
                  ['center', 'Centre', <TextAlignCenter key="c" />],
                  ['right', 'Droite', <TextAlignRight key="r" />],
                ] as const
              ).map(([a, text, icon]) => (
                <button
                  key={a}
                  className="icon-btn"
                  aria-label={text}
                  aria-pressed={s.textAlign === a}
                  onClick={() =>
                    set({ textAlign: s.textAlign === a ? undefined : a })
                  }
                >
                  {icon}
                </button>
              ))}
            </div>
          </>
        )}
        {length('radius', 'Arrondi', <CornersOut />)}
        {node.kind !== 'text' && color('border', 'Bordure')}
        {node.kind !== 'text' && s.border !== undefined && (
          <div className="num">
            <span className="num-icon" title="Épaisseur">
              <Square />
            </span>
            <NumInput
              label="Épaisseur"
              value={s.borderWidth ?? 1}
              onChange={(n) => set({ borderWidth: n })}
            />
          </div>
        )}
      </section>
      <details className="group effects">
        <summary>
          <h3>Effets</h3>
        </summary>
        <div className="num">
          <span className="num-icon" title="Ombre">
            <Square weight="duotone" />
          </span>
          <select
            aria-label="Ombre"
            value={s.shadow ?? ''}
            onChange={(e) => set({ shadow: e.target.value || undefined })}
          >
            <option value="">—</option>
            {options('shadows').map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          {dot('shadow', 'Ombre')}
        </div>
        <div className="num">
          <span className="num-icon" title="Opacité">
            %
          </span>
          <NumInput
            label="Opacité"
            value={s.opacity === undefined ? 100 : Math.round(s.opacity * 100)}
            onChange={(n) =>
              set({
                opacity:
                  n === undefined || n >= 100
                    ? undefined
                    : Math.max(0, n) / 100,
              })
            }
          />
        </div>
      </details>
    </>
  );
}
