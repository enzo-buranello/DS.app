import { z } from 'zod';

// Protocole app ↔ plugin Figma (via WebSocket local).
// Requête : { id, command, params } → réponse : { id, ok, result | error }.
const nodeId = z.string().min(1).max(80);
export const commandParams = {
  ping: z.object({}).strict(),
  get_document_info: z.object({}).strict(),
  get_selection: z.object({}).strict(),
  get_node: z.object({ id: nodeId }).strict(),
  create_frame: z
    .object({
      x: z.number().finite().min(-100_000).max(100_000),
      y: z.number().finite().min(-100_000).max(100_000),
      width: z.number().finite().min(1).max(100_000),
      height: z.number().finite().min(1).max(100_000),
      name: z.string().max(200),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    })
    .strict(),
  set_text: z.object({ id: nodeId, text: z.string().max(10_000) }).strict(),
  delete_node: z.object({ id: nodeId }).strict(),
};
export type FigmaCommand = keyof typeof commandParams;
export const figmaCommands = Object.keys(commandParams) as FigmaCommand[];
export type FigmaParams<C extends FigmaCommand> = z.infer<
  (typeof commandParams)[C]
>;

export const responseSchema = z
  .object({
    id: z.string().max(80),
    ok: z.boolean(),
    result: z.unknown().optional(),
    error: z.string().max(2000).optional(),
  })
  .strict();
export type FigmaResponse = z.infer<typeof responseSchema>;

/** État affiché dans l'app : serveur arrêté, en attente du plugin, ou relié. */
export interface FigmaStatus {
  state: 'disconnected' | 'waiting' | 'connected';
  port: number;
  fileName: string | null;
  error: string | null;
}
export const DEFAULT_FIGMA_PORT = 3055;
export const FIGMA_TIMEOUT_MS = 10_000;
