import type { BuildState } from './build.js';
import type { Entry } from './history.js';
import type { Project, ProjectEntry } from './project.js';

/** Portée de l'IA : sans élément, tout le projet ; sinon cet élément seul. */
export type Scope = { page?: string; component?: string; node?: string };
/** Résultat d'une action de l'IA et son entrée d'historique. */
export type AiResult = { project: Project; entry: string };

// Pont entre l'interface et le processus principal (window.studio).
export type Opened = { path: string; project: Project };
export type StudioApi = {
  list(): Promise<ProjectEntry[]>;
  /** Choisit un dossier puis y crée le projet (ou ouvre celui qui s'y trouve). */
  create(name: string): Promise<Opened | null>;
  /** Sans chemin : choisit un dossier. */
  open(path?: string): Promise<Opened | null>;
  /** `label` nomme l'action dans l'historique (sinon : modification manuelle). */
  save(path: string, project: Project, label?: string): Promise<Project>;
  /** Choisit un nouveau dossier de travail et y copie le projet. */
  move(path: string): Promise<Opened | null>;
  /** Agent Design : applique l'instruction au design system. */
  design(path: string, instruction: string, scope?: Scope): Promise<AiResult>;
  /** Lien et token Figma, et/ou export JSON des variables. */
  figmaImport(
    path: string,
    source: { url?: string; token?: string; variables?: string },
  ): Promise<AiResult>;
  hasFigmaToken(): Promise<boolean>;
  /** Nom court proposé par l'IA pour un composant. */
  suggestName(summary: string): Promise<string>;
  /** Choisit une image et la copie dans le projet ; renvoie « assets/… ». */
  importImage(path: string): Promise<string | null>;
  /** État de la dernière génération, par cible. */
  buildState(path: string): Promise<BuildState>;
  /** Génère le code des cibles choisies ; seul ce qui a changé. */
  generate(path: string): Promise<BuildState>;
  /** Itérations du projet, de la plus récente à la plus ancienne. */
  history(path: string): Promise<Entry[]>;
  /** Ramène le projet à une itération ; crée une nouvelle entrée. */
  restore(path: string, id: string): Promise<Project>;
  /** Retire une itération de l'IA (Annuler) et rend l'état précédent. */
  discard(path: string, id: string): Promise<Project>;
};
export const apiMethods = [
  'list',
  'create',
  'open',
  'save',
  'move',
  'design',
  'figmaImport',
  'hasFigmaToken',
  'suggestName',
  'importImage',
  'buildState',
  'generate',
  'history',
  'restore',
  'discard',
] as const;
