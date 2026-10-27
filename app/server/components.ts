import path from 'node:path';
import {
  componentSchema,
  componentsFileSchema,
  MAX_COMPONENTS,
  type DSComponent,
} from '../shared/component.js';
import { atomicWrite, readPrivate } from './files.js';
import { StudioError } from './store.js';

// Composants créés à la main : fichier privé distinct des tokens, sans diff.
export class ComponentStore {
  private queue: Promise<unknown> = Promise.resolve();
  private file: string;
  constructor(directory: string) {
    this.file = path.join(directory, 'components.json');
  }
  async read(): Promise<{ components: DSComponent[] }> {
    try {
      const raw = await readPrivate(this.file, 1_000_000);
      return componentsFileSchema.parse(JSON.parse(raw));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT')
        return { components: [] };
      throw new StudioError(
        'Composants invalides ou inaccessibles. Original préservé ; les tokens restent disponibles.',
        500,
      );
    }
  }
  private write(change: (list: DSComponent[]) => DSComponent[]) {
    const work = this.queue.then(async () => {
      const current = await this.read();
      const next = componentsFileSchema.parse({
        components: change(current.components),
      });
      if (current.components.length)
        await atomicWrite(
          this.file + '.previous',
          JSON.stringify(current, null, 2) + '\n',
        );
      await atomicWrite(this.file, JSON.stringify(next, null, 2) + '\n');
      return next;
    });
    this.queue = work.catch(() => {});
    return work;
  }
  save(component: unknown) {
    const valid = componentSchema.parse(component);
    return this.write((list) => {
      const index = list.findIndex((c) => c.id === valid.id);
      if (index === -1) {
        if (list.length >= MAX_COMPONENTS)
          throw new StudioError(`${MAX_COMPONENTS} composants maximum.`, 409);
        return [...list, valid];
      }
      return list.map((c, i) => (i === index ? valid : c));
    });
  }
  /** Import Figma : un composant déjà importé (même nœud) est mis à jour, pas dupliqué. */
  upsertBySource(items: DSComponent[]) {
    const valid = items.map((c) => componentSchema.parse(c));
    let created = 0;
    let updated = 0;
    return this.write((list) => {
      const next = [...list];
      for (const item of valid) {
        const index = next.findIndex(
          (c) => c.source && c.source.nodeId === item.source?.nodeId,
        );
        if (index === -1) {
          next.push(item);
          created++;
        } else {
          next[index] = { ...item, id: next[index].id };
          updated++;
        }
      }
      if (next.length > MAX_COMPONENTS)
        throw new StudioError(`${MAX_COMPONENTS} composants maximum.`, 409);
      return next;
    }).then((file) => ({ ...file, created, updated }));
  }
  remove(id: string) {
    return this.write((list) => list.filter((c) => c.id !== id));
  }
}
