import { useState } from 'react';
import { ArrowUp } from '@phosphor-icons/react';
import type { Project } from '../shared/project.js';

// Barre IA : aucune conversation. En cours, puis Garder / Annuler, ou une
// seule ligne en cas d'échec.
export type AiState =
  | { status: 'idle' | 'busy' | 'error' }
  | { status: 'review'; previous: Project };

export function PromptBar(props: {
  state: AiState;
  placeholder: string;
  onSubmit: (text: string) => void;
  onKeep: () => void;
  onUndo: (previous: Project) => void;
}) {
  const [text, setText] = useState('');
  const { state } = props;
  if (state.status === 'review')
    return (
      <div className="prompt-bar">
        <span className="prompt-status">Modifié</span>
        <button className="ghost" onClick={() => props.onUndo(state.previous)}>
          Annuler
        </button>
        <button className="studio-primary" onClick={props.onKeep}>
          Garder
        </button>
      </div>
    );
  const busy = state.status === 'busy';
  return (
    <form
      className="prompt-bar"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim() || busy) return;
        props.onSubmit(text.trim());
        setText('');
      }}
    >
      <input
        aria-label="Instruction"
        placeholder={
          busy
            ? 'En cours'
            : state.status === 'error'
              ? 'Impossible d’appliquer la modification'
              : props.placeholder
        }
        className={state.status === 'error' ? 'error' : undefined}
        value={text}
        disabled={busy}
        onChange={(e) => setText(e.target.value)}
      />
      <button
        className="icon-btn studio-primary"
        aria-label="Envoyer"
        disabled={busy || !text.trim()}
      >
        <ArrowUp />
      </button>
    </form>
  );
}
