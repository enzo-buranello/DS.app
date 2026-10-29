import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  screen,
  shell,
} from 'electron';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StudioApi } from '../shared/api.js';
import { design, importFigma, suggestName } from './agent.js';
import { History } from './history.js';
import {
  edit,
  generate,
  listFiles,
  outDir,
  readState,
  restore,
} from './generate.js';
import { inside } from './guard.js';
import { PICK, stopPreviews, swiftPreview, webPreview } from './preview.js';
import { execFile } from 'node:child_process';
import type { Entry } from '../shared/history.js';
import type { Project } from '../shared/project.js';
import {
  connectFigma,
  figmaConnected,
  figmaExpired,
  parseLink,
} from './figma.js';
import {
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
const pickedFiles = process.env.STUDIO_PICK_FILES?.split(path.delimiter) ?? [];

// Images du projet (.studio/assets) servies par studio://asset/<dossier>/…
protocol.registerSchemesAsPrivileged([
  { scheme: 'studio', privileges: { standard: true, secure: true } },
]);

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

// Un projet sans historique (ouvert depuis un autre poste) reçoit d'abord
// son état de départ, pour qu'on puisse toujours y revenir.
async function base(dir: string, project: Project) {
  const h = new History(dir);
  if (!(await h.list()).length)
    await h.record(null, project, { kind: 'create', label: 'Création' });
}

type Meta = Pick<Entry, 'kind' | 'label' | 'images'>;

// Toute écriture du projet laisse une entrée dans l'historique.
async function commit(dir: string, project: Project, meta: Meta) {
  const before = await readProject(dir).catch(() => null);
  if (before) await base(dir, before);
  const saved = await writeProject(dir, project);
  await new History(dir).record(before, saved, meta);
  return saved;
}
async function withEntry(
  dir: string,
  before: Project,
  after: Project,
  meta: Meta,
) {
  await base(dir, before);
  const project = await writeProject(dir, after);
  const entry = await new History(dir).record(before, project, meta);
  return { project, entry: entry.id };
}

// Images jointes à une instruction : .studio/refs/<empreinte>.<ext>.
async function saveRefs(dir: string, images: string[] = []) {
  const out: string[] = [];
  for (const url of images) {
    const m = /^data:image\/(png|jpeg|webp|gif);base64,(.+)$/.exec(url);
    if (!m) continue;
    const bytes = Buffer.from(m[2], 'base64');
    const name = `${createHash('sha1').update(bytes).digest('hex').slice(0, 16)}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    await fs.mkdir(path.join(dir, '.studio', 'refs'), { recursive: true });
    await fs.writeFile(path.join(dir, '.studio', 'refs', name), bytes);
    out.push(`refs/${name}`);
  }
  return out;
}

// Code : le langage actif est la première cible du projet.
async function active(dir: string) {
  const t = (await readProject(dir)).targets[0];
  if (!t) throw new Error('Aucun langage');
  return t;
}
const notify = (file: string | null) =>
  win?.webContents.send('activity', { file });
// Retouches du code en attente de Garder ou Annuler.
const edits = new Map<
  string,
  { out: string; originals: Map<string, string | null> }
>();

const api: Omit<StudioApi, 'onActivity'> = {
  list: () => recents.list(),
  async create(name) {
    const dir = await pickFolder();
    if (!dir) return null;
    const project = await createProject(dir, name);
    await base(dir, project);
    await recents.add(dir);
    return { path: dir, project };
  },
  async open(dir) {
    dir ??= (await pickFolder()) ?? undefined;
    if (!dir) return null;
    const project = await readProject(dir);
    await base(dir, project);
    await recents.add(dir);
    return { path: dir, project };
  },
  async save(dir, project, label) {
    await known(dir);
    return commit(dir, project, { kind: 'manual', label });
  },
  async move(dir) {
    await known(dir);
    const to = await pickFolder();
    if (!to || to === dir) return null;
    const project = await moveProject(dir, to);
    await recents.add(to, dir);
    return { path: to, project };
  },
  async design(dir, instruction, scope, images) {
    await known(dir);
    const before = await readProject(dir);
    const refs = await saveRefs(dir, images);
    const after = await design(
      before,
      instruction,
      scope,
      refs.map((r) => path.join(dir, '.studio', r)),
    );
    return withEntry(dir, before, after, {
      kind: 'ai',
      label: instruction,
      ...(refs.length && { images: refs }),
    });
  },
  async figmaImport(dir, url) {
    await known(dir);
    const link = parseLink(url);
    if (!link) throw new Error('figma:notfound');
    const before = await readProject(dir);
    const after = await importFigma(before, link).catch((e: Error) => {
      if (e.message === 'figma:auth') figmaExpired();
      throw e;
    });
    return withEntry(dir, before, after, { kind: 'ai', label: 'Import Figma' });
  },
  figmaConnected: () => figmaConnected(),
  figmaConnect: () => connectFigma((url) => void shell.openExternal(url)),
  suggestName: (summary) => suggestName(summary),
  async buildState(dir) {
    await known(dir);
    return readState(dir);
  },
  async generate(dir) {
    await known(dir);
    const project = await readProject(dir);
    let state = await readState(dir);
    try {
      for (const t of project.targets)
        state = await generate(dir, project, t, notify);
    } finally {
      notify(null);
    }
    return state;
  },
  async codeFiles(dir) {
    await known(dir);
    return listFiles(outDir(dir, await active(dir)));
  },
  async readCode(dir, file) {
    await known(dir);
    const out = outDir(dir, await active(dir));
    if (!inside(out, file)) throw new Error('Hors du dossier');
    return fs.readFile(path.join(out, file), 'utf8');
  },
  async code(dir, instruction, scope, images) {
    await known(dir);
    const t = await active(dir);
    const refs = await saveRefs(dir, images);
    try {
      const originals = await edit(
        dir,
        t,
        instruction,
        scope ?? {},
        refs,
        notify,
      );
      const id = createHash('sha1')
        .update(`${Date.now()}${Math.random()}`)
        .digest('hex')
        .slice(0, 12);
      edits.set(id, { out: outDir(dir, t), originals });
      return id;
    } finally {
      notify(null);
    }
  },
  async codeDone(dir, id, undo) {
    await known(dir);
    const e = edits.get(id);
    edits.delete(id);
    if (e && undo) await restore(e.out, e.originals);
  },
  async preview(dir) {
    await known(dir);
    const t = await active(dir);
    const out = outDir(dir, t);
    return t === 'swiftui' ? swiftPreview(dir, out) : webPreview(dir, out, t);
  },
  async inspect(url) {
    const origin = new URL(url).origin;
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) return;
    const frame = win?.webContents.mainFrame.framesInSubtree.find(
      (f) => f !== win!.webContents.mainFrame && f.url.startsWith(origin),
    );
    await frame?.executeJavaScript(PICK);
  },
  async simulator() {
    execFile('open', ['-a', 'Simulator']);
  },
  async history(dir) {
    await known(dir);
    return new History(dir).list();
  },
  async restore(dir, id) {
    await known(dir);
    return commit(dir, await new History(dir).get(id), {
      kind: 'restore',
      label: 'Restauration',
    });
  },
  async discard(dir, id) {
    await known(dir);
    const previous = await new History(dir).discard(id);
    if (!previous) throw new Error('Rien à annuler');
    return writeProject(dir, previous);
  },
  async importImage(dir) {
    await known(dir);
    const file =
      pickedFiles.shift() ??
      (
        await dialog.showOpenDialog(win!, {
          properties: ['openFile'],
          filters: [
            {
              name: 'Images',
              extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'],
            },
          ],
        })
      ).filePaths[0];
    if (!file) return null;
    const bytes = await fs.readFile(file);
    const name = `${createHash('sha1').update(bytes).digest('hex').slice(0, 16)}${path.extname(file).toLowerCase()}`;
    await fs.mkdir(path.join(dir, '.studio', 'assets'), { recursive: true });
    await fs.writeFile(path.join(dir, '.studio', 'assets', name), bytes);
    return `assets/${name}`;
  },
};
for (const [name, fn] of Object.entries(api))
  ipcMain.handle(name, (_e, ...args) =>
    (fn as (...a: unknown[]) => unknown)(...args),
  );

app.whenReady().then(() => {
  protocol.handle('studio', async (req) => {
    const [, dir, ...rest] = new URL(req.url).pathname.split('/');
    const root = decodeURIComponent(dir);
    await known(root);
    const file = path.join(root, '.studio', ...rest.map(decodeURIComponent));
    if (
      !['assets', 'refs'].some((d) =>
        file.startsWith(path.join(root, '.studio', d) + path.sep),
      )
    )
      return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // La fenêtre tient toujours dans l'écran qui l'affiche.
  const area = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: Math.min(1440, area.width),
    height: Math.min(900, area.height),
    minWidth: Math.min(960, area.width),
    minHeight: Math.min(600, area.height),
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
app.on('will-quit', stopPreviews);
