import { app, BrowserWindow, dialog, ipcMain, safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StudioApi } from '../shared/api.js';
import { design } from './agent.js';
import { fetchFigma, fileKey } from './figma.js';
import {
  atomicWrite,
  createProject,
  moveProject,
  readProject,
  Recents,
  writeProject,
} from './projects.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Tests : dossier de données isolé et dossiers choisis sans boîte de dialogue.
if (process.env.STUDIO_USER_DATA)
  app.setPath('userData', process.env.STUDIO_USER_DATA);
const picks = process.env.STUDIO_PICK_DIRS?.split(path.delimiter) ?? [];

const recents = new Recents(
  path.join(app.getPath('userData'), 'projects.json'),
);
let win: BrowserWindow | null = null;

async function pickFolder() {
  if (picks.length) {
    const dir = picks.shift()!;
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }
  const r = await dialog.showOpenDialog(win!, {
    properties: ['openDirectory', 'createDirectory'],
  });
  return r.canceled ? null : r.filePaths[0];
}
async function known(dir: string) {
  if (!(await recents.list()).some((p) => p.path === dir))
    throw new Error('Projet inconnu');
}

// Token Figma : chiffré par le trousseau du système, jamais dans le projet.
const tokenFile = path.join(app.getPath('userData'), 'figma-token');
let sessionToken: string | undefined;
async function figmaToken(token?: string) {
  if (token) {
    sessionToken = token;
    if (safeStorage.isEncryptionAvailable())
      await atomicWrite(
        tokenFile,
        safeStorage.encryptString(token).toString('base64'),
      );
    return token;
  }
  if (sessionToken) return sessionToken;
  const raw = await fs.readFile(tokenFile, 'utf8').catch(() => null);
  return raw ? safeStorage.decryptString(Buffer.from(raw, 'base64')) : null;
}

const api: StudioApi = {
  list: () => recents.list(),
  async create(name) {
    const dir = await pickFolder();
    if (!dir) return null;
    const project = await createProject(dir, name);
    await recents.add(dir);
    return { path: dir, project };
  },
  async open(dir) {
    dir ??= (await pickFolder()) ?? undefined;
    if (!dir) return null;
    const project = await readProject(dir);
    await recents.add(dir);
    return { path: dir, project };
  },
  async save(dir, project) {
    await known(dir);
    return writeProject(dir, project);
  },
  async move(dir) {
    await known(dir);
    const to = await pickFolder();
    if (!to || to === dir) return null;
    const project = await moveProject(dir, to);
    await recents.add(to, dir);
    return { path: to, project };
  },
  async design(dir, instruction) {
    await known(dir);
    return writeProject(dir, await design(await readProject(dir), instruction));
  },
  async figmaImport(dir, { url, token, variables }) {
    await known(dir);
    const key = url ? fileKey(url) : null;
    if (url && !key) throw new Error('Lien invalide');
    const secret = key ? await figmaToken(token) : null;
    if (key && !secret) throw new Error('Token manquant');
    const source = {
      ...(key && (await fetchFigma(key, secret!))),
      ...(variables && { variables: JSON.parse(variables) }),
    };
    await atomicWrite(
      path.join(dir, '.studio', 'cache', 'figma.json'),
      JSON.stringify(source),
    );
    const project = await design(
      await readProject(dir),
      'Remplace le design system par la conversion de cet import Figma : styles et variables en fondations, composants (et leurs variantes d’état) en composants.',
      source,
    );
    return writeProject(dir, {
      ...project,
      ...(key && {
        figma: { fileKey: key, importedAt: new Date().toISOString() },
      }),
    });
  },
  hasFigmaToken: async () => !!(await figmaToken()),
};
for (const [name, fn] of Object.entries(api))
  ipcMain.handle(name, (_e, ...args) =>
    (fn as (...a: unknown[]) => unknown)(...args),
  );

app.whenReady().then(() => {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'DS-Studio',
    backgroundColor: '#f5f5f5',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  if (process.env.STUDIO_DEV_URL) win.loadURL(process.env.STUDIO_DEV_URL);
  else win.loadFile(path.join(here, 'ui', 'index.html'));
});
app.on('window-all-closed', () => app.quit());
