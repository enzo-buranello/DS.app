import path from 'node:path';
import { spawn } from 'node:child_process';
import { z } from 'zod';
import type { FigmaBridge } from './figmaBridge.js';
import type { FileInfo, TargetResult } from '../shared/figmaProtocol.js';
import {
  figmaTargetSchema,
  parseFigmaUrl,
  type FigmaTarget,
} from '../shared/figmaTarget.js';
import { atomicWrite, readPrivate } from './files.js';
import { StudioError } from './store.js';

// État Figma du projet DS-Studio (fichier privé .ds-studio/figma.json) :
// fichier et page cibles, choisis par URL.
const fileSchema = z
  .object({
    version: z.literal(1),
    target: figmaTargetSchema.nullable(),
  })
  .strict();
type SyncFile = z.infer<typeof fileSchema>;
const EMPTY: SyncFile = { version: 1, target: null };

export class FigmaSync {
  private file: string;
  private data: SyncFile = EMPTY;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    directory: string,
    private bridge: FigmaBridge,
  ) {
    this.file = path.join(directory, 'figma.json');
  }
  async load() {
    try {
      this.data = fileSchema.parse(
        JSON.parse(await readPrivate(this.file, 4_000_000)),
      );
    } catch (e) {
      // Fichier absent ou illisible : on repart sans cible, sans l'écraser
      // tant que rien n'est modifié.
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
        console.error('DS-Studio : figma.json illisible, ignoré.');
      this.data = EMPTY;
    }
  }
  private persist() {
    return atomicWrite(this.file, JSON.stringify(this.data, null, 2) + '\n');
  }
  // Une opération à la fois : cible, marquage et synchro ne se croisent pas.
  private serial<T>(work: () => Promise<T>) {
    const next = this.queue.then(work);
    this.queue = next.catch(() => {});
    return next;
  }

  get target() {
    return this.data.target;
  }
  /** Fichier cible ouvert avec le plugin ? */
  get targetConnected() {
    return !!this.data.target && this.bridge.has(this.data.target.fileKey);
  }
  /** Fichier où envoyer les commandes : la cible si elle est ouverte. */
  get routeKey() {
    return this.targetConnected ? this.data.target!.fileKey : undefined;
  }
  summary() {
    return {
      target: this.data.target,
      targetConnected: this.targetConnected,
    };
  }

  /** Valide la cible : le plugin doit tourner dans le fichier de l'URL. */
  setTarget(input: string): Promise<TargetResult> {
    const parsed = parseFigmaUrl(input);
    if (!parsed.ok) return Promise.reject(new StudioError(parsed.error, 400));
    return this.serial(async () => {
      const { fileKey, nodeId, url } = parsed;
      if (!this.bridge.has(fileKey)) return { state: 'waiting', fileKey };
      const info = (await this.bridge.request(
        'get_file_info',
        {},
        fileKey,
      )) as FileInfo;
      const page = (await this.bridge.request(
        'set_target_page',
        { nodeId },
        fileKey,
      )) as { pageId: string; pageName: string; warning: string | null };
      const target = figmaTargetSchema.parse({
        fileKey,
        fileName: String(info.name ?? '').slice(0, 200),
        pageId: page.pageId,
        pageName: String(page.pageName ?? '').slice(0, 200),
        nodeId,
        url,
      });
      this.data = { ...this.data, target };
      await this.persist();
      return { state: 'ok', target, warning: page.warning ?? null };
    });
  }
  clearTarget() {
    return this.serial(async () => {
      this.data = { ...this.data, target: null };
      await this.persist();
      return this.summary();
    });
  }
}

/** Ouvre le lien avec l'ouverture système : Figma desktop prend le fichier. */
export function openFigmaUrl(input: string) {
  const parsed = parseFigmaUrl(input);
  if (!parsed.ok) throw new StudioError(parsed.error, 400);
  // Arguments séparés, jamais de shell : l'URL validée ne peut rien exécuter.
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', ['-a', 'Figma', parsed.url]]
      : process.platform === 'win32'
        ? ['explorer.exe', [parsed.url]]
        : ['xdg-open', [parsed.url]];
  const run = (cmd: string, argv: string[], fallback?: () => void) => {
    const child = spawn(cmd, argv, { stdio: 'ignore', detached: true });
    child.on('error', () => fallback?.());
    child.on('exit', (code) => code !== 0 && fallback?.());
    child.unref();
  };
  // macOS sans Figma desktop installé : le navigateur par défaut prend le lien.
  run(
    command as string,
    args as string[],
    process.platform === 'darwin' ? () => run('open', [parsed.url]) : undefined,
  );
  return { opened: parsed.fileKey };
}
