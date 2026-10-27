import { spawn } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import { userInfo } from 'node:os';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { atomicWrite, readPrivate } from './files.js';
import { StudioError } from './store.js';

// Connexion OAuth à Figma (lecture seule : utilisateur, fichiers et pages).
// L'écriture dans Figma reste faite par le plugin local, après un clic dans l'app.
const SCOPES = 'current_user:read file_content:read';
const REFRESH_MARGIN = 5 * 60_000;
const STATE_TTL = 10 * 60_000;

const storedSchema = z
  .object({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
    expiresAt: z.number(),
    user: z
      .object({ id: z.string(), handle: z.string(), email: z.string() })
      .strict(),
  })
  .strict();
type Stored = z.infer<typeof storedSchema>;

/** Coffre du token : trousseau système si disponible, sinon fichier privé 0600. */
export interface TokenVault {
  kind: 'keychain' | 'file';
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  clear(): Promise<void>;
}
type Runner = (
  args: string[],
  input?: string,
) => Promise<{ code: number; stdout: string }>;
const runSecurity: Runner = (args, input) =>
  new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/security', args, {
      stdio: ['pipe', 'pipe', 'ignore'],
      shell: false,
    });
    let stdout = '';
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (c: string) => (stdout += c));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout }));
    child.stdin!.end(input ?? '');
  });
// Le secret passe par l'entrée standard de « security -i », jamais par les
// arguments (visibles dans la liste des processus). Base64 : aucun guillemet.
export function keychainVault(
  run: Runner = runSecurity,
  service = 'ds-studio-figma',
  account = userInfo().username,
): TokenVault {
  return {
    kind: 'keychain',
    async read() {
      const r = await run([
        'find-generic-password',
        '-s',
        service,
        '-a',
        account,
        '-w',
      ]);
      if (r.code !== 0) return null;
      return Buffer.from(r.stdout.trim(), 'base64').toString('utf8');
    },
    async write(value) {
      const encoded = Buffer.from(value, 'utf8').toString('base64');
      const r = await run(
        ['-i'],
        `add-generic-password -U -s ${service} -a ${account} -w ${encoded}\n`,
      );
      if (r.code !== 0)
        throw new StudioError(
          'Trousseau inaccessible : connexion non enregistrée.',
          500,
        );
    },
    async clear() {
      await run(['delete-generic-password', '-s', service, '-a', account]);
    },
  };
}
export function fileVault(file: string): TokenVault {
  return {
    kind: 'file',
    async read() {
      try {
        return await readPrivate(file, 20_000);
      } catch {
        return null;
      }
    },
    write: (value) => atomicWrite(file, value),
    async clear() {
      await fs.unlink(file).catch(() => {});
    },
  };
}
export function defaultVault(directory: string): TokenVault {
  const keychain =
    process.platform === 'darwin' &&
    existsSync('/usr/bin/security') &&
    process.env.DS_FIGMA_TOKEN_STORE !== 'file';
  return keychain
    ? keychainVault()
    : fileVault(path.join(directory, 'figma', 'oauth.json'));
}

const base64url = (b: Buffer) => b.toString('base64url');
/** Clé d'un lien figma.com/design|file/<clé>/… ; null si le lien n'en est pas un. */
export function figmaFileKey(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'https:' || !/(^|\.)figma\.com$/.test(u.hostname))
      return null;
    return (
      u.pathname.match(/^\/(?:design|file)\/([A-Za-z0-9]{10,64})/)?.[1] ?? null
    );
  } catch {
    return null;
  }
}

export class FigmaAccount {
  private pending = new Map<
    string,
    { verifier: string; redirectUri: string; expires: number }
  >();
  readonly clientId: string;
  private clientSecret: string;
  private authorizeUrl: string;
  private apiBase: string;
  constructor(
    readonly vault: TokenVault,
    env: NodeJS.ProcessEnv = process.env,
  ) {
    this.clientId = env.FIGMA_CLIENT_ID ?? '';
    this.clientSecret = env.FIGMA_CLIENT_SECRET ?? '';
    // Surchargés seulement par les tests (faux serveur Figma local).
    this.authorizeUrl = env.FIGMA_OAUTH_URL ?? 'https://www.figma.com/oauth';
    this.apiBase = env.FIGMA_API_BASE ?? 'https://api.figma.com';
  }
  get configured() {
    return !!this.clientId && !!this.clientSecret;
  }
  private basic() {
    return (
      'Basic ' +
      Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')
    );
  }
  private async read(): Promise<Stored | null> {
    const raw = await this.vault.read();
    if (!raw) return null;
    try {
      return storedSchema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  async status() {
    const stored = this.configured ? await this.read() : null;
    return {
      configured: this.configured,
      connected: !!stored,
      user: stored
        ? { handle: stored.user.handle, email: stored.user.email }
        : null,
      storage: this.vault.kind,
    };
  }
  /** URL d'autorisation Figma (PKCE S256, state à usage unique). */
  start(redirectUri: string) {
    if (!this.configured)
      throw new StudioError(
        'Connexion Figma non configurée : renseignez FIGMA_CLIENT_ID et FIGMA_CLIENT_SECRET dans .env, puis relancez DS-Studio.',
        503,
      );
    const now = Date.now();
    for (const [k, v] of this.pending)
      if (v.expires < now) this.pending.delete(k);
    const state = base64url(randomBytes(24));
    const verifier = base64url(randomBytes(48));
    this.pending.set(state, {
      verifier,
      redirectUri,
      expires: now + STATE_TTL,
    });
    const url = new URL(this.authorizeUrl);
    url.search = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: SCOPES,
      state,
      response_type: 'code',
      code_challenge: base64url(createHash('sha256').update(verifier).digest()),
      code_challenge_method: 'S256',
    }).toString();
    return url.toString();
  }
  private async tokenRequest(route: string, form: Record<string, string>) {
    let res: Response;
    try {
      res = await fetch(this.apiBase + route, {
        method: 'POST',
        headers: {
          Authorization: this.basic(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(form).toString(),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new StudioError(
        'Figma injoignable : vérifiez la connexion Internet.',
        502,
      );
    }
    if (!res.ok)
      throw new StudioError(
        'Figma a refusé la connexion. Reconnectez-vous.',
        401,
      );
    return (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
  }
  async callback(code: string, state: string) {
    const pending = this.pending.get(state);
    this.pending.delete(state);
    if (!pending || pending.expires < Date.now())
      throw new StudioError(
        'Lien de connexion expiré ou inconnu. Recommencez depuis DS-Studio.',
        400,
      );
    const t = await this.tokenRequest('/v1/oauth/token', {
      redirect_uri: pending.redirectUri,
      code,
      grant_type: 'authorization_code',
      code_verifier: pending.verifier,
    });
    if (!t.refresh_token)
      throw new StudioError('Réponse Figma incomplète.', 502);
    const me = await this.get<{ id: string; handle: string; email: string }>(
      '/v1/me',
      t.access_token,
    );
    const stored: Stored = {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: Date.now() + t.expires_in * 1000,
      user: {
        id: String(me.id),
        handle: String(me.handle),
        email: String(me.email ?? ''),
      },
    };
    await this.vault.write(JSON.stringify(stored));
    return stored.user;
  }
  async logout() {
    await this.vault.clear();
  }
  /** Token valide, rafraîchi automatiquement avant expiration. */
  private async token(force = false) {
    const stored = await this.read();
    if (!stored)
      throw new StudioError(
        'Non connecté à Figma : cliquez « Se connecter à Figma ».',
        401,
      );
    if (!force && stored.expiresAt - Date.now() > REFRESH_MARGIN)
      return stored.accessToken;
    let t;
    try {
      t = await this.tokenRequest('/v1/oauth/refresh', {
        refresh_token: stored.refreshToken,
      });
    } catch (e) {
      // Refresh refusé : la session est terminée, on n'insiste pas.
      if ((e as StudioError).status === 401) await this.vault.clear();
      throw new StudioError('Session Figma expirée : reconnectez-vous.', 401);
    }
    const next = {
      ...stored,
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? stored.refreshToken,
      expiresAt: Date.now() + t.expires_in * 1000,
    };
    await this.vault.write(JSON.stringify(next));
    return next.accessToken;
  }
  private async get<T>(route: string, token: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(this.apiBase + route, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new StudioError(
        'Figma injoignable : vérifiez la connexion Internet.',
        502,
      );
    }
    if (res.status === 401)
      throw new StudioError('Session Figma expirée.', 401);
    if (res.status === 403)
      throw new StudioError(
        'Droits insuffisants : ce compte Figma n’a pas accès à ce fichier.',
        403,
      );
    if (res.status === 404)
      throw new StudioError(
        'Fichier Figma introuvable : vérifiez le lien.',
        404,
      );
    if (!res.ok) throw new StudioError(`Erreur Figma (${res.status}).`, 502);
    return (await res.json()) as T;
  }
  /** Appel REST authentifié ; un 401 déclenche un rafraîchissement puis un seul nouvel essai. */
  private async api<T>(route: string): Promise<T> {
    try {
      return await this.get<T>(route, await this.token());
    } catch (e) {
      if ((e as StudioError).status !== 401) throw e;
      return this.get<T>(route, await this.token(true));
    }
  }
  /** Nom, pages et rôle (owner, editor, viewer) d'un fichier. */
  async file(fileKey: string) {
    const f = await this.api<{
      name: string;
      role?: string;
      document: { children: { id: string; name: string; type: string }[] };
    }>(`/v1/files/${encodeURIComponent(fileKey)}?depth=1`);
    return {
      name: String(f.name).slice(0, 200),
      role: f.role ?? 'editor',
      pages: f.document.children
        .filter((p) => p.type === 'CANVAS')
        .slice(0, 500)
        .map((p) => ({
          id: String(p.id).slice(0, 80),
          name: String(p.name).slice(0, 200),
        })),
    };
  }
}
