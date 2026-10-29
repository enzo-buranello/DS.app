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
  Eye,
  EyeSlash,
  Hexagon,
  ImageSquare,
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
import {
  canHold,
  duplicate,
  find,
  insert,
  move,
  newId,
  placeFor,
  remove,
  update,
  type Place,
} from '../shared/nodes.js';
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
  component: Cube,
  list: Square,
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
  sel: string;
  onSelect: (id: string) => void;
  bp: Breakpoint;
  base: string;
  /** Écrit des valeurs de style pour le format (ou l'état) en cours. */
  onStyle: (id: string, patch: StylePatch) => void;
  /** Style propre à l'élément pour le format (ou l'état) en cours. */
  own: (id: string) => Style | undefined;
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

const parentIsFree = (root: Node, id: string, bp: Breakpoint) => {
  const parent = find(root, id)?.parent;
  return !!parent && resolve(parent, bp).direction === 'free';
};

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

// --- Canevas : sélection en surbrillance, déplacement, redimensionnement ---

type Rect = { x: number; y: number; w: number; h: number };

export function Canvas(
  props: EditorProps & {
    theme: Theme;
    patches?: Record<string, Style>;
    /** Un composant s'affiche à sa taille, au centre du format. */
    component?: boolean;
  },
) {
  const { root, sel, bp } = props;
  const stage = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [rect, setRect] = useState<Rect | null>(null);
  // Un composant s'affiche en taille réelle ; au format bureau, il prend la
  // largeur du canevas.
  const width = formats.find((f) => f.bp === bp)!.width;
  const shown = props.component && bp === 'desktop' ? undefined : width;
  // Le format entier tient dans la largeur du canevas.
  useLayoutEffect(() => {
    const el = stage.current!;
    const fit = () =>
      setZoom(props.component ? 1 : Math.min(1, (el.clientWidth - 64) / width));
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, props.component]);
  // Cadre de sélection mesuré après chaque rendu et à chaque défilement.
  const measure = () => {
    const el = board.current?.querySelector(`[data-node="${CSS.escape(sel)}"]`);
    const s = stage.current;
    if (!el || !s) return setRect(null);
    const r = el.getBoundingClientRect();
    const o = s.getBoundingClientRect();
    const next = {
      x: r.left - o.left + s.scrollLeft,
      y: r.top - o.top + s.scrollTop,
      w: r.width,
      h: r.height,
    };
    setRect((p) =>
      p && p.x === next.x && p.y === next.y && p.w === next.w && p.h === next.h
        ? p
        : next,
    );
  };
  useLayoutEffect(measure);
  useShortcuts(props);

  // Un élément placé librement se déplace en le glissant ; tout élément se
  // redimensionne par sa poignée.
  function drag(
    e: React.PointerEvent,
    apply: (dx: number, dy: number) => StylePatch,
  ) {
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const onMove = (m: PointerEvent) => {
      const dx = (m.clientX - x0) / zoom;
      const dy = (m.clientY - y0) / zoom;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      props.onStyle(sel, apply(Math.round(dx), Math.round(dy)));
    };
    const onUp = () => {
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
    };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
  }

  return (
    <div
      className="stage"
      ref={stage}
      onScroll={measure}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('.handle')) return;
        const hit = (e.target as HTMLElement).closest('[data-node]');
        const id = hit?.getAttribute('data-node') ?? root.id;
        props.onSelect(id);
        const node = find(root, id)?.node;
        if (!node || id === root.id || !parentIsFree(root, id, bp)) return;
        const s = resolve(node, bp, props.patches?.[id]);
        dragFrom(e, id, s);
      }}
    >
      <div
        className={props.component ? 'artboard component' : 'artboard'}
        ref={board}
        data-format={bp}
        style={{
          width: shown,
          zoom,
          ...foundationVars(props.project.foundations, props.theme),
        }}
      >
        <Render
          node={root}
          ctx={{
            project: props.project,
            bp,
            base: props.base,
            patches: props.patches,
          }}
        />
      </div>
      {rect && (
        <div
          className="sel-box"
          style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
        >
          <span className="sel-tag">
            {label(find(root, sel)?.node ?? root, props.project)}
          </span>
          {sel !== root.id && (
            <span
              className="handle"
              aria-label="Redimensionner"
              onPointerDown={(e) => {
                e.stopPropagation();
                const w = rect.w / zoom;
                const h = rect.h / zoom;
                drag(e, (dx, dy) => ({
                  width: Math.max(8, Math.round(w + dx)),
                  height: Math.max(8, Math.round(h + dy)),
                }));
              }}
            />
          )}
        </div>
      )}
    </div>
  );

  // Le déplacement vise l'élément pressé, même si la sélection change ensuite.
  function dragFrom(e: React.PointerEvent, id: string, s: Style) {
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const onMove = (m: PointerEvent) => {
      const dx = Math.round((m.clientX - x0) / zoom);
      const dy = Math.round((m.clientY - y0) / zoom);
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      props.onStyle(id, { x: (s.x ?? 0) + dx, y: (s.y ?? 0) + dy });
    };
    const onUp = () => {
      removeEventListener('pointermove', onMove);
      removeEventListener('pointerup', onUp);
    };
    addEventListener('pointermove', onMove);
    addEventListener('pointerup', onUp);
  }
}

// Supprimer et dupliquer au clavier, hors des champs de saisie.
function useShortcuts({ root, onRoot, sel, onSelect }: EditorProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (sel === root.id || t.closest('input, textarea, select')) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onRoot(remove(root, sel));
        onSelect(root.id);
      } else if (e.key === 'd' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const copy = duplicate(root, sel);
        onRoot(copy.root);
        onSelect(copy.id);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [root, onRoot, sel, onSelect]);
}

// --- Menu Ajouter : éléments de base, image importée, composants ---

/** Ajoute un élément là où il se place ; dans un conteneur libre, il est décalé. */
export function addNode(root: Node, sel: string, node: Node): Node {
  const at = placeFor(root, sel);
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
  function add(node: Omit<Node, 'id'>) {
    const id = newId(root, node.kind);
    props.onRoot(addNode(root, props.sel, { id, ...node } as Node));
    props.onSelect(id);
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
          aria-current={sel === n.id ? 'true' : undefined}
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

export function ElementSettings(
  props: EditorProps & {
    /** En cours d'édition d'un état : seul le style change. */
    stateOnly?: boolean;
    header?: React.ReactNode;
  },
) {
  const { project, root, sel, bp } = props;
  const hit = find(root, sel);
  if (!hit) return null;
  const node = hit.node;
  const own = props.own(node.id) ?? {};
  const s: Style = { ...resolve(node, bp), ...own };
  const f = project.foundations;
  const set = (patch: StylePatch) => props.onStyle(node.id, patch);
  const setNode = (patch: Partial<Node>) =>
    props.onRoot(update(root, node.id, (n) => ({ ...n, ...patch })));
  const box = canHold(node);
  const free = s.direction === 'free';
  const inFree = parentIsFree(root, node.id, bp);
  const marked = bp !== 'desktop' || !!props.stateOnly;
  const dot = (key: keyof Style, text: string) => (
    <Dot
      show={marked && own[key] !== undefined}
      label={text}
      onClick={() => set({ [key]: undefined })}
    />
  );
  const options = (kind: FoundationKind): Opt[] =>
    Object.entries(f[kind]).map(([id, t]) => [id, t.name]);

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
          onChange={(id) => set({ [key]: id })}
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
              const t = e.currentTarget.value.trim();
              if (!t) return set({ [key]: undefined });
              if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(t)) set({ [key]: t });
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        )}
        <Bind
          label={text}
          value={v}
          options={options('colors')}
          onChange={(id) => set({ [key]: id })}
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

  return (
    <>
      <div className="panel-head">
        <h2 className="ellipsis">{label(node, project)}</h2>
        <div className="row">
          <button
            className="icon-btn"
            aria-label={s.hidden ? 'Afficher' : 'Masquer'}
            aria-pressed={!!s.hidden}
            onClick={() => set({ hidden: s.hidden ? undefined : true })}
          >
            {s.hidden ? <EyeSlash /> : <Eye />}
          </button>
          {!props.stateOnly && hit.parent && (
            <>
              <button
                className="icon-btn"
                aria-label="Dupliquer"
                onClick={() => {
                  const copy = duplicate(root, node.id);
                  props.onRoot(copy.root);
                  props.onSelect(copy.id);
                }}
              >
                <Copy />
              </button>
              <button
                className="icon-btn"
                aria-label="Supprimer"
                onClick={() => {
                  props.onRoot(remove(root, node.id));
                  props.onSelect(root.id);
                }}
              >
                <Trash />
              </button>
            </>
          )}
        </div>
      </div>
      {props.header}
      {!props.stateOnly && node.kind !== 'box' && (
        <section className="group">
          <h3>Contenu</h3>
          {node.kind === 'text' && (
            <textarea
              aria-label="Texte"
              rows={3}
              value={node.text ?? ''}
              onChange={(e) => setNode({ text: e.target.value })}
            />
          )}
          {node.kind === 'image' && (
            <button
              onClick={async () => {
                const src = await window.studio.importImage(props.base);
                if (src) setNode({ src });
              }}
            >
              <ImageSquare /> {node.src ? 'Changer' : 'Choisir'}
            </button>
          )}
          {node.kind === 'component' && (
            <select
              aria-label="Composant"
              value={node.component}
              onChange={(e) => setNode({ component: e.target.value })}
            >
              {Object.entries(project.components).map(([id, c]) => (
                <option key={id} value={id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </section>
      )}
      {inFree && (
        <section className="group">
          <h3>Position</h3>
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
        </section>
      )}
      {box && (
        <section className="group">
          <h3>Disposition</h3>
          <div className="segmented" role="group" aria-label="Direction">
            {(
              [
                ['column', 'Colonne', <ArrowDown key="c" />],
                ['row', 'Ligne', <ArrowRight key="r" />],
                ['free', 'Libre', <ArrowsOutCardinal key="f" />],
              ] as const
            ).map(([d, text, icon]) => (
              <button
                key={d}
                className="icon-btn"
                aria-label={text}
                aria-pressed={(s.direction ?? 'column') === d}
                onClick={() => set({ direction: d })}
              >
                {icon}
              </button>
            ))}
            {dot('direction', 'Direction')}
          </div>
          {!free && (
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
          {length('padding', 'Marge', <BoundingBox />)}
        </section>
      )}
      <section className="group">
        <h3>Taille</h3>
        <div className="pair">
          {size('width', 'Largeur', 'L')}
          {size('height', 'Hauteur', 'H')}
        </div>
        {length('maxWidth', 'Largeur max', <ArrowsHorizontal />)}
      </section>
      {(node.kind === 'text' || box) && (
        <section className="group">
          <h3>Texte</h3>
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
          {color('color', 'Couleur')}
        </section>
      )}
      <section className="group">
        <h3>Apparence</h3>
        <div className="pair">
          <div className="num">
            <span className="num-icon" title="Opacité">
              %
            </span>
            <NumInput
              label="Opacité"
              value={
                s.opacity === undefined ? 100 : Math.round(s.opacity * 100)
              }
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
          {length('radius', 'Arrondi', <CornersOut />)}
        </div>
        {node.kind !== 'text' && color('background', 'Fond')}
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
      </section>
    </>
  );
}
