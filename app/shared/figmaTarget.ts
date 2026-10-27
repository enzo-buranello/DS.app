import { z } from 'zod';

// Cible Figma choisie par URL : fichier (fileKey) et page, mémorisée par projet.
export const fileKeySchema = z.string().regex(/^[A-Za-z0-9]{10,64}$/);
export const figmaTargetSchema = z
  .object({
    fileKey: fileKeySchema,
    fileName: z.string().max(200),
    pageId: z.string().max(80),
    pageName: z.string().max(200),
    nodeId: z.string().max(80).nullable(),
    url: z.string().max(500),
  })
  .strict();
export type FigmaTarget = z.infer<typeof figmaTargetSchema>;

export type ParsedFigmaUrl =
  | { ok: true; fileKey: string; nodeId: string | null; url: string }
  | { ok: false; error: string };

/**
 * https://www.figma.com/design/<fileKey>/<nom>?node-id=<id> (ou /file/).
 * Le node-id de l'URL s'écrit « 12-34 » ; l'API Plugin attend « 12:34 ».
 */
export function parseFigmaUrl(input: string): ParsedFigmaUrl {
  const fail = (error: string) => ({ ok: false as const, error });
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return fail('URL invalide : copiez le lien du fichier depuis Figma.');
  }
  if (
    url.protocol !== 'https:' ||
    !['www.figma.com', 'figma.com'].includes(url.hostname) ||
    url.username ||
    url.password
  )
    return fail('Lien https://www.figma.com/… attendu.');
  const parts = url.pathname.split('/').filter(Boolean);
  if (!['design', 'file'].includes(parts[0]) || !parts[1])
    return fail('Lien de fichier Figma attendu (/design/… ou /file/…).');
  // Une branche porte sa propre clé : /design/<clé>/branch/<clé de branche>/…
  const fileKey = parts[2] === 'branch' && parts[3] ? parts[3] : parts[1];
  if (!fileKeySchema.safeParse(fileKey).success)
    return fail('Clé de fichier Figma invalide dans l’URL.');
  const raw = url.searchParams.get('node-id');
  let nodeId: string | null = null;
  if (raw) {
    nodeId = raw.replace(/-/g, ':');
    if (!/^\d+:\d+$/.test(nodeId))
      return fail(`node-id invalide dans l’URL : « ${raw} ».`);
  }
  return { ok: true, fileKey, nodeId, url: url.toString() };
}
