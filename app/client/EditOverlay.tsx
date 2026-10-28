import { useEffect, useRef, useState } from 'react';
import {
  HANDLES,
  insertionLine,
  marqueeHits,
  measureGuides,
  moveAbsolute,
  rectFrom,
  reorderIndex,
  resize,
  sizeAfterResize,
  spacingBands,
  union,
  type Band,
  type Guide,
  type Handle,
  type Rect,
} from '../shared/canvas.js';
import type { Doc, DocNode, Props } from '../shared/doc.js';
import { groupAt, select, setProp, type Selected } from '../shared/edit.js';
import { realId } from '../shared/docOps.js';
import {
  chainOf,
  describe,
  findByKey,
  pick,
  SELECTOR,
  stackAt,
  type Selection,
} from './selection.js';

export interface Surface {
  /** Racine des éléments sélectionnables (catalogue, ou body de l'iframe). */
  root: Element;
  /** Iframe de l'aperçu : coordonnées internes, mises à l'échelle. */
  frame?: HTMLIFrameElement;
}
type Box = Rect;
const same = (a: Box | null, b: Box | null) =>
  a === b ||
  (!!a &&
    !!b &&
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.w - b.w) < 0.5 &&
    Math.abs(a.h - b.h) < 0.5);
const sameAll = (a: Box[], b: Box[]) =>
  a.length === b.length && a.every((x, i) => same(x, b[i]));
const DRAG = 3;

// Geste en cours sur le canevas, démarré au pointerdown.
type Gesture =
  | { kind: 'pending'; x: number; y: number; on: Element | null }
  | { kind: 'marquee'; x: number; y: number; add: boolean; pool: Element[] }
  | {
      kind: 'move';
      x: number;
      y: number;
      doc: Doc;
      keys: string[];
    }
  | {
      kind: 'reorder';
      key: string;
      parent: string;
      children: string[];
      axis: 'horizontal' | 'vertical';
      wrap: boolean;
      index: number | null;
    }
  | {
      kind: 'resize';
      x: number;
      y: number;
      doc: Doc;
      key: string;
      handle: Handle;
      start: { w: number; h: number };
    };

const flexAxis = (p: Props | null | undefined) => {
  const m = p?.layout?.mode;
  return m === 'horizontal' || m === 'vertical' ? m : null;
};

// Couche de sélection posée au-dessus du canevas : elle capte les pointeurs
// en mode Édition et dessine contours, poignées et repères. Rien n'est
// ajouté au DOM des composants ; elle n'existe pas en mode Test ni dans les
// rendus d'export. Les gestes écrivent dans le document (rendu immédiat,
// une entrée d'annulation par geste).
export function EditOverlay({
  surface,
  doc,
  selected,
  others,
  onSelect,
  onToggle,
  onMarquee,
  onText,
  canEditText,
  onNodes,
  onGestureEnd,
  onReorder,
}: {
  surface: () => Surface | null;
  doc: Doc | null;
  /** Sélection principale. */
  selected: Selection | null;
  /** Autres calques de la multi-sélection. */
  others: Selection[];
  onSelect: (s: Selection | null) => void;
  /** Maj+clic : ajoute ou retire de la sélection. */
  onToggle: (s: Selection) => void;
  onMarquee: (list: Selection[], add: boolean) => void;
  onText: (s: Selection, text: string) => void;
  canEditText: (s: Selection) => boolean;
  /** Nœuds modifiés par un geste en cours (rendu immédiat). */
  onNodes: (nodes: DocNode[]) => void;
  /** Fin du geste : écriture et entrée d'annulation. */
  onGestureEnd: () => void;
  onReorder: (key: string, parent: string, index: number) => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ s: Selection; box: Box } | null>(null);
  const [selBox, setSelBox] = useState<Box | null>(null);
  const [otherBoxes, setOtherBoxes] = useState<Box[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [alt, setAlt] = useState(false);
  const [inside, setInside] = useState(false);
  const [marquee, setMarquee] = useState<Box | null>(null);
  const [line, setLine] = useState<{
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null>(null);
  const [extras, setExtras] = useState<{
    guides: Guide[];
    bands: Band[];
    zoom: number;
  }>({ guides: [], bands: [], zoom: 1 });
  const hoverKey = useRef<string | null>(null);
  const cancelText = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const dragged = useRef(false);
  const all = selected ? [selected, ...others] : [];
  const multi = all.length > 1;

  const frameScale = (f?: HTMLIFrameElement) =>
    f ? f.getBoundingClientRect().width / (f.offsetWidth || 1) : 1;
  // Échelle écran / document : zoom de l'aperçu ou du catalogue.
  const zoomOf = (sf: Surface) => {
    if (sf.frame) return frameScale(sf.frame);
    const el = sf.root as HTMLElement;
    return el.getBoundingClientRect().width / (el.offsetWidth || 1) || 1;
  };
  // Coordonnées écran → coordonnées du document de la surface.
  const toDoc = (sf: Surface, x: number, y: number) => {
    if (!sf.frame) return { x, y };
    const r = sf.frame.getBoundingClientRect();
    const s = frameScale(sf.frame);
    return { x: (x - r.left) / s, y: (y - r.top) / s };
  };
  const toLocal = (sf: Surface, el: Element): Box => {
    const r = el.getBoundingClientRect();
    const o = layer.current!.getBoundingClientRect();
    if (!sf.frame)
      return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
    const f = sf.frame.getBoundingClientRect();
    const s = frameScale(sf.frame);
    return {
      x: f.left + r.left * s - o.left,
      y: f.top + r.top * s - o.top,
      w: r.width * s,
      h: r.height * s,
    };
  };
  const localPoint = (e: { clientX: number; clientY: number }) => {
    const o = layer.current!.getBoundingClientRect();
    return { x: e.clientX - o.left, y: e.clientY - o.top };
  };
  // Enfants sélectionnables directs d'un élément (ou de la racine).
  const childrenOf = (sf: Surface, parent: Element | null) =>
    [...sf.root.querySelectorAll(SELECTOR)].filter(
      (el) =>
        !el.closest('[data-ds-locked]') &&
        !el.hasAttribute('data-ds-token') &&
        (chainOf(el, sf.root).at(-1) ?? null) === parent,
    );

  // Contours recalculés à chaque image : suivent le zoom, le défilement et
  // les changements de valeur sans observer le DOM des composants.
  const live = useRef({ alt, inside, all, doc });
  live.current = { alt, inside, all, doc };
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const sf = surface();
      if (sf && layer.current) {
        const { alt, inside, all, doc } = live.current;
        const [first, ...rest] = all;
        const el = first && findByKey(sf.root, first.key);
        const box = el ? toLocal(sf, el) : null;
        setSelBox((b) => (same(b, box) ? b : box));
        const boxes = rest
          .map((s) => findByKey(sf.root, s.key))
          .filter((x): x is Element => !!x)
          .map((x) => toLocal(sf, x));
        setOtherBoxes((b) => (sameAll(b, boxes) ? b : boxes));
        let h: Element | null = null;
        if (hoverKey.current) {
          h = findByKey(sf.root, hoverKey.current);
          const s = h && describe(h);
          setHover((v) => {
            if (!h || !s) return null;
            const next = toLocal(sf, h);
            return v && v.s.key === s.key && same(v.box, next)
              ? v
              : { s, box: next };
          });
        }
        // Repères : mesures (Alt) et espacements de l'auto-layout.
        const zoom = zoomOf(sf);
        const scaled = (r: Box): Box => ({
          x: r.x / zoom,
          y: r.y / zoom,
          w: r.w / zoom,
          h: r.h / zoom,
        });
        let guides: Guide[] = [];
        let bands: Band[] = [];
        if (el && box && all.length === 1 && !gesture.current) {
          if (alt) {
            const other =
              h && h !== el && !el.contains(h)
                ? h
                : (chainOf(el, sf.root).at(-1) ?? null);
            if (other)
              guides = measureGuides(scaled(box), scaled(toLocal(sf, other)));
          } else if (inside && doc) {
            const s = select(doc, first.key);
            const axis = flexAxis(s?.resolved.props);
            if (axis) {
              const cs = (
                el.ownerDocument.defaultView ?? window
              ).getComputedStyle(el);
              const pad = {
                top: parseFloat(cs.paddingTop) || 0,
                right: parseFloat(cs.paddingRight) || 0,
                bottom: parseFloat(cs.paddingBottom) || 0,
                left: parseFloat(cs.paddingLeft) || 0,
              };
              const kids = childrenOf(sf, el)
                .filter((k) => {
                  const p = (
                    k.ownerDocument.defaultView ?? window
                  ).getComputedStyle(k).position;
                  return p !== 'absolute';
                })
                .map((k) => scaled(toLocal(sf, k)));
              bands = spacingBands(scaled(box), pad, kids, axis);
            }
          }
        }
        setExtras((x) =>
          JSON.stringify(x) === JSON.stringify({ guides, bands, zoom })
            ? x
            : { guides, bands, zoom },
        );
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [surface]);

  // Alt sans bouger la souris : les repères suivent la touche.
  useEffect(() => {
    const on = (e: KeyboardEvent) => setAlt(e.altKey);
    const off = () => setAlt(false);
    window.addEventListener('keydown', on);
    window.addEventListener('keyup', on);
    window.addEventListener('blur', off);
    return () => {
      window.removeEventListener('keydown', on);
      window.removeEventListener('keyup', on);
      window.removeEventListener('blur', off);
    };
  }, []);

  function at(e: { clientX: number; clientY: number }) {
    const sf = surface();
    if (!sf) return null;
    const p = toDoc(sf, e.clientX, e.clientY);
    const stack = stackAt(sf.root, p.x, p.y);
    const current = selected ? findByKey(sf.root, selected.key) : null;
    return { sf, stack, current, p };
  }

  // Début d'un glissé : déplacer (calques absolus), réordonner (enfant d'un
  // auto-layout) ou tracer un rectangle de sélection (ailleurs).
  function startDrag(
    g: Extract<Gesture, { kind: 'pending' }>,
    shift: boolean,
  ): Gesture | null {
    const sf = surface();
    if (!sf || !doc) return null;
    const keys = new Set(all.map((s) => s.key));
    const grabbed =
      g.on &&
      all.find((s) => {
        const el = findByKey(sf.root, s.key);
        return el && (el === g.on || el.contains(g.on));
      });
    if (grabbed && !shift) {
      const sel = all
        .map((s) => select(doc, s.key))
        .filter((s): s is Selected => !!s);
      if (
        sel.length === keys.size &&
        sel.every((s) => groupAt(s, 'position', null)?.mode === 'absolute')
      )
        return { kind: 'move', x: g.x, y: g.y, doc, keys: [...keys] };
      const s = sel.length === 1 ? sel[0] : null;
      const axis = flexAxis(s?.resolved.parentProps);
      const id = s && !s.key.includes('>') ? realId(doc, s.key) : null;
      const parent = id ? doc.nodes[id]?.parent : null;
      if (s && axis && id && parent && doc.nodes[parent])
        return {
          kind: 'reorder',
          key: id,
          parent,
          children: doc.nodes[parent].children,
          axis,
          wrap: !!s.resolved.parentProps?.layout?.wrap,
          index: null,
        };
      return null;
    }
    // Rectangle : parmi les calques du niveau de celui pressé.
    const r = at({ clientX: g.x, clientY: g.y });
    const el = r && pick(r.stack, r.current, sf.root);
    const container = el ? (chainOf(el, sf.root).at(-1) ?? null) : null;
    return {
      kind: 'marquee',
      x: g.x,
      y: g.y,
      add: shift,
      pool: childrenOf(sf, container),
    };
  }

  function onDrag(e: React.PointerEvent) {
    const g = gesture.current;
    const sf = surface();
    if (!g || !sf) return;
    const zoom = zoomOf(sf);
    if (g.kind === 'marquee') {
      const a = localPoint({ clientX: g.x, clientY: g.y });
      const b = localPoint(e);
      setMarquee(rectFrom(a, b));
      return;
    }
    if (g.kind === 'move') {
      let dx = (e.clientX - g.x) / zoom;
      let dy = (e.clientY - g.y) / zoom;
      // Maj : axe dominant seulement.
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      let d = g.doc;
      const changed = new Map<string, DocNode>();
      for (const key of g.keys) {
        const s = select(d, key);
        if (!s) continue;
        const pos = groupAt(s, 'position', null) ?? {};
        for (const n of setProp(
          d,
          key,
          null,
          'position',
          null,
          moveAbsolute(pos, dx, dy),
        )) {
          changed.set(n.id, n);
          d = { ...d, nodes: { ...d.nodes, [n.id]: n } };
        }
      }
      onNodes([...changed.values()]);
      return;
    }
    if (g.kind === 'resize') {
      const s = select(g.doc, g.key);
      if (!s) return;
      const size = groupAt(s, 'size', null) ?? {};
      const r = resize(
        g.start,
        g.handle,
        (e.clientX - g.x) / zoom,
        (e.clientY - g.y) / zoom,
        e.shiftKey || !!size.lockRatio,
      );
      let d = g.doc;
      const out = new Map<string, DocNode>();
      const write = (nodes: DocNode[]) => {
        for (const n of nodes) {
          out.set(n.id, n);
          d = { ...d, nodes: { ...d.nodes, [n.id]: n } };
        }
      };
      write(setProp(d, g.key, null, 'size', null, sizeAfterResize(size, r)));
      const pos = groupAt(s, 'position', null) ?? {};
      // Poignée gauche ou haute d'un calque absolu ancré en haut à gauche :
      // l'origine suit.
      if (pos.mode === 'absolute' && (r.dx || r.dy)) {
        const dx = (pos.constraintX ?? 'left') === 'left' ? r.dx : 0;
        const dy = (pos.constraintY ?? 'top') === 'top' ? r.dy : 0;
        if (dx || dy)
          write(
            setProp(
              d,
              g.key,
              null,
              'position',
              null,
              moveAbsolute(pos, dx, dy),
            ),
          );
      }
      // Texte : une largeur fixée passe en hauteur auto, une hauteur en fixe.
      if (s.node.type === 'text') {
        const resizeMode = r.height ? 'fixed' : 'auto-height';
        write(setProp(d, g.key, null, 'text', 'resize', resizeMode));
      }
      onNodes([...out.values()]);
      return;
    }
    if (g.kind === 'reorder') {
      const kids = g.children
        .map((id) => ({ id, el: findByKey(sf.root, id) }))
        .filter((k): k is { id: string; el: Element } => {
          if (!k.el) return false;
          const p = (k.el.ownerDocument.defaultView ?? window).getComputedStyle(
            k.el,
          ).position;
          return p !== 'absolute';
        });
      const boxes = kids.map((k) => toLocal(sf, k.el));
      const parentEl = findByKey(sf.root, g.parent);
      const p = localPoint(e);
      const i = reorderIndex(boxes, p, g.axis, g.wrap);
      // Index visible → index dans la liste complète des enfants.
      const index =
        i < kids.length ? g.children.indexOf(kids[i].id) : g.children.length;
      gesture.current = { ...g, index };
      setLine(
        insertionLine(
          boxes,
          i,
          g.axis,
          parentEl ? toLocal(sf, parentEl) : { x: p.x, y: p.y, w: 0, h: 0 },
        ),
      );
    }
  }

  function endDrag(e: React.PointerEvent) {
    const g = gesture.current;
    gesture.current = null;
    setMarquee(null);
    setLine(null);
    if (!g || g.kind === 'pending') return;
    dragged.current = true;
    const sf = surface();
    if (g.kind === 'marquee' && sf) {
      const area = rectFrom(
        localPoint({ clientX: g.x, clientY: g.y }),
        localPoint(e),
      );
      const hits = marqueeHits(
        g.pool.map((el) => ({ item: el, box: toLocal(sf, el) })),
        area,
      );
      onMarquee(
        hits.map(describe).filter((s): s is Selection => !!s),
        g.add,
      );
    }
    if (g.kind === 'move' || g.kind === 'resize') onGestureEnd();
    if (g.kind === 'reorder' && g.index !== null) {
      const from = g.children.indexOf(g.key);
      // Même place : rien à écrire.
      if (g.index !== from && g.index !== from + 1)
        onReorder(g.key, g.parent, g.index);
    }
  }

  const label = (s: Selection) =>
    s.kind === 'instance' ? `${s.name} · instance` : s.name;
  const boxStyle = (b: Box) => ({
    left: b.x,
    top: b.y,
    width: b.w,
    height: b.h,
  });
  const z = extras.zoom;
  const showHandles =
    !!selected &&
    !multi &&
    selected.kind !== 'token' &&
    !editing &&
    !!selBox &&
    !!doc;
  const group = multi && selBox ? union([selBox, ...otherBoxes]) : null;
  return (
    <div
      ref={layer}
      className="edit-overlay"
      data-testid="edit-overlay"
      data-alt={alt || undefined}
      onPointerDown={(e) => {
        if (e.button !== 0 || editing) return;
        dragged.current = false;
        const r = at(e);
        const el =
          r && pick(r.stack, r.current, r.sf.root, e.metaKey || e.ctrlKey);
        gesture.current = {
          kind: 'pending',
          x: e.clientX,
          y: e.clientY,
          on: r?.stack.at(-1) ?? el ?? null,
        };
      }}
      onPointerMove={(e) => {
        setAlt(e.altKey);
        const g = gesture.current;
        if (g?.kind === 'pending' && e.buttons === 1) {
          if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < DRAG) return;
          const next = startDrag(g, e.shiftKey);
          gesture.current = next;
          if (next) e.currentTarget.setPointerCapture(e.pointerId);
          else dragged.current = true;
        }
        if (gesture.current && gesture.current.kind !== 'pending') {
          onDrag(e);
          return;
        }
        const r = at(e);
        const el =
          r && pick(r.stack, r.current, r.sf.root, e.metaKey || e.ctrlKey);
        hoverKey.current = (el && describe(el)?.key) ?? null;
        if (!el) setHover(null);
        const cur = r?.current;
        setInside(!!cur && !!r && r.stack.includes(cur));
      }}
      onPointerUp={(e) => endDrag(e)}
      onPointerCancel={() => {
        gesture.current = null;
        setMarquee(null);
        setLine(null);
      }}
      onPointerLeave={() => {
        hoverKey.current = null;
        setHover(null);
        setInside(false);
      }}
      onClick={(e) => {
        if (dragged.current) {
          dragged.current = false;
          return;
        }
        const r = at(e);
        if (!r) return;
        const el = pick(r.stack, r.current, r.sf.root, e.metaKey || e.ctrlKey);
        setEditing(null);
        const s = el ? describe(el) : null;
        if (e.shiftKey && s) onToggle(s);
        else if (!e.shiftKey) onSelect(s);
      }}
      onDoubleClick={(e) => {
        const r = at(e);
        if (!r || !selected || multi) return;
        const i = r.current ? r.stack.indexOf(r.current) : -1;
        // Élément à libellé (texte, bouton) : édition en place ; sinon on
        // descend d'un niveau.
        if (i >= 0 && canEditText(selected)) setEditing(selected.key);
        else if (i >= 0 && r.stack[i + 1]) onSelect(describe(r.stack[i + 1]));
      }}
    >
      {hover &&
        !all.some((s) => s.key === hover.s.key) &&
        !editing &&
        !gesture.current && (
          <div className="edit-box hover" style={boxStyle(hover.box)}>
            <span className="edit-label">{label(hover.s)}</span>
          </div>
        )}
      {extras.bands.map((b, i) => (
        <div
          key={`b${i}`}
          className={`edit-band ${b.kind}`}
          data-testid="edit-band"
          style={boxStyle({ x: b.x * z, y: b.y * z, w: b.w * z, h: b.h * z })}
        >
          <span>{b.value}</span>
        </div>
      ))}
      {extras.guides.map((g, i) => {
        const horizontal = g.y1 === g.y2;
        return (
          <div
            key={`g${i}`}
            className="edit-guide"
            data-testid="edit-guide"
            data-dir={horizontal ? 'h' : 'v'}
            style={{
              left: Math.min(g.x1, g.x2) * z,
              top: Math.min(g.y1, g.y2) * z,
              width: horizontal ? Math.abs(g.x2 - g.x1) * z : 0,
              height: horizontal ? 0 : Math.abs(g.y2 - g.y1) * z,
            }}
          >
            <span>{g.value}</span>
          </div>
        );
      })}
      {otherBoxes.map((b, i) => (
        <div
          key={`o${i}`}
          className="edit-box selected"
          data-testid="edit-selection-extra"
          style={boxStyle(b)}
        />
      ))}
      {group && (
        <div className="edit-box group" style={boxStyle(group)}>
          <span className="edit-label">{all.length} calques</span>
        </div>
      )}
      {selected && selBox && (
        <div
          className="edit-box selected"
          data-testid="edit-selection"
          style={boxStyle(selBox)}
        >
          {!multi && <span className="edit-label">{label(selected)}</span>}
          {showHandles &&
            HANDLES.map((h) => (
              <span
                key={h}
                className="edit-handle"
                data-handle={h}
                aria-hidden="true"
                onPointerDown={(e) => {
                  if (e.button !== 0 || !doc) return;
                  e.stopPropagation();
                  layer.current?.setPointerCapture(e.pointerId);
                  const sf = surface();
                  const zoom = sf ? zoomOf(sf) : 1;
                  gesture.current = {
                    kind: 'resize',
                    x: e.clientX,
                    y: e.clientY,
                    doc,
                    key: selected.key,
                    handle: h,
                    start: { w: selBox.w / zoom, h: selBox.h / zoom },
                  };
                }}
              />
            ))}
          {editing === selected.key && (
            <input
              className="edit-text"
              aria-label={`Texte de ${selected.name}`}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              defaultValue={selected.text ?? ''}
              maxLength={200}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  cancelText.current = true;
                  e.currentTarget.blur();
                }
              }}
              onBlur={(e) => {
                if (!cancelText.current && e.target.value !== selected.text)
                  onText(selected, e.target.value);
                cancelText.current = false;
                setEditing(null);
              }}
            />
          )}
        </div>
      )}
      {marquee && (
        <div
          className="edit-marquee"
          data-testid="edit-marquee"
          style={boxStyle(marquee)}
        />
      )}
      {line && (
        <div
          className="edit-insert"
          data-testid="edit-insert"
          style={{
            left: Math.min(line.x1, line.x2) - 1,
            top: Math.min(line.y1, line.y2) - 1,
            width: Math.max(2, Math.abs(line.x2 - line.x1)),
            height: Math.max(2, Math.abs(line.y2 - line.y1)),
          }}
        />
      )}
    </div>
  );
}
