import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Versions en présence : un serveur lancé avant une mise à jour du code, ou
// un onglet chargé avant une recompilation, ne doivent pas dialoguer en
// silence avec du code plus récent (routes absentes, formats refusés).

/** Code exécuté par le serveur : relu au démarrage, comparé ensuite. */
const SERVER_SOURCES = [
  'app/server',
  'app/shared',
  'connectors',
  'scripts/runtime.mjs',
];

async function files(dir: string): Promise<string[]> {
  const stat = await fs.stat(dir).catch(() => null);
  if (stat?.isFile()) return [dir];
  const entries = await fs
    .readdir(dir, { withFileTypes: true })
    .catch(() => []);
  const out: string[] = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await files(p)));
    else if (/\.(ts|mjs|js)$/.test(e.name)) out.push(p);
  }
  return out;
}
/** Empreinte du code serveur (chemin, taille, date de modification). */
export async function serverFingerprint(root: string): Promise<string> {
  const all = (
    await Promise.all(SERVER_SOURCES.map((d) => files(path.join(root, d))))
  )
    .flat()
    .sort();
  const hash = createHash('sha256');
  for (const f of all) {
    const s = await fs.stat(f).catch(() => null);
    if (s) hash.update(`${path.relative(root, f)}:${s.size}:${s.mtimeMs}\n`);
  }
  return hash.digest('hex').slice(0, 16);
}
/** Bundle client publié dans dist/ (« assets/index-….js »), null sinon. */
export async function clientBuild(root: string): Promise<string | null> {
  const html = await fs
    .readFile(path.join(root, 'dist', 'index.html'), 'utf8')
    .catch(() => null);
  return html?.match(/assets\/index-[\w-]+\.js/)?.[0] ?? null;
}

/** Surveille le code : périmé dès qu'un fichier serveur a changé. */
export async function versionWatch(root: string) {
  const started = await serverFingerprint(root);
  let checked = { at: 0, stale: false };
  return {
    async stale() {
      // Une lecture toutes les 2 s au plus, quel que soit le nombre d'onglets.
      if (Date.now() - checked.at > 2000)
        checked = {
          at: Date.now(),
          stale: (await serverFingerprint(root)) !== started,
        };
      return checked.stale;
    },
  };
}
