// Agent transversal : ce que l'interface en voit. Aucun texte libre : un QCM,
// une liste d'étapes muette, une confirmation, une bulle d'avis.

/** Question à choix ; la première option est celle que l'IA recommande. */
export type Question = { id: string; label: string; options: string[] };
/** Réponses par identifiant de question ; null : « Décider pour moi ». */
export type Answers = Record<string, string>;

export type Step = {
  label: string;
  state: 'todo' | 'doing' | 'done' | 'failed';
  /** Une seule ligne courte, en cas d'échec. */
  error?: string;
};

/** Avis de designer ; `apply` : instruction exécutée par « Appliquer ». */
export type Advice = { text: string; apply?: string };

/** Réglages de l'app (hors projet). */
export type Settings = { questions: boolean; advice: boolean };
export const defaultSettings: Settings = { questions: true, advice: true };

export type AgentEvent =
  | { kind: 'steps'; steps: Step[] }
  | { kind: 'ask'; questions: Question[] }
  | { kind: 'confirm'; items: string[] }
  | { kind: 'idle' };
