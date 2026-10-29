import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  emptyProject,
  projectSchema,
  type Project,
  type ProjectEntry,
} from '../shared/project.js';

// Stockage disque : <dossier>/.studio/project.json, et la liste des projets
// récents dans le dossier de données de l'app. Aucune dépendance à Electron.

export const projectFile = (dir: string) =>
  path.join(dir, '.studio', 'project.json');

export async function atomicWrite(file: string, raw: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}-${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmp, raw);
    await fs.rename(tmp, file);
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

export async function readProject(dir: string): Promise<Project> {
  return projectSchema.parse(
    JSON.parse(await fs.readFile(projectFile(dir), 'utf8')),
  );
}

export async function writeProject(dir: string, project: Project) {
  const next = projectSchema.parse({
    ...project,
    updatedAt: new Date().toISOString(),
  });
  await atomicWrite(projectFile(dir), JSON.stringify(next, null, 2) + '\n');
  return next;
}

// Un dossier qui contient déjà un projet est ouvert tel quel.
export async function createProject(dir: string, name: string) {
  try {
    return await readProject(dir);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    return writeProject(dir, emptyProject(name));
  }
}

// Changer de dossier : le projet est copié, l'ancien dossier reste intact.
export async function moveProject(from: string, to: string) {
  await fs.cp(path.join(from, '.studio'), path.join(to, '.studio'), {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
  return readProject(to);
}

export class Recents {
  constructor(private file: string) {}
  private async paths(): Promise<string[]> {
    try {
      return JSON.parse(await fs.readFile(this.file, 'utf8'));
    } catch {
      return [];
    }
  }
  async list(): Promise<ProjectEntry[]> {
    const out: ProjectEntry[] = [];
    for (const dir of await this.paths()) {
      const p = await readProject(dir).catch(() => null);
      if (p) out.push({ path: dir, name: p.name, updatedAt: p.updatedAt });
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async add(dir: string, replace?: string) {
    const rest = (await this.paths()).filter((p) => p !== dir && p !== replace);
    await atomicWrite(this.file, JSON.stringify([dir, ...rest]));
  }
}
