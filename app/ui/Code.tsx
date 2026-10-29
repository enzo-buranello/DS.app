import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CaretRight,
  DeviceMobile,
  File as FileIcon,
  X,
} from '@phosphor-icons/react';
import {
  targetLabels,
  type BuildState,
  type CodeScope,
  type Preview,
  type Target,
} from '../shared/build.js';
import { targets, type Project } from '../shared/project.js';
import { PromptBar, type AiState } from './PromptBar.js';

// Module Code : langage, arborescence suivie en direct pendant que l'agent
// écrit, aperçu de l'application au centre. La barre IA retouche le code,
// sur tout le projet ou sur l'élément visé dans l'aperçu.

type Tree = { [name: string]: Tree | null };
function treeOf(files: string[]): Tree {
  const root: Tree = {};
  for (const f of files) {
    const parts = f.split('/');
    let t = root;
    for (const p of parts.slice(0, -1)) t = (t[p] ??= {}) as Tree;
    t[parts.at(-1)!] = null;
  }
  return root;
}
const parents = (file: string) =>
  file
    .split('/')
    .slice(0, -1)
    .map((_, i, a) => a.slice(0, i + 1).join('/'));

export function CodeModule(props: {
  project: Project;
  path: string;
  onSave: (p: Project) => void;
  onFlush: () => Promise<void>;
}) {
  const { project } = props;
  const api = window.studio;
  const target: Target | undefined = project.targets[0];
  const [state, setState] = useState<BuildState>({});
  const [files, setFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [writing, setWriting] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<Preview | 'loading' | 'error' | null>(
    null,
  );
  const [reload, setReload] = useState(0);
  const [pick, setPick] = useState<CodeScope | null>(null);
  const [ai, setAi] = useState<AiState>({ status: 'idle' });
  const frame = useRef<HTMLIFrameElement>(null);
  const generated = !!target && !!state[target]?.ok;
  const touched = new Set(target ? state[target]?.touched : []);

  const loadFiles = () =>
    api.codeFiles(props.path).then(setFiles, () => setFiles([]));
  useEffect(() => {
    setFile(null);
    setPick(null);
    setPreview(null);
    void api.buildState(props.path).then(setState);
    void loadFiles();
  }, [props.path, target]);

  // Le fichier en cours d'écriture reste visible : ses dossiers s'ouvrent.
  useEffect(
    () =>
      api.onActivity(({ file }) => {
        setWriting(file);
        if (file) {
          setOpen((o) => new Set([...o, ...parents(file)]));
          void loadFiles();
        }
      }),
    [props.path],
  );

  // Aperçu : démarré une fois généré, rafraîchi après chaque passage.
  useEffect(() => {
    if (!generated) return;
    let live = true;
    if (target === 'swiftui' || !preview || preview === 'error')
      setPreview('loading');
    api.preview(props.path).then(
      (p) => live && setPreview(p),
      () => live && setPreview('error'),
    );
    return () => {
      live = false;
    };
  }, [props.path, generated, target, reload]);

  // Choix d'un élément dans l'aperçu web ; Échap l'annule.
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (
        e.source === frame.current?.contentWindow &&
        e.data?.studio === 'pick'
      )
        setPick(e.data.pick);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (file) setFile(null);
      else clear();
    };
    addEventListener('message', on);
    addEventListener('keydown', key);
    return () => {
      removeEventListener('message', on);
      removeEventListener('keydown', key);
    };
  }, [file]);
  const clear = () => {
    setPick(null);
    frame.current?.contentWindow?.postMessage({ studio: 'clear' }, '*');
  };

  async function generate() {
    setBusy(true);
    setFailed(false);
    try {
      await props.onFlush();
      const next = await api.generate(props.path);
      setState(next);
      if (target && !next[target]?.ok) setFailed(true);
      setReload((n) => n + 1);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      void loadFiles();
    }
  }
  async function edit(text: string, images: string[]) {
    setAi({ status: 'busy' });
    try {
      await props.onFlush();
      const id = await api.code(props.path, text, pick ?? {}, images);
      setAi({ status: 'review', entry: id });
    } catch {
      setAi({ status: 'error' });
    }
    setState(await api.buildState(props.path));
    void loadFiles();
    setReload((n) => n + 1);
  }
  async function openFile(name: string) {
    setFile({ name, text: await api.readCode(props.path, name) });
    // SwiftUI : pas d'élément cliquable, on vise la vue par son fichier.
    if (target === 'swiftui' && name.endsWith('.swift'))
      setPick({ file: name });
  }

  const tree = useMemo(() => treeOf(files), [files]);
  const renderTree = (t: Tree, base: string): React.ReactNode =>
    Object.entries(t)
      .sort(
        ([a, x], [b, y]) => +(x === null) - +(y === null) || a.localeCompare(b),
      )
      .map(([name, sub]) => {
        const full = base ? `${base}/${name}` : name;
        if (sub)
          return (
            <li key={full}>
              <button
                className="ghost tree-item"
                aria-expanded={open.has(full)}
                onClick={() => {
                  const next = new Set(open);
                  if (!next.delete(full)) next.add(full);
                  setOpen(next);
                }}
              >
                <CaretRight className="caret" /> {name}
              </button>
              {open.has(full) && <ul>{renderTree(sub, full)}</ul>}
            </li>
          );
        return (
          <li key={full}>
            <button
              className="ghost tree-item"
              data-writing={writing === full || undefined}
              aria-current={file?.name === full ? 'true' : undefined}
              onClick={() => openFile(full)}
            >
              <FileIcon /> <span className="ellipsis">{name}</span>
              {touched.has(full) && (
                <span className="dot touched" aria-label="Modifié" />
              )}
            </button>
          </li>
        );
      });

  const scopeLabel = pick?.file ?? pick?.text?.slice(0, 32) ?? pick?.selector;
  return (
    <>
      <aside className="panel left">
        <section className="group">
          <div className="row code-lang">
            <select
              aria-label="Langage"
              value={target ?? ''}
              disabled={busy}
              onChange={(e) =>
                props.onSave({
                  ...project,
                  targets: [e.target.value as Target],
                })
              }
            >
              {!target && (
                <option value="" disabled>
                  Langage
                </option>
              )}
              {targets.map((t) => (
                <option key={t} value={t}>
                  {targetLabels[t]}
                </option>
              ))}
            </select>
            <button
              className="studio-primary"
              disabled={busy || !target}
              onClick={generate}
            >
              {busy ? 'En cours' : 'Générer'}
            </button>
          </div>
          {failed && <p className="error">Impossible de générer</p>}
        </section>
        {files.length > 0 && (
          <section className="group">
            <h3>Fichiers</h3>
            <ul className="tree" aria-label="Fichiers">
              {renderTree(tree, '')}
            </ul>
          </section>
        )}
      </aside>
      <main className="canvas code-canvas" aria-label="Code">
        {file ? (
          <div className="code-view">
            <div className="canvas-head">
              <code className="ellipsis">{file.name}</code>
              <button
                className="icon-btn"
                aria-label="Fermer"
                onClick={() => setFile(null)}
              >
                <X />
              </button>
            </div>
            <pre>
              <code>{file.text}</code>
            </pre>
          </div>
        ) : !generated ? (
          <div className="board empty">
            <span className="muted">Jamais généré</span>
          </div>
        ) : preview === 'loading' || !preview ? (
          <div className="board empty">
            <span className="muted">En cours</span>
          </div>
        ) : preview === 'error' ? (
          <div className="board empty">
            <span className="error">Aperçu indisponible</span>
          </div>
        ) : 'url' in preview ? (
          <iframe
            key={reload}
            ref={frame}
            className="preview"
            title="Aperçu"
            src={preview.url}
            onLoad={() => {
              setPick(null);
              void api.inspect(preview.url);
            }}
          />
        ) : (
          <div className="board empty sim">
            <img className="sim-shot" src={preview.image} alt="Aperçu" />
            <button className="ghost" onClick={() => api.simulator()}>
              <DeviceMobile /> Simulateur
            </button>
          </div>
        )}
        {generated && (
          <PromptBar
            state={ai}
            placeholder={
              scopeLabel
                ? `Modifier « ${scopeLabel} »`
                : 'Décrire une modification'
            }
            onSubmit={edit}
            onKeep={() => {
              if (ai.status === 'review')
                void api.codeDone(props.path, ai.entry, false);
              setAi({ status: 'idle' });
            }}
            onUndo={async (id) => {
              setAi({ status: 'idle' });
              await api.codeDone(props.path, id, true);
              void loadFiles();
              setReload((n) => n + 1);
            }}
          />
        )}
      </main>
    </>
  );
}
