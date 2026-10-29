import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import {
  diff,
  hashes as hashesOf,
  isEmpty,
  steps,
  targetDirs,
  targetLabels,
  type BuildState,
  type Target,
} from '../shared/build.js';
import type { Project } from '../shared/project.js';
import { decide } from './guard.js';
import { atomicWrite, projectFile } from './projects.js';

// Agent Développement : écrit et construit l'application, une cible à la fois,
// dans <projet>/code/<cible>. Il lit le projet, n'écrit que dans sa cible.

export const hashes = (p: Project) =>
  hashesOf(p, (v) =>
    createHash('sha1').update(JSON.stringify(v)).digest('hex').slice(0, 16),
  );

const conventions: Record<Target, string> = {
  react: `Vite + React + TypeScript + Tailwind CSS v4 (@tailwindcss/vite). Tokens : src/styles/tokens.css (variables CSS, valeurs claires et sombres via prefers-color-scheme) reliées au thème Tailwind par @theme. Composants : src/components/<Nom>.tsx, textes et images en props, états par hover:, active:, disabled:. Pages : src/pages/<Nom>.tsx et une navigation simple dans src/App.tsx (location.hash, sans dépendance). Contenus : src/content/<collection>.json importés. Images : public/assets/.`,
  next: `Next.js (App Router) + TypeScript + Tailwind CSS v4. Tokens : app/tokens.css (variables CSS, clair et sombre) reliées par @theme. Composants : components/<Nom>.tsx. Pages : app/page.tsx pour la première page, app/<id>/page.tsx pour les autres. Contenus : content/<collection>.json. Images : public/assets/. Génère un site statique (output: 'export').`,
  html: `HTML et CSS sans framework ni build. Tokens : tokens.css (variables CSS, clair et sombre). Composants : classes réutilisables dans components.css. Pages : index.html pour la première page, <id>.html pour les autres, tout le contenu des collections écrit en HTML. Images : assets/.`,
  swiftui: `SwiftUI (iOS 17, macOS 14). Tokens : Tokens.swift (couleurs claire et sombre, typographies, espacements, arrondis, ombres). Composants : Components/<Nom>.swift. Pages : Pages/<Nom>.swift et App.swift avec une navigation. Contenus : Content/<Collection>.swift (struct et données statiques). Images : Assets/ (fichiers à ajouter au catalogue).`,
};

const DEV = `Tu es le développeur du projet. Tu écris l'application à partir du fichier projet, en silence : aucune explication, aucune question.

Règles :
- Source unique : le fichier .studio/project.json du projet (lis-le). N'écris que dans le dossier courant.
- Ordre : 1. tokens, 2. composants, 3. pages, 4. contenus. Ne traite que ce que la liste des changements désigne ; supprime ce qui a été retiré.
- Les styles du projet sont des identifiants de tokens (couleurs, espacements, arrondis, ombres, typographies) ou des valeurs libres (nombre en px, couleur #rrggbb). Un token devient toujours une référence au token généré, jamais une valeur recopiée.
- Disposition : direction column, row ou grid (columns) en flex/grid ; free : enfants en position absolue (x, y). Formats : desktop par défaut, tablet (≤ 1024 px) et mobile (≤ 640 px) en surcharge.
- Nœuds : box, shape, text, image, list (répète ses enfants pour chaque élément de la collection bind.collection), component (instance ; overrides = ajustements locaux par identifiant d'élément). bind.field : valeur d'un champ de collection. href : lien (« /id » vers une page du projet).
- Code lisible, noms tirés des noms du projet, pas de dépendance inutile.
- Pour une cible web, termine par l'installation des dépendances puis la construction (npm install, npm run build) et corrige les erreurs.`;

const assetDir: Record<Target, string> = {
  react: 'public/assets',
  next: 'public/assets',
  html: 'assets',
  swiftui: 'Assets',
};

async function count(dir: string): Promise<number> {
  let n = 0;
  for (const e of await fs
    .readdir(dir, { withFileTypes: true })
    .catch(() => []))
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    else if (e.isDirectory()) n += await count(path.join(dir, e.name));
    else n++;
  return n;
}

const stateFile = (dir: string) => path.join(dir, '.studio', 'build.json');
export async function readState(dir: string): Promise<BuildState> {
  try {
    return JSON.parse(await fs.readFile(stateFile(dir), 'utf8'));
  } catch {
    return {};
  }
}

/** Génère une cible ; seul ce qui a changé depuis la dernière réussite. */
export async function generate(dir: string, project: Project, target: Target) {
  const out = path.join(dir, 'code', targetDirs[target]);
  const state = await readState(dir);
  const prev = state[target];
  const exists = await fs.stat(out).then(
    () => true,
    () => false,
  );
  const now = hashes(project);
  const changes = diff(exists && prev?.ok ? prev.hashes : undefined, now);
  await fs.mkdir(out, { recursive: true });
  // Les images du projet sont copiées telles quelles.
  await fs
    .cp(path.join(dir, '.studio', 'assets'), path.join(out, assetDir[target]), {
      recursive: true,
    })
    .catch(() => {});

  let ok = true;
  if (!isEmpty(changes)) {
    const prompt = [
      `Cible : ${targetLabels[target]}. ${conventions[target]}`,
      `Fichier projet : ${projectFile(dir)}`,
      `Changements, dans l'ordre :\n${steps
        .map((s) => `${s} : ${JSON.stringify(changes[s])}`)
        .join('\n')}`,
    ].join('\n\n');
    ok = await run(prompt, dir, out, changes);
  }
  const next: BuildState = {
    ...(await readState(dir)),
    [target]: {
      at: new Date().toISOString(),
      ok,
      hashes: ok ? now : prev?.hashes,
      files: await count(out),
    },
  };
  await atomicWrite(stateFile(dir), JSON.stringify(next, null, 2));
  return next;
}

async function run(prompt: string, dir: string, out: string, changes: unknown) {
  if (process.env.STUDIO_FAKE_GENERATE) {
    await fs.writeFile(
      path.join(out, 'GENERATED.json'),
      JSON.stringify(changes),
    );
    return process.env.STUDIO_FAKE_GENERATE !== 'fail';
  }
  try {
    for await (const m of query({
      prompt,
      options: {
        systemPrompt: DEV,
        cwd: out,
        tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
        settingSources: [],
        permissionMode: 'default',
        maxTurns: 150,
        canUseTool: async (tool, input) => {
          const d = decide(tool, input, dir, out);
          return d.ok
            ? { behavior: 'allow', updatedInput: input }
            : { behavior: 'deny', message: d.why ?? 'Refusé' };
        },
      },
    }))
      if (m.type === 'result') return m.subtype === 'success';
  } catch {
    return false;
  }
  return false;
}
