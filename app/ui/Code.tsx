import { useEffect, useState } from 'react';
import { Code as CodeIcon } from '@phosphor-icons/react';
import {
  targetDirs,
  targetLabels,
  type BuildState,
  type Target,
} from '../shared/build.js';
import { targets, type Project } from '../shared/project.js';

// Module Code : cibles, dossier de travail, état de la dernière génération,
// et « Générer ». Rien de plus.

const when = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

export function CodeModule(props: {
  project: Project;
  path: string;
  onSave: (p: Project) => void;
  onFlush: () => Promise<void>;
}) {
  const { project } = props;
  const [state, setState] = useState<BuildState>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(
    () => void window.studio.buildState(props.path).then(setState),
    [props.path],
  );

  async function generate() {
    setBusy(true);
    setFailed(false);
    try {
      await props.onFlush();
      setState(await window.studio.generate(props.path));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  const toggle = (t: Target, on: boolean) =>
    props.onSave({
      ...project,
      targets: on
        ? [...project.targets, t]
        : project.targets.filter((x) => x !== t),
    });

  return (
    <>
      <aside className="panel left">
        <section className="group">
          <h3>Cibles</h3>
          {targets.map((t) => (
            <label key={t} className="check target">
              <input
                type="checkbox"
                checked={project.targets.includes(t)}
                disabled={busy}
                onChange={(e) => toggle(t, e.target.checked)}
              />
              {targetLabels[t]}
            </label>
          ))}
        </section>
      </aside>
      <main className="canvas" aria-label="Code">
        <div className="code-card">
          <div className="field">
            Dossier
            <code className="path">{`\u200e${props.path}/code\u200e`}</code>
          </div>
          <ul className="targets">
            {project.targets.map((t) => {
              const s = state[t];
              return (
                <li key={t}>
                  <CodeIcon />
                  <span className="target-name">{targetLabels[t]}</span>
                  <code className="muted">code/{targetDirs[t]}</code>
                  <span className={s && !s.ok ? 'error' : 'muted'}>
                    {busy
                      ? 'En cours'
                      : !s
                        ? 'Jamais généré'
                        : s.ok
                          ? `${when(s.at)} · ${s.files} fichier${s.files === 1 ? '' : 's'}`
                          : 'Échec'}
                  </span>
                </li>
              );
            })}
          </ul>
          {failed && <p className="error">Impossible de générer</p>}
          <button
            className="studio-primary"
            disabled={busy || !project.targets.length}
            onClick={generate}
          >
            {busy ? 'En cours' : 'Générer'}
          </button>
        </div>
      </main>
      <aside className="panel right" aria-label="Paramètres" />
    </>
  );
}
