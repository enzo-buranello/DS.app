import { useEffect, useState } from 'react';
import { Play, Plus, Trash } from '@phosphor-icons/react';
import { find } from '../shared/nodes.js';
import {
  slug,
  type Breakpoint,
  type Node,
  type Project,
} from '../shared/project.js';
import {
  label,
  AddMenu,
  Canvas,
  ElementSettings,
  FormatSwitch,
  formats,
  setStyles,
  Structure,
  type EditorProps,
} from './Editor.js';
import { foundationVars, Render, type Theme } from './render.js';
import { split, target } from '../shared/instances.js';
import { isAuto, renamePage } from '../shared/rename.js';
import type { Scope } from '../shared/api.js';
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
  bar: (scope: Scope, target?: string) => React.ReactNode;
}) {
  const { project } = props;
  const pages = Object.entries(project.pages);
  const [current, setCurrent] = useState<string | null>(null);
  const [sel, setSel] = useState('root');
  const [edited, setEdited] = useState('root');
  const [bp, setBp] = useState<Breakpoint>('desktop');
  // Mode test : page affichée seule ; l'éditeur reste tel quel dessous.
  const [testing, setTesting] = useState<string | null>(null);
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
              <button
                className="ghost test-btn"
                onClick={() => setTesting(pageId)}
              >
                <Play /> Tester
              </button>
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
        {page &&
          (() => {
            // Avec un élément sélectionné, l'IA n'agit que sur lui.
            const id = editor && (split(editor.sel)?.instance ?? editor.sel);
            const node =
              id && id !== page.root.id ? find(page.root, id)?.node : null;
            return props.bar(
              node ? { page: pageId!, node: node.id } : { page: pageId! },
              node ? label(node, project) : undefined,
            );
          })()}
      </main>
      {testing && project.pages[testing] && (
        <TestMode
          project={project}
          page={testing}
          bp={bp}
          theme={props.theme}
          base={props.path}
          onPage={setTesting}
          onExit={() => setTesting(null)}
        />
      )}
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
                        if (name && (name !== page.name || isAuto(pageId!))) {
                          const out = renamePage(project, pageId!, name);
                          props.onSave(out.project);
                          setCurrent(out.id);
                        }
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

function TestMode(props: {
  project: Project;
  page: string;
  bp: Breakpoint;
  theme: Theme;
  base: string;
  onPage: (id: string) => void;
  onExit: () => void;
}) {
  // Échap quitte ; aucune touche n'atteint l'éditeur pendant le test.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') props.onExit();
    };
    addEventListener('keydown', onKey, true);
    return () => removeEventListener('keydown', onKey, true);
  }, [props.onExit]);
  const { project } = props;
  const width = formats.find((f) => f.bp === props.bp)!.width;
  return (
    <div className="test-mode" role="dialog" aria-label="Test">
      <button className="ghost test-exit" onClick={props.onExit}>
        Quitter
      </button>
      <div
        className="test-page"
        style={{
          maxWidth: props.bp === 'desktop' ? undefined : width,
          ...foundationVars(project.foundations, props.theme),
        }}
      >
        <Render
          node={project.pages[props.page].root}
          ctx={{
            project,
            bp: props.bp,
            base: props.base,
            play: (href) => {
              const id = href.replace(/^\//, '');
              if (href.startsWith('/') && project.pages[id]) props.onPage(id);
            },
          }}
        />
      </div>
    </div>
  );
}
