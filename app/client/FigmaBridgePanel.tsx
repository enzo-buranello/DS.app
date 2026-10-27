import { useEffect, useRef, useState } from 'react';
import type { FigmaCommand, FigmaStatus } from '../shared/figmaProtocol.js';
import { runFigma, useFigmaStatus } from './figma.js';

const LABEL: Record<FigmaStatus['state'], string> = {
  disconnected: 'déconnecté',
  waiting: 'en attente du plugin',
  connected: 'connecté',
};

// Indicateur d'état (barre principale) et panneau de test des commandes.
export default function FigmaBridgePanel() {
  const status = useFigmaStatus();
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
    <>
      <button
        className="figma-status"
        data-state={state}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        title={status?.error ?? `Pont Figma · port ${status?.port ?? '—'}`}
      >
        <span className="figma-dot" aria-hidden="true" />
        <span aria-live="polite">
          Figma : {LABEL[state]}
          {connected && status?.fileName ? ` · ${status.fileName}` : ''}
        </span>
      </button>
      <dialog
        ref={dialog}
        className="figma-test"
        aria-labelledby="figma-test-title"
        onCancel={() => setOpen(false)}
      >
        <div className="dialog-head">
          <h2 id="figma-test-title">Pont Figma</h2>
          <button onClick={() => setOpen(false)}>Fermer</button>
        </div>
        <p className="figma-test-state">
          {connected
            ? `Connecté à « ${status?.fileName ?? 'fichier sans nom'} ».`
            : state === 'waiting'
              ? `En attente du plugin : dans Figma Desktop, lancez Plugins › Development › DS-Studio Bridge (port ${status?.port}).`
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
          {output ? (
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
          ) : (
            <p className="token-hint">Le résultat JSON s’affiche ici.</p>
          )}
        </section>
      </dialog>
    </>
  );
}
