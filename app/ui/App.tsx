import { useEffect, useRef, useState } from 'react';
import {
  CaretDown,
  Code,
  Database,
  FolderOpen,
  GearSix,
  Moon,
  Palette,
  Plus,
  SquaresFour,
  Sun,
} from '@phosphor-icons/react';
import type { Opened, StudioApi } from '../shared/api.js';
import type { Project, ProjectEntry } from '../shared/project.js';
import { DesignModule, FigmaDialog, type FigmaSource } from './DesignSystem.js';
import { PagesModule } from './Pages.js';
import { PromptBar, type AiState } from './PromptBar.js';
import type { Theme } from './render.js';

declare global {
  interface Window {
    studio: StudioApi;
  }
}
const api = window.studio;

const modules = [
  { id: 'design', label: 'Design system', icon: Palette },
  { id: 'pages', label: 'Pages', icon: SquaresFour },
  { id: 'content', label: 'Contenus', icon: Database },
  { id: 'code', label: 'Code', icon: Code },
] as const;
type ModuleId = (typeof modules)[number]['id'];

const when = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

export default function App() {
  const [entries, setEntries] = useState<ProjectEntry[]>([]);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [error, setError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<(() => Promise<unknown>) | null>(null);

  const refresh = () => api.list().then(setEntries);
  useEffect(() => void refresh(), []);

  // Affichage immédiat, écriture sur disque groupée ; vidée avant toute
  // action qui relit le disque ou change de projet.
  async function flush() {
    clearTimeout(timer.current);
    const write = pending.current;
    pending.current = null;
    await write?.();
  }
  function save(project: Project) {
    if (!opened) return;
    const path = opened.path;
    setOpened({ path, project });
    pending.current = () =>
      api.save(path, project).then(refresh, () => setError(true));
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 300);
  }
  async function run(action: () => Promise<Opened | null>) {
    await flush();
    setError(false);
    try {
      const next = await action();
      if (next) setOpened(next);
      await refresh();
    } catch {
      setError(true);
    }
  }

  const failed = error && <p className="error">Impossible d’ouvrir</p>;
  if (!opened)
    return (
      <Home
        entries={entries}
        onCreate={(name) => run(() => api.create(name))}
        onOpen={(path) => run(() => api.open(path))}
        error={failed}
      />
    );
  return (
    <Shell
      opened={opened}
      entries={entries}
      onOpen={(path) => run(() => api.open(path))}
      onHome={() => flush().then(() => setOpened(null))}
      onSave={save}
      onFlush={flush}
      onReplace={(project) => {
        setOpened({ path: opened.path, project });
        void refresh();
      }}
      onMove={() => run(() => api.move(opened.path))}
    />
  );
}

function Home(props: {
  entries: ProjectEntry[];
  onCreate: (name: string) => void;
  onOpen: (path?: string) => void;
  error: React.ReactNode;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <main className="home">
      <header className="home-head">
        <h1>Projets</h1>
        <button className="ghost" onClick={() => props.onOpen()}>
          <FolderOpen /> Ouvrir
        </button>
        <button className="studio-primary" onClick={() => setCreating(true)}>
          <Plus /> Nouveau projet
        </button>
      </header>
      {creating && (
        <form
          className="home-new"
          onSubmit={(e) => {
            e.preventDefault();
            const name = new FormData(e.currentTarget).get('name') as string;
            if (name.trim()) props.onCreate(name.trim());
            setCreating(false);
          }}
        >
          <input name="name" aria-label="Nom" placeholder="Nom" autoFocus />
          <button className="studio-primary">Créer</button>
          <button
            type="button"
            className="ghost"
            onClick={() => setCreating(false)}
          >
            Annuler
          </button>
        </form>
      )}
      {props.error}
      <ul className="home-list">
        {props.entries.map((p) => (
          <li key={p.path}>
            <button className="home-item" onClick={() => props.onOpen(p.path)}>
              <span>{p.name}</span>
              <span className="muted">{when(p.updatedAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Shell(props: {
  opened: Opened;
  entries: ProjectEntry[];
  onOpen: (path: string) => void;
  onHome: () => void;
  onSave: (project: Project) => void;
  onFlush: () => Promise<void>;
  onReplace: (project: Project) => void;
  onMove: () => void;
}) {
  const { project, path } = props.opened;
  const [module, setModule] = useState<ModuleId>('design');
  const [menu, setMenu] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [ai, setAi] = useState<AiState>({ status: 'idle' });
  const settings = useRef<HTMLDialogElement>(null);
  const figma = useRef<HTMLDialogElement>(null);
  // Le menu se ferme au prochain clic, dedans comme dehors.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    addEventListener('click', close);
    return () => removeEventListener('click', close);
  }, [menu]);
  // Autre projet ou autre dossier : rien ne reste en attente.
  useEffect(() => {
    setAi({ status: 'idle' });
  }, [path]);
  const current = modules.find((m) => m.id === module)!;

  // L'IA applique son résultat sur le canevas ; « Garder » ou « Annuler ».
  async function runAi(task: () => Promise<Project>) {
    const previous = project;
    setAi({ status: 'busy' });
    try {
      await props.onFlush();
      props.onReplace(await task());
      setAi({ status: 'review', previous });
    } catch {
      setAi({ status: 'error' });
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="switcher">
          <button
            className="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setMenu(!menu);
            }}
            aria-expanded={menu}
          >
            {project.name} <CaretDown />
          </button>
          {menu && (
            <div className="menu" role="menu">
              {props.entries
                .filter((p) => p.path !== path)
                .map((p) => (
                  <button
                    key={p.path}
                    role="menuitem"
                    className="ghost"
                    onClick={() => props.onOpen(p.path)}
                  >
                    {p.name}
                  </button>
                ))}
              <button role="menuitem" className="ghost" onClick={props.onHome}>
                Tous les projets
              </button>
            </div>
          )}
        </div>
        <div className="row">
          <button
            className="icon-btn"
            aria-label={theme === 'light' ? 'Thème sombre' : 'Thème clair'}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            {theme === 'light' ? <Moon /> : <Sun />}
          </button>
          <button
            className="icon-btn"
            aria-label="Réglages"
            onClick={() => settings.current?.showModal()}
          >
            <GearSix />
          </button>
        </div>
      </header>
      <nav className="rail">
        {modules.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className="ghost"
            aria-current={id === module ? 'page' : undefined}
            onClick={() => setModule(id)}
          >
            <Icon /> {label}
          </button>
        ))}
      </nav>
      {module === 'design' ? (
        <DesignModule
          project={project}
          path={path}
          theme={theme}
          onSave={props.onSave}
          onFigma={() => figma.current?.showModal()}
          bar={
            <PromptBar
              state={ai}
              placeholder="Décrire le design system"
              onSubmit={(text) => runAi(() => api.design(path, text))}
              onKeep={() => setAi({ status: 'idle' })}
              onUndo={(previous) => {
                props.onSave(previous);
                setAi({ status: 'idle' });
              }}
            />
          }
        />
      ) : module === 'pages' ? (
        <PagesModule
          project={project}
          path={path}
          theme={theme}
          onSave={props.onSave}
        />
      ) : (
        <>
          <aside className="panel left">
            <h2>{current.label}</h2>
          </aside>
          <main className="canvas" aria-label={current.label} />
          <aside className="panel right" aria-label="Paramètres" />
        </>
      )}
      <FigmaDialog
        ref={figma}
        project={project}
        onSubmit={(s: FigmaSource) => runAi(() => api.figmaImport(path, s))}
      />
      <dialog ref={settings} className="dialog">
        <form method="dialog" className="dialog-body">
          <h2>Réglages</h2>
          <label className="field">
            Nom
            <input
              key={project.name}
              defaultValue={project.name}
              onBlur={(e) => {
                const name = e.currentTarget.value.trim();
                if (name && name !== project.name)
                  props.onSave({ ...project, name });
              }}
            />
          </label>
          <div className="field">
            Dossier
            <div className="row">
              <code className="path">{path}</code>
              <button type="button" onClick={props.onMove}>
                Changer
              </button>
            </div>
          </div>
          <button className="studio-primary">Fermer</button>
        </form>
      </dialog>
    </div>
  );
}
