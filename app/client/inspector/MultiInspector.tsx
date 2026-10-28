import {
  colorTokenKeys,
  fontSizeTokenKeys,
  lengthTokenKeys,
} from '../../shared/component.js';
import { common, MIXED } from '../../shared/canvas.js';
import type { Doc, DocNode, Props, StateName } from '../../shared/doc.js';
import {
  groupAt,
  select,
  setPropMany,
  type Selected,
} from '../../shared/edit.js';
import type { Tokens } from '../../shared/model.js';
import {
  ColorField,
  LengthField,
  NumberField,
  Section,
  Select,
  Toggle,
} from './fields.js';

// Inspecteur d'une multi-sélection : les réglages communs à tous les
// calques. Une valeur différente d'un calque à l'autre s'affiche « Mixte » ;
// la modifier l'écrit sur tous, en un seul geste.
const CONTAINERS: DocNode['type'][] = [
  'frame',
  'component',
  'component-set',
  'instance',
  'page',
];
type Axis = NonNullable<NonNullable<Props['size']>['width']>;

export function MultiInspector({
  doc,
  keys,
  tokens,
  state,
  onNodes,
}: {
  doc: Doc;
  keys: string[];
  tokens: Tokens;
  state: StateName | null;
  onNodes: (nodes: DocNode[]) => void;
}) {
  const all = keys.map((k) => select(doc, k)).filter((s): s is Selected => !!s);
  if (!all.length) return <p className="muted">Éléments introuvables.</p>;
  const set = (
    group: keyof Props,
    field: string | null,
    value: Parameters<typeof setPropMany>[5],
  ) => onNodes(setPropMany(doc, keys, state, group, field, value));
  // Valeur commune d'un champ, ou MIXED.
  const pick = <T,>(read: (s: Selected) => T) => common(all.map(read));
  const g = <G extends keyof Props>(s: Selected, group: G) =>
    (groupAt(s, group, state) ?? {}) as NonNullable<Props[G]>;
  const num = (v: number | typeof MIXED | undefined) => ({
    value: v === MIXED ? undefined : v,
    mixed: v === MIXED,
  });
  const val = <T,>(v: T | typeof MIXED) => ({
    value: v === MIXED ? undefined : v,
    mixed: v === MIXED,
  });

  const visible = pick((s) => g(s, 'layer').visible !== false);
  const opacity = pick((s) => Math.round((g(s, 'layer').opacity ?? 1) * 100));
  const absolute = all.every((s) => g(s, 'position').mode === 'absolute');
  const containers = all.every((s) => CONTAINERS.includes(s.node.type));
  const texts = all.every(
    (s) => s.node.type === 'text' || s.resolved.props.text,
  );
  const axis = (s: Selected, a: 'width' | 'height'): Axis | undefined =>
    g(s, 'size')[a];
  const sizeField = (a: 'width' | 'height', label: string) => {
    const mode = pick((s) => axis(s, a)?.mode ?? 'auto');
    const px = pick((s) => {
      const v = axis(s, a);
      return v?.mode === 'fixed' ? v.px : undefined;
    });
    return (
      <div className="ins-grid2" key={a}>
        <Select
          label={label}
          {...val(mode)}
          options={[
            ['auto', 'Auto'],
            ['hug', 'Ajuster'],
            ['fill', 'Remplir'],
            ['fixed', 'Fixe'],
          ]}
          onChange={(m) =>
            set('size', a, (s: Selected) =>
              m === 'auto'
                ? undefined
                : m === 'fixed'
                  ? (() => {
                      const v = axis(s, a);
                      return {
                        mode: 'fixed',
                        px: v?.mode === 'fixed' ? v.px : 100,
                      };
                    })()
                  : { mode: m },
            )
          }
        />
        <NumberField
          label={`${label} fixe`}
          unit="px"
          min={0}
          {...num(px)}
          disabled={mode !== 'fixed'}
          onChange={(v) =>
            v !== undefined && set('size', a, { mode: 'fixed', px: v })
          }
        />
      </div>
    );
  };
  const fills = (s: Selected) =>
    (groupAt(s, 'fills', state) ?? []) as NonNullable<Props['fills']>;
  const firstSolid = (s: Selected) => {
    const f = fills(s)[0];
    return f?.type === 'solid' ? f.color : undefined;
  };

  return (
    <div className="inspector" aria-label="Multi-sélection">
      <p className="token-hint">
        {all.length} calques · « Mixte » : valeurs différentes.
      </p>
      <Section title="Calque">
        <div className="ins-row">
          <Toggle
            label="Visible"
            mixed={visible === MIXED}
            checked={visible === true}
            onChange={(v) => set('layer', 'visible', v)}
          />
        </div>
      </Section>
      {containers && (
        <Section title="Mise en page">
          <LengthField
            label="Espacement"
            {...val(
              pick((s) => {
                const gap = g(s, 'layout').gap;
                return gap === 'auto' ? undefined : gap;
              }),
            )}
            tokens={tokens}
            keys={lengthTokenKeys}
            onChange={(v) => set('layout', 'gap', v)}
          />
        </Section>
      )}
      <Section title="Dimensions">
        {sizeField('width', 'Largeur')}
        {sizeField('height', 'Hauteur')}
      </Section>
      {texts && (
        <Section title="Typographie">
          <LengthField
            label="Taille du texte"
            {...val(pick((s) => g(s, 'text').size))}
            tokens={tokens}
            keys={fontSizeTokenKeys}
            max={200}
            onChange={(v) => set('text', 'size', v)}
          />
          <ColorField
            label="Couleur du texte"
            {...val(pick((s) => g(s, 'text').color))}
            tokens={tokens}
            keys={colorTokenKeys}
            onChange={(c) => c && set('text', 'color', c)}
          />
        </Section>
      )}
      {absolute && (
        <Section title="Position">
          <div className="ins-grid2">
            {(['x', 'y'] as const).map((k) => (
              <NumberField
                key={k}
                label={k.toUpperCase()}
                unit="px"
                {...num(pick((s) => g(s, 'position')[k] ?? 0))}
                onChange={(v) => v !== undefined && set('position', k, v)}
              />
            ))}
          </div>
        </Section>
      )}
      <Section title="Apparence">
        <NumberField
          label="Opacité"
          unit="%"
          min={0}
          max={100}
          {...num(opacity)}
          onChange={(v) => v !== undefined && set('layer', 'opacity', v / 100)}
        />
        <LengthField
          label="Rayon"
          {...val(pick((s) => g(s, 'radius').topLeft))}
          tokens={tokens}
          keys={lengthTokenKeys}
          onChange={(v) => {
            const x = v ?? { px: 0 };
            set('radius', null, (s: Selected) => ({
              ...g(s, 'radius'),
              topLeft: x,
              topRight: x,
              bottomRight: x,
              bottomLeft: x,
            }));
          }}
        />
      </Section>
      <Section title="Fond">
        <ColorField
          label="Fond"
          {...val(pick(firstSolid))}
          tokens={tokens}
          keys={colorTokenKeys}
          onChange={(c) =>
            c &&
            set('fills', null, (s: Selected) => {
              const [first, ...rest] = fills(s);
              return first?.type === 'solid'
                ? [{ ...first, color: c }, ...rest]
                : [{ type: 'solid', color: c }, ...fills(s)];
            })
          }
        />
      </Section>
    </div>
  );
}
