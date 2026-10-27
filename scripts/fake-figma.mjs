// Faux serveur Figma pour les tests : OAuth (PKCE vérifié), rafraîchissement,
// utilisateur et fichiers. Aucun appel au vrai Figma.
import http from 'node:http';
import { createHash } from 'node:crypto';

const FILES = {
  AbCdEf123456: {
    name: 'Kit UI',
    role: 'editor',
    pages: [
      { id: '0:1', name: 'Composants' },
      { id: '0:2', name: 'Écrans' },
    ],
  },
  ViewOnly12345: {
    name: 'Lecture seule',
    role: 'viewer',
    pages: [{ id: '0:1', name: 'Page 1' }],
  },
};

export function startFakeFigma(
  port = 0,
  { clientId = 'test', clientSecret = 'test' } = {},
) {
  const codes = new Map();
  const tokens = new Set();
  const stats = { exchanges: 0, refreshes: 0 };
  let seq = 0;
  const basic =
    'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    let body = '';
    for await (const c of req) body += c;
    const form = new URLSearchParams(body);
    if (url.pathname === '/oauth') {
      const p = url.searchParams;
      if (p.get('client_id') !== clientId || p.get('response_type') !== 'code')
        return json(400, { error: 'bad request' });
      const code = `code-${++seq}`;
      codes.set(code, {
        challenge: p.get('code_challenge'),
        redirect: p.get('redirect_uri'),
      });
      const back = new URL(p.get('redirect_uri'));
      back.searchParams.set('code', code);
      back.searchParams.set('state', p.get('state'));
      res.writeHead(302, { Location: back.toString() });
      return res.end();
    }
    if (url.pathname === '/v1/oauth/token' && req.method === 'POST') {
      const pending = codes.get(form.get('code'));
      codes.delete(form.get('code'));
      const verifier = form.get('code_verifier') ?? '';
      const challenge = createHash('sha256')
        .update(verifier)
        .digest('base64url');
      if (
        req.headers.authorization !== basic ||
        !pending ||
        pending.challenge !== challenge ||
        pending.redirect !== form.get('redirect_uri') ||
        form.get('grant_type') !== 'authorization_code'
      )
        return json(400, { error: 'invalid_grant' });
      stats.exchanges++;
      const access = `at-${++seq}`;
      tokens.add(access);
      return json(200, {
        access_token: access,
        refresh_token: 'rt-1',
        token_type: 'bearer',
        // Moins que la marge de 5 min : chaque appel API force un rafraîchissement.
        expires_in: 120,
        user_id_string: '42',
      });
    }
    if (url.pathname === '/v1/oauth/refresh' && req.method === 'POST') {
      if (
        req.headers.authorization !== basic ||
        form.get('refresh_token') !== 'rt-1'
      )
        return json(400, { error: 'invalid_grant' });
      stats.refreshes++;
      const access = `at-${++seq}`;
      tokens.clear();
      tokens.add(access);
      return json(200, {
        access_token: access,
        token_type: 'bearer',
        expires_in: 120,
      });
    }
    if (url.pathname === '/__stats') return json(200, stats);
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (!tokens.has(bearer))
      return json(401, { status: 401, err: 'Invalid token' });
    if (url.pathname === '/v1/me')
      return json(200, {
        id: '42',
        handle: 'Camille',
        email: 'camille@example.com',
      });
    const file = url.pathname.match(/^\/v1\/files\/([^/]+)$/);
    if (file) {
      const f = FILES[decodeURIComponent(file[1])];
      if (!f) return json(404, { status: 404, err: 'Not found' });
      return json(200, {
        name: f.name,
        role: f.role,
        document: { children: f.pages.map((p) => ({ ...p, type: 'CANVAS' })) },
      });
    }
    json(404, { status: 404 });
  });
  return new Promise((resolve) =>
    server.listen(port, '127.0.0.1', () =>
      resolve({
        server,
        stats,
        url: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((r) => server.close(r)),
      }),
    ),
  );
}
