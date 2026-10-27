import { useEffect, useId, useRef, useState } from 'react';
import type { Tokens } from '../shared/model.js';
import type {
  ExportKind,
  ExportResult,
  PageTarget,
} from '../shared/figmaExport.js';
import type { ExportJob } from '../shared/figmaProtocol.js';
import {
  cancelFigmaExport,
  figmaExportJob,
  figmaStatus,
  runFigma,
  startFigmaExport,
  useFigmaStatus,
} from './figma.js';
import { designSystemPayload, previewPayload } from './figmaSerialize.js';

interface DocumentInfo {
  name: string;
  currentPage?: { id: string; name: string };
  pages?: { id: string; name: string }[];
}
const KIND_LABEL: Record<ExportKind, string> = {
  design_system: 'Design system',
  preview: 'Aperçu actuel',
};
const NEW_PAGE: Record<ExportKind, string> = {
  design_system: 'DS-Studio – Design system',
  preview: 'DS-Studio – Aperçu',
};

// Export natif vers le fichier ouvert dans Figma desktop, via le pont local.
export default function FigmaExportButton({
  tokens,
  scenario,
  initialKind = 'design_system',
  onDone,
  onError,
}: {
  tokens: Tokens;
  scenario: { id: string; label: string; width: number };
  initialKind?: ExportKind;
  onDone: (text: string) => void;
  onError: (message: string) => void;
}) {
  const status = useFigmaStatus();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ExportKind>(initialKind);
  const [doc, setDoc] = useState<DocumentInfo>();
  const [target, setTarget] = useState('current');
  const [newName, setNewName] = useState(NEW_PAGE[initialKind]);
  const [job, setJob] = useState<ExportJob>();
  const [phase, setPhase] = useState<'' | 'capture' | 'export'>('');
  const [problem, setProblem] = useState('');
  const menuId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const connected = status?.state === 'connected';
  const busy = phase !== '';

  // Pages du fichier : relues à l'ouverture et à chaque (re)connexion.
  useEffect(() => {
    if (!open || !connected) return;
    runFigma('get_document_info', {})
      .then((info) => setDoc(info as DocumentInfo))
      .catch((e) => setProblem((e as Error).message));
  }, [open, connected, status?.fileName]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (
        !busy &&
        !menu.current?.contains(e.target as Node) &&
        !button.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || busy) return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    requestAnimationFrame(() =>
      (
        menu.current?.querySelector<HTMLElement>('button:not(:disabled)') ??
        menu.current
      )?.focus(),
    );
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open, busy]);

  function choose(next: ExportKind) {
    setKind(next);
    setNewName(NEW_PAGE[next]);
  }
  const page = (): PageTarget =>
    target === 'current'
      ? { mode: 'current' }
      : target === 'new'
        ? { mode: 'new', name: newName.trim() || NEW_PAGE[kind] }
        : { mode: 'existing', id: target };
  function report(result: ExportResult) {
    const parts = [
      `Export ${KIND_LABEL[kind]} vers « ${result.pageName} » : ${result.created} créé(s), ${result.updated} mis à jour.`,
    ];
    if (result.warnings.length)
      parts.push(`Avertissements : ${result.warnings.slice(0, 3).join(' ')}`);
    if (result.orphans.length)
      parts.push(
        `${result.orphans.length} élément(s) DS-Studio présent(s) dans Figma mais plus dans l’app, non supprimé(s) : ${result.orphans
          .slice(0, 5)
          .map((o) => o.name)
          .join(', ')}.`,
      );
    onDone(parts.join(' '));
  }
  async function run() {
    setProblem('');
    setPhase('capture');
    try {
      const payload =
        kind === 'design_system'
          ? await designSystemPayload(tokens, page())
          : await previewPayload(tokens, page(), scenario);
      setPhase('export');
      let current = await startFigmaExport(payload);
      setJob(current);
      while (current.state === 'running') {
        await new Promise((r) => setTimeout(r, 250));
        current = await figmaExportJob(current.id);
        setJob(current);
      }
      if (current.state === 'done') {
        report(current.result as ExportResult);
        setOpen(false);
        button.current?.focus();
      } else if (current.state === 'cancelled') {
        setProblem(
          'Export annulé. Les éléments déjà écrits restent dans Figma ; un nouvel export les mettra à jour.',
        );
      } else throw new Error(current.error ?? 'Export impossible.');
    } catch (e) {
      setProblem((e as Error).message);
      onError((e as Error).message);
    } finally {
      setPhase('');
      setJob(undefined);
    }
  }

  const percent =
    job && job.total ? Math.round((job.done / job.total) * 100) : 0;
  return (
    <div className="export-anchor">
      <button
        ref={button}
        className="export-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">↗</span> Exporter
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          className="export-menu"
          role="dialog"
          aria-label="Exporter vers Figma"
          tabIndex={-1}
        >
          {!connected ? (
            <>
              <p className="export-problem" role="status">
                Lance le plugin DS-Studio dans Figma desktop.
              </p>
              <button type="button" onClick={() => void figmaStatus()}>
                Réessayer
              </button>
            </>
          ) : (
            <>
              <p className="export-file">
                Fichier Figma : <strong>{status?.fileName}</strong>
              </p>
              <div
                className="segmented"
                role="group"
                aria-label="Contenu à exporter"
              >
                {(['design_system', 'preview'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={kind === k}
                    disabled={busy}
                    onClick={() => choose(k)}
                  >
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              <label className="field">
                Page cible
                <select
                  value={target}
                  disabled={busy}
                  onChange={(e) => setTarget(e.target.value)}
                >
                  <option value="current">
                    Page courante
                    {doc?.currentPage ? ` (${doc.currentPage.name})` : ''}
                  </option>
                  {(doc?.pages ?? [])
                    .filter((p) => p.id !== doc?.currentPage?.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  <option value="new">Nouvelle page…</option>
                </select>
              </label>
              {target === 'new' && (
                <label className="field">
                  Nom de la nouvelle page
                  <input
                    value={newName}
                    disabled={busy}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </label>
              )}
              {busy ? (
                <div className="export-progress">
                  <div
                    className="export-bar"
                    role="progressbar"
                    aria-label="Avancement de l’export"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                  >
                    <span
                      style={{
                        width: `${phase === 'capture' ? 3 : Math.max(3, percent)}%`,
                      }}
                    />
                  </div>
                  <p className="token-hint" role="status">
                    {phase === 'capture'
                      ? 'Préparation des éléments…'
                      : `${job?.label ?? 'Envoi…'}${job?.total ? ` · ${job.done}/${job.total}` : ''}`}
                  </p>
                  <button
                    type="button"
                    disabled={!job || job.state !== 'running'}
                    onClick={() =>
                      job && void cancelFigmaExport(job.id).then(setJob)
                    }
                  >
                    Annuler
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="studio-primary"
                  onClick={() => void run()}
                >
                  Exporter {KIND_LABEL[kind].toLowerCase()}
                </button>
              )}
            </>
          )}
          {problem && (
            <p className="error" role="alert">
              {problem}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
