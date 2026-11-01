import { createHash, randomBytes } from 'node:crypto';

// Connexion Claude : le même OAuth public que la CLI officielle, sans secret
// client (PKCE). Le navigateur affiche un code à recopier ; la CLI, elle, le
// lit dans un terminal. Ici l'interface le demande, ce qui évite de dépendre
// d'un terminal et laisse le jeton dans le trousseau de l'app.

const clientId = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const authorizeUrlBase = 'https://claude.com/cai/oauth/authorize';
const tokenUrl = 'https://platform.claude.com/v1/oauth/token';
const redirectUri = 'https://platform.claude.com/oauth/code/callback';
const scope = 'user:inference';
// Le point d'échange refuse les clients sans cette signature.
const agent = 'claude-cli (external, cli)';

export type Pkce = { verifier: string; challenge: string; state: string };

/** Code et état neufs pour une tentative de connexion. */
export function pkce(): Pkce {
  const verifier = randomBytes(32).toString('base64url');
  return {
    verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
    state: randomBytes(24).toString('base64url'),
  };
}

/** Page d'autorisation ouverte dans le navigateur. */
export function authorizeUrl(p: Pkce) {
  const url = new URL(authorizeUrlBase);
  for (const [k, v] of Object.entries({
    code: 'true',
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope,
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    state: p.state,
  }))
    url.searchParams.set(k, v);
  return url.toString();
}

/** Le retour du navigateur est « code#state » ; l'état doit correspondre. */
export function parseCode(input: string, state: string) {
  const [code, got] = input.trim().split('#');
  if (!code) throw new Error('auth:code');
  if (got && got !== state) throw new Error('auth:code');
  return code;
}

export type Tokens = { access: string; refresh: string; expiresAt: number };

type Answer = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

async function post(body: Record<string, string>, fetcher: typeof fetch) {
  let res: Response;
  try {
    res = await fetcher(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': agent },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error('auth:network');
  }
  return res;
}

const tokens = async (res: Response, failure: string): Promise<Tokens> => {
  if (res.status === 400 || res.status === 401 || res.status === 403)
    throw new Error(failure);
  if (!res.ok) throw new Error('auth:network');
  const json = (await res.json().catch(() => ({}))) as Answer;
  if (!json.access_token) throw new Error(failure);
  return {
    access: json.access_token,
    refresh: json.refresh_token ?? '',
    expiresAt: Date.now() + (json.expires_in ?? 0) * 1000,
  };
};

/** Échange le code du navigateur contre un jeton d'accès. */
export async function exchangeCode(
  code: string,
  verifier: string,
  state: string,
  fetcher: typeof fetch = fetch,
): Promise<Tokens> {
  const res = await post(
    {
      grant_type: 'authorization_code',
      code,
      state,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: verifier,
    },
    fetcher,
  );
  return tokens(res, 'auth:code');
}

/** Renouvelle un jeton d'accès arrivé près de son expiration. */
export async function refreshTokens(
  refresh: string,
  fetcher: typeof fetch = fetch,
): Promise<Tokens> {
  const res = await post(
    {
      grant_type: 'refresh_token',
      refresh_token: refresh,
      client_id: clientId,
    },
    fetcher,
  );
  return tokens(res, 'auth:out');
}
