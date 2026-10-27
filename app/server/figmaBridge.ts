import http from 'node:http';
import type { Duplex } from 'node:stream';
import { createHash, randomUUID } from 'node:crypto';
import {
  commandParams,
  DEFAULT_FIGMA_PORT,
  FIGMA_TIMEOUT_MS,
  helloSchema,
  progressSchema,
  responseSchema,
  type ExportJob,
  type FigmaCommand,
  type FigmaStatus,
  type InternalCommand,
} from '../shared/figmaProtocol.js';
import {
  CHUNK_SIZE,
  EXPORT_TIMEOUT_MS,
  exportResultSchema,
  type ExportPayload,
} from '../shared/figmaExport.js';
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

// Un plugin ouvert dans un fichier Figma : identifié par la clé du fichier.
interface Connection {
  socket: Socket;
  fileKey: string | null;
  fileName: string | null;
}

export class FigmaBridge {
  private server: http.Server | null = null;
  /** Ordre d'arrivée : la dernière sert par défaut quand aucune cible n'est fixée. */
  private connections: Connection[] = [];
  private error: string | null = null;
  /** Appelé quand un fichier se connecte (clé connue) : file d'attente de synchro. */
  onFile: (fileKey: string) => void = () => {};
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      connection: Connection;
      onProgress?: (p: { done: number; total: number; label: string }) => void;
    }
  >();
  private jobs = new Map<
    string,
    ExportJob & { requestId?: string; connection?: Connection }
  >();
  constructor(
    private port = DEFAULT_FIGMA_PORT,
    private timeout = FIGMA_TIMEOUT_MS,
  ) {}

  get status(): FigmaStatus {
    const latest = this.connections.at(-1);
    return {
      state: !this.server ? 'disconnected' : latest ? 'connected' : 'waiting',
      port: this.port,
      fileName: latest?.fileName ?? null,
      error: this.error,
      connections: this.connections.map((c) => ({
        fileKey: c.fileKey,
        fileName: c.fileName,
      })),
    };
  }
  /** Le plugin tourne-t-il dans ce fichier ? */
  has(fileKey: string) {
    return this.connections.some((c) => c.fileKey === fileKey);
  }
  // Fichier demandé, sinon la connexion la plus récente.
  private pick(fileKey?: string) {
    if (fileKey === undefined) return this.connections.at(-1);
    return this.connections.find((c) => c.fileKey === fileKey);
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
      for (const { socket } of this.connections) {
        if (!socket.alive) socket.close(1001, 'Plugin muet');
        else {
          socket.alive = false;
          socket.ping();
        }
      }
    }, HEARTBEAT_MS);
    this.heartbeat.unref();
  }
  async close() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const c of this.connections) c.socket.close(1001, 'DS-Studio fermé');
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
    const connection: Connection = {
      socket: ws,
      fileKey: null,
      fileName: null,
    };
    this.connections.push(connection);
    ws.onMessage = (text) => this.receive(text, connection);
    ws.onClose = () => {
      this.connections = this.connections.filter((c) => c !== connection);
      for (const [id, p] of this.pending) {
        if (p.connection !== connection) continue;
        clearTimeout(p.timer);
        p.reject(
          new StudioError('Plugin Figma déconnecté pendant la commande.', 503),
        );
        this.pending.delete(id);
      }
    };
    // Plugin plus ancien (sans annonce) : le fichier est demandé.
    this.send('get_document_info', {}, { connection })
      .then((info) => {
        const i = info as { name?: string; fileKey?: string | null };
        if (connection.fileName === null)
          this.identify(connection, i.fileKey ?? null, String(i.name ?? ''));
      })
      .catch(() => {});
  }
  // Fichier connu : une connexion plus ancienne sur le même fichier est remplacée.
  private identify(
    connection: Connection,
    fileKey: string | null,
    fileName: string,
  ) {
    if (!this.connections.includes(connection)) return;
    connection.fileKey = fileKey;
    connection.fileName = fileName || null;
    for (const other of this.connections)
      if (other !== connection && other.fileKey === fileKey)
        other.socket.close(1000, 'Remplacé par une nouvelle connexion');
    // Le plus récent passe en dernier : c'est la connexion par défaut.
    this.connections = [
      ...this.connections.filter((c) => c !== connection),
      connection,
    ];
    if (fileKey) this.onFile(fileKey);
  }
  private receive(text: string, connection: Connection) {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return;
    }
    const hello = helloSchema.safeParse(raw);
    if (hello.success) {
      const { fileKey, fileName } = hello.data.hello;
      return this.identify(connection, fileKey, fileName);
    }
    const progress = progressSchema.safeParse(raw);
    if (progress.success) {
      this.pending.get(progress.data.id)?.onProgress?.(progress.data.progress);
      return;
    }
    const parsed = responseSchema.safeParse(raw);
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
  request(
    command: FigmaCommand,
    params: unknown,
    fileKey?: string,
  ): Promise<unknown> {
    return this.send(command, commandParams[command].parse(params), {
      fileKey,
    });
  }
  private send(
    command: FigmaCommand | InternalCommand,
    valid: unknown,
    options: {
      timeout?: number;
      id?: string;
      fileKey?: string;
      connection?: Connection;
      onProgress?: (p: { done: number; total: number; label: string }) => void;
    } = {},
  ): Promise<unknown> {
    const timeout = options.timeout ?? this.timeout;
    const connection = options.connection ?? this.pick(options.fileKey);
    if (!connection)
      return Promise.reject(
        new StudioError(
          !this.server
            ? (this.error ?? 'Pont Figma inactif.')
            : options.fileKey
              ? 'Fichier Figma cible non ouvert : lancez le plugin DS-Studio dans ce fichier.'
              : 'Plugin Figma non connecté : lancez DS-Studio Bridge dans Figma Desktop.',
          503,
        ),
      );
    const id = options.id ?? randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new StudioError(
            `Figma n’a pas répondu en ${Math.round(timeout / 1000)} s (${command}).`,
            504,
          ),
        );
      }, timeout);
      this.pending.set(id, {
        resolve,
        reject,
        timer,
        connection,
        onProgress: options.onProgress,
      });
      connection.socket.send(JSON.stringify({ id, command, params: valid }));
    });
  }

  /** Export en tâche de fond : payload découpé en lots, progression, annulation. */
  startExport(payload: ExportPayload, fileKey?: string) {
    const connection = this.pick(fileKey);
    if (!connection)
      throw new StudioError(
        fileKey
          ? 'Fichier Figma cible non ouvert : lance le plugin DS-Studio dans ce fichier.'
          : 'Lance le plugin DS-Studio dans Figma desktop.',
        503,
      );
    if ([...this.jobs.values()].some((j) => j.state === 'running'))
      throw new StudioError('Un export est déjà en cours.', 409);
    const job: ExportJob & { requestId?: string; connection?: Connection } = {
      connection,
      id: randomUUID(),
      kind: payload.kind,
      state: 'running',
      done: 0,
      total: 0,
      label: 'Envoi au plugin…',
    };
    this.jobs.set(job.id, job);
    for (const old of [...this.jobs.keys()].slice(0, -20))
      this.jobs.delete(old);
    void (async () => {
      try {
        const transfer = randomUUID();
        const json = JSON.stringify(payload);
        const total = Math.max(1, Math.ceil(json.length / CHUNK_SIZE));
        for (let index = 0; index < total; index++) {
          if (job.state !== 'running') return;
          job.label = `Envoi au plugin (${index + 1}/${total})…`;
          await this.send(
            'export_chunk',
            {
              transfer,
              index,
              total,
              data: json.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
            },
            { connection },
          );
        }
        if (job.state !== 'running') return;
        job.requestId = randomUUID();
        const result = await this.send(
          payload.kind === 'design_system'
            ? 'export_design_system'
            : 'export_preview',
          { transfer },
          {
            id: job.requestId,
            connection,
            timeout: EXPORT_TIMEOUT_MS,
            onProgress: (p) => {
              if (job.state !== 'running') return;
              job.done = p.done;
              job.total = p.total;
              job.label = p.label;
            },
          },
        );
        if (job.state !== 'running') return;
        job.result = exportResultSchema.parse(result);
        job.done = job.total;
        job.state = 'done';
      } catch (e) {
        if (job.state !== 'running') return;
        job.state = 'error';
        job.error = (e as Error).message;
      }
    })();
    return this.job(job.id);
  }
  job(id: string): ExportJob {
    const job = this.jobs.get(id);
    if (!job) throw new StudioError('Export inconnu.', 404);
    const { requestId: _requestId, connection: _connection, ...visible } = job;
    return visible;
  }
  /** Annule l'export : le plugin s'arrête avant l'élément suivant. */
  cancelExport(id: string) {
    const job = this.jobs.get(id);
    if (!job) throw new StudioError('Export inconnu.', 404);
    if (job.state !== 'running') return this.job(id);
    job.state = 'cancelled';
    job.label = 'Export annulé.';
    if (job.requestId && job.connection) {
      job.connection.socket.send(
        JSON.stringify({
          id: randomUUID(),
          command: 'cancel',
          params: { target: job.requestId },
        }),
      );
      const pending = this.pending.get(job.requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(job.requestId);
        pending.reject(new StudioError('Export annulé.', 499));
      }
    }
    return this.job(id);
  }
}
