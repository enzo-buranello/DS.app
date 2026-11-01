import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  auth,
  authClaude,
  authClaudeCode,
  authKey,
  authOut,
  claudeEnv,
  requireAuth,
} from '../app/main/account.js';
import {
  isProvider,
  modelFor,
  providerLabels,
  providerTable,
  providers,
} from '../app/shared/account.js';

test('table des fournisseurs : deux protocoles, un modèle par défaut', () => {
  assert.deepEqual(providers, [
    'anthropic',
    'openai',
    'deepseek',
    'mistral',
    'openrouter',
  ]);
  assert.equal(providerTable.anthropic.protocol, 'anthropic-sdk');
  for (const p of ['openai', 'deepseek', 'mistral', 'openrouter'] as const)
    assert.equal(providerTable[p].protocol, 'openai-compatible');
  assert.equal(providerTable.deepseek.vision, false);
  assert.ok(providerTable.openai.defaultModel.length > 0);
  assert.equal(modelFor('openai'), providerTable.openai.defaultModel);
  assert.equal(modelFor('openai', 'autre'), 'autre');
  assert.equal(providerLabels.anthropic, 'Claude');
  assert.ok(isProvider('mistral'));
  assert.ok(!isProvider('gemini'));
});

test('claudeEnv : session telle quelle, clé isolée du shell', async () => {
  process.env.STUDIO_FAKE_AUTH = 'in';
  await auth();
  assert.equal(claudeEnv(), process.env);

  process.env.STUDIO_FAKE_AUTH = 'accept';
  await auth();
  const a = await authKey('anthropic', ' sk-test ');
  assert.equal(a.provider, 'anthropic');
  assert.equal(a.method, 'key');
  const env = claudeEnv();
  assert.equal(env.ANTHROPIC_API_KEY, 'sk-test');
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, undefined);
});

test('claudeEnv : jeton du navigateur', async () => {
  process.env.STUDIO_FAKE_AUTH = 'accept';
  await auth();
  const { url } = await authClaude();
  assert.match(url, /claude\.com/);
  const a = await authClaudeCode('fake-code#fake');
  assert.equal(a.method, 'browser');
  const env = claudeEnv();
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, 'fake-browser-token');
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
});

test('sans compte : requireAuth refuse, clé vide refusée', async () => {
  process.env.STUDIO_FAKE_AUTH = 'out';
  await auth();
  assert.throws(() => requireAuth(), /auth:out/);
  await assert.rejects(authKey('anthropic', '   '), /auth:key/);
});

test('clé refusée : rien n’est enregistré', async () => {
  process.env.STUDIO_FAKE_AUTH = 'refuse';
  await auth();
  await assert.rejects(authKey('openai', 'sk-test'), /auth:key/);
  assert.throws(() => requireAuth(), /auth:out/);
  await authOut();
});
