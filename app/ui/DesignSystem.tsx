import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CaretRight,
  FigmaLogo,
  PencilSimple,
  Plus,
  Trash,
} from '@phosphor-icons/react';
import type { Breakpoint } from '../shared/project.js';
import {
  label,
  AddMenu,
  Canvas,
  ElementSettings,
  FormatSwitch,
  setStyles,
  Structure,
  type EditorProps,
} from './Editor.js';
import { find } from '../shared/nodes.js';
import { split, target } from '../shared/instances.js';
import type { Scope } from '../shared/api.js';
import { createComponent, renameComponent, type Update } from './components.js';
import { contains, flatten, tree, type Folder } from '../shared/folders.js';
import {
  componentStates,
  references,
  slug,
  type FoundationKind,
  type Foundations,
  type Project,
} from '../shared/project.js';
import { foundationVars, Render, type Theme } from './render.js';

// Module Design system : liste à gauche, planche au centre, réglages à droite.

export type DSKind = FoundationKind | 'components';
export type DSSelection = { kind: DSKind; id: string } | null;
export type CompState = (typeof componentStates)[number] | 'default';

const groups: { kind: DSKind; label: string }[] = [
  { kind: 'colors', label: 'Couleurs' },
  { kind: 'fonts', label: 'Typographie' },
  { kind: 'spacing', label: 'Espacements' },
  { kind: 'radius', label: 'Arrondis' },
  { kind: 'shadows', label: 'Ombres' },
  { kind: 'components', label: 'Composants' },
];
const stateLabels: Record<CompState, string> = {
  default: 'Par défaut',
  hover: 'Survol',
  active: 'Actif',
  disabled: 'Désactivé',
};

// Valeurs de départ d'une fondation ajoutée à la main.
function blank(kind: FoundationKind, f: Foundations, name: string) {
  if (kind === 'colors') return { name, light: '#000000', dark: '#ffffff' };
  if (kind === 'fonts')
    return { name, family: 'Geist', size: 16, weight: 400, lineHeight: 1.5 };
  if (kind === 'shadows')
    return { name, x: 0, y: 4, blur: 12, color: Object.keys(f.colors)[0] };
  return { name, value: 8 };
}
const entries = (p: Project, kind: DSKind) =>
  Object.entries(kind === 'components' ? p.components : p.foundations[kind]);
export const isEmpty = (p: Project) =>
  groups.every((g) => entries(p, g.kind).length === 0);

type Props = {
  project: Project;
  sel: DSSelection;
  onSelect: (s: DSSelection) => void;
  onSave: (p: Project) => void;
};

export function DesignNav(
  props: Props & { onFigma: () => void; onAddComponent: () => void },
) {
  const { project } = props;
  const [renaming, setRenaming] = useState<string | null>(null);
  function add(kind: FoundationKind, label: string) {
    const f = project.foundations;
    const name = `${label} ${Object.keys(f[kind]).length + 1}`;
    const id = slug(name, f[kind]);
    props.onSave({
      ...project,
      foundations: {
        ...f,
        [kind]: { ...f[kind], [id]: blank(kind, f, name) },
      },
    });
    props.onSelect({ kind, id });
  }
  return (
    <aside className="panel left">
      <div className="panel-head">
        <h2>Design system</h2>
        <button className="ghost" onClick={props.onFigma}>
          <FigmaLogo /> {project.figma ? 'Réimporter' : 'Importer'}
        </button>
      </div>
      {groups.map(({ kind, label }) => (
        <section key={kind} className="group">
          <div className="group-head">
            <h3>{label}</h3>
            <button
              className="icon-btn"
              aria-label={`Ajouter ${label}`}
              disabled={
                kind === 'shadows' && !entries(project, 'colors').length
              }
              onClick={() =>
                kind === 'components'
                  ? props.onAddComponent()
                  : add(kind, label)
              }
            >
              <Plus />
            </button>
          </div>
          <NavFolder
            folder={tree(entries(project, kind))}
            kind={kind}
            {...props}
            renaming={renaming}
            onRename={setRenaming}
          />
        </section>
      ))}
    </aside>
  );
}

// Sous-dossiers d'abord, puis les éléments. Un dossier s'ouvre de lui-même
// quand il contient l'élément sélectionné.
function NavFolder(
  props: Props & {
    folder: Folder;
    kind: DSKind;
    renaming: string | null;
    onRename: (key: string | null) => void;
  },
) {
  const { folder, kind, sel, project } = props;
  return (
    <>
      {folder.folders.map((sub) => (
        <details
          key={sub.path}
          className="folder"
          open={(sel?.kind === kind && contains(sub, sel.id)) || undefined}
        >
          <summary className="item">
            <CaretRight className="caret" /> {sub.name}
          </summary>
          <div className="folder-body">
            <NavFolder {...props} folder={sub} />
          </div>
        </details>
      ))}
      {folder.leaves.map(([id, label]) =>
        props.renaming === `${kind}:${id}` ? (
          <input
            key={id}
            className="name-input"
            aria-label="Nom"
            autoFocus
            defaultValue={
              entries(project, kind).find(([k]) => k === id)?.[1].name
            }
            onBlur={(e) => {
              const name = e.currentTarget.value.trim();
              props.onRename(null);
              if (!name) return;
              props.onSave(
                kind === 'components'
                  ? renameComponent(project, id, name)
                  : {
                      ...project,
                      foundations: {
                        ...project.foundations,
                        [kind]: {
                          ...project.foundations[kind],
                          [id]: { ...project.foundations[kind][id], name },
                        },
                      },
                    },
              );
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') props.onRename(null);
            }}
          />
        ) : (
          <button
            key={id}
            className="ghost item"
            aria-current={
              sel?.kind === kind && sel.id === id ? 'true' : undefined
            }
            onClick={() => props.onSelect({ kind, id })}
            onDoubleClick={() => props.onRename(`${kind}:${id}`)}
          >
            {kind === 'colors' && (
              <span
                className="dot"
                style={{ background: project.foundations.colors[id]?.light }}
              />
            )}
            {label}
          </button>
        ),
      )}
    </>
  );
}

// Import Figma : un lien, rien d'autre. Sans connexion, un seul bouton.
export function FigmaDialog(props: {
  ref: React.Ref<HTMLDialogElement>;
  project: Project;
  onSubmit: (url: string) => void;
}) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [waiting, setWaiting] = useState(false);
  const check = () => void window.studio.figmaConnected().then(setConnected);
  useEffect(check, []);
  const key = props.project.figma?.fileKey;
  const close = (e: React.MouseEvent<HTMLElement>) =>
    e.currentTarget.closest('dialog')?.close();
  return (
    <dialog
      ref={props.ref}
      className="dialog"
      onToggle={(e) => e.newState === 'open' && check()}
    >
      {connected === false ? (
        <div className="dialog-body">
          <h2>Figma</h2>
          <div className="row end">
            <button type="button" className="ghost" onClick={close}>
              Annuler
            </button>
            <button
              className="studio-primary"
              disabled={waiting}
              onClick={async () => {
                setWaiting(true);
                setConnected(await window.studio.figmaConnect());
                setWaiting(false);
              }}
            >
              <FigmaLogo /> {waiting ? 'En attente' : 'Connecter Figma'}
            </button>
          </div>
        </div>
      ) : (
        <form
          className="dialog-body"
          onSubmit={(e) => {
            e.preventDefault();
            const url = (
              new FormData(e.currentTarget).get('url') as string
            ).trim();
            if (!url) return;
            e.currentTarget.closest('dialog')?.close();
            props.onSubmit(url);
          }}
        >
          <h2>Figma</h2>
          <label className="field">
            Lien Figma
            <input
              name="url"
              defaultValue={key && `https://www.figma.com/design/${key}`}
            />
          </label>
          <div className="row end">
            <button type="button" className="ghost" onClick={close}>
              Annuler
            </button>
            <button className="studio-primary">Importer</button>
          </div>
        </form>
      )}
    </dialog>
  );
}

export function DesignBoard(
  props: Props & { theme: Theme; state: CompState; onImport: () => void },
) {
  const { project, sel } = props;
  const f = project.foundations;
  if (isEmpty(project))
    return (
      <div className="board empty">
        <button onClick={props.onImport}>
          <FigmaLogo /> Importer de Figma
        </button>
      </div>
    );
  const pick = (kind: DSKind, id: string) => ({
    'aria-current':
      sel?.kind === kind && sel.id === id ? ('true' as const) : undefined,
    onClick: () => props.onSelect({ kind, id }),
  });
  const ctx = { project, bp: 'desktop' as const };
  return (
    <div
      className="board"
      style={foundationVars(f, props.theme)}
      data-theme={props.theme}
    >
      {groups.map(({ kind, label }) =>
        entries(project, kind).length ? (
          <section key={kind} className="board-group">
            <h3>{label}</h3>
            {flatten(tree(entries(project, kind)))
              .filter((folder) => folder.leaves.length)
              .map((folder) => (
                <div key={folder.path} className="board-folder">
                  {folder.path && <h4>{folder.path.replaceAll('/', ' / ')}</h4>}
                  <div className={`board-items ${kind}`}>
                    {folder.leaves.map(([id, label]) =>
                      kind === 'components' ? (
                        <button
                          key={id}
                          className="board-item"
                          {...pick(kind, id)}
                        >
                          <Render
                            node={project.components[id].root}
                            ctx={{
                              ...ctx,
                              patches:
                                sel?.id === id && props.state !== 'default'
                                  ? project.components[id].states[props.state]
                                  : undefined,
                            }}
                          />
                          <span className="board-label">{label}</span>
                        </button>
                      ) : (
                        <button
                          key={id}
                          className="board-item"
                          {...pick(kind, id)}
                        >
                          <Sample kind={kind} id={id} />
                          <span className="board-label">{label}</span>
                        </button>
                      ),
                    )}
                  </div>
                </div>
              ))}
          </section>
        ) : null,
      )}
    </div>
  );
}

function Sample({ kind, id }: { kind: FoundationKind; id: string }) {
  if (kind === 'colors')
    return <span className="swatch" style={{ background: `var(--c-${id})` }} />;
  if (kind === 'fonts')
    return <span style={{ font: `var(--f-${id})` }}>Aa</span>;
  if (kind === 'spacing')
    return <span className="bar" style={{ width: `var(--s-${id})` }} />;
  if (kind === 'radius')
    return (
      <span className="corner" style={{ borderRadius: `var(--r-${id})` }} />
    );
  return <span className="lift" style={{ boxShadow: `var(--sh-${id})` }} />;
}

export function DesignSettings(
  props: Props & {
    state: CompState;
    onState: (s: CompState) => void;
    onEdit: (id: string) => void;
  },
) {
  const { project, sel } = props;
  if (!sel) return <aside className="panel right" aria-label="Paramètres" />;
  const f = project.foundations;
  const used = references(project).has(`${sel.kind}:${sel.id}`);

  if (sel.kind === 'components') {
    const c = project.components[sel.id];
    if (!c) return <aside className="panel right" />;
    const set = (next: typeof c | null) => {
      const { [sel.id]: _, ...rest } = project.components;
      props.onSave({
        ...project,
        components: next ? { ...rest, [sel.id]: next } : rest,
      });
      if (!next) props.onSelect(null);
    };
    return (
      <aside className="panel right" aria-label="Paramètres">
        <Text
          label="Nom"
          value={c.name}
          onChange={(name) => set({ ...c, name })}
        />
        <StateSelect
          value={props.state}
          onChange={props.onState}
          available={(s) => s === 'default' || !!c.states[s]}
        />
        <button onClick={() => props.onEdit(sel.id)}>
          <PencilSimple /> Modifier
        </button>
        <Remove disabled={used} onClick={() => set(null)} />
      </aside>
    );
  }

  const kind = sel.kind;
  const item = f[kind][sel.id] as Record<string, any> | undefined;
  if (!item) return <aside className="panel right" />;
  const set = (patch: Record<string, unknown> | null) => {
    const { [sel.id]: _, ...rest } = f[kind];
    props.onSave({
      ...project,
      foundations: {
        ...f,
        [kind]: patch ? { ...rest, [sel.id]: { ...item, ...patch } } : rest,
      },
    });
    if (!patch) props.onSelect(null);
  };
  const num = (label: string, key: string, step = 1) => (
    <Num
      label={label}
      value={item[key]}
      step={step}
      onChange={(v) => set({ [key]: v })}
    />
  );
  return (
    <aside className="panel right" aria-label="Paramètres">
      <Text label="Nom" value={item.name} onChange={(name) => set({ name })} />
      {kind === 'colors' && (
        <>
          <Color
            label="Clair"
            value={item.light}
            onChange={(light) => set({ light })}
          />
          <Color
            label="Sombre"
            value={item.dark}
            onChange={(dark) => set({ dark })}
          />
        </>
      )}
      {kind === 'fonts' && (
        <>
          <Text
            label="Police"
            value={item.family}
            onChange={(family) => set({ family })}
          />
          {num('Taille', 'size')}
          <label className="field">
            Graisse
            <select
              value={item.weight}
              onChange={(e) => set({ weight: Number(e.target.value) })}
            >
              {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
                <option key={w}>{w}</option>
              ))}
            </select>
          </label>
          {num('Interligne', 'lineHeight', 0.05)}
        </>
      )}
      {(kind === 'spacing' || kind === 'radius') && num('Valeur', 'value')}
      {kind === 'shadows' && (
        <>
          {num('X', 'x')}
          {num('Y', 'y')}
          {num('Flou', 'blur')}
          <label className="field">
            Couleur
            <select
              value={item.color}
              onChange={(e) => set({ color: e.target.value })}
            >
              {Object.entries(f.colors).map(([id, c]) => (
                <option key={id} value={id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <Remove disabled={used} onClick={() => set(null)} />
    </aside>
  );
}

// --- Champs : la valeur s'enregistre en quittant le champ ---
function Text(p: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      {p.label}
      <input
        key={p.value}
        defaultValue={p.value}
        onBlur={(e) => {
          const v = e.currentTarget.value.trim();
          if (v && v !== p.value) p.onChange(v);
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  );
}
function Num(p: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="field">
      {p.label}
      <input
        type="number"
        key={p.value}
        step={p.step}
        defaultValue={p.value}
        onBlur={(e) => {
          const v = e.currentTarget.valueAsNumber;
          if (Number.isFinite(v) && v !== p.value) p.onChange(v);
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  );
}
function Color(p: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const hex = p.value.slice(0, 7);
  return (
    <div className="field">
      {p.label}
      <div className="row">
        <input
          type="color"
          className="color-picker"
          aria-label={p.label}
          value={hex}
          onChange={(e) => p.onChange(e.target.value)}
        />
        <input
          key={p.value}
          aria-label={`${p.label} hex`}
          defaultValue={p.value}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v) && v !== p.value)
              p.onChange(v);
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </div>
    </div>
  );
}
function Remove(p: { disabled: boolean; onClick: () => void }) {
  return (
    <button className="ghost danger" disabled={p.disabled} onClick={p.onClick}>
      <Trash /> Supprimer
    </button>
  );
}

// Le module complet : planche du design system, ou éditeur d'un composant.
export function DesignModule(props: {
  project: Project;
  path: string;
  theme: Theme;
  onSave: (p: Project) => void;
  onUpdate: Update;
  onFigma: () => void;
  bar: (scope: Scope, target?: string) => React.ReactNode;
}) {
  const { project } = props;
  const [sel, setSel] = useState<DSSelection>(null);
  const [state, setState] = useState<CompState>('default');
  const [editing, setEditing] = useState<string | null>(null);
  const [node, setNode] = useState('root');
  const [edited, setEdited] = useState('root');
  const [bp, setBp] = useState<Breakpoint>('desktop');
  useEffect(() => {
    setSel(null);
    setEditing(null);
  }, [props.path]);
  const select = (s: DSSelection) => {
    setSel(s);
    setState('default');
  };
  // « Modifier » ouvre le composant avec sa racine déjà sélectionnée.
  const edit = (id: string) => {
    setEditing(id);
    setNode('root');
    setEdited('root');
    setState('default');
  };
  function newComponent() {
    const name = `Composant ${Object.keys(project.components).length + 1}`;
    const id = slug(name, project.components);
    props.onSave({
      ...project,
      components: {
        ...project.components,
        [id]: {
          name,
          root: {
            id: 'root',
            kind: 'box',
            name,
            style: { desktop: { direction: 'row', padding: 12 } },
            children: [],
          },
          states: {},
        },
      },
    });
    select({ kind: 'components', id });
    setEditing(id);
    setNode('root');
    setEdited('root');
  }
  const ds = { project, sel, onSelect: select, onSave: props.onSave };
  const c = editing ? project.components[editing] : undefined;

  if (!c || !editing)
    return (
      <>
        <DesignNav
          {...ds}
          onFigma={props.onFigma}
          onAddComponent={newComponent}
        />
        <main className="canvas" aria-label="Design system">
          <DesignBoard
            {...ds}
            theme={props.theme}
            state={state}
            onImport={props.onFigma}
          />
          {sel?.kind === 'components' && project.components[sel.id]
            ? props.bar(
                {
                  component: sel.id,
                  node: project.components[sel.id].root.id,
                },
                project.components[sel.id].name,
              )
            : props.bar({})}
        </main>
        <DesignSettings
          {...ds}
          state={state}
          onState={setState}
          onEdit={edit}
        />
      </>
    );

  // Édition d'un composant ; un état autre que « Par défaut » n'enregistre
  // que des différences de style.
  const patches = state === 'default' ? undefined : c.states[state];
  const setComponent = (next: typeof c) =>
    props.onSave({
      ...project,
      components: { ...project.components, [editing]: next },
    });
  const editor: EditorProps = {
    project,
    root: c.root,
    onRoot: (root) => setComponent({ ...c, root }),
    sel: target(project, c.root, node) ? node : c.root.id,
    edited: target(project, c.root, edited) ? edited : c.root.id,
    onSelect: (id, edit = true) => {
      setNode(id);
      if (edit) setEdited(id);
    },
    onComponentize: (id) =>
      createComponent(
        project,
        c.root,
        id,
        (p, root) => ({
          ...p,
          components: {
            ...p.components,
            [editing]: { ...p.components[editing], root },
          },
        }),
        props.onUpdate,
      ),
    onRenameComponent: (id, name) =>
      props.onUpdate((p) => renameComponent(p, id, name)),
    bp,
    base: props.path,
    own: (id) =>
      state === 'default'
        ? find(c.root, id)?.node.style?.[bp]
        : c.states[state]?.[id],
    onStyle: (id, patch) => {
      if (state === 'default')
        return setComponent({ ...c, root: setStyles(c.root, id, bp, patch) });
      const at: Record<string, unknown> = {
        ...c.states[state]?.[id],
        ...patch,
      };
      for (const k of Object.keys(patch)) if (at[k] === undefined) delete at[k];
      setComponent({
        ...c,
        states: { ...c.states, [state]: { ...c.states[state], [id]: at } },
      });
    },
  };
  return (
    <>
      <aside className="panel left">
        <button className="ghost back" onClick={() => setEditing(null)}>
          <ArrowLeft /> Design system
        </button>
        <select
          aria-label="Composant modifié"
          value={editing}
          onChange={(e) =>
            e.target.value === '+' ? newComponent() : edit(e.target.value)
          }
        >
          {Object.entries(project.components).map(([id, k]) => (
            <option key={id} value={id}>
              {k.name}
            </option>
          ))}
          <option value="+">Nouveau composant</option>
        </select>
        <StateSelect value={state} onChange={setState} available={() => true} />
        <AddMenu {...editor} exclude={editing} />
        <Structure {...editor} />
      </aside>
      <main className="canvas" aria-label={c.name}>
        <div className="canvas-head">
          <FormatSwitch bp={bp} onChange={setBp} />
        </div>
        <Canvas {...editor} theme={props.theme} patches={patches} component />
        {(() => {
          const id = split(editor.sel)?.instance ?? editor.sel;
          const n = find(c.root, id)?.node ?? c.root;
          return props.bar(
            { component: editing, node: n.id },
            n.id === c.root.id ? c.name : label(n, project),
          );
        })()}
      </main>
      <aside className="panel right" aria-label="Paramètres">
        <ElementSettings
          {...editor}
          stateOnly={state !== 'default'}
          header={
            editor.edited === c.root.id && (
              <section className="group">
                <h3>Composant</h3>
                <input
                  aria-label="Nom du composant"
                  key={editing + c.name}
                  defaultValue={c.name}
                  onBlur={(e) => {
                    const name = e.currentTarget.value.trim();
                    if (name && name !== c.name) setComponent({ ...c, name });
                  }}
                />
              </section>
            )
          }
        />
      </aside>
    </>
  );
}

function StateSelect(props: {
  value: CompState;
  onChange: (s: CompState) => void;
  available: (s: CompState) => boolean;
}) {
  return (
    <label className="field">
      État
      <select
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as CompState)}
      >
        {(['default', ...componentStates] as CompState[]).map((s) => (
          <option key={s} value={s} disabled={!props.available(s)}>
            {stateLabels[s]}
          </option>
        ))}
      </select>
    </label>
  );
}
