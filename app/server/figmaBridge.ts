import http from 'node:http';
import type { Duplex } from 'node:stream';
import { createHash, randomUUID } from 'node:crypto';
import {
  commandParams,
  DEFAULT_FIGMA_PORT,
  FIGMA_TIMEOUT_MS,
  responseSchema,
  type FigmaCommand,
  type FigmaStatus,
} from '../shared/figmaProtocol.js';
import { StudioError } from './store.js';

// Pont local app ↔ Figma Desktop. Le plugin (iframe d'origine « null ») se
// connecte en WebSocket à 127.0.0.1 ; l'app lui envoie des commandes et attend
// la réponse portant le même id. Serveur WebSocket minimal (RFC 6455), sans
// dépendance : trames texte, fragmentation, ping/pong, fermeture.
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 8 * 1024 * 1024;
const HEARTBEAT_MS = 15_000;

class Socket {
  private buffer = Buffer.alloc(0);
  private fragments: Buffer[] = [];
  private closed = false;
  alive = true;
  onMessage: (text: string) => void = () => {};
  onClose: () => void = () => {};
  constructor(private stream: Duplex) {
    stream.on('data', (chunk: Buffer) => this.receive(chunk));
    stream.on('close', () => this.finish());
    stream.on('error', () => this.finish());
  }
  private finish() {
    if (this.closed) return;
    this.closed = true;
    this.stream.destroy();
    this.onClose();
  }
  private frame(opcode: number, payload: Buffer) {
    const length = payload.length;
    const head =
      length < 126
        ? Buffer.from([0x80 | opcode, length])
        : length < 65_536
          ? Buffer.from([0x80 | opcode, 126, length >> 8, length & 255])
          : Buffer.concat([
              Buffer.from([0x80 | opcode, 127]),
              (() => {
                const b = Buffer.alloc(8);
                b.writeBigUInt64BE(BigInt(length));
                return b;
              })(),
            ]);
    if (!this.closed) this.stream.write(Buffer.concat([head, payload]));
  }
  send(text: string) {
    this.frame(0x1, Buffer.from(text, 'utf8'));
  }
  ping() {
    this.frame(0x9, Buffer.alloc(0));
  }
  close(code = 1000, reason = '') {
    const payload = Buffer.alloc(2 + Buffer.byteLength(reason));
    payload.writeUInt16BE(code);
    payload.write(reason, 2);
    this.frame(0x8, payload);
    this.stream.end();
    this.finish();
  }
  private receive(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      if (this.buffer.length < 2) return;
      const fin = (this.buffer[0] & 0x80) !== 0;
      const opcode = this.buffer[0] & 0x0f;
      const masked = (this.buffer[1] & 0x80) !== 0;
      let length = this.buffer[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        const big = this.buffer.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE))
          return this.close(1009, 'Message trop grand');
        length = Number(big);
        offset = 10;
      }
      // Un client doit masquer ses trames (RFC 6455 §5.1).
      if (!masked) return this.close(1002, 'Trame non masquée');
      if (length > MAX_MESSAGE) return this.close(1009, 'Message trop grand');
      if (this.buffer.length < offset + 4 + length) return;
      const mask = this.buffer.subarray(offset, offset + 4);
      const payload = Buffer.from(
        this.buffer.subarray(offset + 4, offset + 4 + length),
      );
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      this.buffer = this.buffer.subarray(offset + 4 + length);
      if (opcode === 0x8) return this.close();
      if (opcode === 0x9) this.frame(0xa, payload);
      else if (opcode === 0xa) this.alive = true;
      else if (opcode === 0x1 || opcode === 0x0) {
        this.fragments.push(payload);
        const total = this.fragments.reduce((n, f) => n + f.length, 0);
        if (total > MAX_MESSAGE) return this.close(1009, 'Message trop grand');
        if (fin) {
          const text = Buffer.concat(this.fragments).toString('utf8');
          this.fragments = [];
          this.onMessage(text);
        }
      } else return this.close(1003, 'Type de trame non pris en charge');
    }
  }
}

export class FigmaBridge {
  private server: http.Server | null = null;
  private plugin: Socket | null = null;
  private fileName: string | null = null;
  private error: string | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    private port = DEFAULT_FIGMA_PORT,
    private timeout = FIGMA_TIMEOUT_MS,
  ) {}

  get status(): FigmaStatus {
    return {
      state: !this.server
        ? 'disconnected'
        : this.plugin
          ? 'connected'
          : 'waiting',
      port: this.port,
      fileName: this.plugin ? this.fileName : null,
      error: this.error,
    };
  }
  /** Écoute uniquement sur 127.0.0.1. Un port occupé laisse l'app utilisable. */
  async listen() {
    const server = http.createServer((_req, res) => {
      res.writeHead(426, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('WebSocket attendu (plugin DS-Studio Bridge).');
    });
    server.on('upgrade', (req, socket) => this.upgrade(req, socket));
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(this.port, '127.0.0.1', () => resolve());
      });
    } catch (e) {
      this.error =
        (e as NodeJS.ErrnoException).code === 'EADDRINUSE'
          ? `Port ${this.port} occupé : pont Figma inactif.`
          : 'Pont Figma inactif.';
      return;
    }
    this.port = (server.address() as { port: number }).port;
    this.server = server;
    this.error = null;
    this.heartbeat = setInterval(() => {
      const plugin = this.plugin;
      if (!plugin) return;
      if (!plugin.alive) return plugin.close(1001, 'Plugin muet');
      plugin.alive = false;
      plugin.ping();
    }, HEARTBEAT_MS);
    this.heartbeat.unref();
  }
  async close() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.plugin?.close(1001, 'DS-Studio fermé');
    const server = this.server;
    this.server = null;
    if (server) await new Promise<void>((r) => server.close(() => r()));
  }
  private upgrade(req: http.IncomingMessage, socket: Duplex) {
    const refuse = (status: number, text: string) => {
      socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\n\r\n`);
    };
    // Une page web a toujours une vraie origine : seule l'iframe d'un plugin
    // Figma (« null ») ou un client local sans navigateur est accepté.
    const origin = req.headers.origin;
    if (origin !== undefined && origin !== 'null')
      return refuse(403, 'Forbidden');
    const key = req.headers['sec-websocket-key'];
    if (
      req.headers.upgrade?.toLowerCase() !== 'websocket' ||
      typeof key !== 'string' ||
      req.headers['sec-websocket-version'] !== '13'
    )
      return refuse(400, 'Bad Request');
    const accept = createHash('sha1')
      .update(key + GUID)
      .digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    const ws = new Socket(socket);
    // Un seul plugin : une reconnexion remplace l'ancienne connexion.
    this.plugin?.close(1000, 'Remplacé par une nouvelle connexion');
    this.plugin = ws;
    this.fileName = null;
    ws.onMessage = (text) => this.receive(text);
    ws.onClose = () => {
      if (this.plugin !== ws) return;
      this.plugin = null;
      this.fileName = null;
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(
          new StudioError('Plugin Figma déconnecté pendant la commande.', 503),
        );
        this.pending.delete(id);
      }
    };
    // Nom du fichier ouvert, pour l'indicateur d'état.
    this.request('get_document_info', {})
      .then((info) => {
        if (this.plugin === ws)
          this.fileName =
            String((info as { name?: string }).name ?? '') || null;
      })
      .catch(() => {});
  }
  private receive(text: string) {
    let parsed;
    try {
      parsed = responseSchema.safeParse(JSON.parse(text));
    } catch {
      return;
    }
    if (!parsed.success) return;
    const r = parsed.data;
    const pending = this.pending.get(r.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(r.id);
    if (r.ok) pending.resolve(r.result ?? null);
    else
      pending.reject(
        new StudioError(`Figma : ${r.error ?? 'erreur inconnue.'}`, 502),
      );
  }
  /** Envoie une commande au plugin et attend sa réponse (10 s maximum). */
  request(command: FigmaCommand, params: unknown): Promise<unknown> {
    const valid = commandParams[command].parse(params);
    const plugin = this.plugin;
    if (!plugin)
      return Promise.reject(
        new StudioError(
          this.server
            ? 'Plugin Figma non connecté : lancez DS-Studio Bridge dans Figma Desktop.'
            : (this.error ?? 'Pont Figma inactif.'),
          503,
        ),
      );
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new StudioError(
            `Figma n’a pas répondu en ${Math.round(this.timeout / 1000)} s (${command}).`,
            504,
          ),
        );
      }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      plugin.send(JSON.stringify({ id, command, params: valid }));
    });
  }
}
