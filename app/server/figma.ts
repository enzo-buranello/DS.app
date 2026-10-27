import type http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { atomicWrite, readPrivate } from './files.js';
import { StudioError } from './store.js';
import { liveInfoSchema, type LiveInfo } from '../shared/figma.js';
import { z } from 'zod';

const LIVE_TIMEOUT = 5_000;
const resultSchema = z
  .object({
    id: z.string().uuid(),
    ok: z.boolean(),
    data: z.unknown().optional(),
    error: z.string().max(500).optional(),
  })
  .strict();
// Dernier espace cible choisi dans « Exporter » (fichier puis page).
export const selectionSchema = z
  .object({
    fileUrl: z.string().max(500),
    fileKey: z.string().max(64),
    fileName: z.string().max(200),
    pageId: z.string().max(80),
    pageName: z.string().max(200),
  })
  .strict();
export type Selection = z.infer<typeof selectionSchema>;
const emptySelection: Selection = {
  fileUrl: '',
  fileKey: '',
  fileName: '',
  pageId: '',
  pageName: '',
};
// Correspondances côté app : fichier → clé DS-Studio → id du nœud Figma.
const mappingSchema = z.record(
  z.string().max(64),
  z.record(z.string().max(200), z.string().max(80)),
);
type Command = {
  id: string;
  type: 'export';
  args: unknown;
};

// Pont local avec le plugin Figma « DS-Studio Bridge ».
// - Le plugin s'authentifie par un code d'appairage affiché dans l'app (Bearer).
// - Tant qu'il est ouvert, il s'annonce (fichier, pages) et exécute les exports
//   demandés par un clic dans DS-Studio ; rien n'est écrit dans Figma sinon.
export class FigmaBridge {
  private dir: string;
  private token = '';
  private live: (LiveInfo & { seen: number }) | null = null;
  // Dernier appel refusé : plugin lancé mais code d'appairage absent ou périmé.
  private rejected = 0;
  private commands: Command[] = [];
  private waiting = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(directory: string) {
    this.dir = path.join(directory, 'figma');
  }
  private file(name: string) {
    return path.join(this.dir, name);
  }
  async init() {
    await fs.mkdir(this.dir, {
      recursive: true,
      mode: 0o700,
    });
    try {
      this.token = JSON.parse(
        await readPrivate(this.file('pair.json'), 10_000),
      ).token;
    } catch {
      await this.resetPairing();
    }
    if (!/^[a-f0-9]{24}$/.test(this.token)) await this.resetPairing();
  }
  get pairCode() {
    return this.token;
  }
  async resetPairing() {
    this.token = randomBytes(12).toString('hex');
    await atomicWrite(
      this.file('pair.json'),
      JSON.stringify({ token: this.token }),
    );
  }
  private authorized(req: http.IncomingMessage) {
    const got = Buffer.from(String(req.headers.authorization ?? ''));
    const want = Buffer.from(`Bearer ${this.token}`);
    return got.length === want.length && timingSafeEqual(got, want);
  }
  /** Plugin ouvert dans Figma Desktop : il s'annonce au moins toutes les secondes. */
  get liveStatus() {
    const connected = !!this.live && Date.now() - this.live.seen < LIVE_TIMEOUT;
    return {
      connected,
      unpaired: !connected && Date.now() - this.rejected < LIVE_TIMEOUT,
      file: connected ? this.live!.file : null,
      pages: connected ? this.live!.pages : [],
    };
  }
  /** Transmet une commande au plugin ouvert et attend son résultat. */
  command(type: Command['type'], args: unknown, timeout = 60_000) {
    const status = this.liveStatus;
    if (status.unpaired)
      throw new StudioError(
        'Plugin Figma lancé mais non connecté : collez le code d’appairage de DS-Studio dans le plugin.',
        409,
      );
    if (!status.connected)
      throw new StudioError(
        'Plugin Figma non lancé. Ouvrez Figma Desktop puis Plugins > Development > DS-Studio Bridge.',
        409,
      );
    const id = randomUUID();
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        this.commands = this.commands.filter((c) => c.id !== id);
        reject(
          new StudioError(
            'Le plugin Figma n’a pas répondu à temps. Vérifiez qu’il est toujours ouvert.',
            504,
          ),
        );
      }, timeout);
      this.waiting.set(id, { resolve, reject, timer });
      this.commands.push({ id, type, args });
    });
  }
  async selection() {
    try {
      return selectionSchema.parse(
        JSON.parse(await readPrivate(this.file('selection.json'), 10_000)),
      );
    } catch {
      return emptySelection;
    }
  }
  async saveSelection(selection: Selection) {
    await atomicWrite(
      this.file('selection.json'),
      JSON.stringify(selectionSchema.parse(selection)),
    );
    return selection;
  }
  private async mappings() {
    try {
      return mappingSchema.parse(
        JSON.parse(await readPrivate(this.file('exports.json'), 2_000_000)),
      );
    } catch {
      return {};
    }
  }
  /** Ids Figma déjà connus pour ce fichier (clé DS-Studio → id de nœud). */
  async mapping(fileKey: string) {
    return (await this.mappings())[fileKey] ?? {};
  }
  async saveMapping(fileKey: string, nodes: Record<string, string>) {
    const all = await this.mappings();
    all[fileKey] = { ...all[fileKey], ...nodes };
    await atomicWrite(this.file('exports.json'), JSON.stringify(all));
  }
  /** Routes /plugin/figma/* appelées par l'iframe du plugin (origine « null »). */
  async handle(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
    // L'iframe d'un plugin Figma a l'origine opaque « null ». Rien d'autre n'est accepté.
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== 'null')
      throw new StudioError('Origine non autorisée.', 403);
    res.setHeader('Access-Control-Allow-Origin', 'null');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'authorization, content-type',
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Vary', 'Origin');
    const send = (status: number, value: unknown) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      res.end(JSON.stringify(value));
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (!this.authorized(req)) {
      this.rejected = Date.now();
      throw new StudioError(
        'Code d’appairage invalide. Copiez le code affiché dans DS-Studio.',
        401,
      );
    }
    const route = url.pathname.slice('/plugin/figma/'.length);
    if (req.method === 'GET' && route === 'ping')
      return send(200, { ok: true, app: 'DS-Studio' });
    if (req.method !== 'POST') throw new StudioError('Route inconnue.', 404);
    if (!req.headers['content-type']?.startsWith('application/json'))
      throw new StudioError('JSON requis.', 415);
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 40_000_000)
        throw new StudioError('Import trop volumineux.', 413);
      chunks.push(chunk);
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new StudioError('JSON invalide.');
    }
    if (route === 'live') {
      this.live = { ...liveInfoSchema.parse(body), seen: Date.now() };
      return send(200, { command: this.commands.shift() ?? null });
    }
    if (route === 'result') {
      const r = resultSchema.parse(body);
      const pending = this.waiting.get(r.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.waiting.delete(r.id);
        if (r.ok) pending.resolve(r.data);
        else
          pending.reject(
            new StudioError(`Figma : ${r.error ?? 'erreur inconnue.'}`, 502),
          );
      }
      return send(200, { ok: true });
    }
    throw new StudioError('Route inconnue.', 404);
  }
}
