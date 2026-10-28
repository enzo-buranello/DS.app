import { useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeSlash,
  Lock,
  LockOpen,
  Minus,
  Plus,
  Trash,
} from '@phosphor-icons/react';
import {
  colorTokenKeys,
  fontFamilies,
  fontSizeTokenKeys,
  lengthTokenKeys,
} from '../../shared/component.js';
import {
  componentOf,
  screenSlug,
  tags,
  type Doc,
  type DocNode,
  type Effect,
  type Interaction,
  type Length,
  type Paint,
  type Props,
  type StateName,
} from '../../shared/doc.js';
import {
  addComponentProp,
  renameVariantProp,
  type PropType,
} from '../../shared/docOps.js';
import {
  groupAt,
  isOwn,
  overrideCount,
  resetOverrides,
  select,
  setFacet,
  setProp,
  type Selected,
} from '../../shared/edit.js';
import type { Tokens } from '../../shared/model.js';
import { request } from '../api.js';
import {
  ColorField,
  LengthField,
  NumberField,
  OwnMark,
  Section,
  Select,
  Toggle,
} from './fields.js';

// Inspecteur « à la Figma » : sections affichées selon le type de nœud,
// valeurs lues sur le rendu (composant + overrides), écrites sur la cible
// (nœud, ou override de l'instance). Un état (survol…) choisi en haut
// redirige les modifications vers cet état.
const STATES: readonly (readonly [StateName | 'base', string])[] = [
  ['base', 'Défaut'],
  ['hover', 'Survol'],
  ['pressed', 'Appuyé'],
  ['focus', 'Focus'],
  ['disabled', 'Désactivé'],
  ['invalid', 'Invalide'],
];
const CONTAINERS: DocNode['type'][] = [
  'frame',
  'component',
  'component-set',
  'instance',
  'page',
];
const zero = { px: 0 };
const sides = ['top', 'right', 'bottom', 'left'] as const;
const SIDE = { top: 'haut', right: 'droite', bottom: 'bas', left: 'gauche' };
const corners = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;
const CORNER = {
  topLeft: 'haut gauche',
  topRight: 'haut droit',
  bottomRight: 'bas droit',
  bottomLeft: 'bas gauche',
};

export interface InspectorProps {
  doc: Doc;
  selKey: string;
  tokens: Tokens;
  state: StateName | null;
  onState: (s: StateName | null) => void;
  /** Nœuds modifiés par un geste (rendu immédiat, écriture regroupée). */
  onNodes: (nodes: DocNode[]) => void;
  onApply: () => void;
  /** Nom du calque modifié (titre du panneau). */
  onRename: (name: string) => void;
  /** Commandes de structure (variante, détacher). */
  onCommand: (name: 'variant' | 'detach') => void;
  /** Taille rendue de l'élément (px), pour passer en taille fixe. */
  measure: () => { w: number; h: number } | null;
}

export function Inspector(p: InspectorProps) {
  const { doc, selKey: key, tokens, state } = p;
  const s = select(doc, key);
  if (!s) return <p className="muted">Élément introuvable.</p>;
  const type = s.node.type;
  const isText = type === 'text';
  const container = CONTAINERS.includes(type);
  const parent = s.resolved.parentProps;
  const parentFlex =
    parent?.layout?.mode === 'horizontal' ||
    parent?.layout?.mode === 'vertical';

  const set = (group: keyof Props, field: string | null, value: unknown) =>
    p.onNodes(setProp(doc, key, state, group, field, value));
  function val<G extends keyof Props>(group: G): NonNullable<Props[G]> {
    return (groupAt(s!, group, state) ?? {}) as NonNullable<Props[G]>;
  }
  // Pastille « valeur locale » : override d'instance ou valeur d'un état.
  const mark = (group: keyof Props, field: string | null, label: string) =>
    (s.inInstance || state) && (
      <OwnMark
        own={isOwn(s, group, field, state)}
        label={label}
        onReset={() => set(group, field, undefined)}
      />
    );
  const sections: ReactNode[] = [];

  // --- Calque : nom, visibilité, verrou (en-tête) ; le reste suit sa famille ---
  const layer = val('layer');
  const appearance = (
    <>
      <NumberField
        label="Opacité"
        unit="%"
        min={0}
        max={100}
        value={Math.round((layer.opacity ?? 1) * 100)}
        hint={mark('layer', 'opacity', 'Opacité')}
        onChange={(v) =>
          set('layer', 'opacity', v === undefined ? undefined : v / 100)
        }
      />
      <Select
        label="Fusion"
        value={layer.blend ?? 'normal'}
        options={[
          ['normal', 'Normal'],
          ['multiply', 'Produit'],
          ['screen', 'Superposition (écran)'],
          ['overlay', 'Incrustation'],
          ['darken', 'Obscurcir'],
          ['lighten', 'Éclaircir'],
          ['color-dodge', 'Densité couleur −'],
          ['color-burn', 'Densité couleur +'],
          ['hard-light', 'Lumière crue'],
          ['soft-light', 'Lumière tamisée'],
          ['difference', 'Différence'],
          ['exclusion', 'Exclusion'],
          ['hue', 'Teinte'],
          ['saturation', 'Saturation'],
          ['color', 'Couleur'],
          ['luminosity', 'Luminosité'],
        ]}
        onChange={(v) => set('layer', 'blend', v)}
      />
    </>
  );
  const clip = container && (
    <Toggle
      label="Rogner le contenu"
      checked={!!layer.clip}
      onChange={(v) => set('layer', 'clip', v)}
    />
  );
  const cursor = (
    <Select
      label="Curseur"
      value={layer.cursor ?? 'auto'}
      options={[
        ['auto', 'Auto'],
        ['pointer', 'Main'],
        ['not-allowed', 'Interdit'],
        ['text', 'Texte'],
      ]}
      onChange={(v) => set('layer', 'cursor', v)}
    />
  );

  // --- Instance / composant ---
  if (type === 'instance') sections.push(instanceSection(p, s));
  if (type === 'component' && s.target.kind === 'node' && !state)
    sections.push(<ComponentSection key="component" p={p} s={s} />);
  if (type === 'component-set' && s.target.kind === 'node' && !state)
    sections.push(setSection(p, s));

  // --- Contenu : texte ou champ de saisie ---
  if (isText && !state)
    sections.push(
      <Section title="Contenu" key="content">
        <label className="ins-field stack">
          <span className="ins-label">
            Texte
            {s.inInstance && (
              <OwnMark
                own={s.own.characters !== undefined}
                label="Texte"
                onReset={() =>
                  p.onNodes(setFacet(doc, key, 'characters', undefined))
                }
              />
            )}
          </span>
          <textarea
            aria-label="Contenu du texte"
            rows={2}
            maxLength={2000}
            value={s.resolved.characters ?? ''}
            onChange={(e) =>
              p.onNodes(setFacet(doc, key, 'characters', e.target.value))
            }
          />
        </label>
      </Section>,
    );

  // --- Champ de saisie ---
  if (type === 'field' && s.target.kind === 'node' && !state) {
    const f = s.node.field ?? {};
    const write = (patch: Partial<typeof f>) =>
      p.onNodes([{ ...structuredClone(s.node), field: { ...f, ...patch } }]);
    sections.push(
      <Section title="Contenu" key="field">
        <Select
          label="Type de champ"
          short="Type"
          value={f.input ?? 'text'}
          options={[
            ['text', 'Texte'],
            ['email', 'E-mail'],
            ['checkbox', 'Case à cocher'],
          ]}
          onChange={(v) => write({ input: v })}
        />
        <label className="ins-field">
          <span className="ins-label">Indicatif</span>
          <input
            aria-label="Texte indicatif"
            value={f.placeholder ?? ''}
            maxLength={200}
            onChange={(e) => write({ placeholder: e.target.value })}
          />
        </label>
        <div className="ins-row">
          <Toggle
            label="Obligatoire"
            checked={!!f.required}
            onChange={(v) => write({ required: v })}
          />
          <Toggle
            label="Désactivé"
            checked={!!f.disabled}
            onChange={(v) => write({ disabled: v })}
          />
        </div>
      </Section>,
    );
  }

  // --- Position ---
  const pos = val('position');
  const absolute = pos.mode === 'absolute';
  const position = (
    <Section title="Position" key="position" open={false}>
      {parentFlex && (
        <>
          <Select
            label="Alignement dans le parent"
            short="Alignement"
            value={pos.alignSelf ?? 'auto'}
            options={[
              ['auto', 'Hérité du parent'],
              ['start', 'Début'],
              ['center', 'Centre'],
              ['end', 'Fin'],
              ['stretch', 'Étirer'],
            ]}
            hint={mark('position', 'alignSelf', 'Alignement dans le parent')}
            onChange={(v) => set('position', 'alignSelf', v)}
          />
          <Toggle
            label="Position absolue (hors auto-layout)"
            short="Absolue"
            checked={absolute}
            onChange={(v) => set('position', 'mode', v ? 'absolute' : 'auto')}
          />
        </>
      )}
      {!parentFlex && (
        <Toggle
          label="Position absolue"
          short="Absolue"
          checked={absolute}
          onChange={(v) => set('position', 'mode', v ? 'absolute' : 'auto')}
        />
      )}
      {absolute && (
        <>
          <div className="ins-grid2">
            <NumberField
              label="X"
              unit="px"
              value={pos.x ?? 0}
              onChange={(v) => set('position', 'x', v ?? 0)}
            />
            <NumberField
              label="Y"
              unit="px"
              value={pos.y ?? 0}
              onChange={(v) => set('position', 'y', v ?? 0)}
            />
          </div>
          <div className="ins-grid2">
            <Select
              label="Contrainte horizontale"
              short="Horizontale"
              value={pos.constraintX ?? 'left'}
              options={[
                ['left', 'Gauche'],
                ['right', 'Droite'],
                ['center', 'Centre'],
                ['stretch', 'Gauche et droite'],
              ]}
              onChange={(v) => set('position', 'constraintX', v)}
            />
            <Select
              label="Contrainte verticale"
              short="Verticale"
              value={pos.constraintY ?? 'top'}
              options={[
                ['top', 'Haut'],
                ['bottom', 'Bas'],
                ['center', 'Centre'],
                ['stretch', 'Haut et bas'],
              ]}
              onChange={(v) => set('position', 'constraintY', v)}
            />
          </div>
          {(pos.constraintX === 'stretch' || pos.constraintY === 'stretch') && (
            <div className="ins-grid2">
              {pos.constraintX === 'stretch' && (
                <NumberField
                  label="Marge droite"
                  short="Droite"
                  unit="px"
                  value={pos.xEnd ?? 0}
                  onChange={(v) => set('position', 'xEnd', v ?? 0)}
                />
              )}
              {pos.constraintY === 'stretch' && (
                <NumberField
                  label="Marge basse"
                  short="Basse"
                  unit="px"
                  value={pos.yEnd ?? 0}
                  onChange={(v) => set('position', 'yEnd', v ?? 0)}
                />
              )}
            </div>
          )}
        </>
      )}
      <NumberField
        label="Rotation"
        unit="°"
        min={-360}
        max={360}
        value={pos.rotation ?? 0}
        hint={mark('position', 'rotation', 'Rotation')}
        onChange={(v) => set('position', 'rotation', v || undefined)}
      />
      {!!pos.rotation && parentFlex && !absolute && (
        <p className="ins-note">Sans effet sur l’auto-layout en CSS.</p>
      )}
    </Section>
  );

  // --- Dimensions ---
  const size = val('size');
  const axis = (which: 'width' | 'height', label: string) => {
    const v = size[which];
    return (
      <div className={v?.mode === 'fixed' ? 'ins-grid2' : 'ins-length'}>
        <Select
          label={label}
          value={v?.mode ?? 'auto'}
          options={[
            ['auto', 'Auto'],
            ['hug', 'Contenu'],
            ['fill', 'Remplir'],
            ['fixed', 'Fixe'],
          ]}
          hint={mark('size', which, label)}
          onChange={(mode) => {
            if (mode === 'auto') return set('size', which, undefined);
            const m = p.measure();
            set(
              'size',
              which,
              mode === 'fixed'
                ? {
                    mode,
                    px: Math.round(m ? (which === 'width' ? m.w : m.h) : 100),
                  }
                : { mode },
            );
          }}
        />
        {v?.mode === 'fixed' && (
          <NumberField
            label={`${label} fixe`}
            short="Valeur"
            unit="px"
            min={0}
            value={v.px}
            onChange={(px) => {
              const next = { mode: 'fixed' as const, px: px ?? 0 };
              const other = which === 'width' ? 'height' : 'width';
              const o = size[other];
              // Ratio verrouillé : l'autre côté suit (s'il est fixe).
              if (size.lockRatio && o?.mode === 'fixed' && v.px > 0)
                set('size', null, {
                  ...size,
                  [which]: next,
                  [other]: {
                    mode: 'fixed',
                    px: Math.round((o.px * (px ?? 0)) / v.px),
                  },
                });
              else set('size', which, next);
            }}
          />
        )}
      </div>
    );
  };
  const dimensions = (
    <Section title="Dimensions" key="size">
      {axis('width', 'Largeur')}
      {axis('height', 'Hauteur')}
      <Toggle
        label="Verrouiller le ratio"
        short="Ratio"
        checked={!!size.lockRatio}
        onChange={(v) => set('size', 'lockRatio', v || undefined)}
      />
      <div className="ins-grid2">
        {(
          [
            ['minWidth', 'Largeur min', 'L min'],
            ['maxWidth', 'Largeur max', 'L max'],
            ['minHeight', 'Hauteur min', 'H min'],
            ['maxHeight', 'Hauteur max', 'H max'],
          ] as const
        ).map(([f, label, short]) => (
          <NumberField
            key={f}
            label={label}
            short={short}
            unit="px"
            min={0}
            placeholder="—"
            value={size[f] ?? undefined}
            hint={mark('size', f, label)}
            onChange={(v) => set('size', f, v ?? undefined)}
          />
        ))}
      </div>
    </Section>
  );

  // --- Mise en page : auto-layout, rognage ---
  if (container)
    sections.push(
      <LayoutSection key="layout" {...{ p, s, val, set, mark }}>
        {clip}
      </LayoutSection>,
    );

  sections.push(dimensions);

  // --- Typographie ---
  sections.push(
    <TextSection
      key="text"
      open={isText || type === 'field' || !!s.resolved.props.text}
      {...{ p, s, val, set, mark }}
    />,
  );

  sections.push(position);

  // --- Apparence : opacité, fusion, rayons ---
  sections.push(
    <RadiusSection key="radius" {...{ p, s, val, set, mark }}>
      {appearance}
    </RadiusSection>,
  );

  // --- Fonds, contour ---
  if (!isText)
    sections.push(<FillsSection key="fills" {...{ p, s, val, set, mark }} />);
  if (!isText)
    sections.push(<StrokeSection key="stroke" {...{ p, s, val, set, mark }} />);

  // --- Effets ---
  sections.push(<EffectsSection key="effects" {...{ p, s, val, set, mark }} />);

  // --- Interaction ---
  if (!state) sections.push(interactionSection(p, s, cursor));

  // --- Avancé : sémantique HTML ---
  if (!state && type !== 'field') sections.push(semanticsSection(p, s));

  const hidden = layer.visible === false;
  return (
    <div className="inspector">
      <div className="ins-head">
        <div className="ins-head-row">
          {s.target.kind === 'node' && !state && (
            <input
              aria-label="Nom du calque"
              value={s.node.name}
              maxLength={120}
              onChange={(e) => {
                if (!e.target.value.trim()) return;
                p.onNodes([
                  { ...structuredClone(s.node), name: e.target.value },
                ]);
                p.onRename(e.target.value);
              }}
            />
          )}
          <button
            type="button"
            className="icon-btn"
            aria-label="Visible"
            title={hidden ? 'Afficher' : 'Masquer'}
            aria-pressed={!hidden}
            onClick={() => set('layer', 'visible', hidden)}
          >
            {hidden ? <EyeSlash /> : <Eye />}
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Verrouillé"
            title={layer.locked ? 'Déverrouiller' : 'Verrouiller'}
            aria-pressed={!!layer.locked}
            onClick={() => set('layer', 'locked', !layer.locked)}
          >
            {layer.locked ? <Lock /> : <LockOpen />}
          </button>
        </div>
        <Select
          label="État"
          value={state ?? 'base'}
          options={STATES.filter(([v]) => v !== 'invalid' || type === 'field')}
          onChange={(v) => p.onState(v === 'base' ? null : (v as StateName))}
        />
        {state && (
          <p className="ins-note">
            Réglages de l’état « {STATES.find(([v]) => v === state)?.[1]} ».
          </p>
        )}
      </div>
      {sections}
    </div>
  );
}

interface SectionArgs {
  p: InspectorProps;
  s: Selected;
  val: <G extends keyof Props>(g: G) => NonNullable<Props[G]>;
  set: (group: keyof Props, field: string | null, value: unknown) => void;
  mark: (group: keyof Props, field: string | null, label: string) => ReactNode;
}

function LayoutSection({
  p,
  val,
  set,
  mark,
  children,
}: SectionArgs & { children?: ReactNode }) {
  const l = val('layout');
  const [perSide, setPerSide] = useState(() => {
    const pad = l.padding;
    return !!pad && new Set(sides.map((k) => JSON.stringify(pad[k]))).size > 1;
  });
  const on = l.mode === 'horizontal' || l.mode === 'vertical';
  const pad = l.padding ?? { top: zero, right: zero, bottom: zero, left: zero };
  const setPad = (patch: Partial<Record<(typeof sides)[number], Length>>) =>
    set('layout', 'padding', { ...pad, ...patch });
  const horizontal = l.mode === 'horizontal';
  // Grille 3 × 3 : colonnes = axe horizontal, lignes = axe vertical.
  const cells = ['start', 'center', 'end'] as const;
  const NAMES = {
    start: ['gauche', 'haut'],
    center: ['centre', 'milieu'],
    end: ['droite', 'bas'],
  };
  const cross =
    l.alignCross === 'stretch' || l.alignCross === 'baseline'
      ? 'start'
      : (l.alignCross ?? 'start');
  return (
    <Section
      title="Mise en page"
      badge={on ? 'Auto-layout' : undefined}
      actions={
        <button
          type="button"
          aria-label={on ? 'Retirer l’auto-layout' : 'Ajouter un auto-layout'}
          onClick={() => set('layout', 'mode', on ? 'none' : 'vertical')}
        >
          {on ? <Minus /> : <Plus />}
        </button>
      }
    >
      {on && (
        <>
          <Select
            label="Direction"
            value={l.wrap ? 'wrap' : l.mode}
            options={[
              ['horizontal', 'Horizontale →'],
              ['vertical', 'Verticale ↓'],
              ['wrap', 'Horizontale avec retour'],
            ]}
            hint={mark('layout', 'mode', 'Direction')}
            onChange={(v) =>
              set('layout', null, {
                ...l,
                mode: v === 'vertical' ? 'vertical' : 'horizontal',
                wrap: v === 'wrap' || undefined,
              })
            }
          />
          <LengthField
            label="Espacement"
            value={l.gap === 'auto' ? undefined : l.gap}
            tokens={p.tokens}
            keys={lengthTokenKeys}
            hint={mark('layout', 'gap', 'Espacement')}
            extra={{
              value: 'auto',
              label: 'Auto (répartir)',
              selected: l.gap === 'auto',
              pick: () => set('layout', 'gap', 'auto'),
            }}
            onChange={(v) => set('layout', 'gap', v)}
          />
          {l.wrap && (
            <LengthField
              label="Espacement des lignes"
              short="Lignes"
              value={l.rowGap}
              tokens={p.tokens}
              keys={lengthTokenKeys}
              onChange={(v) => set('layout', 'rowGap', v)}
            />
          )}
          <div className="ins-field">
            <span className="ins-label" aria-hidden="true">
              Alignement
            </span>
            <div className="ins-align" role="group" aria-label="Alignement">
              {cells.map((y) =>
                cells.map((x) => {
                  const main = horizontal ? x : y;
                  const crs = horizontal ? y : x;
                  const pressed =
                    (l.alignMain ?? 'start') === main && cross === crs;
                  return (
                    <button
                      key={`${x}-${y}`}
                      type="button"
                      aria-label={`Aligner ${NAMES[y][1]} ${NAMES[x][0]}`}
                      aria-pressed={pressed}
                      onClick={() =>
                        set('layout', null, {
                          ...l,
                          alignMain: main,
                          alignCross: crs,
                          ...(l.gap === 'auto' ? { gap: zero } : {}),
                        })
                      }
                    />
                  );
                }),
              )}
            </div>
          </div>
          <div className="ins-row">
            <Toggle
              label="Étirer les enfants"
              short="Étirer"
              checked={l.alignCross === 'stretch'}
              onChange={(v) =>
                set('layout', 'alignCross', v ? 'stretch' : 'start')
              }
            />
            {horizontal && (
              <Toggle
                label="Ligne de base"
                checked={l.alignCross === 'baseline'}
                onChange={(v) =>
                  set('layout', 'alignCross', v ? 'baseline' : 'start')
                }
              />
            )}
            <Toggle
              label="Premier au premier plan"
              short="Premier plan"
              checked={!!l.reverseZ}
              onChange={(v) => set('layout', 'reverseZ', v || undefined)}
            />
          </div>
          <div className="ins-row">
            <Toggle
              label="Marges par côté"
              short="Par côté"
              checked={perSide}
              onChange={setPerSide}
            />
          </div>
          {perSide ? (
            sides.map((k) => (
              <LengthField
                key={k}
                label={`Marge ${SIDE[k]}`}
                short={SIDE[k][0].toUpperCase() + SIDE[k].slice(1)}
                value={pad[k]}
                tokens={p.tokens}
                keys={lengthTokenKeys}
                onChange={(v) => setPad({ [k]: v ?? zero })}
              />
            ))
          ) : (
            <LengthField
              label="Marge intérieure"
              short="Marge"
              value={pad.top}
              tokens={p.tokens}
              keys={lengthTokenKeys}
              hint={mark('layout', 'padding', 'Marge intérieure')}
              onChange={(v) => {
                const x = v ?? zero;
                setPad({ top: x, right: x, bottom: x, left: x });
              }}
            />
          )}
        </>
      )}
      {children}
    </Section>
  );
}

/** Apparence : opacité et fusion du calque, puis rayons (hors texte). */
function RadiusSection({
  p,
  s,
  val,
  set,
  mark,
  children,
}: SectionArgs & { children: ReactNode }) {
  const r = val('radius');
  const isText = s.node.type === 'text';
  const [perCorner, setPerCorner] = useState(
    () => new Set(corners.map((c) => JSON.stringify(r[c] ?? zero))).size > 1,
  );
  const write = (patch: Partial<Record<(typeof corners)[number], Length>>) =>
    set('radius', null, {
      ...Object.fromEntries(corners.map((c) => [c, r[c] ?? zero])),
      ...(r.smoothing !== undefined ? { smoothing: r.smoothing } : {}),
      ...patch,
    });
  return (
    <Section title="Apparence" open={false}>
      {children}
      {!isText && (
        <>
          <Toggle
            label="Rayon par coin"
            short="Par coin"
            checked={perCorner}
            onChange={setPerCorner}
          />
          {perCorner ? (
            corners.map((c) => (
              <LengthField
                key={c}
                label={`Rayon ${CORNER[c]}`}
                short={CORNER[c][0].toUpperCase() + CORNER[c].slice(1)}
                value={r[c]}
                tokens={p.tokens}
                keys={lengthTokenKeys}
                onChange={(v) => write({ [c]: v ?? zero })}
              />
            ))
          ) : (
            <LengthField
              label="Rayon"
              value={r.topLeft}
              tokens={p.tokens}
              keys={lengthTokenKeys}
              hint={mark('radius', null, 'Rayon')}
              onChange={(v) => {
                const x = v ?? zero;
                write({
                  topLeft: x,
                  topRight: x,
                  bottomRight: x,
                  bottomLeft: x,
                });
              }}
            />
          )}
          <NumberField
            label="Lissage des coins"
            short="Lissage"
            unit="%"
            min={0}
            max={100}
            value={Math.round((r.smoothing ?? 0) * 100)}
            onChange={(v) =>
              set('radius', 'smoothing', v ? v / 100 : undefined)
            }
          />
          {!!r.smoothing && (
            <p className="ins-note">Visible dans Figma uniquement.</p>
          )}
        </>
      )}
    </Section>
  );
}

const solidOf = (token = 'color.surface'): Paint => ({
  type: 'solid',
  color: { token: token as never, opacity: 1 },
  visible: true,
});
function move<T>(list: T[], i: number, d: number) {
  const next = [...list];
  const j = i + d;
  if (j < 0 || j >= next.length) return next;
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
async function upload(file: File): Promise<string> {
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    r.readAsDataURL(file);
  });
  const { asset } = await request<{ asset: string }>('assets', {
    mediaType: file.type,
    data,
  });
  return asset;
}

function FillsSection({ p, s, val, set, mark }: SectionArgs) {
  const fills = (groupAt(s, 'fills', p.state) ?? []) as Paint[];
  const write = (next: Paint[]) => set('fills', null, next);
  const [error, setError] = useState('');
  void val;
  return (
    <Section
      title="Fond"
      open={false}
      actions={
        <>
          {mark('fills', null, 'Fond')}
          <button
            type="button"
            aria-label="Ajouter un fond"
            onClick={() => write([solidOf(), ...fills])}
          >
            <Plus />
          </button>
        </>
      }
    >
      {fills.map((f, i) => {
        const n = i + 1;
        const update = (patch: Partial<Paint>) =>
          write(
            fills.map((x, j) => (j === i ? ({ ...x, ...patch } as Paint) : x)),
          );
        return (
          <div className="ins-item" key={i} data-hidden={f.visible === false}>
            <div className="ins-item-head">
              <Select
                label={`Fond ${n} : type`}
                value={f.type}
                options={[
                  ['solid', 'Couleur'],
                  ['linear', 'Dégradé linéaire'],
                  ['radial', 'Dégradé radial'],
                  ['image', 'Image'],
                ]}
                onChange={(t) => {
                  const color =
                    f.type === 'solid'
                      ? f.color
                      : { token: 'color.brand' as const, opacity: 1 };
                  const stops = [
                    { position: 0, color },
                    {
                      position: 1,
                      color: { token: 'color.surface' as const, opacity: 1 },
                    },
                  ];
                  write(
                    fills.map((x, j) =>
                      j !== i
                        ? x
                        : t === 'solid'
                          ? { type: 'solid', color, visible: true }
                          : t === 'linear'
                            ? {
                                type: 'linear',
                                angle: 180,
                                stops,
                                opacity: 1,
                                visible: true,
                              }
                            : t === 'radial'
                              ? {
                                  type: 'radial',
                                  stops,
                                  opacity: 1,
                                  visible: true,
                                }
                              : x.type === 'image'
                                ? x
                                : x,
                    ),
                  );
                  if (t === 'image')
                    document.getElementById(`fill-file-${i}`)?.click();
                }}
              />
              <button
                type="button"
                aria-label={`Fond ${n} : ${f.visible === false ? 'afficher' : 'masquer'}`}
                onClick={() => update({ visible: f.visible === false })}
              >
                {f.visible === false ? <EyeSlash /> : <Eye />}
              </button>
              <button
                type="button"
                aria-label={`Fond ${n} : monter`}
                disabled={i === 0}
                onClick={() => write(move(fills, i, -1))}
              >
                <ArrowUp />
              </button>
              <button
                type="button"
                aria-label={`Fond ${n} : descendre`}
                disabled={i === fills.length - 1}
                onClick={() => write(move(fills, i, 1))}
              >
                <ArrowDown />
              </button>
              <button
                type="button"
                aria-label={`Fond ${n} : supprimer`}
                onClick={() => write(fills.filter((_, j) => j !== i))}
              >
                <Trash />
              </button>
            </div>
            {f.type === 'solid' && (
              <ColorField
                label={`Fond ${n}`}
                value={f.color}
                tokens={p.tokens}
                keys={colorTokenKeys}
                onChange={(c) => c && update({ color: c })}
              />
            )}
            {(f.type === 'linear' || f.type === 'radial') && (
              <>
                {f.type === 'linear' && (
                  <NumberField
                    label={`Fond ${n} : angle`}
                    unit="°"
                    min={-360}
                    max={360}
                    value={f.angle}
                    onChange={(v) => update({ angle: v ?? 0 })}
                  />
                )}
                {f.stops.map((stop, k) => (
                  <div className="ins-stop" key={k}>
                    <ColorField
                      label={`Fond ${n} : arrêt ${k + 1}`}
                      value={stop.color}
                      tokens={p.tokens}
                      keys={colorTokenKeys}
                      onChange={(c) =>
                        c &&
                        update({
                          stops: f.stops.map((x, j) =>
                            j === k ? { ...x, color: c } : x,
                          ),
                        })
                      }
                    />
                    <NumberField
                      label={`Fond ${n} : position ${k + 1}`}
                      unit="%"
                      min={0}
                      max={100}
                      value={Math.round(stop.position * 100)}
                      onChange={(v) =>
                        update({
                          stops: f.stops.map((x, j) =>
                            j === k ? { ...x, position: (v ?? 0) / 100 } : x,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
                {f.stops.length < 8 && (
                  <button
                    type="button"
                    onClick={() =>
                      update({
                        stops: [
                          ...f.stops,
                          { position: 1, color: f.stops.at(-1)!.color },
                        ],
                      })
                    }
                  >
                    Ajouter un arrêt
                  </button>
                )}
              </>
            )}
            {f.type === 'image' && (
              <>
                <p className="muted">Image : {f.asset}</p>
                <Select
                  label={`Fond ${n} : ajustement`}
                  value={f.fit}
                  options={[
                    ['fill', 'Remplir'],
                    ['fit', 'Contenir'],
                    ['tile', 'Mosaïque'],
                  ]}
                  onChange={(v) => update({ fit: v })}
                />
              </>
            )}
            {f.type !== 'solid' && (
              <NumberField
                label={`Fond ${n} : opacité`}
                unit="%"
                min={0}
                max={100}
                value={Math.round(f.opacity * 100)}
                onChange={(v) => update({ opacity: (v ?? 100) / 100 })}
              />
            )}
            {f.type === 'image' && f.opacity < 1 && (
              <p className="ins-note">
                L’opacité d’une image n’a pas d’équivalent CSS par couche :
                exportée vers Figma, non visible dans l’aperçu.
              </p>
            )}
            <input
              id={`fill-file-${i}`}
              type="file"
              hidden
              accept="image/png,image/jpeg,image/webp"
              aria-label={`Fond ${n} : fichier image`}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const asset = await upload(file);
                  setError('');
                  write(
                    fills.map((x, j) =>
                      j === i
                        ? {
                            type: 'image',
                            asset,
                            fit: 'fill',
                            opacity: 1,
                            visible: true,
                          }
                        : x,
                    ),
                  );
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            />
          </div>
        );
      })}
      {error && <p role="alert">{error}</p>}
    </Section>
  );
}

function StrokeSection({ p, s, set, mark }: SectionArgs) {
  const st = groupAt(s, 'stroke', p.state);
  const perSide = !!st && typeof st.weight === 'object';
  const w = st?.weight;
  const uniform =
    typeof w === 'number'
      ? w
      : w
        ? Math.max(w.top, w.right, w.bottom, w.left)
        : 1;
  return (
    <Section
      title="Contour"
      open={false}
      actions={
        <>
          {mark('stroke', null, 'Contour')}
          <button
            type="button"
            aria-label={st ? 'Retirer le contour' : 'Ajouter un contour'}
            onClick={() =>
              set(
                'stroke',
                null,
                st
                  ? null
                  : {
                      color: { token: 'color.border', opacity: 1 },
                      weight: 1,
                      style: 'solid',
                      align: 'inside',
                      visible: true,
                    },
              )
            }
          >
            {st ? <Minus /> : <Plus />}
          </button>
        </>
      }
    >
      {st && (
        <>
          <ColorField
            label="Contour"
            short="Couleur"
            value={st.color}
            tokens={p.tokens}
            keys={colorTokenKeys}
            onChange={(c) => c && set('stroke', 'color', c)}
          />
          <Toggle
            label="Épaisseur par côté"
            short="Par côté"
            checked={perSide}
            onChange={(v) =>
              set(
                'stroke',
                'weight',
                v
                  ? {
                      top: uniform,
                      right: uniform,
                      bottom: uniform,
                      left: uniform,
                    }
                  : uniform,
              )
            }
          />
          {perSide && typeof w === 'object' ? (
            <div className="ins-grid2">
              {sides.map((k) => (
                <NumberField
                  key={k}
                  label={`Épaisseur ${SIDE[k]}`}
                  short={SIDE[k][0].toUpperCase() + SIDE[k].slice(1)}
                  unit="px"
                  min={0}
                  max={64}
                  value={w[k]}
                  onChange={(v) =>
                    set('stroke', 'weight', { ...w, [k]: v ?? 0 })
                  }
                />
              ))}
            </div>
          ) : (
            <NumberField
              label="Épaisseur"
              unit="px"
              min={0}
              max={64}
              value={uniform}
              onChange={(v) => set('stroke', 'weight', v ?? 0)}
            />
          )}
          <div className="ins-grid2">
            <Select
              label="Style du contour"
              short="Style"
              value={st.style}
              options={[
                ['solid', 'Plein'],
                ['dashed', 'Tirets'],
                ['dotted', 'Pointillés'],
              ]}
              onChange={(v) => set('stroke', 'style', v)}
            />
            <Select
              label="Position du contour"
              short="Position"
              value={st.align}
              options={[
                ['inside', 'Intérieur'],
                ['center', 'Centre'],
                ['outside', 'Extérieur'],
              ]}
              onChange={(v) => set('stroke', 'align', v)}
            />
          </div>
          {perSide && st.align !== 'inside' && (
            <p className="ins-note">Aperçu : épaisseur max sur tout le tour.</p>
          )}
        </>
      )}
    </Section>
  );
}

function EffectsSection({ p, s, set, mark }: SectionArgs) {
  const effects = (groupAt(s, 'effects', p.state) ?? []) as Effect[];
  const write = (next: Effect[]) => set('effects', null, next);
  const shadow = (type: 'drop-shadow' | 'inner-shadow'): Effect => ({
    type,
    x: 0,
    y: 4,
    blur: 12,
    spread: 0,
    color: { hex: '#000000', opacity: 0.15 },
    visible: true,
  });
  return (
    <Section
      title="Effets"
      open={false}
      actions={
        <>
          {mark('effects', null, 'Effets')}
          <button
            type="button"
            aria-label="Ajouter un effet"
            onClick={() => write([...effects, shadow('drop-shadow')])}
          >
            <Plus />
          </button>
        </>
      }
    >
      {effects.map((e, i) => {
        const n = i + 1;
        const update = (patch: object) =>
          write(
            effects.map((x, j) =>
              j === i ? ({ ...x, ...patch } as Effect) : x,
            ),
          );
        return (
          <div className="ins-item" key={i} data-hidden={e.visible === false}>
            <div className="ins-item-head">
              <Select
                label={`Effet ${n} : type`}
                value={e.type}
                options={[
                  ['drop-shadow', 'Ombre portée'],
                  ['inner-shadow', 'Ombre intérieure'],
                  ['layer-blur', 'Flou du calque'],
                  ['background-blur', 'Flou d’arrière-plan'],
                ]}
                onChange={(t) =>
                  write(
                    effects.map((x, j) =>
                      j !== i
                        ? x
                        : t === 'drop-shadow' || t === 'inner-shadow'
                          ? 'x' in x
                            ? { ...x, type: t }
                            : shadow(t)
                          : {
                              type: t,
                              radius: 'radius' in x ? x.radius : 4,
                              visible: true,
                            },
                    ),
                  )
                }
              />
              <button
                type="button"
                aria-label={`Effet ${n} : ${e.visible === false ? 'afficher' : 'masquer'}`}
                onClick={() => update({ visible: e.visible === false })}
              >
                {e.visible === false ? <EyeSlash /> : <Eye />}
              </button>
              <button
                type="button"
                aria-label={`Effet ${n} : supprimer`}
                onClick={() => write(effects.filter((_, j) => j !== i))}
              >
                <Trash />
              </button>
            </div>
            {'x' in e ? (
              <>
                <div className="ins-grid2">
                  {(['x', 'y', 'blur', 'spread'] as const).map((k) => (
                    <NumberField
                      key={k}
                      label={`Effet ${n} : ${{ x: 'x', y: 'y', blur: 'flou', spread: 'étendue' }[k]}`}
                      unit="px"
                      min={k === 'blur' ? 0 : -500}
                      max={500}
                      value={e[k]}
                      onChange={(v) => update({ [k]: v ?? 0 })}
                    />
                  ))}
                </div>
                <ColorField
                  label={`Effet ${n} : couleur`}
                  value={e.color}
                  tokens={p.tokens}
                  keys={colorTokenKeys}
                  onChange={(c) => c && update({ color: c })}
                />
              </>
            ) : (
              <NumberField
                label={`Effet ${n} : rayon`}
                unit="px"
                min={0}
                max={250}
                value={e.radius}
                onChange={(v) => update({ radius: v ?? 0 })}
              />
            )}
          </div>
        );
      })}
    </Section>
  );
}

function TextSection({
  p,
  s,
  val,
  set,
  mark,
  open,
}: SectionArgs & { open: boolean }) {
  const t = val('text');
  const isText = s.node.type === 'text';
  const lh = t.lineHeight;
  return (
    <Section
      title="Typographie"
      badge={isText ? undefined : 'Héritée'}
      open={open}
    >
      <Select
        label="Police"
        value={
          !t.family ? undefined : 'token' in t.family ? 'token' : t.family.value
        }
        options={[
          ['token', 'font.family (token)'],
          ...fontFamilies.map((f) => [f, f] as const),
        ]}
        hint={mark('text', 'family', 'Police')}
        onChange={(v) =>
          set(
            'text',
            'family',
            v === 'token' ? { token: 'font.family' } : { value: v },
          )
        }
      />
      <div className="ins-grid2">
        <Select
          label="Graisse"
          value={t.weight ? String(t.weight) : undefined}
          options={[100, 200, 300, 400, 500, 600, 650, 700, 800, 900].map(
            (w) => [String(w), String(w)] as const,
          )}
          hint={mark('text', 'weight', 'Graisse')}
          onChange={(v) => set('text', 'weight', Number(v))}
        />
        <LengthField
          label="Taille du texte"
          short="Taille"
          value={t.size}
          tokens={p.tokens}
          keys={fontSizeTokenKeys}
          max={200}
          hint={mark('text', 'size', 'Taille du texte')}
          onChange={(v) => set('text', 'size', v)}
        />
      </div>
      <ColorField
        label="Couleur du texte"
        short="Couleur"
        value={t.color}
        tokens={p.tokens}
        keys={colorTokenKeys}
        hint={mark('text', 'color', 'Couleur du texte')}
        onChange={(c) => set('text', 'color', c)}
      />
      <div className="ins-grid2">
        <Select
          label="Interlignage"
          value={!lh ? 'auto' : 'ratio' in lh ? 'ratio' : 'px'}
          options={[
            ['auto', 'Auto'],
            ['ratio', 'Multiple'],
            ['px', 'Pixels'],
          ]}
          onChange={(v) =>
            set(
              'text',
              'lineHeight',
              v === 'auto'
                ? undefined
                : v === 'ratio'
                  ? { ratio: 1.5 }
                  : { px: 24 },
            )
          }
        />
        {lh && (
          <NumberField
            label="Interlignage : valeur"
            short="Valeur"
            step={'ratio' in lh ? 0.05 : 1}
            min={0}
            max={400}
            unit={'ratio' in lh ? '×' : 'px'}
            value={'ratio' in lh ? lh.ratio : lh.px}
            onChange={(v) =>
              set(
                'text',
                'lineHeight',
                'ratio' in lh ? { ratio: v ?? 1 } : { px: v ?? 0 },
              )
            }
          />
        )}
      </div>
      <NumberField
        label="Espacement des lettres"
        short="Lettres"
        unit="px"
        step={0.1}
        min={-20}
        max={40}
        value={t.letterSpacing ?? 0}
        hint={mark('text', 'letterSpacing', 'Espacement des lettres')}
        onChange={(v) => set('text', 'letterSpacing', v || undefined)}
      />
      <div className="ins-grid2">
        <Select
          label="Alignement horizontal"
          short="Horizontal"
          value={t.align ?? 'left'}
          options={[
            ['left', 'Gauche'],
            ['center', 'Centre'],
            ['right', 'Droite'],
            ['justify', 'Justifié'],
          ]}
          onChange={(v) => set('text', 'align', v)}
        />
        {isText && (
          <Select
            label="Alignement vertical"
            short="Vertical"
            value={t.valign ?? 'top'}
            options={[
              ['top', 'Haut'],
              ['center', 'Milieu'],
              ['bottom', 'Bas'],
            ]}
            onChange={(v) => set('text', 'valign', v)}
          />
        )}
      </div>
      <div className="ins-grid2">
        <Select
          label="Casse"
          value={t.case ?? 'none'}
          options={[
            ['none', 'Telle quelle'],
            ['upper', 'MAJUSCULES'],
            ['lower', 'minuscules'],
            ['title', 'Première Lettre'],
          ]}
          onChange={(v) => set('text', 'case', v)}
        />
        <Select
          label="Décoration"
          value={t.decoration ?? 'none'}
          options={[
            ['none', 'Aucune'],
            ['underline', 'Souligné'],
            ['strike', 'Barré'],
          ]}
          onChange={(v) => set('text', 'decoration', v)}
        />
      </div>
      {isText && (
        <>
          <Select
            label="Redimensionnement du texte"
            short="Ajustement"
            value={t.resize ?? 'auto-height'}
            options={[
              ['auto-width', 'Largeur auto'],
              ['auto-height', 'Hauteur auto'],
              ['fixed', 'Taille fixe'],
            ]}
            onChange={(v) => set('text', 'resize', v)}
          />
          <div className="ins-grid2">
            <NumberField
              label="Lignes max"
              min={1}
              max={50}
              placeholder="—"
              value={t.maxLines ?? undefined}
              onChange={(v) =>
                set('text', 'maxLines', v ? Math.round(v) : undefined)
              }
            />
            <Toggle
              label="Tronquer (…)"
              short="Tronquer"
              checked={!!t.truncate}
              onChange={(v) => set('text', 'truncate', v || undefined)}
            />
          </div>
        </>
      )}
    </Section>
  );
}

// Composant source d'une instance et options de variante de son set.
function variantOptions(doc: Doc, component: DocNode | undefined) {
  const set = component?.parent ? doc.nodes[component.parent] : undefined;
  if (!set || set.type !== 'component-set') return {};
  const out: Record<string, string[]> = {};
  for (const id of set.children)
    for (const [k, v] of Object.entries(doc.nodes[id]?.variant ?? {}))
      if (!(out[k] ??= []).includes(v)) out[k].push(v);
  return out;
}

const componentLabel = (doc: Doc, c: DocNode) => {
  const set = c.parent ? doc.nodes[c.parent] : undefined;
  return set?.type === 'component-set'
    ? `${set.name} · ${Object.values(c.variant ?? {}).join(', ')}`
    : c.name;
};
function instanceSection(p: InspectorProps, s: Selected) {
  const { doc } = p;
  const source = s.node.componentId ? doc.nodes[s.node.componentId] : undefined;
  const shown = doc.nodes[s.resolved.marks['data-ds-id']];
  const options = variantOptions(doc, source);
  const count = overrideCount(s);
  const props = Object.entries(shown?.componentProps ?? {});
  const components = Object.values(doc.nodes).filter(
    (n) => n.type === 'component',
  );
  const setValue = (name: string, v: string | boolean) =>
    p.onNodes([
      {
        ...structuredClone(s.node),
        propValues: { ...s.node.propValues, [name]: v },
      },
    ]);
  return (
    <Section title="Instance" key="instance">
      <p className="muted">
        Composant : {shown ? componentLabel(doc, shown) : source?.name}
      </p>
      {Object.entries(options).map(([prop, values]) => (
        <Select
          key={prop}
          label={prop}
          value={shown?.variant?.[prop]}
          options={values.map((v) => [v, v] as const)}
          onChange={(v) =>
            p.onNodes(
              setFacet(doc, s.key, 'variant', { ...s.own.variant, [prop]: v }),
            )
          }
        />
      ))}
      {s.target.kind === 'node' &&
        props.map(([name, def]) =>
          def.type === 'boolean' ? (
            <Toggle
              key={name}
              label={name}
              checked={(s.node.propValues?.[name] ?? def.default) === true}
              onChange={(v) => setValue(name, v)}
            />
          ) : def.type === 'text' ? (
            <label className="ins-field" key={name}>
              <span className="ins-label">Propriété « {name} »</span>
              <input
                aria-label={`Propriété ${name}`}
                value={String(s.node.propValues?.[name] ?? def.default)}
                maxLength={200}
                onChange={(e) => setValue(name, e.target.value)}
              />
            </label>
          ) : (
            <Select
              key={name}
              label={`Propriété ${name}`}
              value={String(s.node.propValues?.[name] ?? def.default)}
              options={components.map(
                (c) => [c.id, componentLabel(doc, c)] as const,
              )}
              onChange={(v) => setValue(name, v)}
            />
          ),
        )}
      <div className="override-bar" role="status">
        {count ? (
          <span className="override-badge">
            {count} override{count > 1 ? 's' : ''}
          </span>
        ) : (
          <span className="muted">Identique au composant</span>
        )}
        <button
          type="button"
          disabled={!count}
          onClick={() => p.onNodes(resetOverrides(doc, s.key))}
        >
          Réinitialiser
        </button>
        <button
          type="button"
          className="studio-primary"
          disabled={!count}
          onClick={p.onApply}
        >
          Appliquer au composant
        </button>
      </div>
      {s.target.kind === 'node' && (
        <button type="button" onClick={() => p.onCommand('detach')}>
          Détacher l’instance
        </button>
      )}
    </Section>
  );
}

// Composant maître : variante (valeurs éditables), propriétés exposées et
// création d'une propriété liée à un calque interne.
function ComponentSection({ p, s }: { p: InspectorProps; s: Selected }) {
  const { doc } = p;
  const node = s.node;
  const props = Object.entries(node.componentProps ?? {});
  const layers = descendantsOf(doc, node.id);
  const [type, setType] = useState<PropType>('text');
  const [layer, setLayer] = useState('');
  const [name, setName] = useState('');
  const write = (patch: Partial<DocNode>) =>
    p.onNodes([{ ...structuredClone(node), ...patch }]);
  const candidates = layers.filter((l) =>
    type === 'text'
      ? l.type === 'text'
      : type === 'instance-swap'
        ? l.type === 'instance'
        : true,
  );
  return (
    <Section title="Composant" badge="Maître">
      <p className="ins-note">Se propage aux instances.</p>
      {node.variant &&
        Object.entries(node.variant).map(([k, v]) => (
          <label className="ins-field" key={k}>
            <span className="ins-label">Variante · {k}</span>
            <input
              aria-label={`Valeur de variante ${k}`}
              value={v}
              maxLength={60}
              onChange={(e) =>
                e.target.value.trim() &&
                write({ variant: { ...node.variant, [k]: e.target.value } })
              }
            />
          </label>
        ))}
      <button type="button" onClick={() => p.onCommand('variant')}>
        Ajouter une variante
      </button>
      {props.map(([key, def]) => (
        <div className="ins-item" key={key}>
          <div className="ins-item-head">
            <span className="ins-label">
              {key} ·{' '}
              {def.type === 'text'
                ? 'texte'
                : def.type === 'boolean'
                  ? 'booléen'
                  : 'échange d’instance'}
            </span>
            <button
              type="button"
              aria-label={`Supprimer la propriété ${key}`}
              onClick={() => {
                const { [key]: _, ...rest } = node.componentProps ?? {};
                // Les calques liés à cette propriété sont déliés.
                const unbound = layers
                  .filter((l) => Object.values(l.bind ?? {}).includes(key))
                  .map((l) => {
                    const n = structuredClone(l);
                    n.bind = Object.fromEntries(
                      Object.entries(n.bind ?? {}).filter(([, v]) => v !== key),
                    );
                    if (!Object.keys(n.bind).length) delete n.bind;
                    return n;
                  });
                p.onNodes([
                  { ...structuredClone(node), componentProps: rest },
                  ...unbound,
                ]);
              }}
            >
              <Trash />
            </button>
          </div>
          {def.type === 'text' && (
            <input
              aria-label={`Propriété ${key} par défaut`}
              value={def.default}
              maxLength={200}
              onChange={(e) =>
                write({
                  componentProps: {
                    ...node.componentProps,
                    [key]: { ...def, default: e.target.value },
                  },
                })
              }
            />
          )}
          {def.type === 'boolean' && (
            <Toggle
              label="Visible par défaut"
              checked={def.default}
              onChange={(v) =>
                write({
                  componentProps: {
                    ...node.componentProps,
                    [key]: { ...def, default: v },
                  },
                })
              }
            />
          )}
        </div>
      ))}
      <div className="ins-item">
        <span className="list-item-title">Nouvelle propriété</span>
        <Select
          label="Type de propriété"
          short="Type"
          value={type}
          options={[
            ['text', 'Texte'],
            ['boolean', 'Booléen'],
            ['instance-swap', 'Échange d’instance'],
          ]}
          onChange={(v) => {
            setType(v);
            setLayer('');
          }}
        />
        <Select
          label="Calque lié"
          short="Calque"
          value={layer || undefined}
          options={candidates.map((l) => [l.id, l.name] as const)}
          onChange={setLayer}
        />
        <label className="ins-field">
          <span className="ins-label">Nom</span>
          <input
            aria-label="Nom de la propriété"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={!layer || !name.trim()}
          onClick={() => {
            const changes = addComponentProp(doc, node.id, layer, type, name);
            p.onNodes(changes.flatMap((c) => (c.after ? [c.after] : [])));
            setName('');
          }}
        >
          <Plus />
          Ajouter
        </button>
      </div>
    </Section>
  );
}
function descendantsOf(doc: Doc, id: string): DocNode[] {
  const out: DocNode[] = [];
  const walk = (n: string) => {
    for (const c of doc.nodes[n]?.children ?? []) {
      out.push(doc.nodes[c]);
      // Le contenu d'une instance imbriquée se règle dans son composant.
      if (doc.nodes[c]?.type !== 'instance') walk(c);
    }
  };
  walk(id);
  return out.filter(Boolean);
}

function setSection(p: InspectorProps, s: Selected) {
  const options = variantOptions(p.doc, p.doc.nodes[s.node.children[0]]);
  return (
    <Section title="Variantes" key="set">
      <p className="muted">{s.node.children.length} variante(s)</p>
      {Object.entries(options).map(([prop, values]) => (
        <label className="ins-field" key={prop}>
          <span className="ins-label">
            Propriété de variante ({values.join(', ')})
          </span>
          <input
            aria-label={`Propriété de variante ${prop}`}
            defaultValue={prop}
            maxLength={60}
            onBlur={(e) => {
              const changes = renameVariantProp(
                p.doc,
                s.node.id,
                prop,
                e.target.value.trim(),
              );
              p.onNodes(changes.flatMap((c) => (c.after ? [c.after] : [])));
            }}
          />
        </label>
      ))}
    </Section>
  );
}

function interactionSection(p: InspectorProps, s: Selected, cursor: ReactNode) {
  const { doc } = p;
  const list: Interaction[] = s.resolved.interactions;
  const write = (next: Interaction[]) =>
    p.onNodes(setFacet(doc, s.key, 'interactions', next));
  // Variantes du composant englobant (composant interactif).
  const owner = componentOf(doc, s.node.id);
  const ownerVariants = variantOptions(doc, owner ?? undefined);
  const screens = doc.screens.map(
    (id) => [id, doc.nodes[id]?.name ?? screenSlug(id)] as const,
  );
  const blank: Interaction = {
    trigger: 'click',
    action: { type: 'navigate', screen: doc.screens[0] },
  };
  return (
    <Section
      title="Interaction"
      key="interaction"
      open={false}
      actions={
        <button
          type="button"
          aria-label="Ajouter une interaction"
          onClick={() => write([...list, blank])}
        >
          <Plus />
        </button>
      }
    >
      {cursor}
      {list.map((it, i) => {
        const n = i + 1;
        const update = (next: Interaction) =>
          write(list.map((x, j) => (j === i ? next : x)));
        const a = it.action;
        const firstProp = Object.keys(ownerVariants)[0];
        return (
          <div className="ins-item" key={i}>
            <div className="ins-item-head">
              <Select
                label={`Interaction ${n} : déclencheur`}
                value={it.trigger}
                options={[
                  ['click', 'Au clic'],
                  ['submit', 'À l’envoi du formulaire'],
                ]}
                onChange={(t) => update({ ...it, trigger: t })}
              />
              <button
                type="button"
                aria-label={`Interaction ${n} : supprimer`}
                onClick={() => write(list.filter((_, j) => j !== i))}
              >
                <Trash />
              </button>
            </div>
            <Select
              label={`Interaction ${n} : action`}
              value={a.type}
              options={[
                ['navigate', 'Aller à l’écran'],
                ['back', 'Retour'],
                ...(firstProp
                  ? ([['change-to', 'Changer de variante']] as const)
                  : []),
              ]}
              onChange={(t) =>
                update({
                  ...it,
                  action:
                    t === 'navigate'
                      ? { type: 'navigate', screen: doc.screens[0] }
                      : t === 'back'
                        ? { type: 'back' }
                        : {
                            type: 'change-to',
                            variant: {
                              [firstProp]: ownerVariants[firstProp][0],
                            },
                          },
                })
              }
            />
            {a.type === 'navigate' && (
              <Select
                label="Cible de navigation"
                value={a.screen}
                options={screens}
                onChange={(screen) =>
                  update({ ...it, action: { type: 'navigate', screen } })
                }
              />
            )}
            {a.type === 'change-to' &&
              Object.entries(ownerVariants).map(([prop, values]) => (
                <Select
                  key={prop}
                  label={`Variante cible : ${prop}`}
                  value={a.variant[prop]}
                  options={values.map((v) => [v, v] as const)}
                  onChange={(v) =>
                    update({
                      ...it,
                      action: {
                        type: 'change-to',
                        variant: { ...a.variant, [prop]: v },
                      },
                    })
                  }
                />
              ))}
          </div>
        );
      })}
      {s.inInstance && s.own.interactions !== undefined && (
        <button
          type="button"
          onClick={() =>
            p.onNodes(setFacet(doc, s.key, 'interactions', undefined))
          }
        >
          Revenir aux interactions du composant
        </button>
      )}
    </Section>
  );
}

function semanticsSection(p: InspectorProps, s: Selected) {
  const sem = s.resolved.semantics;
  const write = (patch: object) =>
    p.onNodes(
      setFacet(p.doc, s.key, 'semantics', { ...s.own.semantics, ...patch }),
    );
  return (
    <Section title="Avancé" key="semantics" open={false} badge="HTML">
      <Select
        label="Balise"
        value={sem.tag ?? (s.node.type === 'text' ? 'span' : 'div')}
        options={tags.map((t) => [t, t] as const)}
        onChange={(tag) => write({ tag })}
      />
      <label className="ins-field">
        <span className="ins-label">Libellé</span>
        <input
          aria-label="Libellé accessible"
          value={sem.ariaLabel ?? ''}
          maxLength={200}
          onChange={(e) => write({ ariaLabel: e.target.value || undefined })}
        />
      </label>
      {sem.tag === 'button' && (
        <Select
          label="Type de bouton"
          short="Type"
          value={sem.buttonType ?? 'button'}
          options={[
            ['button', 'Bouton'],
            ['submit', 'Envoi de formulaire'],
          ]}
          onChange={(buttonType) => write({ buttonType })}
        />
      )}
    </Section>
  );
}
