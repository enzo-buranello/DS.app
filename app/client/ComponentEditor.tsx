import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  colorTokenKeys,
  fontFamilies,
  fontSizeTokenKeys,
  lengthTokenKeys,
  MAX_COMPONENTS,
  newComponent,
  type ColorValue,
  type DSComponent,
  type FontSizeValue,
  type LengthValue,
} from '../shared/component.js';
import type { TokenKey, Tokens } from '../shared/model.js';
import { request } from './api.js';

// Chargement et sauvegarde en direct (différée) des composants créés à la main.
export function useComponents(onError: (message: string) => void) {
  const [components, setComponents] = useState<DSComponent[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const save = (component: DSComponent) =>
    request('components/save', { component }).catch((e) =>
      onError((e as Error).message),
    );
  const reload = () =>
    request<{ components: DSComponent[] }>('components')
      .then((r) => {
        setComponents(r.components);
        setSelectedId((id) =>
          r.components.some((c) => c.id === id) ? id : r.components[0]?.id,
        );
      })
      .catch((e) => onError((e as Error).message));
  useEffect(() => {
    void reload();
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);
  function update(next: DSComponent) {
    setComponents((list) => list.map((c) => (c.id === next.id ? next : c)));
    clearTimeout(timers.current.get(next.id));
    if (!next.name.trim()) return;
    timers.current.set(
      next.id,
      setTimeout(() => void save(next), 300),
    );
  }
  function create() {
    const component = newComponent(crypto.randomUUID(), components.length + 1);
    setComponents((list) => [...list, component]);
    setSelectedId(component.id);
    void save(component);
  }
  // Composant déjà construit ailleurs (import d'image) : ajouté puis sélectionné.
  function add(component: DSComponent) {
    setComponents((list) => [...list, component]);
    setSelectedId(component.id);
    return request('components/save', { component });
  }
  function remove(id: string) {
    clearTimeout(timers.current.get(id));
    const rest = components.filter((c) => c.id !== id);
    setComponents(rest);
    setSelectedId(rest[0]?.id);
    request('components/delete', { id }).catch((e) =>
      onError((e as Error).message),
    );
  }
  return {
    components,
    selected: components.find((c) => c.id === selectedId),
    select: setSelectedId,
    update,
    create,
    remove,
    reload,
    add,
  };
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const tokenLabel = (tokens: Tokens, key: TokenKey) =>
  `${key} · ${tokens[key].$value}${tokens[key].$type === 'dimension' ? ' px' : ''}`;

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  nullable = false,
  unit,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min: number;
  max: number;
  step?: number;
  nullable?: boolean;
  unit?: string;
}) {
  return (
    <label className="field">
      {unit ? `${label} (${unit})` : label}
      <input
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        step={step}
        placeholder={nullable ? 'Aucun' : undefined}
        onChange={(e) => {
          if (e.target.value === '') {
            if (nullable) onChange(null);
            return;
          }
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(clamp(n, min, max));
        }}
      />
    </label>
  );
}
function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (value: T) => void;
}) {
  return (
    <label className="field">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
// Couleur : token existant (lié) ou valeur libre, avec opacité.
function ColorField({
  label,
  value,
  onChange,
  tokens,
  nullable = false,
}: {
  label: string;
  value: ColorValue | null;
  onChange: (value: ColorValue | null) => void;
  tokens: Tokens;
  nullable?: boolean;
}) {
  const source = !value ? 'none' : 'token' in value ? value.token : 'hex';
  const opacity = value?.opacity ?? 1;
  const hex =
    value && 'hex' in value
      ? value.hex
      : value
        ? String(tokens[value.token].$value)
        : '#000000';
  return (
    <div className="control-group">
      <label className="field">
        {label}
        <select
          value={source}
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'none') onChange(null);
            else if (v === 'hex') onChange({ hex, opacity });
            else onChange({ token: v as TokenKey, opacity } as ColorValue);
          }}
        >
          {nullable && <option value="none">Aucune</option>}
          {colorTokenKeys.map((k) => (
            <option key={k} value={k}>
              {tokenLabel(tokens, k)}
            </option>
          ))}
          <option value="hex">Valeur libre</option>
        </select>
      </label>
      {value && (
        <div className="control-row">
          {'hex' in value && (
            <>
              <input
                className="color-picker"
                type="color"
                aria-label={`${label} : couleur libre`}
                value={value.hex}
                onChange={(e) => onChange({ ...value, hex: e.target.value })}
              />
              <input
                aria-label={`${label} : hex`}
                value={value.hex}
                maxLength={7}
                onChange={(e) =>
                  /^#[0-9a-fA-F]{6}$/.test(e.target.value) &&
                  onChange({ ...value, hex: e.target.value })
                }
              />
            </>
          )}
          <NumberField
            label={`${label} : opacité`}
            unit="%"
            value={Math.round(opacity * 100)}
            min={0}
            max={100}
            onChange={(n) => onChange({ ...value, opacity: (n ?? 100) / 100 })}
          />
        </div>
      )}
    </div>
  );
}
// Longueur : token d'espacement ou de rayon (lié), ou valeur libre en px.
function LengthField<V extends LengthValue | FontSizeValue>({
  label,
  value,
  onChange,
  tokens,
  keys,
  max,
}: {
  label: string;
  value: V;
  onChange: (value: V) => void;
  tokens: Tokens;
  keys: readonly TokenKey[];
  max: number;
}) {
  const px = 'px' in value ? value.px : Number(tokens[value.token].$value);
  return (
    <div className="control-row">
      <label className="field">
        {label}
        <select
          value={'token' in value ? value.token : 'px'}
          onChange={(e) =>
            onChange(
              (e.target.value === 'px'
                ? { px }
                : { token: e.target.value }) as V,
            )
          }
        >
          {keys.map((k) => (
            <option key={k} value={k}>
              {tokenLabel(tokens, k)}
            </option>
          ))}
          <option value="px">Valeur libre</option>
        </select>
      </label>
      {'px' in value && (
        <NumberField
          label={`${label} : valeur`}
          unit="px"
          value={value.px}
          min={0}
          max={max}
          onChange={(n) => onChange({ px: n ?? 0 } as V)}
        />
      )}
    </div>
  );
}
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="control-set">
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}
function Sides<K extends string>({
  label,
  sides,
  values,
  onChange,
  tokens,
}: {
  label: string;
  sides: [K, string][];
  values: Record<K, LengthValue>;
  onChange: (values: Record<K, LengthValue>) => void;
  tokens: Tokens;
}) {
  const first = values[sides[0][0]];
  return (
    <>
      <LengthField
        label={`${label} global`}
        value={first}
        tokens={tokens}
        keys={lengthTokenKeys}
        max={512}
        onChange={(v) =>
          onChange(
            Object.fromEntries(sides.map(([k]) => [k, v])) as Record<
              K,
              LengthValue
            >,
          )
        }
      />
      <details className="control-details">
        <summary>{`${label} par ${sides.length === 4 && sides[0][0] === 'top' ? 'côté' : 'coin'}`}</summary>
        {sides.map(([k, text]) => (
          <LengthField
            key={k}
            label={`${label} ${text}`}
            value={values[k]}
            tokens={tokens}
            keys={lengthTokenKeys}
            max={512}
            onChange={(v) => onChange({ ...values, [k]: v })}
          />
        ))}
      </details>
    </>
  );
}

const sizingOptions: ['hug' | 'fill' | 'fixed', string][] = [
  ['hug', 'Hug (contenu)'],
  ['fill', 'Fill (remplir)'],
  ['fixed', 'Fixe'],
];
export function ComponentEditor({
  tokens,
  components,
  selected,
  onSelect,
  onChange,
  onCreate,
  onDelete,
}: {
  tokens: Tokens;
  components: DSComponent[];
  selected?: DSComponent;
  onSelect: (id: string) => void;
  onChange: (component: DSComponent) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}) {
  const head = (
    <div className="control-row">
      {components.length > 0 && (
        <label className="field">
          Composant sélectionné
          <select
            value={selected?.id ?? ''}
            onChange={(e) => onSelect(e.target.value)}
          >
            {components.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || 'Sans nom'}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        onClick={onCreate}
        disabled={components.length >= MAX_COMPONENTS}
      >
        Nouveau composant
      </button>
    </div>
  );
  if (!selected) return <div className="component-editor">{head}</div>;
  const c = selected;
  const set = (patch: Partial<DSComponent>) => onChange({ ...c, ...patch });
  const layout = (patch: Partial<DSComponent['layout']>) =>
    set({ layout: { ...c.layout, ...patch } });
  const typo = (patch: Partial<DSComponent['typography']>) =>
    set({ typography: { ...c.typography, ...patch } });
  const size = (patch: Partial<DSComponent['size']>) =>
    set({ size: { ...c.size, ...patch } });
  const shadow = c.effects.shadow;
  return (
    <div className="component-editor">
      {head}
      <div className="control-row">
        <label className="field">
          Nom
          <input
            value={c.name}
            maxLength={60}
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>
        <button type="button" onClick={() => onDelete(c.id)}>
          Supprimer
        </button>
      </div>
      <div className="control-row">
        <label className="field">
          Texte
          <input
            value={c.label}
            maxLength={200}
            onChange={(e) => set({ label: e.target.value })}
          />
        </label>
        <label className="field narrow">
          Icône
          <input
            value={c.icon}
            maxLength={4}
            onChange={(e) => set({ icon: e.target.value })}
          />
        </label>
      </div>

      <Group title="Couleurs">
        <ColorField
          label="Fill"
          value={c.fill}
          tokens={tokens}
          nullable
          onChange={(fill) => set({ fill })}
        />
        <ColorField
          label="Stroke"
          value={c.stroke}
          tokens={tokens}
          nullable
          onChange={(stroke) => set({ stroke })}
        />
        <ColorField
          label="Texte (couleur)"
          value={c.text}
          tokens={tokens}
          onChange={(text) => text && set({ text })}
        />
      </Group>

      <Group title="Border radius">
        <Sides
          label="Rayon"
          sides={[
            ['topLeft', 'haut gauche'],
            ['topRight', 'haut droit'],
            ['bottomRight', 'bas droit'],
            ['bottomLeft', 'bas gauche'],
          ]}
          values={c.radius}
          tokens={tokens}
          onChange={(radius) => set({ radius })}
        />
      </Group>

      <Group title="Auto layout">
        <div className="control-row">
          <SelectField
            label="Direction"
            value={c.layout.direction}
            options={[
              ['horizontal', 'Horizontale'],
              ['vertical', 'Verticale'],
            ]}
            onChange={(direction) => layout({ direction })}
          />
          <LengthField
            label="Gap"
            value={c.layout.gap}
            tokens={tokens}
            keys={lengthTokenKeys}
            max={512}
            onChange={(gap) => layout({ gap })}
          />
        </div>
        <Sides
          label="Padding"
          sides={[
            ['top', 'haut'],
            ['right', 'droite'],
            ['bottom', 'bas'],
            ['left', 'gauche'],
          ]}
          values={c.layout.padding}
          tokens={tokens}
          onChange={(padding) => layout({ padding })}
        />
        <div className="control-row">
          <SelectField
            label="Alignement"
            value={c.layout.align}
            options={[
              ['start', 'Début'],
              ['center', 'Centre'],
              ['end', 'Fin'],
              ['stretch', 'Étirer'],
            ]}
            onChange={(align) => layout({ align })}
          />
          <SelectField
            label="Distribution"
            value={c.layout.distribute}
            options={[
              ['start', 'Début'],
              ['center', 'Centre'],
              ['end', 'Fin'],
              ['space-between', 'Espacée'],
            ]}
            onChange={(distribute) => layout({ distribute })}
          />
        </div>
        <div className="control-row">
          <SelectField
            label="Largeur"
            value={c.layout.sizingX}
            options={sizingOptions}
            onChange={(sizingX) => layout({ sizingX })}
          />
          <SelectField
            label="Hauteur"
            value={c.layout.sizingY}
            options={sizingOptions}
            onChange={(sizingY) => layout({ sizingY })}
          />
        </div>
      </Group>

      <Group title="Typographie">
        <SelectField
          label="Famille"
          value={
            'token' in c.typography.family ? 'token' : c.typography.family.value
          }
          options={[
            ['token', `font.family · ${tokens['font.family'].$value}`],
            ...fontFamilies.map((f): [string, string] => [f, f]),
          ]}
          onChange={(v) =>
            typo({
              family: v === 'token' ? { token: 'font.family' } : { value: v },
            })
          }
        />
        <LengthField
          label="Taille"
          value={c.typography.size}
          tokens={tokens}
          keys={fontSizeTokenKeys}
          max={200}
          onChange={(s) => typo({ size: s })}
        />
        <div className="control-row">
          <SelectField
            label="Graisse"
            value={String(c.typography.weight)}
            options={[100, 200, 300, 400, 500, 600, 700, 800, 900].map(
              (w): [string, string] => [String(w), String(w)],
            )}
            onChange={(w) => typo({ weight: Number(w) })}
          />
          <NumberField
            label="Interligne"
            value={c.typography.lineHeight}
            min={0.8}
            max={3}
            step={0.05}
            onChange={(n) => typo({ lineHeight: n ?? 1.5 })}
          />
        </div>
      </Group>

      <Group title="Bordure">
        <div className="control-row">
          <NumberField
            label="Épaisseur"
            unit="px"
            value={c.border.width}
            min={0}
            max={32}
            onChange={(n) => set({ border: { ...c.border, width: n ?? 0 } })}
          />
          <SelectField
            label="Style"
            value={c.border.style}
            options={[
              ['solid', 'Plein'],
              ['dashed', 'Tirets'],
              ['dotted', 'Pointillés'],
            ]}
            onChange={(style) => set({ border: { ...c.border, style } })}
          />
        </div>
      </Group>

      <Group title="Effets">
        <label className="check">
          <input
            type="checkbox"
            checked={!!shadow}
            onChange={(e) =>
              set({
                effects: {
                  ...c.effects,
                  shadow: e.target.checked
                    ? {
                        x: 0,
                        y: 4,
                        blur: 12,
                        spread: 0,
                        color: { hex: '#000000', opacity: 0.2 },
                      }
                    : null,
                },
              })
            }
          />
          Ombre portée
        </label>
        {shadow && (
          <>
            <div className="control-row">
              {(['x', 'y', 'blur', 'spread'] as const).map((k) => (
                <NumberField
                  key={k}
                  label={`Ombre ${k === 'blur' ? 'flou' : k === 'spread' ? 'étendue' : k}`}
                  value={shadow[k]}
                  min={k === 'blur' ? 0 : -200}
                  max={200}
                  onChange={(n) =>
                    set({
                      effects: {
                        ...c.effects,
                        shadow: { ...shadow, [k]: n ?? 0 },
                      },
                    })
                  }
                />
              ))}
            </div>
            <ColorField
              label="Ombre couleur"
              value={shadow.color}
              tokens={tokens}
              onChange={(color) =>
                color &&
                set({ effects: { ...c.effects, shadow: { ...shadow, color } } })
              }
            />
          </>
        )}
        <NumberField
          label="Flou du calque"
          unit="px"
          value={c.effects.blur}
          min={0}
          max={100}
          onChange={(n) => set({ effects: { ...c.effects, blur: n ?? 0 } })}
        />
      </Group>

      <Group title="Dimensions">
        <div className="control-row">
          <NumberField
            label="Largeur fixe"
            unit="px"
            nullable
            value={c.size.width}
            min={0}
            max={4000}
            onChange={(width) =>
              set({
                size: { ...c.size, width },
                layout:
                  width === null ? c.layout : { ...c.layout, sizingX: 'fixed' },
              })
            }
          />
          <NumberField
            label="Hauteur fixe"
            unit="px"
            nullable
            value={c.size.height}
            min={0}
            max={4000}
            onChange={(height) =>
              set({
                size: { ...c.size, height },
                layout:
                  height === null
                    ? c.layout
                    : { ...c.layout, sizingY: 'fixed' },
              })
            }
          />
        </div>
        <div className="control-row">
          <NumberField
            label="Largeur min"
            unit="px"
            nullable
            value={c.size.minWidth}
            min={0}
            max={4000}
            onChange={(minWidth) => size({ minWidth })}
          />
          <NumberField
            label="Largeur max"
            unit="px"
            nullable
            value={c.size.maxWidth}
            min={0}
            max={4000}
            onChange={(maxWidth) => size({ maxWidth })}
          />
        </div>
        <div className="control-row">
          <NumberField
            label="Hauteur min"
            unit="px"
            nullable
            value={c.size.minHeight}
            min={0}
            max={4000}
            onChange={(minHeight) => size({ minHeight })}
          />
          <NumberField
            label="Hauteur max"
            unit="px"
            nullable
            value={c.size.maxHeight}
            min={0}
            max={4000}
            onChange={(maxHeight) => size({ maxHeight })}
          />
        </div>
      </Group>
    </div>
  );
}
