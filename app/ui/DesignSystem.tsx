import { useEffect, useState } from 'react';
import { FigmaLogo, Plus, Trash } from '@phosphor-icons/react';
import {
  componentStates,
  references,
  slug,
  type FoundationKind,
  type Foundations,
  type Project,
} from '../shared/project.js';
import { foundationVars, Render, type Theme } from './render.js';

// Module Design system : liste à gauche, planche au centre, réglages à droite.

export type DSKind = FoundationKind | 'components';
export type DSSelection = { kind: DSKind; id: string } | null;
export type CompState = (typeof componentStates)[number] | 'default';

const groups: { kind: DSKind; label: string }[] = [
  { kind: 'colors', label: 'Couleurs' },
  { kind: 'fonts', label: 'Typographie' },
  { kind: 'spacing', label: 'Espacements' },
  { kind: 'radius', label: 'Arrondis' },
  { kind: 'shadows', label: 'Ombres' },
  { kind: 'components', label: 'Composants' },
];
const stateLabels: Record<CompState, string> = {
  default: 'Par défaut',
  hover: 'Survol',
  active: 'Actif',
  disabled: 'Désactivé',
};

// Valeurs de départ d'une fondation ajoutée à la main.
function blank(kind: FoundationKind, f: Foundations, name: string) {
  if (kind === 'colors') return { name, light: '#000000', dark: '#ffffff' };
  if (kind === 'fonts')
    return { name, family: 'Geist', size: 16, weight: 400, lineHeight: 1.5 };
  if (kind === 'shadows')
    return { name, x: 0, y: 4, blur: 12, color: Object.keys(f.colors)[0] };
  return { name, value: 8 };
}
const entries = (p: Project, kind: DSKind) =>
  Object.entries(kind === 'components' ? p.components : p.foundations[kind]);
export const isEmpty = (p: Project) =>
  groups.every((g) => entries(p, g.kind).length === 0);

type Props = {
  project: Project;
  sel: DSSelection;
  onSelect: (s: DSSelection) => void;
  onSave: (p: Project) => void;
};

export function DesignNav(props: Props & { onFigma: () => void }) {
  const { project } = props;
  function add(kind: FoundationKind, label: string) {
    const f = project.foundations;
    const name = `${label} ${Object.keys(f[kind]).length + 1}`;
    const id = slug(name, f[kind]);
    props.onSave({
      ...project,
      foundations: {
        ...f,
        [kind]: { ...f[kind], [id]: blank(kind, f, name) },
      },
    });
    props.onSelect({ kind, id });
  }
  return (
    <aside className="panel left">
      <div className="panel-head">
        <h2>Design system</h2>
        <button className="ghost" onClick={props.onFigma}>
          <FigmaLogo /> {project.figma ? 'Réimporter' : 'Importer'}
        </button>
      </div>
      {groups.map(({ kind, label }) => (
        <section key={kind} className="group">
          <div className="group-head">
            <h3>{label}</h3>
            {kind !== 'components' && (
              <button
                className="icon-btn"
                aria-label={`Ajouter ${label}`}
                disabled={
                  kind === 'shadows' && !entries(project, 'colors').length
                }
                onClick={() => add(kind, label)}
              >
                <Plus />
              </button>
            )}
          </div>
          {entries(project, kind).map(([id, item]) => (
            <button
              key={id}
              className="ghost item"
              aria-current={
                props.sel?.kind === kind && props.sel.id === id
                  ? 'true'
                  : undefined
              }
              onClick={() => props.onSelect({ kind, id })}
            >
              {kind === 'colors' && (
                <span
                  className="dot"
                  style={{ background: (item as { light: string }).light }}
                />
              )}
              {item.name}
            </button>
          ))}
        </section>
      ))}
    </aside>
  );
}

export type FigmaSource = { url?: string; token?: string; variables?: string };
export function FigmaDialog(props: {
  ref: React.Ref<HTMLDialogElement>;
  project: Project;
  onSubmit: (s: FigmaSource) => void;
}) {
  const [saved, setSaved] = useState(false);
  useEffect(() => void window.studio.hasFigmaToken().then(setSaved), []);
  const key = props.project.figma?.fileKey;
  return (
    <dialog ref={props.ref} className="dialog">
      <form
        className="dialog-body"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const d = new FormData(form);
          const file = d.get('variables') as File | null;
          const s: FigmaSource = {
            url: (d.get('url') as string).trim() || undefined,
            token: (d.get('token') as string).trim() || undefined,
            variables: file?.size ? await file.text() : undefined,
          };
          if (s.url || s.variables) {
            form.closest('dialog')?.close();
            props.onSubmit(s);
          }
        }}
      >
        <h2>Figma</h2>
        <label className="field">
          Lien
          <input
            name="url"
            defaultValue={key && `https://www.figma.com/design/${key}`}
          />
        </label>
        <label className="field">
          Token
          <input
            name="token"
            type="password"
            placeholder={saved ? 'Enregistré' : undefined}
          />
        </label>
        <label className="field">
          Variables
          <input name="variables" type="file" accept=".json,application/json" />
        </label>
        <div className="row end">
          <button
            type="button"
            className="ghost"
            onClick={(e) => e.currentTarget.closest('dialog')?.close()}
          >
            Annuler
          </button>
          <button className="studio-primary">
            {key ? 'Réimporter' : 'Importer'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export function DesignBoard(
  props: Props & { theme: Theme; state: CompState; onImport: () => void },
) {
  const { project, sel } = props;
  const f = project.foundations;
  if (isEmpty(project))
    return (
      <div className="board empty">
        <button onClick={props.onImport}>
          <FigmaLogo /> Importer de Figma
        </button>
      </div>
    );
  const pick = (kind: DSKind, id: string) => ({
    'aria-current':
      sel?.kind === kind && sel.id === id ? ('true' as const) : undefined,
    onClick: () => props.onSelect({ kind, id }),
  });
  const ctx = { project, bp: 'desktop' as const };
  return (
    <div
      className="board"
      style={foundationVars(f, props.theme)}
      data-theme={props.theme}
    >
      {groups.map(({ kind, label }) =>
        entries(project, kind).length ? (
          <section key={kind} className="board-group">
            <h3>{label}</h3>
            <div className={`board-items ${kind}`}>
              {kind === 'components'
                ? Object.entries(project.components).map(([id, c]) => (
                    <button key={id} className="board-item" {...pick(kind, id)}>
                      <Render
                        node={c.root}
                        ctx={{
                          ...ctx,
                          patches:
                            sel?.id === id && props.state !== 'default'
                              ? c.states[props.state]
                              : undefined,
                        }}
                      />
                      <span className="board-label">{c.name}</span>
                    </button>
                  ))
                : Object.entries(f[kind as FoundationKind]).map(([id, t]) => (
                    <button key={id} className="board-item" {...pick(kind, id)}>
                      <Sample kind={kind as FoundationKind} id={id} />
                      <span className="board-label">{t.name}</span>
                    </button>
                  ))}
            </div>
          </section>
        ) : null,
      )}
    </div>
  );
}

function Sample({ kind, id }: { kind: FoundationKind; id: string }) {
  if (kind === 'colors')
    return <span className="swatch" style={{ background: `var(--c-${id})` }} />;
  if (kind === 'fonts')
    return <span style={{ font: `var(--f-${id})` }}>Aa</span>;
  if (kind === 'spacing')
    return <span className="bar" style={{ width: `var(--s-${id})` }} />;
  if (kind === 'radius')
    return (
      <span className="corner" style={{ borderRadius: `var(--r-${id})` }} />
    );
  return <span className="lift" style={{ boxShadow: `var(--sh-${id})` }} />;
}

export function DesignSettings(
  props: Props & { state: CompState; onState: (s: CompState) => void },
) {
  const { project, sel } = props;
  if (!sel) return <aside className="panel right" aria-label="Paramètres" />;
  const f = project.foundations;
  const used = references(project).has(`${sel.kind}:${sel.id}`);

  if (sel.kind === 'components') {
    const c = project.components[sel.id];
    if (!c) return <aside className="panel right" />;
    const set = (next: typeof c | null) => {
      const { [sel.id]: _, ...rest } = project.components;
      props.onSave({
        ...project,
        components: next ? { ...rest, [sel.id]: next } : rest,
      });
      if (!next) props.onSelect(null);
    };
    return (
      <aside className="panel right" aria-label="Paramètres">
        <Text
          label="Nom"
          value={c.name}
          onChange={(name) => set({ ...c, name })}
        />
        <label className="field">
          État
          <select
            value={props.state}
            onChange={(e) => props.onState(e.target.value as CompState)}
          >
            {(['default', ...componentStates] as CompState[]).map((s) => (
              <option
                key={s}
                value={s}
                disabled={s !== 'default' && !c.states[s]}
              >
                {stateLabels[s]}
              </option>
            ))}
          </select>
        </label>
        <Remove disabled={used} onClick={() => set(null)} />
      </aside>
    );
  }

  const kind = sel.kind;
  const item = f[kind][sel.id] as Record<string, any> | undefined;
  if (!item) return <aside className="panel right" />;
  const set = (patch: Record<string, unknown> | null) => {
    const { [sel.id]: _, ...rest } = f[kind];
    props.onSave({
      ...project,
      foundations: {
        ...f,
        [kind]: patch ? { ...rest, [sel.id]: { ...item, ...patch } } : rest,
      },
    });
    if (!patch) props.onSelect(null);
  };
  const num = (label: string, key: string, step = 1) => (
    <Num
      label={label}
      value={item[key]}
      step={step}
      onChange={(v) => set({ [key]: v })}
    />
  );
  return (
    <aside className="panel right" aria-label="Paramètres">
      <Text label="Nom" value={item.name} onChange={(name) => set({ name })} />
      {kind === 'colors' && (
        <>
          <Color
            label="Clair"
            value={item.light}
            onChange={(light) => set({ light })}
          />
          <Color
            label="Sombre"
            value={item.dark}
            onChange={(dark) => set({ dark })}
          />
        </>
      )}
      {kind === 'fonts' && (
        <>
          <Text
            label="Police"
            value={item.family}
            onChange={(family) => set({ family })}
          />
          {num('Taille', 'size')}
          <label className="field">
            Graisse
            <select
              value={item.weight}
              onChange={(e) => set({ weight: Number(e.target.value) })}
            >
              {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
                <option key={w}>{w}</option>
              ))}
            </select>
          </label>
          {num('Interligne', 'lineHeight', 0.05)}
        </>
      )}
      {(kind === 'spacing' || kind === 'radius') && num('Valeur', 'value')}
      {kind === 'shadows' && (
        <>
          {num('X', 'x')}
          {num('Y', 'y')}
          {num('Flou', 'blur')}
          <label className="field">
            Couleur
            <select
              value={item.color}
              onChange={(e) => set({ color: e.target.value })}
            >
              {Object.entries(f.colors).map(([id, c]) => (
                <option key={id} value={id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <Remove disabled={used} onClick={() => set(null)} />
    </aside>
  );
}

// --- Champs : la valeur s'enregistre en quittant le champ ---
function Text(p: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      {p.label}
      <input
        key={p.value}
        defaultValue={p.value}
        onBlur={(e) => {
          const v = e.currentTarget.value.trim();
          if (v && v !== p.value) p.onChange(v);
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  );
}
function Num(p: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="field">
      {p.label}
      <input
        type="number"
        key={p.value}
        step={p.step}
        defaultValue={p.value}
        onBlur={(e) => {
          const v = e.currentTarget.valueAsNumber;
          if (Number.isFinite(v) && v !== p.value) p.onChange(v);
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </label>
  );
}
function Color(p: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const hex = p.value.slice(0, 7);
  return (
    <div className="field">
      {p.label}
      <div className="row">
        <input
          type="color"
          className="color-picker"
          aria-label={p.label}
          value={hex}
          onChange={(e) => p.onChange(e.target.value)}
        />
        <input
          key={p.value}
          aria-label={`${p.label} hex`}
          defaultValue={p.value}
          onBlur={(e) => {
            const v = e.currentTarget.value.trim();
            if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v) && v !== p.value)
              p.onChange(v);
          }}
        />
      </div>
    </div>
  );
}
function Remove(p: { disabled: boolean; onClick: () => void }) {
  return (
    <button className="ghost danger" disabled={p.disabled} onClick={p.onClick}>
      <Trash /> Supprimer
    </button>
  );
}
