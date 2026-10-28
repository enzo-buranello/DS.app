import { useEffect, useId, useRef, useState } from 'react';
import { X } from '@phosphor-icons/react';
import type { FigmaCommand, FigmaStatus } from '../shared/figmaProtocol.js';
import { parseFigmaUrl } from '../shared/figmaTarget.js';
import {
  clearFigmaTarget,
  openFigmaFile,
  runFigma,
  setFigmaTarget,
  useFigmaStatus,
} from './figma.js';

const LABEL: Record<FigmaStatus['state'], string> = {
  disconnected: 'déconnecté',
  waiting: 'en attente du plugin',
  connected: 'connecté',
};

const WAIT_MS = 60_000;

// Indicateur d'état (barre principale) : un clic ouvre le choix de la cible
// Figma par URL ; le panneau de test des commandes reste accessible de là.
export default function FigmaBridgePanel() {
  const status = useFigmaStatus();
  const [targetOpen, setTargetOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [nodeId, setNodeId] = useState('');
  const [text, setText] = useState('Texte modifié depuis DS-Studio');
  const [frame, setFrame] = useState({
    x: 0,
    y: 0,
    width: 320,
    height: 200,
    name: 'Frame DS-Studio',
    color: '#3154C4',
  });
  const [busy, setBusy] = useState<FigmaCommand | ''>('');
  const [output, setOutput] = useState<{
    command: FigmaCommand;
    ok: boolean;
    value: unknown;
    ms: number;
  }>();

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  async function run(command: FigmaCommand, params: object) {
    setBusy(command);
    const start = performance.now();
    try {
      const value = await runFigma(command, params as never);
      setOutput({ command, ok: true, value, ms: performance.now() - start });
      // L'id du dernier nœud créé ou sélectionné sert aux commandes suivantes.
      const first = Array.isArray(value) ? value[0] : value;
      if (
        first &&
        typeof first === 'object' &&
        'id' in first &&
        command !== 'get_document_info'
      )
        setNodeId(String((first as { id: string }).id));
    } catch (e) {
      setOutput({
        command,
        ok: false,
        value: (e as Error).message,
        ms: performance.now() - start,
      });
    } finally {
      setBusy('');
    }
  }

  const state = status?.state ?? 'disconnected';
  const connected = state === 'connected';
  const target = status?.target ?? null;
  const action = (command: FigmaCommand, params: object, label?: string) => (
    <button
      type="button"
      disabled={!connected || !!busy}
      onClick={() => void run(command, params)}
    >
      {busy === command ? '…' : (label ?? command)}
    </button>
  );
  return (
    <div className="export-anchor">
      <button
        className="figma-status"
        data-state={
          target ? (status?.targetConnected ? 'connected' : 'waiting') : state
        }
        aria-haspopup="dialog"
        aria-expanded={targetOpen}
        onClick={() => setTargetOpen(!targetOpen)}
        title={status?.error ?? `Pont Figma · port ${status?.port ?? '—'}`}
      >
        <span className="figma-dot" aria-hidden="true" />
        <span aria-live="polite">
          {target ? (
            <>
              Figma : {target.fileName} / {target.pageName}
              {status?.targetConnected ? '' : ' · fichier non ouvert'}
            </>
          ) : (
            <>
              Figma : {LABEL[state]}
              {connected && status?.fileName ? ` · ${status.fileName}` : ''}
            </>
          )}
        </span>
      </button>
      {targetOpen && (
        <TargetPopover
          connections={status?.connections ?? []}
          target={target}
          onClose={() => setTargetOpen(false)}
          onTest={() => {
            setTargetOpen(false);
            setOpen(true);
          }}
        />
      )}
      <dialog
        ref={dialog}
        className="figma-test"
        aria-labelledby="figma-test-title"
        onCancel={() => setOpen(false)}
      >
        <div className="dialog-head">
          <h2 id="figma-test-title">Pont Figma</h2>
          <button
            className="icon-btn"
            aria-label="Fermer"
            onClick={() => setOpen(false)}
          >
            <X />
          </button>
        </div>
        <p className="figma-test-state">
          {connected
            ? `Connecté à « ${status?.fileName ?? 'fichier sans nom'} ».`
            : state === 'waiting'
              ? `En attente du plugin · Plugins › Development › DS-Studio Bridge (port ${status?.port}).`
              : (status?.error ?? 'Pont Figma déconnecté.')}
        </p>
        <div className="figma-test-grid">
          <section aria-label="Lecture">
            {action('ping', {})}
            {action('get_document_info', {})}
            {action('get_selection', {})}
          </section>
          <section aria-label="Nœud">
            <label className="field">
              ID du nœud
              <input
                value={nodeId}
                placeholder="12:34"
                onChange={(e) => setNodeId(e.target.value.trim())}
              />
            </label>
            <div className="control-row">
              {action('get_node', { id: nodeId })}
              {action('delete_node', { id: nodeId })}
            </div>
            <label className="field">
              Nouveau texte
              <input value={text} onChange={(e) => setText(e.target.value)} />
            </label>
            {action('set_text', { id: nodeId, text })}
          </section>
          <section aria-label="Créer une frame">
            <div className="frame-fields">
              {(['x', 'y', 'width', 'height'] as const).map((k) => (
                <label className="field" key={k}>
                  {k}
                  <input
                    type="number"
                    value={frame[k]}
                    onChange={(e) =>
                      setFrame({ ...frame, [k]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="control-row">
              <label className="field">
                Nom de la frame
                <input
                  value={frame.name}
                  onChange={(e) => setFrame({ ...frame, name: e.target.value })}
                />
              </label>
              <label className="field narrow">
                Fond de la frame
                <input
                  className="color-picker"
                  type="color"
                  value={frame.color}
                  onChange={(e) =>
                    setFrame({ ...frame, color: e.target.value.toUpperCase() })
                  }
                />
              </label>
            </div>
            {action('create_frame', frame)}
          </section>
        </div>
        <section aria-label="Résultat" className="figma-result">
          {output && (
            <>
              <p role="status" className={output.ok ? 'notice' : 'error'}>
                {output.command} · {output.ok ? 'ok' : 'erreur'} ·{' '}
                {Math.round(output.ms)} ms
              </p>
              <pre>
                {output.ok
                  ? JSON.stringify(output.value, null, 2)
                  : String(output.value)}
              </pre>
            </>
          )}
        </section>
      </dialog>
    </div>
  );
}

// Popover « Cible Figma » : URL du fichier (et du nœud) → fichier et page cibles.
function TargetPopover({
  connections,
  target,
  onClose,
  onTest,
}: {
  connections: FigmaStatus['connections'];
  target: { fileName: string; pageName: string; url: string } | null;
  onClose: () => void;
  onTest: () => void;
}) {
  const [url, setUrl] = useState(target?.url ?? '');
  const [phase, setPhase] = useState<
    'idle' | 'checking' | 'waiting' | 'timeout'
  >('idle');
  const [waitingKey, setWaitingKey] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [problem, setProblem] = useState('');
  const [warning, setWarning] = useState('');
  const [done, setDone] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();

  useEffect(() => {
    input.current?.focus();
    const outside = (e: PointerEvent) => {
      const anchor = box.current?.parentElement;
      if (!anchor?.contains(e.target as Node)) onClose();
    };
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [onClose]);

  async function validate() {
    setFieldError('');
    setProblem('');
    setWarning('');
    setDone('');
    const parsed = parseFigmaUrl(url);
    if (!parsed.ok) return setFieldError(parsed.error);
    setPhase('checking');
    try {
      const r = await setFigmaTarget(url);
      if (r.state === 'ok') {
        setPhase('idle');
        setWarning(r.warning ?? '');
        setDone(`Cible : ${r.target.fileName} / ${r.target.pageName}.`);
        return;
      }
      // Fichier pas encore relié : Figma desktop l'ouvre, on attend le plugin.
      await openFigmaFile(url).catch((e) => setProblem((e as Error).message));
      setWaitingKey(r.fileKey);
      setPhase('waiting');
    } catch (e) {
      setPhase('idle');
      setProblem((e as Error).message);
    }
  }
  // En attente : dès que le plugin du fichier se connecte, la cible est validée.
  const arrived = connections.some((c) => c.fileKey === waitingKey);
  useEffect(() => {
    if (phase !== 'waiting') return;
    if (arrived) {
      void validate();
      return;
    }
    const timer = setTimeout(() => setPhase('timeout'), WAIT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, arrived]);

  return (
    <div
      ref={box}
      className="export-menu figma-target"
      role="dialog"
      aria-label="Cible Figma"
    >
      <h2>Cible Figma</h2>
      <p className="export-file">
        {target ? (
          <>
            Actuelle :{' '}
            <strong>
              {target.fileName} / {target.pageName}
            </strong>
          </>
        ) : (
          'Aucune cible : dernier fichier où le plugin a été lancé.'
        )}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void validate();
        }}
      >
        <label className="field">
          Lien du fichier ou de la page Figma
          <input
            ref={input}
            value={url}
            placeholder="URL Figma"
            aria-invalid={!!fieldError}
            aria-describedby={fieldError ? errorId : undefined}
            disabled={phase === 'checking' || phase === 'waiting'}
            onChange={(e) => {
              setUrl(e.target.value);
              setFieldError('');
            }}
          />
        </label>
        {fieldError && (
          <p id={errorId} className="field-error" role="alert">
            {fieldError}
          </p>
        )}
        <button
          type="submit"
          className="studio-primary"
          disabled={phase === 'checking' || phase === 'waiting'}
        >
          {phase === 'checking' ? 'Vérification…' : 'Valider'}
        </button>
      </form>
      {phase === 'waiting' && (
        <p className="export-problem" role="status">
          En attente du plugin DS-Studio dans ce fichier…
        </p>
      )}
      {phase === 'timeout' && (
        <div className="control-row">
          <p className="export-problem" role="alert">
            Plugin non détecté dans ce fichier après 60 s.
          </p>
          <button type="button" onClick={() => void validate()}>
            Réessayer
          </button>
        </div>
      )}
      {done && (
        <p className="notice" role="status">
          {done}
        </p>
      )}
      {warning && (
        <p className="export-problem" role="alert">
          {warning}
        </p>
      )}
      {problem && (
        <p className="error" role="alert">
          {problem}
        </p>
      )}
      <div className="control-row">
        {target && (
          <button
            type="button"
            onClick={() =>
              void clearFigmaTarget()
                .then(() => setDone('Cible retirée.'))
                .catch((e) => setProblem((e as Error).message))
            }
          >
            Retirer
          </button>
        )}
        <button type="button" onClick={onTest}>
          Tester le pont
        </button>
      </div>
    </div>
  );
}
