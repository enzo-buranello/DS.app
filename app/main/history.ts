import { promises as fs } from 'node:fs';
import path from 'node:path';
import { changeOf, type Entry } from '../shared/history.js';
import { projectSchema, type Project } from '../shared/project.js';
import { atomicWrite } from './projects.js';

// .studio/history/ : index.json (de la plus ancienne à la plus récente) et un
// instantané du projet par entrée. Les modifications manuelles successives sur
// un même élément remplacent l'instantané de leur entrée.

const MAX = 200;

export class History {
  private dir: string;
  constructor(project: string) {
    this.dir = path.join(project, '.studio', 'history');
  }
  private file = (id: string) => path.join(this.dir, `${id}.json`);
  private async index(): Promise<Entry[]> {
    try {
      return JSON.parse(
        await fs.readFile(path.join(this.dir, 'index.json'), 'utf8'),
      );
    } catch {
      return [];
    }
  }
  private save = (list: Entry[]) =>
    atomicWrite(path.join(this.dir, 'index.json'), JSON.stringify(list));

  /** Les entrées, de la plus récente à la plus ancienne. */
  async list() {
    return (await this.index()).reverse();
  }

  async record(
    before: Project | null,
    after: Project,
    meta: Pick<Entry, 'kind' | 'label' | 'images' | 'choices'>,
  ): Promise<Entry> {
    const list = await this.index();
    const change = before
      ? changeOf(before, after)
      : { scope: 'global' as const, target: 'project' };
    const last = list.at(-1);
    const at = new Date().toISOString();
    if (
      meta.kind === 'manual' &&
      !meta.label &&
      last?.kind === 'manual' &&
      !last.label &&
      last.target === change.target
    ) {
      last.at = at;
      await atomicWrite(this.file(last.id), JSON.stringify(after));
      await this.save(list);
      return last;
    }
    const entry: Entry = {
      id: `${Date.now().toString(36)}-${list.length}`,
      ...meta,
      ...change,
      at,
    };
    await atomicWrite(this.file(entry.id), JSON.stringify(after));
    list.push(entry);
    for (const old of list.splice(0, Math.max(0, list.length - MAX))) {
      await fs.rm(this.file(old.id), { force: true });
      await fs.rm(this.code(old.id), { force: true });
    }
    await this.save(list);
    return entry;
  }

  async get(id: string): Promise<Project> {
    return projectSchema.parse(
      JSON.parse(await fs.readFile(this.file(id), 'utf8')),
    );
  }

  /**
   * Fichiers de code d'origine d'une itération de l'IA (null : créé par elle),
   * chemins relatifs au projet ; « Annuler » les remet.
   */
  saveCode = (id: string, files: Record<string, string | null>) =>
    atomicWrite(this.code(id), JSON.stringify(files));
  private code = (id: string) => path.join(this.dir, `${id}.code.json`);

  /** Retire une entrée et rend l'état de celle qui la précède. */
  async discard(id: string): Promise<Project | null> {
    const list = await this.index();
    const i = list.findIndex((e) => e.id === id);
    if (i < 1) return null;
    const [gone] = list.splice(i, 1);
    const root = path.dirname(path.dirname(this.dir));
    const code: Record<string, string | null> = await fs
      .readFile(this.code(gone.id), 'utf8')
      .then(JSON.parse, () => ({}));
    for (const [rel, text] of Object.entries(code)) {
      const file = path.join(root, rel);
      if (text === null) await fs.rm(file, { force: true });
      else await atomicWrite(file, text);
    }
    await fs.rm(this.code(gone.id), { force: true });
    await fs.rm(this.file(gone.id), { force: true });
    await this.save(list);
    return this.get(list[i - 1].id);
  }
}
