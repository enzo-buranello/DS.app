import type { AgentReply, Tokens } from '../../app/shared/model.js';
export type VisionImage = {
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp';
  data: string;
};
export interface AgentContext {
  tokens: Tokens;
  brief: string;
  rules: string;
  history: { role: 'user' | 'assistant'; text: string }[];
  /** Élément sélectionné : la réponse ne doit modifier que lui. */
  element?: AgentElement;
}
export interface AgentElement {
  kind: 'token' | 'master' | 'instance' | 'custom';
  id: string;
  name: string;
  /** Champs modifiables (vide pour un token : seule sa valeur change). */
  fields: string[];
  current: Record<string, unknown>;
  overrides: Record<string, unknown> | null;
  /** Nœuds rendus du périmètre (l'élément et ses descendants). */
  nodes?: unknown[];
}
export interface AgentAdapter {
  id: string;
  status(): Promise<{ available: boolean; detail: string }>;
  reply(
    message: string,
    context: AgentContext,
    signal?: AbortSignal,
  ): Promise<AgentReply>;
  /** Vision (facultatif) : renvoie le JSON brut, validé par l'appelant. */
  describeImage?(
    image: VisionImage,
    instructions: string,
    prompt: string,
    signal?: AbortSignal,
  ): Promise<unknown>;
}
