import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bodyFor,
  headersFor,
  httpError,
  parseJson,
  urlFor,
  visionError,
} from '../app/main/compat.js';

const parts = [{ type: 'text' as const, text: 'bonjour' }];
const schema = { type: 'object', properties: { name: { type: 'string' } } };

test('OpenAI : json_schema strict, les autres : json_object', () => {
  const openai = bodyFor(
    'openai',
    'gpt-6.1-sol',
    'system',
    'prompt',
    schema,
    parts,
  ) as {
    response_format: { type: string; json_schema?: { strict: boolean } };
    messages: { role: string; content: unknown }[];
  };
  assert.equal(openai.response_format.type, 'json_schema');
  assert.equal(openai.response_format.json_schema?.strict, true);
  assert.equal(openai.messages[0].content, 'system');

  const other = bodyFor(
    'deepseek',
    'deepseek-v4-pro',
    'system',
    'prompt',
    schema,
    parts,
  ) as {
    response_format: { type: string };
    messages: { role: string; content: string }[];
  };
  assert.equal(other.response_format.type, 'json_object');
  assert.match(String(other.messages[0].content), /"type":"object"/);
});

test('URL et en-têtes par fournisseur', () => {
  assert.match(urlFor('openai'), /^https:\/\/api\.openai\.com\/v1\//);
  assert.match(
    urlFor('deepseek'),
    /^https:\/\/api\.deepseek\.com\/chat\/completions$/,
  );
  assert.match(urlFor('openrouter'), /^https:\/\/openrouter\.ai\/api\/v1\//);
  assert.equal(headersFor('openai', 'k').Authorization, 'Bearer k');
});

test('images refusées sans vision', () => {
  assert.equal(visionError('deepseek', ['a.png']), 'auth:vision');
  assert.equal(visionError('deepseek', []), null);
  assert.equal(visionError('openai', ['a.png']), null);
});

test('401 et réseau ont des codes stables', () => {
  assert.equal(httpError(401), 'auth:key');
  assert.equal(httpError(403), 'auth:key');
  assert.equal(httpError(500), 'auth:network');
});

test('le JSON est extrait des fences et du texte autour', () => {
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJson('Voici : {"a":2} merci'), { a: 2 });
});
