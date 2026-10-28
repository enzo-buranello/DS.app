import { createHash } from 'node:crypto';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  docSchema,
  MAX_DOC_BYTES,
  nodeIdSchema,
  nodeSchema,
  type Doc,
} from '../shared/doc.js';
import { editsFileSchema } from '../shared/edits.js';
import { importComponents, migrateEdits } from '../shared/migrate.js';
import { seedDoc } from '../shared/seedDoc.js';
import { componentSchema, componentsFileSchema } from '../shared/component.js';
import { tokenKeys, type TokenKey } from '../shared/model.js';
import { atomicWrite, readPrivate } from './files.js';
import { StudioError } from './store.js';

// Opération sur un nœud entier : valeur attendue avant, valeur après (null =
// absent). Le serveur refuse l'écriture si le nœud a changé entre-temps.
export const nodeOpSchema = z
  .object({
    id: nodeIdSchema,
    before: nodeSchema.nullable(),
    after: nodeSchema.nullable(),
  })
  .strict();
export type NodeOp = z.infer<typeof nodeOpSchema>;
// Liste des écrans (racines de l'aperçu) : avant / après, comme un nœud.
export const screensOpSchema = z
  .object({
    before: z.array(nodeIdSchema).max(50),
    after: z.array(nodeIdSchema).min(1).max(50),
  })
  .strict();
export type ScreensOp = z.infer<typeof screensOpSchema>;

const absent = (e: unknown) => (e as NodeJS.ErrnoException).code === 'ENOENT';

// Document de nœuds (.ds-studio/document.json). Créé au premier accès depuis
// le document de départ et, s'il existe, edits.json (v1), qui n'est jamais
// modifié ni supprimé : il reste la sauvegarde de l'état v1.
export class DocStore {
  private queue: Promise<unknown> = Promise.resolve();
  private file: string;
  private legacy: string;
  private components: string;
  constructor(directory: string) {
    this.file = path.join(directory, 'document.json');
    this.legacy = path.join(directory, 'edits.json');
    this.components = path.join(directory, 'components.json');
  }
  private async load(): Promise<Doc> {
    let doc: Doc;
    try {
      const raw = await readPrivate(this.file, MAX_DOC_BYTES);
      doc = docSchema.parse(JSON.parse(raw));
    } catch (e) {
      if (!absent(e))
        throw new StudioError(
          'Document invalide ou inaccessible. Original préservé.',
          500,
        );
      doc = await this.migrate();
    }
    return doc.migratedFrom?.components === undefined
      ? this.importComponents(doc)
      : doc;
  }
  // Composants créés (components.json, v1) : importés une fois dans le
  // document. Le fichier n'est ni modifié ni supprimé.
  private async importComponents(doc: Doc): Promise<Doc> {
    let raw: string | null = null;
    try {
      raw = await readPrivate(this.components, 1_000_000);
    } catch (e) {
      if (!absent(e)) return doc;
    }
    const parsed =
      raw === null ? null : componentsFileSchema.safeParse(JSON.parse(raw));
    // Fichier illisible : on réessaiera, sans bloquer le document.
    if (parsed && !parsed.success) return doc;
    const next = importComponents(doc, parsed?.data.components ?? []);
    next.migratedFrom = {
      edits: doc.migratedFrom?.edits ?? null,
      at: doc.migratedFrom?.at ?? new Date().toISOString(),
      components:
        raw === null ? null : createHash('sha256').update(raw).digest('hex'),
    };
    const valid = docSchema.parse(next);
    await atomicWrite(this.file, JSON.stringify(valid, null, 2) + '\n');
    return valid;
  }
  private async migrate(): Promise<Doc> {
    let raw: string | null = null;
    try {
      raw = await readPrivate(this.legacy, 1_000_000);
    } catch (e) {
      if (!absent(e))
        throw new StudioError(
          'edits.json inaccessible. Original préservé.',
          500,
        );
    }
    let doc = seedDoc();
    if (raw !== null) {
      const parsed = editsFileSchema.safeParse(JSON.parse(raw));
      if (!parsed.success)
        throw new StudioError(
          'edits.json (v1) invalide : migration interrompue, original préservé.',
          500,
        );
      doc = migrateEdits(doc, parsed.data).doc;
    }
    doc.migratedFrom = {
      edits:
        raw === null ? null : createHash('sha256').update(raw).digest('hex'),
      at: new Date().toISOString(),
    };
    const valid = docSchema.parse(doc);
    await atomicWrite(this.file, JSON.stringify(valid, null, 2) + '\n');
    return valid;
  }
  read(): Promise<Doc> {
    const work = this.queue.then(() => this.load());
    this.queue = work.catch(() => {});
    return work;
  }
  /** Applique un geste (plusieurs nœuds) en une seule écriture atomique. */
  apply(ops: NodeOp[], screens?: ScreensOp) {
    const work = this.queue.then(async () => {
      const current = await this.load();
      const next: Doc = { ...current, nodes: { ...current.nodes } };
      if (screens) {
        if (!isDeepStrictEqual(current.screens, screens.before))
          throw new StudioError(
            'La liste des écrans a changé entre-temps : rien n’a été écrit. Rechargez.',
            409,
          );
        next.screens = screens.after;
      }
      for (const op of ops) {
        if (op.after && op.after.id !== op.id)
          throw new StudioError(`Opération incohérente sur ${op.id}.`);
        if (!isDeepStrictEqual(next.nodes[op.id] ?? null, op.before))
          throw new StudioError(
            `« ${op.before?.name ?? op.id} » a changé entre-temps : rien n’a été écrit. Rechargez.`,
            409,
          );
        if (op.after) next.nodes[op.id] = op.after;
        else delete next.nodes[op.id];
      }
      const valid = docSchema.safeParse(next);
      if (!valid.success)
        throw new StudioError(
          `Document refusé : ${valid.error.issues[0]?.message ?? 'invalide'}`,
          422,
        );
      const raw = JSON.stringify(valid.data, null, 2) + '\n';
      if (raw.length > MAX_DOC_BYTES)
        throw new StudioError('Document trop volumineux.', 413);
      await atomicWrite(
        this.file + '.previous',
        JSON.stringify(current, null, 2) + '\n',
      );
      await atomicWrite(this.file, raw);
      return valid.data;
    });
    this.queue = work.catch(() => {});
    return work;
  }
}

// Pile Cmd+Z persistante : elle survit au rechargement. Chaque entrée est un
// geste (tokens, nœuds ou composant créé), avec ses valeurs avant et après.
const tokenValue = z.union([z.string().max(100), z.number().finite()]);
export const undoOpSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('token'),
      key: z.enum(tokenKeys as [TokenKey, ...TokenKey[]]),
      before: tokenValue,
      after: tokenValue,
    })
    .strict(),
  z.object({ type: z.literal('node'), ...nodeOpSchema.shape }).strict(),
  z.object({ type: z.literal('screens'), ...screensOpSchema.shape }).strict(),
  z
    .object({
      type: z.literal('custom'),
      before: componentSchema,
      after: componentSchema,
    })
    .strict(),
]);
export const MAX_HISTORY = 200;
export const historySchema = z
  .object({
    done: z.array(z.array(undoOpSchema).min(1).max(500)).max(MAX_HISTORY),
    undone: z.array(z.array(undoOpSchema).min(1).max(500)).max(MAX_HISTORY),
  })
  .strict();
export type History = z.infer<typeof historySchema>;
export class HistoryStore {
  private queue: Promise<unknown> = Promise.resolve();
  private file: string;
  constructor(directory: string) {
    this.file = path.join(directory, 'history.json');
  }
  async read(): Promise<History> {
    try {
      const raw = await readPrivate(this.file, 4_000_000);
      const parsed = historySchema.safeParse(JSON.parse(raw));
      // Historique illisible : on repart d'une pile vide sans toucher au DS.
      return parsed.success ? parsed.data : { done: [], undone: [] };
    } catch {
      return { done: [], undone: [] };
    }
  }
  save(history: unknown) {
    const valid = historySchema.parse(history);
    const work = this.queue.then(() =>
      atomicWrite(this.file, JSON.stringify(valid) + '\n'),
    );
    this.queue = work.catch(() => {});
    return work.then(() => valid);
  }
}
