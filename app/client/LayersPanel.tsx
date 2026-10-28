import { useMemo, useState, type ReactNode } from 'react';
import {
  CaretDown,
  CaretRight,
  Copy,
  Cube,
  Diamond,
  Eye,
  EyeSlash,
  Hash,
  Image as ImageIcon,
  LinkBreak,
  Lock,
  LockOpen,
  PenNib,
  Plus,
  Rectangle,
  Rows,
  SelectionAll,
  StackPlus,
  SquaresFour,
  Textbox,
  TextT,
  Trash,
  Browser,
} from '@phosphor-icons/react';
import type { Doc } from '../shared/doc.js';
import { screenSlug } from '../shared/doc.js';
import { renderTree, type RNode } from '../shared/render.js';

// Panneau Calques : arbre rendu de la racine courante (page des composants
// ou écran), synchronisé avec la sélection du canevas. Glisser-déposer,
// renommage, visibilité et verrouillage ne portent que sur les nœuds réels ;
// le contenu d'une instance se règle dans l'inspecteur.
export type LayerAction =
  | { type: 'select'; key: string; add?: boolean }
  | { type: 'rename'; key: string; name: string }
  | { type: 'toggle'; key: string; field: 'visible' | 'locked' }
  | {
      type: 'move';
      key: string;
      target: string;
      where: 'before' | 'after' | 'inside';
    }
  | {
      type: 'insert';
      kind: 'frame' | 'text' | 'rect' | 'image' | 'instance';
      component?: string;
    }
  | {
      type: 'command';
      name:
        | 'duplicate'
        | 'delete'
        | 'group'
        | 'auto-layout'
        | 'component'
        | 'detach'
        | 'variant';
    };
export type ScreenAction =
  | { type: 'open'; id: string }
  | { type: 'create' }
  | { type: 'duplicate'; id: string }
  | { type: 'delete'; id: string }
  | { type: 'rename'; id: string; name: string };

const ICON: Record<string, ReactNode> = {
  frame: <Hash />,
  text: <TextT />,
  rect: <Rectangle />,
  image: <ImageIcon />,
  vector: <PenNib />,
  field: <Textbox />,
  component: <Cube />,
  'component-set': <SquaresFour />,
  instance: <Diamond />,
  page: <Browser />,
};
const CONTAINERS = ['frame', 'component', 'component-set', 'page'];

export function LayersPanel({
  doc,
  root,
  selected,
  extra = [],
  onLayer,
  screens,
  onScreen,
}: {
  doc: Doc;
  root: string;
  selected: string | null;
  /** Autres calques de la multi-sélection. */
  extra?: string[];
  onLayer: (a: LayerAction) => void;
  /** Écrans (vue Aperçu seulement). */
  screens?: { current: string };
  onScreen: (a: ScreenAction) => void;
}) {
  const tree = useMemo(() => renderTree(doc, root), [doc, root]);
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{
    key: string;
    where: 'before' | 'after' | 'inside';
  } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const components = Object.values(doc.nodes).filter(
    (n) => n.type === 'component',
  );
  // Ancêtres de la sélection : toujours dépliés.
  const open = (key: string) =>
    !closed.has(key) || (!!selected && selected.startsWith(`${key}>`));

  const row = (r: RNode, depth: number) => {
    const real = !r.key.includes('>');
    const isRoot = r.key === root;
    const kids = r.children;
    const expanded = open(r.key);
    const hidden = r.props.layer?.visible === false;
    const locked = !!r.props.layer?.locked;
    const can = (where: 'before' | 'after' | 'inside') =>
      drag &&
      drag !== r.key &&
      real &&
      !(where !== 'inside' && isRoot) &&
      !(where === 'inside' && !CONTAINERS.includes(r.type));
    return (
      <li key={r.key} role="none">
        <div
          role="treeitem"
          aria-level={depth + 1}
          aria-selected={selected === r.key || extra.includes(r.key)}
          aria-expanded={kids.length ? expanded : undefined}
          aria-label={r.name}
          className="layer-row"
          data-key={r.key}
          data-over={over?.key === r.key ? over.where : undefined}
          data-hidden={hidden || undefined}
          style={{ paddingLeft: 6 + depth * 14 }}
          draggable={real && !isRoot && editing !== r.key}
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', r.key);
            e.dataTransfer.effectAllowed = 'move';
            setDrag(r.key);
          }}
          onDragEnd={() => {
            setDrag(null);
            setOver(null);
          }}
          onDragOver={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const y = (e.clientY - box.top) / box.height;
            const where = y < 0.3 ? 'before' : y > 0.7 ? 'after' : 'inside';
            const pick = can(where) ? where : can('inside') ? 'inside' : null;
            if (!pick) return;
            e.preventDefault();
            setOver({ key: r.key, where: pick });
          }}
          onDragLeave={() => setOver((o) => (o?.key === r.key ? null : o))}
          onDrop={(e) => {
            e.preventDefault();
            const key = e.dataTransfer.getData('text/plain') || drag;
            if (key && over)
              onLayer({ type: 'move', key, target: r.key, where: over.where });
            setDrag(null);
            setOver(null);
          }}
          onClick={(e) =>
            onLayer({
              type: 'select',
              key: r.key,
              add: e.shiftKey || e.metaKey || e.ctrlKey,
            })
          }
          onDoubleClick={() => real && setEditing(r.key)}
        >
          {kids.length ? (
            <button
              type="button"
              className="layer-twisty"
              aria-label={expanded ? `Replier ${r.name}` : `Déplier ${r.name}`}
              onClick={(e) => {
                e.stopPropagation();
                setClosed((c) => {
                  const next = new Set(c);
                  if (expanded) next.add(r.key);
                  else next.delete(r.key);
                  return next;
                });
              }}
            >
              {expanded ? <CaretDown size={12} /> : <CaretRight size={12} />}
            </button>
          ) : (
            <span className="layer-twisty" />
          )}
          <span className={`layer-icon t-${r.type}`} aria-hidden="true">
            {ICON[r.type]}
          </span>
          {editing === r.key ? (
            <input
              className="layer-name-input"
              aria-label={`Renommer ${r.name}`}
              autoFocus
              defaultValue={r.name}
              maxLength={120}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') setEditing(null);
              }}
              onBlur={(e) => {
                if (
                  editing &&
                  e.target.value.trim() &&
                  e.target.value !== r.name
                )
                  onLayer({
                    type: 'rename',
                    key: r.key,
                    name: e.target.value.trim(),
                  });
                setEditing(null);
              }}
            />
          ) : (
            <span className="layer-name">{r.name}</span>
          )}
          {real && !isRoot && (
            <span className="layer-tools">
              <button
                type="button"
                aria-label={`${hidden ? 'Afficher' : 'Masquer'} ${r.name}`}
                aria-pressed={hidden}
                onClick={(e) => {
                  e.stopPropagation();
                  onLayer({ type: 'toggle', key: r.key, field: 'visible' });
                }}
              >
                {hidden ? <EyeSlash /> : <Eye />}
              </button>
              <button
                type="button"
                aria-label={`${locked ? 'Déverrouiller' : 'Verrouiller'} ${r.name}`}
                aria-pressed={locked}
                onClick={(e) => {
                  e.stopPropagation();
                  onLayer({ type: 'toggle', key: r.key, field: 'locked' });
                }}
              >
                {locked ? <Lock /> : <LockOpen />}
              </button>
            </span>
          )}
        </div>
        {kids.length > 0 && expanded && (
          <ul role="group">{kids.map((c) => row(c, depth + 1))}</ul>
        )}
      </li>
    );
  };

  return (
    <aside className="layers" aria-label="Calques">
      {screens && (
        <section className="layers-screens" aria-label="Écrans">
          <div className="layers-head">
            <h3>Écrans</h3>
            <button
              type="button"
              aria-label="Nouvel écran"
              title="Nouvel écran"
              onClick={() => onScreen({ type: 'create' })}
            >
              <Plus />
            </button>
          </div>
          <ul>
            {doc.screens.map((id) => (
              <li key={id}>
                {renaming === id ? (
                  <input
                    aria-label={`Renommer l’écran ${doc.nodes[id]?.name}`}
                    autoFocus
                    defaultValue={doc.nodes[id]?.name}
                    maxLength={120}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') e.currentTarget.blur();
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    onBlur={(e) => {
                      if (e.target.value.trim())
                        onScreen({
                          type: 'rename',
                          id,
                          name: e.target.value.trim(),
                        });
                      setRenaming(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="screen-row"
                    aria-current={
                      screenSlug(id) === screens.current ? 'page' : undefined
                    }
                    onClick={() => onScreen({ type: 'open', id })}
                    onDoubleClick={() => setRenaming(id)}
                  >
                    {doc.nodes[id]?.name ?? id}
                  </button>
                )}
                <span className="layer-tools">
                  <button
                    type="button"
                    aria-label={`Dupliquer l’écran ${doc.nodes[id]?.name}`}
                    onClick={() => onScreen({ type: 'duplicate', id })}
                  >
                    <Copy />
                  </button>
                  <button
                    type="button"
                    aria-label={`Supprimer l’écran ${doc.nodes[id]?.name}`}
                    disabled={doc.screens.length <= 1}
                    onClick={() => onScreen({ type: 'delete', id })}
                  >
                    <Trash />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="layers-head">
        <h3>Calques</h3>
      </div>
      <div className="layers-toolbar" role="toolbar" aria-label="Insérer">
        <button
          type="button"
          title="Cadre (F)"
          aria-label="Insérer un cadre"
          onClick={() => onLayer({ type: 'insert', kind: 'frame' })}
        >
          <Hash />
        </button>
        <button
          type="button"
          title="Texte (T)"
          aria-label="Insérer un texte"
          onClick={() => onLayer({ type: 'insert', kind: 'text' })}
        >
          <TextT />
        </button>
        <button
          type="button"
          title="Rectangle (R)"
          aria-label="Insérer un rectangle"
          onClick={() => onLayer({ type: 'insert', kind: 'rect' })}
        >
          <Rectangle />
        </button>
        <button
          type="button"
          title="Image"
          aria-label="Insérer une image"
          onClick={() => onLayer({ type: 'insert', kind: 'image' })}
        >
          <ImageIcon />
        </button>
        <select
          aria-label="Insérer une instance"
          value=""
          onChange={(e) =>
            e.target.value &&
            onLayer({
              type: 'insert',
              kind: 'instance',
              component: e.target.value,
            })
          }
        >
          <option value="">Instance…</option>
          {components.map((c) => {
            const set = c.parent ? doc.nodes[c.parent] : undefined;
            const label =
              set?.type === 'component-set'
                ? `${set.name} · ${Object.values(c.variant ?? {}).join(', ')}`
                : c.name;
            return (
              <option key={c.id} value={c.id}>
                {label}
              </option>
            );
          })}
        </select>
      </div>
      <div className="layers-toolbar" role="toolbar" aria-label="Structure">
        {(
          [
            ['duplicate', 'Dupliquer (Cmd+D)', <Copy />],
            ['delete', 'Supprimer (Suppr)', <Trash />],
            ['group', 'Grouper (Cmd+G)', <SelectionAll />],
            ['auto-layout', 'Auto-layout (Maj+A)', <Rows />],
            ['component', 'Créer un composant (Cmd+Alt+K)', <Cube />],
            ['variant', 'Ajouter une variante', <StackPlus />],
            ['detach', 'Détacher l’instance', <LinkBreak />],
          ] as const
        ).map(([name, label, icon]) => (
          <button
            key={name}
            type="button"
            title={label}
            aria-label={label.replace(/ \(.*\)$/, '')}
            disabled={!selected}
            onClick={() => onLayer({ type: 'command', name })}
          >
            {icon}
          </button>
        ))}
      </div>
      {tree && (
        <ul className="layers-tree" role="tree" aria-label="Arbre des calques">
          {row(tree, 0)}
        </ul>
      )}
    </aside>
  );
}
