import { promises as fs } from 'node:fs';
import path from 'node:path';
import { atomicWrite } from './projects.js';
import { decrypt, encrypt } from './vault.js';

// Clés d'API du code généré : chiffrées par le trousseau du système
// (safeStorage d'Electron), rangées hors du projet, par dossier de projet.
// Jamais dans project.json, jamais dans le code ni transmises à l'agent :
// injectées en variables d'environnement au lancement de l'aperçu.

/** Dossier du projet → nom → valeur chiffrée (base64). */
type Store = Record<string, Record<string, string>>;
export const secretName = /^[A-Z][A-Z0-9_]{1,63}$/;

// Chargé à la demande : les tests unitaires n'ont pas Electron.
const electron = () => import('electron');
const file = async () =>
  path.join((await electron()).app.getPath('userData'), 'secrets.json');
async function load(): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(await file(), 'utf8'));
  } catch {
    return {};
  }
}
const save = async (s: Store) => atomicWrite(await file(), JSON.stringify(s));

export async function secretNames(dir: string) {
  return Object.keys((await load())[dir] ?? {}).sort();
}

/** Ajoute, remplace ou retire (null) une clé ; renvoie les noms. */
export async function setSecret(
  dir: string,
  name: string,
  value: string | null,
) {
  if (!secretName.test(name)) throw new Error('Nom invalide');
  const s = await load();
  const bag = { ...s[dir] };
  if (value === null) delete bag[name];
  else bag[name] = await encrypt(value);
  s[dir] = bag;
  await save(s);
  return Object.keys(bag).sort();
}

/** Variables d'environnement de l'aperçu. */
export async function secretEnv(dir: string): Promise<Record<string, string>> {
  const bag = (await load())[dir];
  if (!bag) return {};
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(bag)) env[k] = await decrypt(v);
  return env;
}

/** Le projet change de dossier : ses clés le suivent. */
export async function moveSecrets(from: string, to: string) {
  const s = await load();
  if (!s[from]) return;
  s[to] = s[from];
  delete s[from];
  await save(s);
}
