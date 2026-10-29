import path from 'node:path';

// Garde-fous de l'agent Développement : il lit le projet, n'écrit que dans
// le dossier de sa cible et n'exécute que des commandes de construction.

export const inside = (dir: string, file: string) => {
  const rel = path.relative(dir, path.resolve(dir, file));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

const commands = new Set([
  'npm',
  'npx',
  'node',
  'ls',
  'cat',
  'mkdir',
  'cp',
  'mv',
  'rm',
  'touch',
  'swift',
  'swiftc',
]);

/** Commande acceptée : programmes connus, chemins dans le dossier de la cible. */
export function allowCommand(cmd: string, dir: string): boolean {
  if (/[`$<>|;]|\.\.|~|\bsudo\b/.test(cmd.replace(/&&/g, ''))) return false;
  return cmd.split('&&').every((part) => {
    const words = part.trim().split(/\s+/).filter(Boolean);
    if (!words.length || !commands.has(words[0])) return false;
    return words
      .slice(1)
      .filter((w) => w.startsWith('/'))
      .every((w) => inside(dir, w));
  });
}

const writers = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const readers = new Set(['Read', 'Glob', 'Grep', 'LS']);

/** Décision pour un outil : lecture dans le projet, écriture dans la cible. */
export function decide(
  tool: string,
  input: Record<string, unknown>,
  project: string,
  target: string,
): { ok: boolean; why?: string } {
  const file = (input.file_path ?? input.path ?? input.notebook_path) as
    string | undefined;
  if (writers.has(tool))
    return file && inside(target, file)
      ? { ok: true }
      : { ok: false, why: 'Écriture hors du dossier de la cible' };
  if (readers.has(tool))
    return !file || inside(project, file)
      ? { ok: true }
      : { ok: false, why: 'Lecture hors du projet' };
  if (tool === 'Bash')
    return allowCommand(String(input.command ?? ''), target)
      ? { ok: true }
      : { ok: false, why: 'Commande refusée' };
  return { ok: false, why: 'Outil refusé' };
}
