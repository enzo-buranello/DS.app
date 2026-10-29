import type { Activity, BuildState, CodeScope, Preview } from './build.js';
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
  /** Agent Design : applique l'instruction ; `images` en data URL. */
  design(
    path: string,
    instruction: string,
    scope?: Scope,
    images?: string[],
  ): Promise<AiResult>;
  /** Lit le fichier Figma du lien et crée ou complète le design system. */
  figmaImport(path: string, url: string): Promise<AiResult>;
  figmaConnected(): Promise<boolean>;
  /** Autorisation dans le navigateur ; vrai une fois connecté. */
  figmaConnect(): Promise<boolean>;
  /** Nom court proposé par l'IA pour un composant. */
  suggestName(summary: string): Promise<string>;
  /** Choisit une image et la copie dans le projet ; renvoie « assets/… ». */
  importImage(path: string): Promise<string | null>;
  /** État de la dernière génération, par cible. */
  buildState(path: string): Promise<BuildState>;
  /** Génère le code des cibles choisies ; seul ce qui a changé. */
  generate(path: string): Promise<BuildState>;
  /** Fichiers du code de la cible active, chemins relatifs. */
  codeFiles(path: string): Promise<string[]>;
  readCode(path: string, file: string): Promise<string>;
  /** Agent Développement : retouche le code ; renvoie l'id pour Annuler. */
  code(
    path: string,
    instruction: string,
    scope?: CodeScope,
    images?: string[],
  ): Promise<string>;
  /** Garder (null) ou annuler une retouche du code. */
  codeDone(path: string, id: string, undo: boolean): Promise<void>;
  /** Lance ou rafraîchit l'aperçu de la cible active. */
  preview(path: string): Promise<Preview>;
  /** Prépare l'aperçu web au ciblage d'éléments. */
  inspect(url: string): Promise<void>;
  /** Ouvre le simulateur iOS. */
  simulator(): Promise<void>;
  /** Itérations du projet, de la plus récente à la plus ancienne. */
  history(path: string): Promise<Entry[]>;
  /** Ramène le projet à une itération ; crée une nouvelle entrée. */
  restore(path: string, id: string): Promise<Project>;
  /** Retire une itération de l'IA (Annuler) et rend l'état précédent. */
  discard(path: string, id: string): Promise<Project>;
  /** Suivi de l'agent Développement ; renvoie de quoi se désabonner. */
  onActivity(fn: (a: Activity) => void): () => void;
};
export const apiMethods = [
  'list',
  'create',
  'open',
  'save',
  'move',
  'design',
  'figmaImport',
  'figmaConnected',
  'figmaConnect',
  'suggestName',
  'importImage',
  'buildState',
  'generate',
  'codeFiles',
  'readCode',
  'code',
  'codeDone',
  'preview',
  'inspect',
  'simulator',
  'history',
  'restore',
  'discard',
] as const;
