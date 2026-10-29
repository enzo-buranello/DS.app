import { useEffect, useState } from 'react';
import { ClockCounterClockwise } from '@phosphor-icons/react';
import type { Entry } from '../shared/history.js';

// Historique : les itérations du projet, de la plus récente à la plus
// ancienne ; « Restaurer » crée elle-même une nouvelle entrée.

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

export function HistoryButton(props: {
  path: string;
  /** Change à chaque écriture : la liste se recharge. */
  version: string;
  onRestore: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Entry[]>([]);
  useEffect(() => {
    if (open) void window.studio.history(props.path).then(setList);
  }, [open, props.path, props.version]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    addEventListener('click', close);
    return () => removeEventListener('click', close);
  }, [open]);
  return (
    <div className="history-anchor">
      <button
        className="icon-btn"
        aria-label="Historique"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        <ClockCounterClockwise />
      </button>
      {open && (
        <div
          className="menu history"
          role="dialog"
          aria-label="Historique"
          onClick={(e) => e.stopPropagation()}
        >
          <h2>Historique</h2>
          <ol>
            {list.map((e, i) => (
              <li key={e.id}>
                <div className="history-text">
                  <span className="ellipsis">
                    {e.label ?? 'Modification manuelle'}
                  </span>
                  <span className="muted">
                    {e.scope === 'element' ? 'Élément' : 'Global'} ·{' '}
                    {time(e.at)}
                  </span>
                </div>
                {i > 0 && (
                  <button
                    className="ghost"
                    onClick={() => {
                      setOpen(false);
                      props.onRestore(e.id);
                    }}
                  >
                    Restaurer
                  </button>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
