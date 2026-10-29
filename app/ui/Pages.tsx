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
  Canvas,
  ElementSettings,
  FormatSwitch,
  setStyle,
  Structure,
} from './Editor.js';
import type { Theme } from './render.js';

// Module Pages : une page blanche à construire, à la main ou par l'IA.

const blankPage = (): Node => ({
  id: 'root',
  kind: 'box',
  style: { desktop: { direction: 'column', width: 'fill' } },
  children: [],
});

export function PagesModule(props: {
  project: Project;
  path: string;
  theme: Theme;
  onSave: (p: Project) => void;
  bar?: React.ReactNode;
}) {
  const { project } = props;
  const pages = Object.entries(project.pages);
  const [current, setCurrent] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [bp, setBp] = useState<Breakpoint>('desktop');
  useEffect(() => setSel(null), [props.path, current]);
  const pageId =
    current && project.pages[current] ? current : (pages[0]?.[0] ?? null);
  const page = pageId ? project.pages[pageId] : undefined;

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
  const onRoot = (root: Node) => page && setPage({ ...page, root });
  const editor = page && {
    project,
    root: page.root,
    onRoot,
    sel,
    onSelect: setSel,
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
        {editor && <Structure {...editor} />}
      </aside>
      <main className="canvas" aria-label="Pages">
        {editor ? (
          <>
            <div className="canvas-head">
              <FormatSwitch bp={bp} onChange={setBp} />
            </div>
            <Canvas {...editor} bp={bp} theme={props.theme} base={props.path} />
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
        {editor && sel ? (
          <ElementSettings
            {...editor}
            bp={bp}
            base={props.path}
            own={(id) => find(editor.root, id)?.node.style?.[bp]}
            onStyle={(id, key, value) =>
              onRoot(setStyle(editor.root, id, bp, key, value))
            }
          />
        ) : (
          page && (
            <>
              <label className="field">
                Nom
                <input
                  key={pageId! + page.name}
                  defaultValue={page.name}
                  onBlur={(e) => {
                    const name = e.currentTarget.value.trim();
                    if (name && name !== page.name) setPage({ ...page, name });
                  }}
                />
              </label>
              <button className="ghost danger" onClick={() => setPage(null)}>
                <Trash /> Supprimer
              </button>
            </>
          )
        )}
      </aside>
    </>
  );
}
