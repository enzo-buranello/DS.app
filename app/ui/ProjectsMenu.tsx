import { useEffect, useRef, useState } from 'react';
import {
  CaretDown,
  FigmaLogo,
  Folder,
  FolderOpen,
  Plus,
} from '@phosphor-icons/react';
import type { ProjectEntry } from '../shared/project.js';
import folder from './assets/folder.png';

// Menu des projets, en haut de l'accueil : il s'ouvre au survol du bouton et
// reprend la carte de la référence (en-tête, lignes à icônes, séparateur).

const date = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
  });

export function ProjectsMenu(props: {
  entries: ProjectEntry[];
  canFigma: boolean;
  onOpen: (path: string) => void;
  onNew: () => void;
  onFolder: () => void;
  onFigma: () => void;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    addEventListener('mousedown', outside);
    addEventListener('keydown', key);
    return () => {
      removeEventListener('mousedown', outside);
      removeEventListener('keydown', key);
    };
  }, [open]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const show = () => {
    clearTimeout(timer.current);
    setOpen(true);
  };
  const hide = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 200);
  };
  const act = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div
      className="projects-menu"
      ref={root}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <button
        type="button"
        className="ghost projects-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={show}
        onFocus={show}
      >
        <img
          className="projects-folder"
          src={folder}
          alt=""
          aria-hidden="true"
        />
        Projets
        <CaretDown className="caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="projects-panel" role="menu" aria-label="Projets">
          <div className="projects-items">
            {props.entries.length ? (
              props.entries.map((p) => (
                <button
                  key={p.path}
                  type="button"
                  role="menuitem"
                  className="projects-item"
                  onClick={act(() => props.onOpen(p.path))}
                >
                  <Folder aria-hidden="true" />
                  <span className="projects-label">{p.name}</span>
                  <span className="projects-date">{date(p.updatedAt)}</span>
                </button>
              ))
            ) : (
              <p className="projects-empty">Aucun projet</p>
            )}
          </div>
          <div className="projects-sep" />
          <div className="projects-items">
            <button
              type="button"
              role="menuitem"
              className="projects-item"
              onClick={act(props.onNew)}
            >
              <Plus aria-hidden="true" />
              Nouveau projet
            </button>
            <button
              type="button"
              role="menuitem"
              className="projects-item"
              onClick={act(props.onFolder)}
            >
              <FolderOpen aria-hidden="true" />
              Ouvrir
            </button>
            {props.canFigma && (
              <button
                type="button"
                role="menuitem"
                className="projects-item"
                onClick={act(props.onFigma)}
              >
                <FigmaLogo aria-hidden="true" />
                Importer de Figma
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
