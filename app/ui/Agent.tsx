import { useEffect, useState } from 'react';
import { Check, Circle, CircleNotch, X } from '@phosphor-icons/react';
import type { Advice, Answers, Question, Step } from '../shared/agent.js';

// Au-dessus de la barre IA, une seule chose à la fois : confirmation, QCM,
// étapes muettes, ou bulle d'avis. Aucune conversation.

export type AgentView = {
  steps: Step[];
  questions: Question[] | null;
  confirm: string[] | null;
  advice: Advice | null;
};
export const idleView: AgentView = {
  steps: [],
  questions: null,
  confirm: null,
  advice: null,
};

export function AgentLayer(props: {
  view: AgentView;
  onAnswer: (a: Answers | null) => void;
  onConfirm: (ok: boolean) => void;
  onApply: (instruction: string) => void;
  onDismiss: () => void;
}) {
  const { view } = props;
  const body = view.confirm ? (
    <Confirm items={view.confirm} onDone={props.onConfirm} />
  ) : view.questions ? (
    <Choices questions={view.questions} onDone={props.onAnswer} />
  ) : view.steps.length ? (
    <Steps steps={view.steps} />
  ) : view.advice ? (
    <Bubble
      advice={view.advice}
      onApply={props.onApply}
      onDismiss={props.onDismiss}
    />
  ) : null;
  return body && <div className="agent-layer">{body}</div>;
}

function Steps(props: { steps: Step[] }) {
  return (
    <ol className="agent-steps" aria-label="Étapes">
      {props.steps.map((s, i) => (
        <li key={i} data-state={s.state}>
          {s.state === 'done' ? (
            <Check />
          ) : s.state === 'doing' ? (
            <CircleNotch className="spin" />
          ) : s.state === 'failed' ? (
            <X />
          ) : (
            <Circle />
          )}
          <span>{s.label}</span>
          {s.error && <span className="error">{s.error}</span>}
        </li>
      ))}
    </ol>
  );
}

const OTHER = '\u0000autre';

function Choices(props: {
  questions: Question[];
  onDone: (a: Answers | null) => void;
}) {
  const [picked, setPicked] = useState<Answers>(() =>
    Object.fromEntries(props.questions.map((q) => [q.id, q.options[0]])),
  );
  const [other, setOther] = useState<Answers>({});
  const answers = Object.fromEntries(
    Object.entries(picked).map(([id, v]) => [
      id,
      v === OTHER ? other[id]?.trim() : v,
    ]),
  );
  const ready = Object.values(answers).every(Boolean);
  return (
    <form
      className="agent-card"
      aria-label="Précisions"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) props.onDone(answers as Answers);
      }}
    >
      {props.questions.map((q) => (
        <fieldset key={q.id}>
          <legend>{q.label}</legend>
          <div className="choices">
            {q.options.map((o, i) => (
              <label key={o} className="choice">
                <input
                  type="radio"
                  name={q.id}
                  checked={picked[q.id] === o}
                  onChange={() => setPicked({ ...picked, [q.id]: o })}
                />
                {o}
                {i === 0 && <span className="tag">Recommandé</span>}
              </label>
            ))}
            <label className="choice">
              <input
                type="radio"
                name={q.id}
                aria-label="Autre"
                checked={picked[q.id] === OTHER}
                onChange={() => setPicked({ ...picked, [q.id]: OTHER })}
              />
              <input
                className="choice-other"
                placeholder="Autre"
                aria-label={`${q.label} : autre`}
                maxLength={60}
                value={other[q.id] ?? ''}
                onFocus={() => setPicked({ ...picked, [q.id]: OTHER })}
                onChange={(e) => setOther({ ...other, [q.id]: e.target.value })}
              />
            </label>
          </div>
        </fieldset>
      ))}
      <div className="row agent-actions">
        <button
          type="button"
          className="ghost"
          onClick={() => props.onDone(null)}
        >
          Décider pour moi
        </button>
        <button className="studio-primary" disabled={!ready}>
          Valider
        </button>
      </div>
    </form>
  );
}

function Confirm(props: { items: string[]; onDone: (ok: boolean) => void }) {
  return (
    <div className="agent-card" role="alertdialog" aria-label="Supprimer">
      <ul className="agent-list">
        {props.items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
      <div className="row agent-actions">
        <button className="ghost" onClick={() => props.onDone(false)}>
          Garder
        </button>
        <button className="danger" onClick={() => props.onDone(true)}>
          Supprimer
        </button>
      </div>
    </div>
  );
}

const ADVICE_MS = 12_000;

function Bubble(props: {
  advice: Advice;
  onApply: (instruction: string) => void;
  onDismiss: () => void;
}) {
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (hover) return;
    const t = setTimeout(props.onDismiss, ADVICE_MS);
    return () => clearTimeout(t);
  }, [props.advice, hover]);
  const { apply } = props.advice;
  return (
    <div
      className="advice"
      role="status"
      aria-label="Avis"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <p>{props.advice.text}</p>
      {apply && (
        <button className="advice-apply" onClick={() => props.onApply(apply)}>
          Appliquer
        </button>
      )}
      <button
        className="advice-close"
        aria-label="Fermer"
        onClick={props.onDismiss}
      >
        <X />
      </button>
    </div>
  );
}
