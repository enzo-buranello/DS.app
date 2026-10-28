import { z } from 'zod';
import type { FigmaTarget } from './figmaTarget.js';

// Protocole app ↔ plugin Figma (via WebSocket local).
// Requête : { id, command, params } → réponse : { id, ok, result | error }.
const nodeId = z.string().min(1).max(80);
export const commandParams = {
  ping: z.object({}).strict(),
  get_document_info: z.object({}).strict(),
  get_file_info: z.object({}).strict(),
  set_target_page: z.object({ nodeId: nodeId.nullable() }).strict(),
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
// Pendant un export, le plugin envoie l'avancement de la commande en cours.
export const progressSchema = z
  .object({
    id: z.string().max(80),
    progress: z
      .object({
        done: z.number().int().min(0),
        total: z.number().int().min(0),
        label: z.string().max(200),
      })
      .strict(),
  })
  .strict();
// Commandes internes de l'export (non exposées au panneau de test).
export type InternalCommand =
  | 'export_chunk'
  | 'export_design_system'
  | 'export_preview'
  | 'sync_changes'
  | 'cancel';
// À la connexion, le plugin annonce le fichier ouvert (clé et nom).
export const helloSchema = z
  .object({
    hello: z
      .object({
        fileKey: z.string().max(80).nullable(),
        fileName: z.string().max(200),
        /** Format d'export compris par le plugin (absent : plugin ancien). */
        exportVersion: z.number().int().min(1).max(1000).optional(),
      })
      .strict(),
  })
  .strict();
export interface FileInfo {
  fileKey: string | null;
  name: string;
  currentPage: { id: string; name: string };
  pages: { id: string; name: string }[];
}
export interface ExportJob {
  id: string;
  kind: 'design_system' | 'preview';
  state: 'running' | 'done' | 'error' | 'cancelled';
  done: number;
  total: number;
  label: string;
  result?: unknown;
  error?: string;
}

/** État affiché dans l'app : serveur arrêté, en attente du plugin, ou relié. */
export interface FigmaStatus {
  state: 'disconnected' | 'waiting' | 'connected';
  port: number;
  fileName: string | null;
  error: string | null;
  /** Une connexion par fichier Figma où le plugin tourne. */
  connections: {
    fileKey: string | null;
    fileName: string | null;
    /** null : plugin annoncé sans version (antérieur au format v2). */
    exportVersion?: number | null;
  }[];
}
/** État vu par l'app : pont + cible du projet. */
export interface StudioFigmaStatus extends FigmaStatus {
  target: FigmaTarget | null;
  /** Le plugin tourne dans le fichier cible. */
  targetConnected: boolean;
}
export type TargetResult =
  | { state: 'ok'; target: FigmaTarget; warning: string | null }
  | { state: 'waiting'; fileKey: string };
export const DEFAULT_FIGMA_PORT = 3055;
export const FIGMA_TIMEOUT_MS = 10_000;
