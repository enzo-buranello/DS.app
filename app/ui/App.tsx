import { useEffect, useRef, useState } from 'react';
import {
  CaretDown,
  Code,
  Database,
  GearSix,
  Moon,
  Palette,
  SunHorizon,
  Trash,
  SquaresFour,
  Sun,
} from '@phosphor-icons/react';
import type { AiResult, Opened, Scope, StudioApi } from '../shared/api.js';
import type { Auth } from '../shared/account.js';
import { providerLabels } from '../shared/account.js';
import { AuthScreen } from './Auth.js';
import memojiOne from './assets/memoji-1.png';
import memojiTwo from './assets/memoji-2.png';
import { HistoryButton } from './History.js';
import { ProjectsMenu } from './ProjectsMenu.js';
import type { Project, ProjectEntry } from '../shared/project.js';
import { DesignModule, FigmaDialog } from './DesignSystem.js';
import { PagesModule } from './Pages.js';
import { ContentModule } from './Content.js';
import { CodeModule } from './Code.js';
import type { Update } from './components.js';
import { PromptBar, type AiState } from './PromptBar.js';
import { AgentLayer, idleView, type AgentView } from './Agent.js';
import type { Settings } from '../shared/agent.js';
import { fontsHref, type Theme } from './render.js';

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

export default function App() {
  const [entries, setEntries] = useState<ProjectEntry[]>([]);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [account, setAccount] = useState<Auth | null | undefined>(undefined);
  const [error, setError] = useState(false);
  // Première action d'un projet ouvert depuis l'accueil : prompt ou Figma.
  const [start, setStart] = useState<Start | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<(() => Promise<unknown>) | null>(null);
  // Dernier état connu : les réponses asynchrones (nom proposé par l'IA)
  // s'appliquent dessus, jamais sur une copie périmée.
  const latest = useRef<Opened | null>(null);
  latest.current = opened;

  const refresh = () => api.list().then(setEntries);
  useEffect(() => {
    if (account) void refresh();
  }, [account]);
  useEffect(() => {
    void api.auth().then(setAccount, () => setAccount(null));
  }, []);

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
  if (account === undefined) return <div className="boot" />;
  if (!account) return <AuthScreen onDone={setAccount} />;
  const canFigma = account.provider === 'anthropic';
  if (!opened)
    return (
      <Home
        entries={entries}
        canFigma={canFigma}
        onCreate={(name) => run(() => api.create(name))}
        onOpen={(path) => run(() => api.open(path))}
        onStart={(next) => {
          setStart(next);
          void run(() =>
            api.draft(next.figma ? 'Import Figma' : 'Nouveau projet'),
          );
        }}
        error={failed}
      />
    );
  return (
    <Shell
      opened={opened}
      account={account}
      canFigma={canFigma}
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
      onMoved={(o) => {
        latest.current = o;
        setOpened(o);
        void refresh();
      }}
      onSignOut={() => {
        latest.current = null;
        setOpened(null);
        setAccount(null);
      }}
      start={start}
      onStarted={() => setStart(null)}
    />
  );
}

type Start = { text: string; images: string[]; figma?: boolean };

function Home(props: {
  entries: ProjectEntry[];
  canFigma: boolean;
  onCreate: (name: string) => void;
  onOpen: (path?: string) => void;
  onStart: (start: Start) => void;
  error: React.ReactNode;
}) {
  const [creating, setCreating] = useState(false);
  return (
    <main className="home">
      <header className="home-head">
        <span className="home-mark">Studio</span>
        <ProjectsMenu
          entries={props.entries}
          canFigma={props.canFigma}
          onOpen={props.onOpen}
          onNew={() => setCreating(true)}
          onFolder={() => props.onOpen()}
          onFigma={() => props.onStart({ text: '', images: [], figma: true })}
        />
      </header>
      <section className="home-hero">
        <div className="home-art" aria-hidden="true">
          <span className="hero-bubble bubble-left">Bonjour</span>
          <span className="hero-avatar human">
            <img src={memojiOne} alt="" />
          </span>
          <span className="hero-avatar friend">
            <img src={memojiTwo} alt="" />
          </span>
          <span className="hero-avatar robot">🤖</span>
          <span className="hero-bubble bubble-right">Commençons</span>
        </div>
        <h1>Que voulez-vous créer ?</h1>
        <p className="home-lead">
          Décrivez votre projet. Studio compose le design system, les pages et
          le code.
        </p>
        <span className="home-label" aria-hidden="true">
          Idée
        </span>
        <PromptBar
          label="Que voulez-vous créer ?"
          variant="hero"
          submitLabel="Créer"
          state={{ status: 'idle' }}
          placeholder="Un site, une app…"
          onSubmit={(text, images) => props.onStart({ text, images })}
          onKeep={() => {}}
          onUndo={() => {}}
        />
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
            <button className="studio-primary">Valider</button>
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
      </section>
    </main>
  );
}

function Shell(props: {
  opened: Opened;
  account: Auth;
  canFigma: boolean;
  entries: ProjectEntry[];
  onOpen: (path: string) => void;
  onHome: () => void;
  onSave: (project: Project) => void;
  onUpdate: Update;
  onFlush: () => Promise<void>;
  onReplace: (project: Project) => void;
  onMove: () => void;
  /** Le projet a reçu son dossier pendant une action. */
  onMoved: (o: Opened) => void;
  onSignOut: () => void;
  start: Start | null;
  onStarted: () => void;
}) {
  const { project, path } = props.opened;
  // Les polices du projet s'affichent telles quelles sur le canevas.
  const fonts = fontsHref(project.foundations);
  useEffect(() => {
    document.getElementById('project-fonts')?.remove();
    if (!fonts) return;
    const link = Object.assign(document.createElement('link'), {
      id: 'project-fonts',
      rel: 'stylesheet',
      href: fonts,
    });
    document.head.append(link);
  }, [fonts]);
  const [module, setModule] = useState<ModuleId>('design');
  const [menu, setMenu] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [ai, setAi] = useState<AiState>({ status: 'idle' });
  const [view, setView] = useState<AgentView>(idleView);
  const [prefs, setPrefs] = useState<Settings | null>(null);
  const settings = useRef<HTMLDialogElement>(null);
  useEffect(() => void api.settings().then(setPrefs), []);
  // Agent transversal : étapes, QCM, confirmations. Une étape en échec
  // reste affichée un instant, sur une ligne.
  useEffect(() => {
    let clear: ReturnType<typeof setTimeout>;
    const off = api.onAgent((e) => {
      clearTimeout(clear);
      if (e.kind === 'steps') setView((v) => ({ ...v, steps: e.steps }));
      else if (e.kind === 'ask')
        setView((v) => ({ ...v, questions: e.questions, advice: null }));
      else if (e.kind === 'confirm')
        setView((v) => ({ ...v, confirm: e.items, advice: null }));
      else
        setView((v) => {
          const failed = v.steps.some((s) => s.state === 'failed');
          if (failed)
            clear = setTimeout(
              () => setView((w) => ({ ...w, steps: [] })),
              4000,
            );
          return {
            ...v,
            questions: null,
            confirm: null,
            steps: failed ? v.steps : [],
          };
        });
    });
    return () => {
      off();
      clearTimeout(clear);
    };
  }, []);
  const figma = useRef<HTMLDialogElement>(null);
  // Le menu se ferme au prochain clic, dedans comme dehors.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    addEventListener('click', close);
    return () => removeEventListener('click', close);
  }, [menu]);
  // Autre projet ou autre dossier : rien ne reste en attente.
  // Sauf un projet qui vient de recevoir son dossier : même travail en cours.
  const moved = useRef<string | null>(null);
  useEffect(() => {
    if (moved.current === path) return;
    setAi({ status: 'idle' });
    setView(idleView);
  }, [path]);
  // Depuis l'accueil : le prompt s'exécute, ou l'import Figma s'ouvre.
  useEffect(() => {
    const s = props.start;
    if (!s) return;
    props.onStarted();
    if (s.figma) figma.current?.showModal();
    else void runAi(() => api.design(path, s.text, {}, s.images));
  }, []);
  const current = modules.find((m) => m.id === module)!;

  // L'IA applique son résultat sur le canevas ; « Garder » ou « Annuler ».
  // L'avis éventuel apparaît ensuite, jamais en même temps qu'un QCM.
  async function runAi(task: () => Promise<AiResult>) {
    setAi({ status: 'busy' });
    setView((v) => ({ ...v, advice: null }));
    try {
      await props.onFlush();
      const out = await task();
      if (out.path) {
        moved.current = out.path;
        props.onMoved({ path: out.path, project: out.project });
      } else props.onReplace(out.project);
      setAi({ status: 'review', entry: out.entry });
      if (out.advice) setView((v) => ({ ...v, advice: out.advice! }));
    } catch (e) {
      if (String(e).includes('auth:out')) {
        props.onSignOut();
        return;
      }
      setAi({ status: 'error' });
    }
  }
  // Import Figma : pas de relecture, on arrive sur le design system créé ;
  // l'itération reste dans l'historique.
  async function runImport(url: string) {
    setAi({ status: 'busy', message: 'Import en cours' });
    try {
      await props.onFlush();
      const out = await api.figmaImport(path, url);
      props.onReplace(out.project);
      setModule('design');
      setAi({ status: 'idle' });
    } catch (e) {
      if (String(e).includes('auth:out')) {
        props.onSignOut();
        return;
      }
      if (String(e).includes('figma:auth')) {
        setAi({ status: 'idle' });
        figma.current?.showModal();
      } else
        setAi({
          status: 'error',
          message: String(e).includes('figma:notfound')
            ? 'Fichier introuvable ou non partagé'
            : undefined,
        });
    }
  }
  // Barre IA : la portée vient du module (élément sélectionné ou global).
  const bar = (scope: Scope, target?: string) => (
    <div className="prompt-dock">
      <AgentLayer
        view={view}
        onAnswer={(a) => {
          setView((v) => ({ ...v, questions: null }));
          void api.answer(a);
        }}
        onConfirm={(ok) => {
          setView((v) => ({ ...v, confirm: null }));
          void api.confirm(ok);
        }}
        onApply={(instruction) =>
          runAi(() => api.design(path, instruction, {}, []))
        }
        onDismiss={() => setView((v) => ({ ...v, advice: null }))}
      />
      <PromptBar
        state={ai}
        placeholder={
          target ? `Modifier « ${target} »` : 'Décrire une modification'
        }
        onSubmit={(text, images) =>
          runAi(() => api.design(path, text, scope, images))
        }
        onKeep={() => setAi({ status: 'idle' })}
        onUndo={async (entry) => {
          setAi({ status: 'idle' });
          setView((v) => ({ ...v, advice: null }));
          props.onReplace(await api.discard(path, entry));
        }}
      />
    </div>
  );

  return (
    <div className="shell" data-module={module}>
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
        <div className="rail-foot">
          <HistoryButton
            path={path}
            version={project.updatedAt}
            onRestore={async (id) => {
              await props.onFlush();
              props.onReplace(await api.restore(path, id));
              setAi({ status: 'idle' });
            }}
          />
          <ModesButton theme={theme} onChange={setTheme} />
          <hr />
          <button
            className="ghost"
            onClick={() => settings.current?.showModal()}
          >
            <GearSix /> Paramètres
          </button>
        </div>
      </nav>
      {module === 'design' ? (
        <DesignModule
          project={project}
          path={path}
          theme={theme}
          onSave={props.onSave}
          onUpdate={props.onUpdate}
          onFigma={
            props.canFigma ? () => figma.current?.showModal() : undefined
          }
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
          onMoved={props.onOpen}
          onSignOut={props.onSignOut}
          bar={bar}
        />
      )}
      <FigmaDialog ref={figma} project={project} onSubmit={runImport} />
      <dialog ref={settings} className="dialog">
        <form method="dialog" className="dialog-body">
          <h2>Paramètres</h2>
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
          <div className="field">
            Compte
            <div className="row">
              <span className="ellipsis">
                {providerLabels[props.account.provider]}
              </span>
              <button
                type="button"
                className="ghost"
                onClick={async () => {
                  await api.authOut().catch(() => {});
                  settings.current?.close();
                  props.onSignOut();
                }}
              >
                Déconnecter
              </button>
            </div>
          </div>
          {prefs && (
            <div className="field">
              IA
              <label className="field check">
                <input
                  type="checkbox"
                  checked={prefs.questions}
                  onChange={async (e) =>
                    setPrefs(
                      await api.setSettings({
                        ...prefs,
                        questions: e.target.checked,
                      }),
                    )
                  }
                />
                Questions
              </label>
              <label className="field check">
                <input
                  type="checkbox"
                  checked={prefs.advice}
                  onChange={async (e) =>
                    setPrefs(
                      await api.setSettings({
                        ...prefs,
                        advice: e.target.checked,
                      }),
                    )
                  }
                />
                Avis
              </label>
            </div>
          )}
          <Keys path={path} />
          <button className="studio-primary">Fermer</button>
        </form>
      </dialog>
    </div>
  );
}

// Clés d'API du code généré : la valeur part au trousseau, seul le nom reste.
function Keys(props: { path: string }) {
  const [names, setNames] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => void api.secrets(props.path).then(setNames), [props.path]);
  const valid = /^[A-Z][A-Z0-9_]{1,63}$/.test(name) && !!value;
  const put = async (n: string, v: string | null) => {
    setFailed(false);
    try {
      setNames(await api.setSecret(props.path, n, v));
      return true;
    } catch {
      setFailed(true);
      return false;
    }
  };
  return (
    <div className="field">
      Clés d’API
      {names.length > 0 && (
        <ul className="keys">
          {names.map((n) => (
            <li key={n} className="row">
              <code className="ellipsis">{n}</code>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Supprimer ${n}`}
                onClick={() => void put(n, null)}
              >
                <Trash />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="row">
        <input
          aria-label="Clé"
          placeholder="VITE_API_KEY"
          value={name}
          onChange={(e) =>
            setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))
          }
        />
        <input
          type="password"
          aria-label="Valeur"
          placeholder="Valeur"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="button"
          disabled={!valid}
          onClick={async () => {
            if (await put(name, value)) {
              setName('');
              setValue('');
            }
          }}
        >
          Ajouter
        </button>
      </div>
      {failed && <span className="error">Trousseau indisponible</span>}
    </div>
  );
}

// Modes : aperçu du projet en clair ou en sombre.
function ModesButton(props: { theme: Theme; onChange: (t: Theme) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    addEventListener('click', close);
    return () => removeEventListener('click', close);
  }, [open]);
  const modes = [
    { id: 'light', label: 'Clair', icon: Sun },
    { id: 'dark', label: 'Sombre', icon: Moon },
  ] as const;
  return (
    <div className="history-anchor">
      <button
        className="ghost"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        <SunHorizon /> Modes
      </button>
      {open && (
        <div className="menu" role="menu" aria-label="Modes">
          {modes.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              role="menuitemradio"
              aria-checked={props.theme === id}
              className="ghost"
              onClick={() => props.onChange(id)}
            >
              <Icon /> {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
