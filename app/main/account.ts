import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  isAuthMethod,
  isProvider,
  modelFor,
  providerTable,
  type Auth,
  type AuthMethod,
  type Provider,
} from '../shared/account.js';
import { encrypt, decrypt } from './vault.js';
import { atomicWrite } from './projects.js';
import { authorizeUrl, exchangeCode, parseCode, pkce, refreshTokens } from './claude-auth.js';

// Compte LLM global, hors projet. Une entrée chiffrée dans le dossier de
// données de l'app ; jamais dans project.json, jamais renvoyée à l'interface.

export type Account = {
  provider: Provider;
  method: AuthMethod;
  model: string;
  secret: string;
  /** Jeton de rafraîchissement (connexion navigateur), chiffré comme le reste. */
  refresh: string;
  /** Expiration du jeton d'accès, en millisecondes ; 0 : inconnue. */
  expiresAt: number;
};

const exec = promisify(execFile);
const fake = () => process.env.STUDIO_FAKE_AUTH;
const electron = () => import('electron');

let cache: Account | null = null;
let loaded = false;
let oauth: { verifier: string; state: string } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const files = async () => {
  const { app } = await electron();
  const dir = app.getPath('userData');
  return {
    account: path.join(dir, 'accounts.json'),
    off: path.join(dir, 'account.off'),
  };
};

const publicAuth = (a: Account | null): Auth | null =>
  a ? { provider: a.provider, method: a.method } : null;

const parse = (raw: string): Account | null => {
  try {
    const j = JSON.parse(raw) as Partial<Account>;
    if (
      !isProvider(j.provider) ||
      !isAuthMethod(j.method) ||
      typeof j.secret !== 'string' ||
      !j.secret
    )
      return null;
    return {
      provider: j.provider,
      method: j.method,
      model: typeof j.model === 'string' ? j.model : '',
      secret: j.secret,
      refresh: typeof j.refresh === 'string' ? j.refresh : '',
      expiresAt: Number(j.expiresAt) || 0,
    };
  } catch {
    return null;
  }
};

/** Jeton d'un JSON Claude Code (credentials ou trousseau), s'il est valide. */
const token = (raw: string) => {
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const o = (j.claudeAiOauth ?? j) as Record<string, unknown>;
    const expires = Number(o.expiresAt ?? o.expires_at ?? 0);
    const at = expires && expires < 1e12 ? expires * 1000 : expires;
    if (at && at <= Date.now()) return false;
    return typeof o.accessToken === 'string' && o.accessToken.length > 0;
  } catch {
    return false;
  }
};

/** Session Claude Code déjà présente sur la machine, sans appel payant. */
const session = (): Account => ({
  provider: 'anthropic',
  method: 'session',
  model: '',
  secret: '',
  refresh: '',
  expiresAt: 0,
});

async function detect(): Promise<Account | null> {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY)
    return session();
  const file = path.join(homedir(), '.claude', '.credentials.json');
  const raw = await fs.readFile(file, 'utf8').catch(() => null);
  if (raw && token(raw)) return session();
  if (process.platform === 'darwin') {
    const out = await exec(
      'security',
      ['find-generic-password', '-s', 'Claude Code-credentials', '-w'],
      { timeout: 5000 },
    )
      .then((r) => r.stdout)
      .catch(() => null);
    if (out && token(out)) return session();
  }
  // Source officielle, lisible sans terminal : la CLI répond en JSON.
  const bin = await findClaude();
  if (bin) {
    const out = await exec(bin, ['auth', 'status'], { timeout: 10_000 })
      .then((r) => r.stdout)
      .catch(() => null);
    try {
      if (out && JSON.parse(out).loggedIn === true) return session();
    } catch {
      // Sortie inattendue : on continue vers « non connecté ».
    }
  }
  return null;
}

/** Compte courant, sans secret. */
export async function auth(): Promise<Auth | null> {
  const f = fake();
  if (f === 'in') {
    cache = session();
    loaded = true;
    return publicAuth(cache);
  }
  if (f) {
    cache = null;
    loaded = true;
    return null;
  }
  if (loaded) return publicAuth(cache);
  loaded = true;
  const { account, off } = await files();
  const raw = await fs.readFile(account, 'utf8').catch(() => null);
  const saved = raw && parse(raw);
  if (saved) {
    try {
      saved.secret = await decrypt(saved.secret);
      if (saved.refresh) saved.refresh = await decrypt(saved.refresh);
    } catch {
      return null;
    }
    cache = await refreshIfNeeded(saved);
    scheduleRefresh(cache);
    return publicAuth(cache);
  }
  if (existsSync(off)) return null;
  cache = await detect();
  return publicAuth(cache);
}

/** Le compte complet, pour le processus principal seulement. */
export function requireAuth(): Account {
  if (!cache) throw new Error('auth:out');
  return cache;
}

export function accountNow(): Account {
  return requireAuth();
}

/** Clé conservée dans le cache et dans accounts.json, chiffrée. */
async function store(a: Account) {
  const { account, off } = await files();
  await fs.mkdir(path.dirname(account), { recursive: true });
  await atomicWrite(
    account,
    JSON.stringify({
      provider: a.provider,
      method: a.method,
      model: a.model,
      secret: await encrypt(a.secret),
      refresh: a.refresh ? await encrypt(a.refresh) : '',
      expiresAt: a.expiresAt,
    }),
  );
  await fs.rm(off, { force: true });
  cache = a;
  loaded = true;
  scheduleRefresh(a);
  return a;
}

/** Renouvelle un jeton navigateur proche de l'expiration, une fois. */
async function refreshIfNeeded(a: Account): Promise<Account> {
  if (a.method !== 'browser' || !a.refresh) return a;
  if (!a.expiresAt || a.expiresAt - Date.now() > 5 * 60_000) return a;
  try {
    const t = await refreshTokens(a.refresh);
    return await store({
      ...a,
      secret: t.access,
      refresh: t.refresh || a.refresh,
      expiresAt: t.expiresAt,
    });
  } catch {
    // Jeton expiré : la prochaine requête renverra auth:out.
    return a;
  }
}

/** Renouvellement en tâche de fond, sans retenir le processus. */
function scheduleRefresh(a: Account) {
  if (timer) clearTimeout(timer);
  timer = null;
  if (a.method !== 'browser' || !a.refresh || !a.expiresAt) return;
  const wait = Math.min(a.expiresAt - Date.now() - 5 * 60_000, 2 ** 31 - 1);
  if (wait <= 0) return;
  timer = setTimeout(() => {
    timer = null;
    void refreshIfNeeded(a);
  }, wait);
  timer.unref?.();
}

/** Valide une clé sans consommer de tokens : lecture seule, 10 s. */
async function checkKey(provider: Provider, key: string) {
  const info = providerTable[provider];
  const headers: Record<string, string> =
    provider === 'anthropic'
      ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
      : { Authorization: `Bearer ${key}` };
  let res: Response;
  try {
    res = await fetch(info.check, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error('auth:network');
  }
  if (res.status === 401 || res.status === 403) throw new Error('auth:key');
  if (!res.ok) throw new Error('auth:network');
}

/** Valide puis enregistre une clé ; renvoie le compte sans la clé. */
export async function authKey(provider: Provider, key: string): Promise<Auth> {
  if (!isProvider(provider)) throw new Error('auth:key');
  const secret = key.trim();
  if (!secret) throw new Error('auth:key');
  const f = fake();
  if (f === 'refuse') throw new Error('auth:key');
  if (f === 'accept') {
    cache = {
      provider,
      method: 'key',
      model: modelFor(provider),
      secret,
      refresh: '',
      expiresAt: 0,
    };
    loaded = true;
    return publicAuth(cache)!;
  }
  await checkKey(provider, secret);
  const a: Account = {
    provider,
    method: 'key',
    model: modelFor(provider),
    secret,
    refresh: '',
    expiresAt: 0,
  };
  await store(a);
  return publicAuth(a)!;
}

/** `claude` dans le PATH, puis les emplacements connus. */
async function findClaude(): Promise<string | null> {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const found = await exec(cmd, ['claude'], { timeout: 5000 })
    .then((r) => r.stdout.split(/\r?\n/)[0]?.trim() ?? '')
    .catch(() => '');
  if (found && existsSync(found)) return found;
  const candidates = [
    path.join(homedir(), '.local', 'bin', 'claude'),
    path.join(homedir(), '.claude', 'local', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ];
  return candidates.find((c) => existsSync(c)) ?? null;
}

/** Ouvre la page d'autorisation ; le code affiché revient par `authClaudeCode`. */
export async function authClaude(): Promise<{ url: string }> {
  const f = fake();
  if (f === 'accept' || f === 'refuse') {
    oauth = { verifier: 'fake', state: 'fake' };
    return { url: 'https://claude.com/cai/oauth/authorize' };
  }
  const p = pkce();
  oauth = { verifier: p.verifier, state: p.state };
  const url = authorizeUrl(p);
  const { shell } = await electron();
  await shell.openExternal(url);
  return { url };
}

/** Échange le code recopié du navigateur contre un jeton, puis le range. */
export async function authClaudeCode(input: string): Promise<Auth> {
  const f = fake();
  if (f === 'refuse') throw new Error('auth:code');
  if (f === 'accept') {
    const a: Account = {
      provider: 'anthropic',
      method: 'browser',
      model: '',
      secret: 'fake-browser-token',
      refresh: '',
      expiresAt: 0,
    };
    cache = a;
    loaded = true;
    return publicAuth(a)!;
  }
  if (!oauth) throw new Error('auth:code');
  const code = parseCode(input, oauth.state);
  const t = await exchangeCode(code, oauth.verifier, oauth.state);
  oauth = null;
  const a: Account = {
    provider: 'anthropic',
    method: 'browser',
    model: '',
    secret: t.access,
    refresh: t.refresh,
    expiresAt: t.expiresAt,
  };
  await store(a);
  return publicAuth(a)!;
}

/** Efface le compte et empêche la détection de le réactiver au lancement. */
export async function authOut(): Promise<void> {
  const had = cache !== null;
  oauth = null;
  cache = null;
  loaded = true;
  if (timer) clearTimeout(timer);
  timer = null;
  if (fake()) return;
  const { account, off } = await files();
  await fs.rm(account, { force: true });
  // Une annulation de connexion ne doit pas bloquer la détection suivante.
  if (!had) return;
  await fs.mkdir(path.dirname(off), { recursive: true });
  await fs.writeFile(off, '');
}

/**
 * Environnement du SDK : la seule source de vérité pour l'authentification
 * Claude. Une clé ou un jeton du navigateur remplace celle du shell.
 */
export function claudeEnv(): NodeJS.ProcessEnv {
  const a = cache;
  if (!a || a.method === 'session') return process.env;
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  delete env.CLAUDE_CODE_OAUTH_TOKEN;
  if (a.provider === 'anthropic') {
    if (a.method === 'key') env.ANTHROPIC_API_KEY = a.secret;
    else env.CLAUDE_CODE_OAUTH_TOKEN = a.secret;
  }
  return env;
}
