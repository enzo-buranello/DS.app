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
