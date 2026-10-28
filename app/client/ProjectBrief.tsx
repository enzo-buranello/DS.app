import { useEffect, useState } from 'react';
import {
  ArrowsClockwise,
  CaretRight,
  DownloadSimple,
} from '@phosphor-icons/react';
import type { ProjectSnapshot } from '../shared/project.js';
import { downloadText, request } from './api.js';

export default function ProjectBrief() {
  const [snapshot, setSnapshot] = useState<ProjectSnapshot>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      setSnapshot(await request('project'));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <details className="project-brief">
      <summary>
        <CaretRight className="chevron" />
        <span>Mon PFE</span>
        <span className="badge">Privé</span>
      </summary>
      <p>Stocké sur ce poste, hors Git.</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {snapshot && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError('');
            setNotice('');
            try {
              setSnapshot(await request('project', snapshot));
              setNotice('Brief enregistré sur ce poste.');
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {(
            [
              ['name', 'Nom du PFE', 100],
              ['audience', 'Public concerné', 1000],
              ['goal', 'Objectif et critères de réussite', 2000],
              ['figmaUrl', 'Lien Figma (facultatif)', 500],
            ] as const
          ).map(([key, label, max]) => (
            <label className="field" key={key}>
              {label}
              {key === 'goal' || key === 'audience' ? (
                <textarea
                  maxLength={max}
                  value={snapshot.project[key]}
                  disabled={busy}
                  onChange={(e) =>
                    setSnapshot({
                      ...snapshot,
                      project: { ...snapshot.project, [key]: e.target.value },
                    })
                  }
                />
              ) : (
                <input
                  type={key === 'figmaUrl' ? 'url' : 'text'}
                  maxLength={max}
                  value={snapshot.project[key]}
                  disabled={busy}
                  onChange={(e) =>
                    setSnapshot({
                      ...snapshot,
                      project: { ...snapshot.project, [key]: e.target.value },
                    })
                  }
                />
              )}
            </label>
          ))}
          <button disabled={busy}>
            {busy ? 'Enregistrement…' : 'Enregistrer le brief'}
          </button>
        </form>
      )}
      <button type="button" disabled={busy} onClick={() => void load()}>
        <ArrowsClockwise />
        Recharger
      </button>
      <button
        type="button"
        disabled={busy || !snapshot}
        onClick={() => {
          void request<ProjectSnapshot>('project')
            .then(({ project: p }) => {
              downloadText(
                'PFE-brief.md',
                `# ${p.name || 'Mon PFE'}\n\n## Public\n\n${p.audience}\n\n## Objectif\n\n${p.goal}\n\n## Repère Figma (sans connexion)\n\n${p.figmaUrl}\n`,
              );
            })
            .catch((e) => setError(e.message));
        }}
      >
        <DownloadSimple />
        Exporter (.md)
      </button>
      <p className="privacy-note">
        Envoyé à l’agent avec Codex : aucune donnée sensible.
      </p>
    </details>
  );
}
