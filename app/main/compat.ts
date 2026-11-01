import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { providerTable } from '../shared/account.js';
import { accountNow } from './account.js';

// Fournisseurs compatibles OpenAI : un appel JSON, sans outil. La clé ne
// quitte jamais le processus principal.

const mime: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

type Part =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

const schemaOf = (schema: z.ZodType) =>
  z.toJSONSchema(schema, { io: 'input', target: 'draft-7' }) as Record<
    string,
    unknown
  >;

export const urlFor = (provider: keyof typeof providerTable) =>
  `${providerTable[provider].baseUrl}/chat/completions`;

export const headersFor = (
  provider: keyof typeof providerTable,
  key: string,
) => ({
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
});

export const visionError = (
  provider: keyof typeof providerTable,
  images: string[],
) => (images.length && !providerTable[provider].vision ? 'auth:vision' : null);

export const httpError = (status: number) =>
  status === 401 || status === 403 ? 'auth:key' : 'auth:network';

export const bodyFor = (
  provider: keyof typeof providerTable,
  model: string,
  system: string,
  prompt: string,
  json: Record<string, unknown>,
  parts: Part[],
  repair?: { previous: string; problem: string },
) => {
  const openai = provider === 'openai';
  const sys = openai
    ? system
    : `${system}\n\nRéponds uniquement en JSON valide, conforme à ce schéma :\n${JSON.stringify(json)}`;
  return {
    model,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: parts.length > 1 ? parts : prompt },
      ...(repair
        ? [
            { role: 'assistant', content: repair.previous },
            {
              role: 'user',
              content: `Réponse invalide : ${repair.problem}\nRenvoie uniquement le JSON conforme au schéma.`,
            },
          ]
        : []),
    ],
    response_format: openai
      ? {
          type: 'json_schema',
          json_schema: { name: 'result', strict: true, schema: json },
        }
      : { type: 'json_object' },
  };
};

export const parseJson = (text: string) => {
  const clean = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(clean) as unknown;
  } catch {
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('auth:network');
    try {
      return JSON.parse(clean.slice(start, end + 1)) as unknown;
    } catch {
      throw new Error('auth:network');
    }
  }
};

const contentText = (data: unknown) => {
  const content = (data as { choices?: { message?: { content?: unknown } }[] })
    .choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content))
    return content
      .map((p) =>
        p && typeof p === 'object' && 'text' in p
          ? String((p as { text: unknown }).text)
          : '',
      )
      .join('');
  return '';
};

async function call(
  system: string,
  prompt: string,
  schema: z.ZodType,
  images: string[],
  repair?: { previous: string; problem: string },
) {
  const a = accountNow();
  const info = providerTable[a.provider];
  if (info.protocol !== 'openai-compatible') throw new Error('auth:out');
  const vision = visionError(a.provider, images);
  if (vision) throw new Error(vision);
  const model = a.model || info.defaultModel;
  const parts: Part[] = [{ type: 'text', text: prompt }];
  for (const file of images) {
    const ext = file.split('.').pop()?.toLowerCase() ?? '';
    const data = await readFile(file).catch(() => null);
    if (!data) continue;
    parts.push({
      type: 'image_url',
      image_url: {
        url: `data:${mime[ext] ?? 'image/png'};base64,${data.toString('base64')}`,
      },
    });
  }
  const body = bodyFor(
    a.provider,
    model,
    system,
    prompt,
    schemaOf(schema),
    parts,
    repair,
  );
  let res: Response;
  try {
    res = await fetch(urlFor(a.provider), {
      method: 'POST',
      headers: headersFor(a.provider, a.secret),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new Error('auth:network');
  }
  if (!res.ok) throw new Error(httpError(res.status));
  const data = await res.json().catch(() => null);
  if (!data) throw new Error('auth:network');
  return contentText(data);
}

/**
 * Réponse JSON validée ; une seule tentative de réparation avec l'erreur de
 * validation. Les images sont refusées avant l'appel si le modèle ne les voit
 * pas.
 */
export async function askJson<T>(
  system: string,
  prompt: string,
  schema: z.ZodType<T>,
  images: string[] = [],
): Promise<T> {
  const first = await call(system, prompt, schema, images);
  let problem = '';
  try {
    return schema.parse(parseJson(first));
  } catch (e) {
    problem =
      e instanceof z.ZodError
        ? JSON.stringify(e.issues).slice(0, 4000)
        : 'JSON invalide';
  }
  const second = await call(system, prompt, schema, images, {
    previous: first.slice(0, 20_000),
    problem,
  });
  try {
    return schema.parse(parseJson(second));
  } catch {
    throw new Error('auth:network');
  }
}
