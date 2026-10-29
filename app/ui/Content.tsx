import { useEffect, useState } from 'react';
import {
  CalendarBlank,
  Hash,
  ImageSquare,
  LinkSimple,
  Plus,
  TextAlignLeft,
  TextT,
  ToggleLeft,
  Trash,
} from '@phosphor-icons/react';
import type { Scope } from '../shared/api.js';
import {
  bindings,
  convert,
  fieldLabels,
  type Collection,
  type FieldType,
  type Value,
} from '../shared/content.js';
import { fieldTypes, slug, type Project } from '../shared/project.js';
import { assetUrl } from './render.js';

// Module Contenus : collections simples, saisies dans un tableau.

const icons: Record<FieldType, React.ReactNode> = {
  text: <TextT />,
  longText: <TextAlignLeft />,
  image: <ImageSquare />,
  number: <Hash />,
  date: <CalendarBlank />,
  link: <LinkSimple />,
  boolean: <ToggleLeft />,
};

export function ContentModule(props: {
  project: Project;
  path: string;
  onSave: (p: Project) => void;
  bar: (scope: Scope, target?: string) => React.ReactNode;
}) {
  const { project } = props;
  const list = Object.entries(project.collections);
  const [current, setCurrent] = useState<string | null>(null);
  const [field, setField] = useState<string | null>(null);
  useEffect(() => setField(null), [current, props.path]);
  const cid =
    current && project.collections[current] ? current : (list[0]?.[0] ?? null);
  const c = cid ? project.collections[cid] : undefined;
  const used = bindings(project);

  const setCollection = (next: Collection | null) => {
    if (!cid) return;
    const { [cid]: _, ...rest } = project.collections;
    props.onSave({
      ...project,
      collections: next ? { ...rest, [cid]: next } : rest,
    });
  };
  function addCollection() {
    const name = `Collection ${list.length + 1}`;
    const id = slug(name, project.collections);
    props.onSave({
      ...project,
      collections: {
        ...project.collections,
        [id]: {
          name,
          fields: [{ id: 'nom', name: 'Nom', type: 'text' }],
          items: [],
        },
      },
    });
    setCurrent(id);
  }
  function addField() {
    if (!c) return;
    const name = `Champ ${c.fields.length + 1}`;
    const id = slug(name, Object.fromEntries(c.fields.map((f) => [f.id, 1])));
    setCollection({ ...c, fields: [...c.fields, { id, name, type: 'text' }] });
    setField(id);
  }
  function addItem() {
    if (!c) return;
    let n = c.items.length + 1;
    while (c.items.some((i) => i.id === `item-${n}`)) n++;
    setCollection({
      ...c,
      items: [...c.items, { id: `item-${n}`, values: {} }],
    });
  }
  const setValue = (item: string, f: string, v: Value | undefined) =>
    c &&
    setCollection({
      ...c,
      items: c.items.map((i) => {
        if (i.id !== item) return i;
        const values = { ...i.values };
        if (v === undefined || v === '') delete values[f];
        else values[f] = v;
        return { ...i, values };
      }),
    });

  const cell = (
    item: Collection['items'][number],
    f: Collection['fields'][number],
  ) => {
    const v = item.values[f.id];
    const label = `${f.name} ${item.id}`;
    if (f.type === 'boolean')
      return (
        <input
          type="checkbox"
          aria-label={label}
          checked={v === true}
          onChange={(e) =>
            setValue(item.id, f.id, e.target.checked || undefined)
          }
        />
      );
    if (f.type === 'image')
      return (
        <button
          className="ghost cell-image"
          aria-label={label}
          onClick={async () => {
            const src = await window.studio.importImage(props.path);
            if (src) setValue(item.id, f.id, src);
          }}
        >
          {typeof v === 'string' ? (
            <img src={assetUrl(v, props.path)} alt="" />
          ) : (
            <ImageSquare />
          )}
        </button>
      );
    return (
      <input
        aria-label={label}
        type={
          f.type === 'number'
            ? 'number'
            : f.type === 'date'
              ? 'date'
              : f.type === 'link'
                ? 'url'
                : 'text'
        }
        value={v === undefined ? '' : String(v)}
        onChange={(e) =>
          setValue(
            item.id,
            f.id,
            f.type === 'number'
              ? convert(e.target.value, 'number')
              : e.target.value,
          )
        }
      />
    );
  };

  const selected =
    c && field ? c.fields.find((f) => f.id === field) : undefined;
  return (
    <>
      <aside className="panel left">
        <section className="group">
          <div className="group-head">
            <h3>Collections</h3>
            <button
              className="icon-btn"
              aria-label="Ajouter une collection"
              onClick={addCollection}
            >
              <Plus />
            </button>
          </div>
          {list.map(([id, col]) => (
            <button
              key={id}
              className="ghost item"
              aria-current={id === cid ? 'true' : undefined}
              onClick={() => setCurrent(id)}
            >
              {col.name}
              <span className="muted count">{col.items.length}</span>
            </button>
          ))}
        </section>
      </aside>
      <main className="canvas" aria-label="Contenus">
        {c ? (
          <div className="table-wrap">
            <table className="content-table">
              <thead>
                <tr>
                  {c.fields.map((f) => (
                    <th key={f.id}>
                      <button
                        className="ghost th"
                        aria-current={f.id === field ? 'true' : undefined}
                        onClick={() => setField(f.id)}
                      >
                        {icons[f.type]} {f.name}
                      </button>
                    </th>
                  ))}
                  <th className="th-add">
                    <button
                      className="icon-btn"
                      aria-label="Ajouter un champ"
                      onClick={addField}
                    >
                      <Plus />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {c.items.map((item) => (
                  <tr key={item.id}>
                    {c.fields.map((f) => (
                      <td key={f.id}>{cell(item, f)}</td>
                    ))}
                    <td className="row-actions">
                      <button
                        className="icon-btn"
                        aria-label={`Supprimer ${item.id}`}
                        onClick={() =>
                          setCollection({
                            ...c,
                            items: c.items.filter((i) => i.id !== item.id),
                          })
                        }
                      >
                        <Trash />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="ghost add-row" onClick={addItem}>
              <Plus /> Ajouter
            </button>
          </div>
        ) : (
          <div className="board empty">
            <button onClick={addCollection}>
              <Plus /> Ajouter une collection
            </button>
          </div>
        )}
        {props.bar({})}
      </main>
      <aside className="panel right" aria-label="Paramètres">
        {c && selected ? (
          <>
            <label className="field">
              Nom
              <input
                aria-label="Nom du champ"
                key={selected.id + selected.name}
                defaultValue={selected.name}
                onBlur={(e) => {
                  const name = e.currentTarget.value.trim();
                  if (name && name !== selected.name)
                    setCollection({
                      ...c,
                      fields: c.fields.map((f) =>
                        f.id === selected.id ? { ...f, name } : f,
                      ),
                    });
                }}
              />
            </label>
            <label className="field">
              Type
              <select
                value={selected.type}
                onChange={(e) => {
                  const type = e.target.value as FieldType;
                  setCollection({
                    ...c,
                    fields: c.fields.map((f) =>
                      f.id === selected.id ? { ...f, type } : f,
                    ),
                    items: c.items.map((i) => {
                      const values = { ...i.values };
                      const v = convert(values[selected.id], type);
                      if (v === undefined) delete values[selected.id];
                      else values[selected.id] = v;
                      return { ...i, values };
                    }),
                  });
                }}
              >
                {fieldTypes.map((t) => (
                  <option key={t} value={t}>
                    {fieldLabels[t]}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="ghost danger"
              disabled={
                used.has(`${cid}:${selected.id}`) || c.fields.length < 2
              }
              onClick={() => {
                setCollection({
                  ...c,
                  fields: c.fields.filter((f) => f.id !== selected.id),
                  items: c.items.map((i) => {
                    const { [selected.id]: _, ...values } = i.values;
                    return { ...i, values };
                  }),
                });
                setField(null);
              }}
            >
              <Trash /> Supprimer
            </button>
          </>
        ) : (
          c && (
            <>
              <label className="field">
                Nom
                <input
                  key={cid! + c.name}
                  aria-label="Nom de la collection"
                  defaultValue={c.name}
                  onBlur={(e) => {
                    const name = e.currentTarget.value.trim();
                    if (name && name !== c.name) setCollection({ ...c, name });
                  }}
                />
              </label>
              <button
                className="ghost danger"
                disabled={used.has(cid!)}
                onClick={() => setCollection(null)}
              >
                <Trash /> Supprimer
              </button>
            </>
          )
        )}
      </aside>
    </>
  );
}
