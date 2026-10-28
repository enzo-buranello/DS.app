import { useRef, useState } from 'react';
import type { DSComponent } from '../shared/component.js';
import type { DocNode } from '../shared/doc.js';
import type { TokenKey, TokenValue } from '../shared/model.js';

// Une opération réversible : la valeur avant et après.
export type UndoOp =
  | { type: 'token'; key: TokenKey; before: TokenValue; after: TokenValue }
  | {
      type: 'node';
      id: string;
      before: DocNode | null;
      after: DocNode | null;
    }
  | { type: 'screens'; before: string[]; after: string[] }
  // Ancien format (composants de components.json) : ignoré à l'annulation.
  | { type: 'custom'; before: DSComponent; after: DSComponent };
export interface UndoStacks {
  done: UndoOp[][];
  undone: UndoOp[][];
}
const MAX = 200;

// Pile d'annulation (panneau, prompt, « Appliquer au composant »). Chaque
// entrée regroupe les opérations d'un même geste. Elle est enregistrée côté
// serveur (history.json) et rechargée : Cmd+Z survit au rechargement.
export function useUndo(
  apply: (ops: UndoOp[], side: 'before' | 'after') => Promise<void>,
  persist: (stacks: UndoStacks) => void,
) {
  const done = useRef<UndoOp[][]>([]);
  const undone = useRef<UndoOp[][]>([]);
  const busy = useRef(false);
  const [, setVersion] = useState(0);
  const bump = () => {
    setVersion((v) => v + 1);
    persist({ done: done.current, undone: undone.current });
  };
  async function move(
    from: UndoOp[][],
    to: UndoOp[][],
    side: 'before' | 'after',
  ) {
    if (busy.current || !from.length) return false;
    busy.current = true;
    const entry = from.pop()!;
    try {
      await apply(side === 'before' ? [...entry].reverse() : entry, side);
      to.push(entry);
      return true;
    } catch (e) {
      from.push(entry);
      throw e;
    } finally {
      busy.current = false;
      bump();
    }
  }
  return {
    /** Pile relue au chargement (avant tout geste de la session). */
    load(stacks: UndoStacks) {
      if (done.current.length || undone.current.length) return;
      done.current = stacks.done.slice(-MAX);
      undone.current = stacks.undone.slice(-MAX);
      setVersion((v) => v + 1);
    },
    push(ops: UndoOp[]) {
      if (!ops.length) return;
      done.current.push(ops);
      if (done.current.length > MAX) done.current.shift();
      undone.current = [];
      bump();
    },
    undo: () => move(done.current, undone.current, 'before'),
    redo: () => move(undone.current, done.current, 'after'),
    canUndo: done.current.length > 0,
    canRedo: undone.current.length > 0,
  };
}
