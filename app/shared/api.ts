import type { Project, ProjectEntry } from './project.js';

// Pont entre l'interface et le processus principal (window.studio).
export type Opened = { path: string; project: Project };
export type StudioApi = {
  list(): Promise<ProjectEntry[]>;
  /** Choisit un dossier puis y crée le projet (ou ouvre celui qui s'y trouve). */
  create(name: string): Promise<Opened | null>;
  /** Sans chemin : choisit un dossier. */
  open(path?: string): Promise<Opened | null>;
  save(path: string, project: Project): Promise<Project>;
  /** Choisit un nouveau dossier de travail et y copie le projet. */
  move(path: string): Promise<Opened | null>;
  /** Agent Design : applique l'instruction au design system. */
  design(path: string, instruction: string): Promise<Project>;
  /** Lien et token Figma, et/ou export JSON des variables. */
  figmaImport(
    path: string,
    source: { url?: string; token?: string; variables?: string },
  ): Promise<Project>;
  hasFigmaToken(): Promise<boolean>;
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
] as const;
