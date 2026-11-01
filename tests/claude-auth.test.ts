import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  authorizeUrl,
  exchangeCode,
  parseCode,
  pkce,
  refreshTokens,
} from '../app/main/claude-auth.js';

test('pkce : vérificateur, défi S256 et état distincts', () => {
  const a = pkce();
  const b = pkce();
  assert.match(a.verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(
    a.challenge,
    createHash('sha256').update(a.verifier).digest('base64url'),
  );
  assert.notEqual(a.verifier, b.verifier);
  assert.notEqual(a.state, b.state);
});

test('authorizeUrl : les paramètres attendus, sans secret', () => {
  const p = pkce();
  const url = new URL(authorizeUrl(p));
  assert.equal(url.origin + url.pathname, 'https://claude.com/cai/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), '9d1c250a-e61b-44d9-88ed-5944d1962f5e');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://platform.claude.com/oauth/code/callback');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge'), p.challenge);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('state'), p.state);
  assert.equal(url.searchParams.get('scope'), 'user:inference');
  assert.ok(!url.toString().includes('client_secret'));
});

test('parseCode : code seul, code#état, refus du reste', () => {
  assert.equal(parseCode(' abc123 ', 's'), 'abc123');
  assert.equal(parseCode('abc123#s', 's'), 'abc123');
  assert.throws(() => parseCode('abc123#autre', 's'), /auth:code/);
  assert.throws(() => parseCode('   ', 's'), /auth:code/);
});

const answer = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

test('exchangeCode : code et état contre un jeton daté', async () => {
  let sent: { url: string; body: Record<string, unknown>; headers: unknown } | null =
    null;
  const fetcher = (async (url: string, init: RequestInit) => {
    sent = {
      url: String(url),
      body: JSON.parse(String(init.body)),
      headers: init.headers,
    };
    return answer({
      access_token: 'sk-ant-oat01-x',
      refresh_token: 'r',
      expires_in: 3600,
    });
  }) as unknown as typeof fetch;
  const before = Date.now();
  const t = await exchangeCode('code', 'verifier', 'state', fetcher);
  assert.equal(t.access, 'sk-ant-oat01-x');
  assert.equal(t.refresh, 'r');
  assert.ok(t.expiresAt >= before + 3599_000);
  assert.equal(sent!.url, 'https://platform.claude.com/v1/oauth/token');
  assert.deepEqual(sent!.body, {
    grant_type: 'authorization_code',
    code: 'code',
    state: 'state',
    redirect_uri: 'https://platform.claude.com/oauth/code/callback',
    client_id: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
    code_verifier: 'verifier',
  });
  assert.match(
    JSON.stringify(sent!.headers),
    /claude-cli/,
  );
});

test('refreshTokens et erreurs', async () => {
  const refresh = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    assert.equal(body.grant_type, 'refresh_token');
    assert.equal(body.refresh_token, 'r');
    return answer({ access_token: 'a2', expires_in: 60 });
  }) as unknown as typeof fetch;
  const t = await refreshTokens('r', refresh);
  assert.equal(t.access, 'a2');

  const refused = (async () => answer({}, 401)) as unknown as typeof fetch;
  await assert.rejects(exchangeCode('code', 'v', 's', refused), /auth:code/);
  await assert.rejects(refreshTokens('r', refused), /auth:out/);

  const down = (async () => {
    throw new Error('offline');
  }) as unknown as typeof fetch;
  await assert.rejects(exchangeCode('code', 'v', 's', down), /auth:network/);
});
