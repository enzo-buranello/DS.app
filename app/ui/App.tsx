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
import type { AiResult, Opened, Scope, StudioApi } from '../shared/api.js';
import { HistoryButton } from './History.js';
import type { Project, ProjectEntry } from '../shared/project.js';
import { DesignModule, FigmaDialog, type FigmaSource } from './DesignSystem.js';
import { PagesModule } from './Pages.js';
import { ContentModule } from './Content.js';
import { CodeModule } from './Code.js';
import type { Update } from './components.js';
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
  // Dernier état connu : les réponses asynchrones (nom proposé par l'IA)
  // s'appliquent dessus, jamais sur une copie périmée.
  const latest = useRef<Opened | null>(null);
  latest.current = opened;

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
  function save(project: Project, label?: string) {
    if (!latest.current) return;
    const path = latest.current.path;
    latest.current = { path, project };
    setOpened({ path, project });
    pending.current = () =>
      api.save(path, project, label).then(refresh, () => setError(true));
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
      onUpdate={(fn, label) =>
        latest.current && save(fn(latest.current.project), label)
      }
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
  onUpdate: Update;
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
  async function runAi(task: () => Promise<AiResult>) {
    setAi({ status: 'busy' });
    try {
      await props.onFlush();
      const out = await task();
      props.onReplace(out.project);
      setAi({ status: 'review', entry: out.entry });
    } catch {
      setAi({ status: 'error' });
    }
  }
  // Barre IA : la portée vient du module (élément sélectionné ou global).
  const bar = (scope: Scope, target?: string) => (
    <PromptBar
      state={ai}
      placeholder={
        target ? `Modifier « ${target} »` : 'Décrire une modification'
      }
      onSubmit={(text) => runAi(() => api.design(path, text, scope))}
      onKeep={() => setAi({ status: 'idle' })}
      onUndo={async (entry) => {
        setAi({ status: 'idle' });
        props.onReplace(await api.discard(path, entry));
      }}
    />
  );

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
          <HistoryButton
            path={path}
            version={project.updatedAt}
            onRestore={async (id) => {
              await props.onFlush();
              props.onReplace(await api.restore(path, id));
              setAi({ status: 'idle' });
            }}
          />
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
          onUpdate={props.onUpdate}
          onFigma={() => figma.current?.showModal()}
          bar={bar}
        />
      ) : module === 'pages' ? (
        <PagesModule
          project={project}
          path={path}
          theme={theme}
          onSave={props.onSave}
          onUpdate={props.onUpdate}
          bar={bar}
        />
      ) : module === 'content' ? (
        <ContentModule
          project={project}
          path={path}
          onSave={props.onSave}
          bar={bar}
        />
      ) : (
        <CodeModule
          project={project}
          path={path}
          onSave={props.onSave}
          onFlush={props.onFlush}
        />
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
