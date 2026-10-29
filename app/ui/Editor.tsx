import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  CaretRight,
  Copy,
  Cube,
  DesktopTower,
  DeviceMobile,
  DeviceTablet,
  ImageSquare,
  Square,
  TextT,
  Trash,
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
import type {
  Breakpoint,
  FoundationKind,
  Node,
  Project,
  Style,
} from '../shared/project.js';
import { foundationVars, Render, resolve, type Theme } from './render.js';

// Éditeur d'éléments, commun aux pages et aux composants : canevas au centre,
// structure à gauche, paramètres à droite.

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
  text: 'Texte',
  image: 'Image',
  component: 'Composant',
  list: 'Liste',
};
const kindIcons = {
  box: Square,
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

export type EditorProps = {
  project: Project;
  root: Node;
  onRoot: (root: Node) => void;
  sel: string | null;
  onSelect: (id: string | null) => void;
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

export function Canvas(
  props: EditorProps & {
    bp: Breakpoint;
    theme: Theme;
    base: string;
    patches?: Record<string, Style>;
  },
) {
  const frame = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const width = formats.find((f) => f.bp === props.bp)!.width;
  // Le format entier tient dans la largeur du canevas.
  useLayoutEffect(() => {
    const el = frame.current!;
    const fit = () => setZoom(Math.min(1, (el.clientWidth - 64) / width));
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  useDeleteKeys(props);
  return (
    <div
      className="stage"
      ref={frame}
      onClick={(e) => {
        const hit = (e.target as HTMLElement).closest('[data-node]');
        const id = hit?.getAttribute('data-node') ?? null;
        props.onSelect(id);
      }}
    >
      <div
        className="artboard"
        data-format={props.bp}
        style={{
          width,
          zoom,
          ...foundationVars(props.project.foundations, props.theme),
        }}
      >
        <Render
          node={props.root}
          ctx={{
            project: props.project,
            bp: props.bp,
            base: props.base,
            patches: props.patches,
          }}
        />
      </div>
      {props.sel && (
        <style>{`.artboard [data-node="${CSS.escape(props.sel)}"]{outline:2px solid var(--ui-focus);outline-offset:-1px}`}</style>
      )}
    </div>
  );
}

// Supprimer et dupliquer au clavier, hors des champs de saisie.
function useDeleteKeys({ root, onRoot, sel, onSelect }: EditorProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (
        !sel ||
        sel === root.id ||
        t.closest('input, textarea, select, [contenteditable]')
      )
        return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onRoot(remove(root, sel));
        onSelect(null);
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

export function Structure(props: EditorProps) {
  const { project, root, sel } = props;
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<Place | null>(null);
  const [closed, setClosed] = useState<Set<string>>(new Set());

  function add(kind: Node['kind'], component?: string) {
    const id = newId(root, kind);
    const node: Node =
      kind === 'box'
        ? {
            id,
            kind,
            style: { desktop: { direction: 'column' } },
            children: [],
          }
        : kind === 'text'
          ? { id, kind, text: 'Texte' }
          : kind === 'component'
            ? { id, kind, component }
            : { id, kind };
    props.onRoot(insert(root, node, placeFor(root, sel)));
    props.onSelect(id);
  }
  // Moitié haute : avant ; moitié basse : après ; milieu d'un bloc : dedans.
  function where(e: React.DragEvent, n: Node): Place {
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    if (canHold(n) && y > 0.25 && y < 0.75)
      return { target: n.id, where: 'inside' };
    return { target: n.id, where: y < 0.5 ? 'before' : 'after' };
  }
  const components = Object.entries(project.components);

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
            setDrag(null);
            setDrop(null);
          }}
          onDragEnd={() => {
            setDrag(null);
            setDrop(null);
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
      <div className="group-head">
        <h3>Structure</h3>
        <div className="row">
          <button
            className="icon-btn"
            aria-label="Ajouter Bloc"
            onClick={() => add('box')}
          >
            <Square />
          </button>
          <button
            className="icon-btn"
            aria-label="Ajouter Texte"
            onClick={() => add('text')}
          >
            <TextT />
          </button>
          <button
            className="icon-btn"
            aria-label="Ajouter Image"
            onClick={() => add('image')}
          >
            <ImageSquare />
          </button>
        </div>
      </div>
      {components.length > 0 && (
        <select
          aria-label="Ajouter Composant"
          value=""
          onChange={(e) => add('component', e.target.value)}
        >
          <option value="" disabled>
            Composant
          </option>
          {components.map(([id, c]) => (
            <option key={id} value={id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <ul
        className="tree"
        onDragOver={(e) => drag && e.preventDefault()}
        onDrop={() => {
          if (drag)
            props.onRoot(
              move(root, drag, { target: root.id, where: 'inside' }),
            );
          setDrag(null);
          setDrop(null);
        }}
      >
        {row(root, 0)}
      </ul>
    </section>
  );
}

// --- Paramètres d'un élément ---

const align = [
  ['start', 'Début'],
  ['center', 'Centre'],
  ['end', 'Fin'],
  ['stretch', 'Étirer'],
] as const;
const justify = [
  ['start', 'Début'],
  ['center', 'Centre'],
  ['end', 'Fin'],
  ['between', 'Réparti'],
] as const;

export function ElementSettings(
  props: EditorProps & {
    bp: Breakpoint;
    base: string;
    /** Style propre à l'élément pour le format ou l'état en cours. */
    own: (id: string) => Style | undefined;
    onStyle: (
      id: string,
      key: keyof Style,
      value: Style[keyof Style] | undefined,
    ) => void;
    /** Masqué en cours d'édition d'un état : seul le style change. */
    stateOnly?: boolean;
    header?: React.ReactNode;
  },
) {
  const { project, root, sel, bp } = props;
  const hit = sel ? find(root, sel) : null;
  if (!hit) return null;
  const node = hit.node;
  const own = props.own(node.id) ?? {};
  const eff = { ...resolve(node, bp), ...own };
  const f = project.foundations;
  const setNode = (patch: Partial<Node>) =>
    props.onRoot(update(root, node.id, (n) => ({ ...n, ...patch })));
  const box = canHold(node);

  // Un point marque une valeur propre au format (hors bureau) ; il la retire.
  const field = (key: keyof Style, text: string, control: React.ReactNode) => (
    <div className="field" key={key}>
      <span className="field-label">
        {text}
        {(bp !== 'desktop' || props.stateOnly) && own[key] !== undefined && (
          <button
            className="override"
            aria-label={`Rétablir ${text}`}
            onClick={() => props.onStyle(node.id, key, undefined)}
          />
        )}
      </span>
      {control}
    </div>
  );
  const token = (key: keyof Style, text: string, kind: FoundationKind) =>
    field(
      key,
      text,
      <select
        aria-label={text}
        value={(eff[key] as string) ?? ''}
        onChange={(e) =>
          props.onStyle(node.id, key, e.target.value || undefined)
        }
      >
        <option value="">—</option>
        {Object.entries(f[kind]).map(([id, t]) => (
          <option key={id} value={id}>
            {t.name}
          </option>
        ))}
      </select>,
    );
  const choice = (
    key: keyof Style,
    text: string,
    options: readonly (readonly [string, string])[],
  ) =>
    field(
      key,
      text,
      <select
        aria-label={text}
        value={(eff[key] as string) ?? ''}
        onChange={(e) =>
          props.onStyle(node.id, key, (e.target.value || undefined) as never)
        }
      >
        <option value="">—</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>,
    );

  return (
    <>
      <div className="panel-head">
        <h2>{label(node, project)}</h2>
        {!props.stateOnly && hit.parent && (
          <div className="row">
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
                props.onSelect(null);
              }}
            >
              <Trash />
            </button>
          </div>
        )}
      </div>
      {props.header}
      {!props.stateOnly && (
        <section className="group">
          <h3>Contenu</h3>
          <label className="field">
            Nom
            <input
              key={node.id + (node.name ?? '')}
              defaultValue={node.name ?? ''}
              placeholder={label({ ...node, name: undefined }, project)}
              onBlur={(e) =>
                setNode({ name: e.currentTarget.value.trim() || undefined })
              }
            />
          </label>
          {node.kind === 'text' && (
            <label className="field">
              Texte
              <textarea
                rows={3}
                value={node.text ?? ''}
                onChange={(e) => setNode({ text: e.target.value })}
              />
            </label>
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
            <label className="field">
              Composant
              <select
                value={node.component}
                onChange={(e) => setNode({ component: e.target.value })}
              >
                {Object.entries(project.components).map(([id, c]) => (
                  <option key={id} value={id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>
      )}
      {box && (
        <section className="group">
          <h3>Disposition</h3>
          {choice('direction', 'Direction', [
            ['column', 'Colonne'],
            ['row', 'Ligne'],
          ])}
          {token('gap', 'Écart', 'spacing')}
          {choice('align', 'Aligner', align)}
          {choice('justify', 'Répartir', justify)}
          {token('padding', 'Marge', 'spacing')}
        </section>
      )}
      <section className="group">
        <h3>Taille</h3>
        {choice('width', 'Largeur', [
          ['hug', 'Ajustée'],
          ['fill', 'Remplir'],
        ])}
        {token('maxWidth', 'Largeur max', 'spacing')}
        {field(
          'hidden',
          'Masquer',
          <input
            type="checkbox"
            aria-label="Masquer"
            checked={!!eff.hidden}
            onChange={(e) =>
              props.onStyle(node.id, 'hidden', e.target.checked || undefined)
            }
          />,
        )}
      </section>
      <section className="group">
        <h3>Style</h3>
        {(node.kind === 'text' || box) && token('font', 'Typo', 'fonts')}
        {(node.kind === 'text' || box) && token('color', 'Couleur', 'colors')}
        {node.kind !== 'text' && token('background', 'Fond', 'colors')}
        {node.kind !== 'text' && token('border', 'Bordure', 'colors')}
        {node.kind !== 'text' && token('radius', 'Arrondi', 'radius')}
        {node.kind !== 'text' && token('shadow', 'Ombre', 'shadows')}
      </section>
    </>
  );
}

/** Écrit une valeur de style pour un format ; une valeur vide est retirée. */
export function setStyle(
  root: Node,
  id: string,
  bp: Breakpoint,
  key: keyof Style,
  value: unknown,
) {
  return update(root, id, (n) => {
    const at = { ...n.style?.[bp], [key]: value };
    if (value === undefined) delete at[key];
    return { ...n, style: { ...n.style, [bp]: at } };
  });
}
