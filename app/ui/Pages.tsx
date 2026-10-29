import { useEffect, useState } from 'react';
import { Plus, Trash } from '@phosphor-icons/react';
import { find } from '../shared/nodes.js';
import {
  slug,
  type Breakpoint,
  type Node,
  type Project,
} from '../shared/project.js';
import {
  AddMenu,
  Canvas,
  ElementSettings,
  FormatSwitch,
  setStyles,
  Structure,
  type EditorProps,
} from './Editor.js';
import type { Theme } from './render.js';
import { target } from '../shared/instances.js';
import { createComponent, renameComponent, type Update } from './components.js';

// Module Pages : chaque page est un cadre, libre par défaut, à construire à
// la main ou par l'IA.

const blankPage = (): Node => ({
  id: 'root',
  kind: 'box',
  style: { desktop: { direction: 'free', width: 'fill' } },
  children: [],
});

export function PagesModule(props: {
  project: Project;
  path: string;
  theme: Theme;
  onSave: (p: Project) => void;
  onUpdate: Update;
  bar?: React.ReactNode;
}) {
  const { project } = props;
  const pages = Object.entries(project.pages);
  const [current, setCurrent] = useState<string | null>(null);
  const [sel, setSel] = useState('root');
  const [edited, setEdited] = useState('root');
  const [bp, setBp] = useState<Breakpoint>('desktop');
  const pageId =
    current && project.pages[current] ? current : (pages[0]?.[0] ?? null);
  const page = pageId ? project.pages[pageId] : undefined;
  useEffect(() => {
    setSel('root');
    setEdited('root');
  }, [props.path, pageId]);

  function addPage() {
    const name = `Page ${pages.length + 1}`;
    const id = slug(name, project.pages);
    props.onSave({
      ...project,
      pages: { ...project.pages, [id]: { name, root: blankPage() } },
    });
    setCurrent(id);
  }
  const setPage = (next: Project['pages'][string] | null) => {
    if (!pageId) return;
    const { [pageId]: _, ...rest } = project.pages;
    props.onSave({
      ...project,
      pages: next ? { ...rest, [pageId]: next } : rest,
    });
  };
  const valid = (id: string) =>
    page && target(project, page.root, id) ? id : 'root';
  const editor: EditorProps | undefined = page && {
    project,
    root: page.root,
    onRoot: (root) => setPage({ ...page, root }),
    sel: valid(sel),
    edited: valid(edited),
    onSelect: (id, edit = true) => {
      setSel(id);
      if (edit) setEdited(id);
    },
    bp,
    base: props.path,
    own: (id) => find(page.root, id)?.node.style?.[bp],
    onStyle: (id, patch) =>
      setPage({ ...page, root: setStyles(page.root, id, bp, patch) }),
    onComponentize: (id) =>
      createComponent(
        project,
        page.root,
        id,
        (p, root) => ({
          ...p,
          pages: { ...p.pages, [pageId!]: { ...p.pages[pageId!], root } },
        }),
        props.onUpdate,
      ),
    onRenameComponent: (id, name) =>
      props.onUpdate((p) => renameComponent(p, id, name)),
  };

  return (
    <>
      <aside className="panel left">
        <section className="group">
          <div className="group-head">
            <h3>Pages</h3>
            <button
              className="icon-btn"
              aria-label="Ajouter une page"
              onClick={addPage}
            >
              <Plus />
            </button>
          </div>
          {pages.map(([id, p]) => (
            <button
              key={id}
              className="ghost item"
              aria-current={id === pageId ? 'true' : undefined}
              onClick={() => setCurrent(id)}
            >
              {p.name}
            </button>
          ))}
        </section>
        {editor && (
          <>
            <AddMenu {...editor} />
            <Structure {...editor} />
          </>
        )}
      </aside>
      <main className="canvas" aria-label="Pages">
        {editor ? (
          <>
            <div className="canvas-head">
              <FormatSwitch bp={bp} onChange={setBp} />
            </div>
            <Canvas {...editor} theme={props.theme} />
          </>
        ) : (
          <div className="board empty">
            <button onClick={addPage}>
              <Plus /> Ajouter une page
            </button>
          </div>
        )}
        {props.bar}
      </main>
      <aside className="panel right" aria-label="Paramètres">
        {editor && page && (
          <ElementSettings
            {...editor}
            header={
              editor.edited === page.root.id && (
                <section className="group">
                  <h3>Page</h3>
                  <div className="row">
                    <input
                      aria-label="Nom de la page"
                      key={pageId! + page.name}
                      defaultValue={page.name}
                      onBlur={(e) => {
                        const name = e.currentTarget.value.trim();
                        if (name && name !== page.name)
                          setPage({ ...page, name });
                      }}
                    />
                    <button
                      className="icon-btn"
                      aria-label="Supprimer la page"
                      onClick={() => setPage(null)}
                    >
                      <Trash />
                    </button>
                  </div>
                </section>
              )
            }
          />
        )}
      </aside>
    </>
  );
}
