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
import {
  defaultSettings,
  type AgentEvent,
  type Answers,
  type Settings,
} from '../shared/agent.js';
import { targetLabels, type Target } from '../shared/build.js';
import { design, importFigma, suggestName } from './agent.js';
import {
  auth as loadAuth,
  authClaude,
  authClaudeCode,
  authKey,
  authOut,
  requireAuth,
} from './account.js';
import { orchestrate, type Code, type Ui } from './orchestrator.js';
import { moveSecrets, secretNames, setSecret } from './secrets.js';
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
  atomicWrite,
  createProject,
  moveProject,
  readProject,
  Recents,
  writeProject,
} from './projects.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Nom de l'application : menu, « À propos » et dossier de données par défaut.
app.setName('Studio');
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
// Projets créés par un prompt : rangés dans le dossier de données de l'app
// jusqu'à la première génération du code, qui demande le vrai dossier.
const drafts = path.join(app.getPath('userData'), 'projects');
const isDraft = (dir: string) => path.dirname(dir) === drafts;
/** Le dossier de travail du projet ; null si le choix est annulé. */
async function settle(dir: string): Promise<string | null> {
  if (!isDraft(dir)) return dir;
  const to = await pickFolder();
  if (!to) return null;
  await moveProject(dir, to);
  await recents.add(to, dir);
  await moveSecrets(dir, to);
  await fs.rm(dir, { recursive: true, force: true });
  return to;
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

type Meta = Pick<Entry, 'kind' | 'label' | 'images' | 'choices'>;

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
  code: Backup = new Map(),
) {
  await base(dir, before);
  const project = await writeProject(dir, after);
  const history = new History(dir);
  const entry = await history.record(before, project, meta);
  if (code.size) await history.saveCode(entry.id, Object.fromEntries(code));
  return { project, entry: entry.id };
}

// Fichiers de code d'origine touchés par l'agent, relatifs au projet
// (null : créé par lui).
type Backup = Map<string, string | null>;
async function keep(dir: string, backup: Backup, file: string) {
  const rel = path.relative(dir, file);
  if (!backup.has(rel))
    backup.set(rel, await fs.readFile(file, 'utf8').catch(() => null));
}
async function undoCode(dir: string, backup: Backup) {
  for (const [rel, text] of backup)
    if (text === null) await fs.rm(path.join(dir, rel), { force: true });
    else await atomicWrite(path.join(dir, rel), text);
}

// Réglages de l'app : QCM et bulle d'avis.
const settingsFile = path.join(app.getPath('userData'), 'settings.json');
async function readSettings(): Promise<Settings> {
  const raw = await fs.readFile(settingsFile, 'utf8').catch(() => '{}');
  return { ...defaultSettings, ...JSON.parse(raw) };
}

// Agent transversal : l'interface répond aux QCM et aux confirmations.
const emit = (e: AgentEvent) => win?.webContents.send('agent', e);
let answering: ((a: Answers | null) => void) | null = null;
let confirming: ((ok: boolean) => void) | null = null;
const ui: Ui = {
  steps: (steps) => emit({ kind: 'steps', steps }),
  ask: (questions) =>
    new Promise((ok) => {
      answering = ok;
      emit({ kind: 'ask', questions });
    }),
  confirm: (items) =>
    new Promise((ok) => {
      confirming = ok;
      emit({ kind: 'confirm', items });
    }),
};

/** Le code du projet pour l'agent transversal ; chaque fichier touché est gardé. */
function codeOf(at: { dir: string }, backup: Backup): Code {
  const touch = (t: Target) => async (f: string) => {
    await keep(at.dir, backup, path.join(outDir(at.dir, t), f));
    notify(f);
  };
  const state = () => path.join(at.dir, '.studio', 'build.json');
  // Le dossier de travail est demandé à la première génération.
  const settled = async () => {
    const d = await settle(at.dir);
    if (d) at.dir = d;
    return d;
  };
  return {
    async status(project) {
      const t = project.targets[0];
      if (!t) return 'Aucun langage';
      const s = (await readState(at.dir))[t];
      const keys = await secretNames(at.dir);
      return [
        s
          ? `${targetLabels[t]} : ${s.ok ? 'généré' : 'en échec'} (${s.files ?? 0} fichiers)`
          : `${targetLabels[t]} : jamais généré`,
        keys.length &&
          `Clés d'API (variables d'environnement) : ${keys.join(', ')}`,
      ]
        .filter(Boolean)
        .join('. ');
    },
    async generate(project) {
      const dir = await settled();
      if (!dir) return 'Aucun dossier choisi : ne génère pas le code.';
      await keep(dir, backup, state());
      await writeProject(dir, project);
      let failed: Target | undefined;
      try {
        for (const t of project.targets)
          if (!(await generate(dir, project, t, touch(t)))[t]?.ok) failed = t;
      } finally {
        notify(null);
      }
      return failed ? `Construction ${targetLabels[failed]} en échec` : null;
    },
    async edit(project, instruction) {
      const dir = await settled();
      if (!dir) return 'Aucun dossier choisi : ne touche pas au code.';
      await keep(dir, backup, state());
      await writeProject(dir, project);
      const t = project.targets[0];
      try {
        await edit(dir, t, instruction, {}, [], touch(t));
        return null;
      } catch {
        return 'Retouche impossible';
      } finally {
        notify(null);
      }
    },
    async check(page, width) {
      const dir = at.dir;
      const t = (await readProject(dir)).targets[0];
      const out = outDir(dir, t);
      if (t === 'swiftui') {
        const p = await swiftPreview(dir, out);
        return {
          image: 'image' in p ? p.image.split(',')[1] : undefined,
          errors: [],
        };
      }
      const { url } = (await webPreview(dir, out, t)) as { url: string };
      return capture(new URL(page, url).toString(), width);
    },
  };
}

/** Page rendue hors écran : capture et erreurs de la console. */
async function capture(url: string, width: number) {
  const w = new BrowserWindow({
    show: false,
    width,
    height: 900,
    webPreferences: { offscreen: true, sandbox: true },
  });
  const errors: string[] = [];
  w.webContents.on('console-message', (e) => {
    if (e.level === 'error') errors.push(e.message.slice(0, 300));
  });
  w.webContents.on('did-fail-load', (_e, _code, why) => errors.push(why));
  try {
    await w.loadURL(url).catch(() => {});
    await new Promise((r) => setTimeout(r, 1000));
    const image = (await w.webContents.capturePage())
      .toPNG()
      .toString('base64');
    return { image, errors: errors.slice(0, 20) };
  } finally {
    w.destroy();
  }
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

const api: Omit<StudioApi, 'onActivity' | 'onAgent'> = {
  auth: () => loadAuth(),
  authKey: (provider, key) => authKey(provider, key),
  authClaude: () => authClaude(),
  authClaudeCode: (code) => authClaudeCode(code),
  authOut: () => authOut(),
  list: () => recents.list(),
  async create(name) {
    const dir = await pickFolder();
    if (!dir) return null;
    const project = await createProject(dir, name);
    await base(dir, project);
    await recents.add(dir);
    return { path: dir, project };
  },
  async draft(name) {
    const dir = path.join(drafts, Date.now().toString(36));
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
    await moveSecrets(dir, to);
    return { path: to, project };
  },
  async design(dir, instruction, scope, images) {
    await known(dir);
    const account = requireAuth();
    const before = await readProject(dir);
    const refs = await saveRefs(dir, images);
    const files = refs.map((r) => path.join(dir, '.studio', r));
    const meta: Meta = {
      kind: 'ai',
      label: instruction,
      ...(refs.length && { images: refs }),
    };
    // Élément visé : lui seul change, sans question.
    if (scope?.node)
      return withEntry(
        dir,
        before,
        await design(before, instruction, scope, files),
        meta,
      );
    // Hors Claude : un seul appel JSON, sans question, avis ni étapes.
    if (account.provider !== 'anthropic')
      return withEntry(
        dir,
        before,
        await design(before, instruction, scope, files),
        meta,
      );
    const backup: Backup = new Map();
    const at = { dir };
    try {
      const out = await orchestrate({
        project: before,
        instruction,
        images: files,
        page: scope?.page,
        settings: await readSettings(),
        ui,
        code: codeOf(at, backup),
      });
      const saved = await withEntry(
        at.dir,
        before,
        out.project,
        { ...meta, ...(out.choices.length && { choices: out.choices }) },
        backup,
      );
      return {
        ...saved,
        advice: out.advice,
        ...(at.dir !== dir && { path: at.dir }),
      };
    } catch (e) {
      // Rien ne reste d'une exécution en échec.
      if (backup.size) {
        await undoCode(at.dir, backup);
        await writeProject(at.dir, before);
      }
      throw e;
    } finally {
      answering = confirming = null;
      emit({ kind: 'idle' });
    }
  },
  async answer(answers) {
    const fn = answering;
    answering = null;
    fn?.(answers);
  },
  async confirm(ok) {
    const fn = confirming;
    confirming = null;
    fn?.(ok);
  },
  settings: readSettings,
  async secrets(dir) {
    await known(dir);
    return secretNames(dir);
  },
  async setSecret(dir, name, value) {
    await known(dir);
    return setSecret(dir, name, value);
  },
  async setSettings(s) {
    const next = { ...(await readSettings()), ...s };
    await atomicWrite(settingsFile, JSON.stringify(next));
    return next;
  },
  async figmaImport(dir, url) {
    await known(dir);
    if (requireAuth().provider !== 'anthropic') throw new Error('auth:figma');
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
  suggestName: (summary) => {
    requireAuth();
    return suggestName(summary);
  },
  async buildState(dir) {
    await known(dir);
    return readState(dir);
  },
  async generate(from) {
    await known(from);
    requireAuth();
    const dir = await settle(from);
    if (!dir) return null;
    const project = await readProject(dir);
    let state = await readState(dir);
    try {
      for (const t of project.targets)
        state = await generate(dir, project, t, notify);
    } finally {
      notify(null);
    }
    return { state, path: dir };
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
    requireAuth();
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

app.whenReady().then(async () => {
  await loadAuth();
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
    title: 'Studio',
    backgroundColor: '#f5f5f5',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  if (process.env.STUDIO_DEBUG) {
    win.webContents.on('render-process-gone', (_e, d) =>
      console.log('[gone]', JSON.stringify(d)),
    );
    win.on('closed', () => console.log('[closed]'));
    win.webContents.on('console-message', (e) =>
      console.log('[ui]', e.level, e.message.slice(0, 300)),
    );
  }
  if (process.env.STUDIO_DEV_URL) win.loadURL(process.env.STUDIO_DEV_URL);
  else win.loadFile(path.join(here, 'ui', 'index.html'));
});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', stopPreviews);
