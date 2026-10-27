import type http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { atomicWrite, readPrivate } from './files.js';
import { StudioError } from './store.js';
import {
  figmaImportSchema,
  screensSchema,
  type FigmaExport,
  type StoredImport,
} from '../shared/figma.js';
import type { Tokens } from '../shared/model.js';

// Pont local avec le plugin Figma « DS-Studio Bridge ».
// - Le plugin s'authentifie par un code d'appairage affiché dans l'app (Bearer).
// - Aucune écriture Figma ici : le plugin dessine seulement après un clic humain.
// - L'import ne modifie aucun token : il alimente une proposition soumise au diff.
export class FigmaBridge {
  private dir: string;
  private token = '';
  constructor(directory: string) {
    this.dir = path.join(directory, 'figma');
  }
  private file(name: string) {
    return path.join(this.dir, name);
  }
  async init() {
    await fs.mkdir(path.join(this.dir, 'images'), {
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
  async lastImport(): Promise<StoredImport | null> {
    try {
      return JSON.parse(await readPrivate(this.file('import.json'), 5_000_000));
    } catch {
      return null;
    }
  }
  async lastExport(): Promise<FigmaExport | null> {
    try {
      return JSON.parse(await readPrivate(this.file('export.json'), 5_000_000));
    } catch {
      return null;
    }
  }
  async image(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id))
      throw new StudioError('Image inconnue.', 404);
    return fs.readFile(path.join(this.dir, 'images', `${id}.png`));
  }
  async saveScreens(body: unknown, tokens: Tokens) {
    const { screens } = screensSchema.parse(body);
    const data: FigmaExport = {
      date: new Date().toISOString(),
      tokens,
      screens,
    };
    await atomicWrite(this.file('export.json'), JSON.stringify(data));
    return { date: data.date, screens: screens.length };
  }
  private async saveImport(body: unknown) {
    const data = figmaImportSchema.parse(body);
    // Les anciennes images sont remplacées : l'import reflète la dernière sélection.
    const folder = path.join(this.dir, 'images');
    for (const f of await fs.readdir(folder))
      if (f.endsWith('.png'))
        await fs.unlink(path.join(folder, f)).catch(() => {});
    const images = [];
    for (const img of data.images) {
      const id = randomUUID();
      const buffer = Buffer.from(img.png, 'base64');
      // Signature PNG obligatoire : rien d'autre n'est servi par /api/figma/image.
      if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
        throw new StudioError('Image refusée : PNG attendu.');
      await fs.writeFile(path.join(folder, `${id}.png`), buffer, {
        mode: 0o600,
      });
      images.push({ id, name: img.name, width: img.width, height: img.height });
    }
    const stored: StoredImport = {
      date: new Date().toISOString(),
      fileName: data.fileName,
      variables: data.variables,
      paintStyles: data.paintStyles,
      textStyles: data.textStyles,
      images,
    };
    await atomicWrite(this.file('import.json'), JSON.stringify(stored));
    return {
      variables: stored.variables.length,
      paintStyles: stored.paintStyles.length,
      textStyles: stored.textStyles.length,
      images: images.length,
    };
  }

  /** Routes /plugin/figma/* appelées par l'iframe du plugin (origine « null »). */
  async handle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
    tokens: () => Tokens,
  ) {
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
    if (!this.authorized(req))
      throw new StudioError(
        'Code d’appairage invalide. Copiez le code affiché dans DS-Studio.',
        401,
      );
    const route = url.pathname.slice('/plugin/figma/'.length);
    if (req.method === 'GET' && route === 'ping')
      return send(200, { ok: true, app: 'DS-Studio' });
    if (req.method === 'GET' && route === 'export') {
      const data = await this.lastExport();
      if (!data)
        throw new StudioError(
          'Aucun export préparé. Dans DS-Studio, cliquez « Préparer l’export Figma ».',
          404,
        );
      // Les tokens envoyés sont ceux du disque à l'instant de la lecture.
      return send(200, { ...data, tokens: tokens() });
    }
    if (req.method === 'POST' && route === 'import') {
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
      return send(200, await this.saveImport(body));
    }
    throw new StudioError('Route inconnue.', 404);
  }
}
