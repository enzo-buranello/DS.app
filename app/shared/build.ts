import type { Project } from './project.js';

// Génération incrémentale : une empreinte par élément du projet, dans l'ordre
// tokens → composants → pages → contenus. Seul ce qui a changé est régénéré.

export const steps = ['tokens', 'components', 'pages', 'content'] as const;
export type Step = (typeof steps)[number];
export type Hashes = Record<string, string>;

/** Clés « étape:id » → empreinte ; `hash` vient du processus principal. */
export function hashes(p: Project, hash: (v: unknown) => string): Hashes {
  const out: Hashes = { 'tokens:all': hash(p.foundations) };
  for (const [id, c] of Object.entries(p.components))
    out[`components:${id}`] = hash(c);
  for (const [id, pg] of Object.entries(p.pages)) out[`pages:${id}`] = hash(pg);
  for (const [id, c] of Object.entries(p.collections))
    out[`content:${id}`] = hash(c);
  return out;
}

export type Changes = Record<Step, { changed: string[]; removed: string[] }>;

/** Ce qui a changé depuis la dernière génération réussie, par étape. */
export function diff(before: Hashes | undefined, now: Hashes): Changes {
  const out = Object.fromEntries(
    steps.map((s) => [s, { changed: [] as string[], removed: [] as string[] }]),
  ) as Changes;
  for (const [key, h] of Object.entries(now))
    if (before?.[key] !== h) {
      const [step, id] = key.split(':') as [Step, string];
      out[step].changed.push(id);
    }
  for (const key of Object.keys(before ?? {}))
    if (!(key in now)) {
      const [step, id] = key.split(':') as [Step, string];
      out[step].removed.push(id);
    }
  return out;
}

export const isEmpty = (c: Changes) =>
  steps.every((s) => !c[s].changed.length && !c[s].removed.length);

export const targetDirs = {
  react: 'react',
  next: 'next',
  html: 'html',
  swiftui: 'swiftui',
} as const;
export const targetLabels = {
  react: 'React + Tailwind',
  next: 'Next.js',
  html: 'HTML/CSS',
  swiftui: 'SwiftUI',
} as const;
export type Target = keyof typeof targetDirs;

/** État de la dernière génération, par cible (.studio/build.json). */
export type BuildState = Partial<
  Record<
    Target,
    {
      at: string;
      ok: boolean;
      hashes?: Hashes;
      files?: number;
      /** Fichiers créés ou modifiés lors du dernier passage de l'agent. */
      touched?: string[];
    }
  >
>;

/** Élément visé dans l'aperçu, ou fichier (SwiftUI). */
export type CodeScope = {
  selector?: string;
  html?: string;
  text?: string;
  file?: string;
};
/** Aperçu : page web servie en local, ou capture du simulateur. */
export type Preview = { url: string } | { image: string };
/** Fichier en cours d'écriture par l'agent ; null : il a fini. */
export type Activity = { file: string | null };
