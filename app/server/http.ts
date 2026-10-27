import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { proposeSchema } from '../shared/model.js';
import { Store, StudioError } from './store.js';
import { ProjectStore } from './project.js';
import { ComponentStore } from './components.js';
import type { FigmaBridge } from './figmaBridge.js';
import { FigmaSync, openFigmaUrl } from './figmaSync.js';
import { parseFigmaUrl } from '../shared/figmaTarget.js';
import { figmaCommands } from '../shared/figmaProtocol.js';
import { exportPayloadSchema } from '../shared/figmaExport.js';
import { componentSchema } from '../shared/component.js';
import {
  componentDraftSchema,
  draftToComponent,
  IMAGE_MEDIA_TYPES,
  MAX_IMAGE_BYTES,
  visionInstructions,
} from '../shared/componentDraft.js';
import { projectSchema } from '../shared/project.js';
import { CodexAdapter } from '../../connectors/agents/codex.js';
import { unvalidatedAdapter } from '../../connectors/agents/unvalidated.js';
import { ClaudeAdapter } from '../../connectors/agents/claude.js';
import type { AgentAdapter } from '../../connectors/agents/types.js';
import type { RecordInfo } from '../../scripts/runtime.mjs';

export async function createStudioServer(options: {
  root: string;
  store: Store;
  agent?: AgentAdapter;
  claude?: AgentAdapter;
  figma?: FigmaBridge;
  /** Ouverture système d'un lien Figma (remplaçable dans les tests). */
  openUrl?: (url: string) => unknown;
  dev?: boolean;
  control?: { record: RecordInfo; stop: () => void };
}) {
  const { root, store } = options;
  const adapters: Record<string, AgentAdapter> = {
    codex: options.agent ?? new CodexAdapter(),
    claude: options.claude ?? new ClaudeAdapter(),
    gemini: unvalidatedAdapter('gemini'),
  };
  const project = new ProjectStore(store.directory);
  const components = new ComponentStore(store.directory);
  const figmaSync = options.figma
    ? new FigmaSync(store.directory, options.figma)
    : null;
  await figmaSync?.load();
  const openUrl = options.openUrl ?? openFigmaUrl;
  const needFigma = () => {
    if (!options.figma || !figmaSync)
      throw new StudioError('Pont Figma non démarré.', 503);
    return { bridge: options.figma, sync: figmaSync };
  };
  const csrf = randomBytes(32).toString('hex');
  let busy = false;
  const active = new Set<AbortController>();
  const vite = options.dev
    ? await (
        await import('vite')
      ).createServer({
        root,
        server: { middlewareMode: true, host: '127.0.0.1' },
        appType: 'spa',
      })
    : null;
  const server = http.createServer(async (req, res) => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const origin = `http://127.0.0.1:${port}`;
    const send = (status: number, value: unknown) => {
      if (!res.destroyed) {
        res.writeHead(status, {
          'Content-Type': 'application/json; charset=utf-8',
        });
        res.end(JSON.stringify(value));
      }
    };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'${options.dev ? ' ws://127.0.0.1:*' : ''}; frame-ancestors 'self'; base-uri 'none'; form-action 'self'`,
    );
    try {
      if (req.headers.host !== `127.0.0.1:${port}`)
        throw new StudioError(
          'Hôte refusé. Utilisez l’adresse 127.0.0.1 affichée au démarrage.',
          403,
        );
      const url0 = new URL(req.url ?? '/', origin);
      if (req.headers.origin && req.headers.origin !== origin)
        throw new StudioError('Origine non autorisée.', 403);
      if (req.headers['sec-fetch-site'] === 'cross-site')
        throw new StudioError('Requête externe refusée.', 403);
      const url = new URL(req.url ?? '/', origin);
      if (url.pathname.startsWith('/_studio/')) {
        const control = options.control;
        if (
          !control ||
          req.headers['x-studio-control'] !== control.record.token
        )
          throw new StudioError('Contrôle privé refusé.', 403);
        const { token: _token, ...identity } = control.record;
        if (url.pathname === '/_studio/health' && req.method === 'GET')
          return send(200, identity);
        if (url.pathname === '/_studio/stop' && req.method === 'POST') {
          send(200, identity);
          setImmediate(control.stop);
          return;
        }
        throw new StudioError('Route inconnue.', 404);
      }
      if (url.pathname.startsWith('/api/')) {
        if (req.method === 'GET') {
          if (url.pathname === '/api/bootstrap')
            return send(200, {
              csrf,
              agents: [],
            });
          if (url.pathname === '/api/agents')
            return send(
              200,
              await Promise.all(
                Object.values(adapters).map(async (a) => ({
                  id: a.id,
                  ...(await a.status()),
                })),
              ),
            );
          if (url.pathname === '/api/project')
            return send(200, await project.read());
          if (url.pathname === '/api/components')
            return send(200, await components.read());
          if (url.pathname === '/api/state') return send(200, store.snapshot());
          if (url.pathname === '/api/figma/status')
            return send(
              200,
              options.figma && figmaSync
                ? { ...options.figma.status, ...figmaSync.summary() }
                : {
                    state: 'disconnected',
                    port: 0,
                    fileName: null,
                    error: 'Pont Figma non démarré.',
                    connections: [],
                    target: null,
                    targetConnected: false,
                  },
            );
          const job = url.pathname.match(
            /^\/api\/figma\/export\/([0-9a-f-]{36})$/,
          );
          if (job) {
            if (!options.figma)
              throw new StudioError('Pont Figma non démarré.', 503);
            return send(200, options.figma.job(job[1]));
          }
          if (url.pathname === '/api/export')
            return send(200, store.snapshot().tokens);
          throw new StudioError('Route inconnue.', 404);
        }
        if (req.method !== 'POST')
          throw new StudioError('Méthode non autorisée.', 405);
        if (req.headers['x-ds-studio'] !== csrf)
          throw new StudioError(
            'Validation de session manquante. Rechargez la page.',
            403,
          );
        if (!req.headers['content-type']?.startsWith('application/json'))
          throw new StudioError('JSON requis.', 415);
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (
            size >
            (url.pathname === '/api/import/image'
              ? 6_000_000
              : url.pathname === '/api/figma/export'
                ? 8_000_000
                : 128_000)
          )
            throw new StudioError('Requête trop volumineuse.', 413);
          chunks.push(chunk);
        }
        const raw = Buffer.concat(chunks).toString('utf8');
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          throw new StudioError('JSON invalide.');
        }
        if (url.pathname === '/api/project') {
          const b = z
            .object({ base: z.string().max(64), project: projectSchema })
            .strict()
            .parse(body);
          return send(200, await project.save(b.base, b.project));
        }
        if (url.pathname === '/api/components/save') {
          const b = z.object({ component: z.unknown() }).strict().parse(body);
          return send(200, await components.save(b.component));
        }
        if (url.pathname === '/api/components/delete') {
          const b = z.object({ id: z.string().uuid() }).strict().parse(body);
          return send(200, await components.remove(b.id));
        }
        // Pont Figma : une commande du protocole, relayée au plugin ouvert.
        if (url.pathname === '/api/figma/command') {
          const b = z
            .object({
              command: z.enum(figmaCommands as [string, ...string[]]),
              params: z.unknown().default({}),
            })
            .strict()
            .parse(body);
          const { bridge, sync } = needFigma();
          const result = await bridge.request(
            b.command as (typeof figmaCommands)[number],
            b.params,
            sync.routeKey,
          );
          return send(200, { ok: true, result });
        }
        // Cible Figma : fichier et page choisis par URL, mémorisés par projet.
        if (url.pathname === '/api/figma/target') {
          const b = z
            .object({ url: z.string().max(2000) })
            .strict()
            .parse(body);
          return send(200, await needFigma().sync.setTarget(b.url));
        }
        if (url.pathname === '/api/figma/target/clear') {
          z.object({}).strict().parse(body);
          return send(200, await needFigma().sync.clearTarget());
        }
        if (url.pathname === '/api/figma/open') {
          const b = z
            .object({ url: z.string().max(2000) })
            .strict()
            .parse(body);
          // Seul un lien de fichier Figma valide part vers l'ouverture système.
          const parsed = parseFigmaUrl(b.url);
          if (!parsed.ok) throw new StudioError(parsed.error, 400);
          return send(200, openUrl(parsed.url));
        }
        // Export vers Figma : payload validé ici, puis tâche suivie et annulable.
        if (url.pathname === '/api/figma/export') {
          const { bridge, sync } = needFigma();
          // Cible définie : l'export va toujours dans ce fichier, jamais ailleurs.
          return send(
            200,
            bridge.startExport(
              exportPayloadSchema.parse(body),
              sync.target?.fileKey,
            ),
          );
        }
        const cancel = url.pathname.match(
          /^\/api\/figma\/export\/([0-9a-f-]{36})\/cancel$/,
        );
        if (cancel) {
          if (!options.figma)
            throw new StudioError('Pont Figma non démarré.', 503);
          return send(200, options.figma.cancelExport(cancel[1]));
        }
        if (url.pathname === '/api/proposals') {
          const b = proposeSchema.parse(body);
          return send(200, store.propose(b.revision, b.changes));
        }
        if (url.pathname === '/api/import') {
          const b = z
            .object({
              revision: z.number().int().nonnegative(),
              tokens: z.unknown(),
            })
            .strict()
            .parse(body);
          return send(200, store.proposeImport(b.revision, b.tokens));
        }
        if (url.pathname === '/api/undo') {
          const b = z
            .object({
              revision: z.number().int().nonnegative(),
              id: z.string().uuid(),
            })
            .strict()
            .parse(body);
          return send(200, store.proposeUndo(b.revision, b.id));
        }
        if (url.pathname === '/api/commit') {
          const b = z.object({ id: z.string().uuid() }).strict().parse(body);
          return send(200, await store.commit(b.id));
        }
        if (url.pathname === '/api/import/image') {
          const b = z
            .object({
              mediaType: z.enum(IMAGE_MEDIA_TYPES),
              data: z
                .string()
                .max(5_800_000)
                .regex(/^[A-Za-z0-9+/]+={0,2}$/),
            })
            .strict()
            .parse(body);
          const bytes = Buffer.from(b.data, 'base64');
          if (bytes.length > MAX_IMAGE_BYTES)
            throw new StudioError('Image trop lourde (4 Mo maximum).', 413);
          // Signature réelle du fichier, indépendante du type annoncé.
          const signature =
            b.mediaType === 'image/png'
              ? bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
              : b.mediaType === 'image/jpeg'
                ? bytes.subarray(0, 3).toString('hex') === 'ffd8ff'
                : bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
                  bytes.subarray(8, 12).toString('latin1') === 'WEBP';
          if (!signature)
            throw new StudioError(
              'Format non supporté : PNG, JPG, WebP ou SVG attendu.',
              415,
            );
          const claude = adapters.claude;
          if (!claude.describeImage)
            throw new StudioError('Analyse d’image indisponible.', 501);
          if (busy)
            throw new StudioError('Une demande IA est déjà en cours.', 429);
          busy = true;
          const controller = new AbortController();
          active.add(controller);
          const cancel = () => controller.abort();
          res.once('close', cancel);
          try {
            const tokens = store.snapshot().tokens;
            const raw = await claude.describeImage(
              { mediaType: b.mediaType, data: b.data },
              visionInstructions(tokens),
              'Décris ce composant selon le schéma.',
              controller.signal,
            );
            const draft = componentDraftSchema.safeParse(raw);
            if (!draft.success)
              throw new StudioError(
                'Réponse de Claude invalide : ' +
                  draft.error.issues
                    .slice(0, 3)
                    .map((i) => `${i.path.join('.') || 'racine'} ${i.message}`)
                    .join(' ; ') +
                  '. Réessayez.',
                422,
              );
            const component = componentSchema.parse(
              draftToComponent(draft.data, tokens, randomUUID()),
            );
            return send(200, { draft: draft.data, component });
          } finally {
            busy = false;
            active.delete(controller);
            res.off('close', cancel);
          }
        }
        if (url.pathname === '/api/agent') {
          const b = z
            .object({
              agent: z.enum(['codex', 'claude', 'gemini']),
              message: z.string().trim().min(1).max(8000),
              revision: z.number().int().nonnegative(),
              history: z
                .array(
                  z
                    .object({
                      role: z.enum(['user', 'assistant']),
                      text: z.string().max(12000),
                    })
                    .strict(),
                )
                .max(10),
            })
            .strict()
            .parse(body);
          if (b.revision !== store.snapshot().revision)
            throw new StudioError(
              'DS modifié depuis votre dernier affichage. Réessayez.',
              409,
            );
          if (busy)
            throw new StudioError('Une demande IA est déjà en cours.', 429);
          busy = true;
          const controller = new AbortController();
          active.add(controller);
          const cancel = () => controller.abort();
          res.once('close', cancel);
          try {
            const context = async (name: string) => {
              const file = path.join(root, 'workspace', name);
              const stat = await fs.lstat(file);
              if (stat.isSymbolicLink() || stat.size > 32_000)
                throw new StudioError(
                  `Contexte ${name} refusé (lien ou taille).`,
                );
              return fs.readFile(file, 'utf8');
            };
            const reply = await adapters[b.agent].reply(
              b.message,
              {
                tokens: store.snapshot().tokens,
                brief:
                  (await context('PFE.md')) +
                  '\nBrief privé DS-Studio :\n' +
                  JSON.stringify((await project.read()).project),
                rules: await context('DESIGN_RULES.md'),
                history: b.history,
              },
              controller.signal,
            );
            const proposal = reply.changes.length
              ? store.propose(
                  b.revision,
                  reply.changes,
                  b.agent === 'claude' ? 'claude' : 'codex',
                )
              : null;
            return send(200, { message: reply.message, proposal });
          } finally {
            busy = false;
            active.delete(controller);
            res.off('close', cancel);
          }
        }
        throw new StudioError('Route inconnue.', 404);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD')
        throw new StudioError('Méthode non autorisée.', 405);
      if (vite) {
        const allowed = [
          '/app/client/',
          '/app/shared/',
          '/node_modules/',
          '/@vite/',
          '/@id/',
        ];
        if (
          url.pathname !== '/' &&
          url.pathname !== '/index.html' &&
          !allowed.some((prefix) => url.pathname.startsWith(prefix))
        )
          throw new StudioError('Source privée non distribuée.', 403);
        vite.middlewares(req, res);
        return;
      }
      const pathname = decodeURIComponent(url.pathname);
      if (pathname.includes('..') || pathname.includes('\\'))
        throw new StudioError('Chemin refusé.', 403);
      let file: string;
      if (pathname.startsWith('/assets/'))
        file = path.join(root, 'dist', pathname);
      else if (pathname === '/' || pathname === '/index.html')
        file = path.join(root, 'dist', 'index.html');
      else throw new StudioError('Fichier introuvable.', 404);
      const data = await fs.readFile(file);
      const ext = path.extname(file);
      res.setHeader(
        'Content-Type',
        (
          {
            '.html': 'text/html; charset=utf-8',
            '.js': 'text/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.svg': 'image/svg+xml',
            '.png': 'image/png',
            '.webmanifest': 'application/manifest+json',
          } as Record<string, string>
        )[ext] ?? 'application/octet-stream',
      );
      res.end(data);
    } catch (error) {
      if (error instanceof z.ZodError)
        return send(400, {
          error:
            'Données invalides : ' +
            error.issues
              .map((i) => `${i.path.join('.')}: ${i.message}`)
              .join('; '),
        });
      if (error instanceof StudioError)
        return send(error.status, { error: error.message });
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return send(404, {
          error: 'Fichier introuvable. Exécutez npm run build avant npm start.',
        });
      return send(500, { error: urlSafeMessage(error) });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return {
    server,
    close: async () => {
      for (const c of active) c.abort();
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      await vite?.close();
    },
  };
}
function urlSafeMessage(error: unknown) {
  // Les erreurs agent sont rédigées dans l'adaptateur, jamais de stderr brut ni de stack.
  const message = (error as Error).message ?? '';
  if (
    /^(CLI |Codex |Version non|Échec Codex|Délai CLI|Demande interrompue|Le CLI|Réponse CLI|Réponse de Claude|Claude |Échec Claude|claude non|gemini non|Impossible de démarrer)/.test(
      message,
    )
  )
    return message;
  return 'Opération impossible. Aucune validation automatique. Vérifiez les données et relancez si nécessaire.';
}
