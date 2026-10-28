import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CaretRight, Circle, LinkBreak } from '@phosphor-icons/react';
import type { TokenKey, Tokens } from '../../shared/model.js';
import type { Color, Length } from '../../shared/doc.js';
import { evaluate } from '../../shared/expr.js';

// Champs génériques de l'inspecteur. Chaque champ lié à un token se comporte
// comme une variable Figma : choix du token filtré par type, « Dissocier »
// (valeur personnalisée égale), option « Personnalisée » pour une valeur libre.
// `label` reste le nom accessible complet ; `short` est le libellé affiché
// (contenu dans `label`, pour que le nom lu contienne le texte vu).

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/**
 * Nombre : flèches (Maj = ×10), glisser sur le libellé pour faire défiler,
 * expressions simples (16*2) validées par Entrée ou en quittant le champ.
 */
export function NumberField({
  label,
  short,
  value,
  onChange,
  min = -10_000,
  max = 10_000,
  step = 1,
  unit,
  placeholder,
  disabled,
  hint,
  mixed,
}: {
  label: string;
  short?: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  placeholder?: string;
  disabled?: boolean;
  hint?: ReactNode;
  /** Multi-sélection aux valeurs différentes : « Mixte », vide ignoré. */
  mixed?: boolean;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value === undefined ? '' : String(value));
  }, [value]);
  const commit = (raw: string) => {
    if (raw.trim() === '') return mixed ? undefined : onChange(undefined);
    const v = evaluate(raw);
    if (v === null) return setText(value === undefined ? '' : String(value));
    const next = clamp(v, min, max);
    setText(String(next));
    onChange(next);
  };
  const scrub = useRef<{ x: number; start: number } | null>(null);
  return (
    <label className="ins-field">
      <span
        className="ins-label scrub"
        title="Glisser pour modifier"
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          scrub.current = { x: e.clientX, start: value ?? 0 };
        }}
        onPointerMove={(e) => {
          const s = scrub.current;
          if (!s) return;
          const dx = Math.round((e.clientX - s.x) / 2);
          const next = clamp(
            Math.round((s.start + dx * step * (e.shiftKey ? 10 : 1)) * 100) /
              100,
            min,
            max,
          );
          setText(String(next));
          onChange(next);
        }}
        onPointerUp={() => (scrub.current = null)}
      >
        {short ?? label}
        {hint}
      </span>
      <span className="ins-input">
        <input
          aria-label={label}
          inputMode="decimal"
          value={text}
          placeholder={mixed ? 'Mixte' : placeholder}
          disabled={disabled}
          onFocus={() => (focused.current = true)}
          onChange={(e) => {
            setText(e.target.value);
            // Saisie simple : appliquée en direct ; expression : à la validation.
            const n = Number(e.target.value.replace(',', '.'));
            if (e.target.value.trim() && Number.isFinite(n))
              onChange(clamp(n, min, max));
          }}
          onBlur={(e) => {
            focused.current = false;
            commit(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(e.currentTarget.value);
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const base = evaluate(e.currentTarget.value) ?? value ?? 0;
              const d =
                (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
              const next = clamp(Math.round((base + d) * 100) / 100, min, max);
              setText(String(next));
              onChange(next);
            }
          }}
        />
        {unit && <span className="ins-unit">{unit}</span>}
      </span>
    </label>
  );
}

export function Select<T extends string>({
  label,
  short,
  value,
  options,
  onChange,
  hint,
  mixed,
}: {
  label: string;
  short?: string;
  value: T | undefined;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
  hint?: ReactNode;
  mixed?: boolean;
}) {
  return (
    <label className="ins-field">
      <span className="ins-label">
        {short ?? label}
        {hint}
      </span>
      <select
        aria-label={label}
        value={mixed ? '' : (value ?? '')}
        onChange={(e) => e.target.value && onChange(e.target.value as T)}
      >
        {(mixed || value === undefined) && (
          <option value="">{mixed ? 'Mixte' : '—'}</option>
        )}
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
export function Toggle({
  label,
  short,
  checked,
  onChange,
  mixed,
}: {
  label: string;
  short?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  mixed?: boolean;
}) {
  return (
    <label className="ins-check">
      <input
        type="checkbox"
        aria-label={short ? label : undefined}
        ref={(el) => {
          if (el) el.indeterminate = !!mixed;
        }}
        checked={mixed ? false : checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {short ?? label}
    </label>
  );
}
/** Pastille d'override (valeur propre à l'instance) avec retour au composant. */
export function OwnMark({
  own,
  onReset,
  label,
}: {
  own: boolean;
  onReset?: () => void;
  label: string;
}) {
  if (!own) return null;
  return onReset ? (
    <button
      type="button"
      className="own-mark"
      title="Valeur locale : revenir à celle du composant"
      aria-label={`Réinitialiser ${label}`}
      onClick={onReset}
    >
      <Circle weight="fill" size={8} />
    </button>
  ) : null;
}

const tokenText = (tokens: Tokens, k: TokenKey) =>
  `${k} · ${tokens[k].$value}${tokens[k].$type === 'dimension' ? ' px' : ''}`;

/** Couleur : token (avec opacité) ou valeur libre hex + opacité. */
export function ColorField({
  label,
  short,
  value,
  tokens,
  keys,
  onChange,
  hint,
  mixed,
}: {
  label: string;
  short?: string;
  value: Color | undefined;
  tokens: Tokens;
  keys: readonly TokenKey[];
  onChange: (v: Color | undefined) => void;
  hint?: ReactNode;
  mixed?: boolean;
}) {
  if (mixed) value = undefined;
  const hex = !value
    ? '#000000'
    : 'hex' in value
      ? value.hex
      : String(tokens[value.token].$value);
  const opacity = Math.round((value?.opacity ?? 1) * 100);
  return (
    <div className="ins-color">
      <label className="ins-field">
        <span className="ins-label">
          {short ?? label}
          {hint}
        </span>
        <span className="ins-input">
          <input
            type="color"
            className="color-picker"
            aria-label={`${label} : couleur`}
            value={hex.toLowerCase()}
            onChange={(e) =>
              onChange({
                hex: e.target.value.toUpperCase(),
                opacity: value?.opacity ?? 1,
              })
            }
          />
          <select
            aria-label={label}
            value={!value ? '' : 'token' in value ? value.token : 'hex'}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return mixed ? undefined : onChange(undefined);
              onChange(
                v === 'hex'
                  ? { hex: hex.toUpperCase(), opacity: value?.opacity ?? 1 }
                  : { token: v as never, opacity: value?.opacity ?? 1 },
              );
            }}
          >
            <option value="">{mixed ? 'Mixte' : '—'}</option>
            {keys.map((k) => (
              <option key={k} value={k}>
                {tokenText(tokens, k)}
              </option>
            ))}
            <option value="hex">Personnalisée</option>
          </select>
          {value && 'token' in value && (
            <button
              type="button"
              className="ins-detach"
              aria-label={`${label} : dissocier du thème`}
              title="Dissocier du thème"
              onClick={() =>
                onChange({
                  hex: String(tokens[value.token].$value).toUpperCase(),
                  opacity: value.opacity,
                })
              }
            >
              <LinkBreak />
            </button>
          )}
        </span>
      </label>
      {value && 'hex' in value && (
        <label className="ins-field">
          <span className="ins-label">Hex</span>
          <input
            aria-label={`${label} : hex`}
            defaultValue={value.hex}
            key={value.hex}
            maxLength={7}
            onChange={(e) =>
              /^#[0-9a-fA-F]{6}$/.test(e.target.value) &&
              onChange({ ...value, hex: e.target.value.toUpperCase() })
            }
          />
        </label>
      )}
      {value && (
        <NumberField
          label={`${label} : opacité`}
          short="Opacité"
          unit="%"
          min={0}
          max={100}
          value={opacity}
          onChange={(v) =>
            onChange({ ...value, opacity: (v ?? 100) / 100 } as Color)
          }
        />
      )}
    </div>
  );
}

/** Longueur : token (espacement, rayon, taille de texte) ou px libre. */
export function LengthField({
  label,
  short,
  value,
  tokens,
  keys,
  onChange,
  max = 512,
  hint,
  extra,
  mixed,
}: {
  mixed?: boolean;
  label: string;
  short?: string;
  value: Length | { token: TokenKey } | { px: number } | undefined;
  tokens: Tokens;
  keys: readonly TokenKey[];
  onChange: (v: { token: TokenKey } | { px: number } | undefined) => void;
  max?: number;
  hint?: ReactNode;
  /** Options supplémentaires (ex. gap « auto »). */
  extra?: { value: string; label: string; selected: boolean; pick: () => void };
}) {
  if (mixed) value = undefined;
  const px = !value
    ? 0
    : 'px' in value
      ? value.px
      : Number(tokens[value.token].$value);
  const current = extra?.selected
    ? extra.value
    : !value
      ? ''
      : 'token' in value
        ? value.token
        : 'px';
  return (
    <div className="ins-length">
      <label className="ins-field">
        <span className="ins-label">
          {short ?? label}
          {hint}
        </span>
        <span className="ins-input">
          <select
            aria-label={label}
            value={current}
            onChange={(e) => {
              const v = e.target.value;
              if (extra && v === extra.value) return extra.pick();
              if (!v && mixed) return;
              onChange(
                !v ? undefined : v === 'px' ? { px } : { token: v as TokenKey },
              );
            }}
          >
            <option value="">{mixed ? 'Mixte' : '—'}</option>
            {extra && <option value={extra.value}>{extra.label}</option>}
            {keys.map((k) => (
              <option key={k} value={k}>
                {tokenText(tokens, k)}
              </option>
            ))}
            <option value="px">Personnalisée</option>
          </select>
          {value && 'token' in value && !extra?.selected && (
            <button
              type="button"
              className="ins-detach"
              aria-label={`${label} : dissocier du thème`}
              title="Dissocier du thème"
              onClick={() => onChange({ px })}
            >
              <LinkBreak />
            </button>
          )}
        </span>
      </label>
      {value && 'px' in value && !extra?.selected && (
        <NumberField
          label={`${label} : valeur`}
          short="Valeur"
          unit="px"
          min={0}
          max={max}
          value={value.px}
          onChange={(v) => onChange({ px: v ?? 0 })}
        />
      )}
    </div>
  );
}

const SECTIONS_KEY = 'ds-studio-inspector-sections';
function storedSections(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(SECTIONS_KEY) || '{}');
  } catch {
    return {};
  }
}

// Dans un groupe, une Section devient un sous-bloc : intertitre discret,
// sans repli. Seuls les groupes de premier niveau se replient.
const InGroup = createContext(false);

/**
 * Groupe repliable : chevron et intertitre cliquables, sans fond. L'état
 * ouvert/replié choisi par l'utilisateur est retenu d'une sélection à l'autre.
 */
export function Section({
  title,
  children,
  open: byDefault = true,
  actions,
  badge,
}: {
  title: string;
  children: ReactNode;
  open?: boolean;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  const sub = useContext(InGroup);
  const [open, setOpen] = useState(() => storedSections()[title] ?? byDefault);
  if (sub)
    return (
      <div className="ins-sub">
        <div className="ins-sub-head">
          <h5>
            {title}
            {badge && <span className="badge">{badge}</span>}
          </h5>
          {actions && <span className="ins-actions">{actions}</span>}
        </div>
        {children}
      </div>
    );
  return (
    <details className="ins-section" open={open}>
      <summary
        onClick={(e) => {
          e.preventDefault();
          if ((e.target as Element).closest('.ins-actions')) return;
          setOpen(!open);
          try {
            localStorage.setItem(
              SECTIONS_KEY,
              JSON.stringify({ ...storedSections(), [title]: !open }),
            );
          } catch {
            /* Facultatif. */
          }
        }}
      >
        <CaretRight className="chevron" />
        <h4>
          {title}
          {badge && <span className="badge">{badge}</span>}
        </h4>
        {actions && <span className="ins-actions">{actions}</span>}
      </summary>
      <div className="ins-body">
        <InGroup.Provider value={true}>{children}</InGroup.Provider>
      </div>
    </details>
  );
}
