import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { tokenCss, tokenKeys, type Tokens } from '../shared/model.js';
import type { DSComponent } from '../shared/component.js';
import { screenOf, screenSlug, type Doc } from '../shared/doc.js';
import { componentDoc } from '../shared/migrate.js';
import type { Runtime } from '../shared/render.js';
import { NodeTree, type PreviewState } from './NodeView.js';

// Tout ce qui est rendu (catalogue, aperçu, export) vient du document de
// nœuds, par une seule traduction nœud → CSS (shared/nodeCss.ts).
export function DSProvider({
  tokens,
  children,
}: {
  tokens: Tokens;
  children: ReactNode;
}) {
  return (
    <div className="ds" style={tokenCss(tokens) as CSSProperties}>
      {children}
    </div>
  );
}
// Composant créé à la main : converti en nœuds, rendu comme les autres.
export function ComponentView({ component }: { component: DSComponent }) {
  const doc = useMemo(() => componentDoc(component), [component]);
  return <NodeTree doc={doc} root={`custom/${component.id}`} />;
}
// Tokens du DS affichés pour être sélectionnés (vue DS seulement, jamais exportés).
function TokenBoard({ tokens }: { tokens: Tokens }) {
  const group = (prefix: string) =>
    tokenKeys.filter((k) => k.startsWith(prefix));
  return (
    <div className="token-board">
      <div className="token-swatches">
        {group('color.').map((k) => (
          <div
            key={k}
            className="token-item"
            data-ds-token={k}
            data-ds-name={k}
          >
            <span
              className="token-chip"
              style={{ background: String(tokens[k].$value) }}
            />
            <small>{k.slice(6)}</small>
          </div>
        ))}
      </div>
      <div className="token-rows">
        {group('font.').map((k) => (
          <div
            key={k}
            className="token-item"
            data-ds-token={k}
            data-ds-name={k}
          >
            <span
              style={
                k === 'font.family'
                  ? { fontFamily: String(tokens[k].$value) }
                  : { fontSize: `${tokens[k].$value}px` }
              }
            >
              Aa
            </span>
            <small>
              {k} · {tokens[k].$value}
              {tokens[k].$type === 'dimension' ? ' px' : ''}
            </small>
          </div>
        ))}
        {[...group('space.'), ...group('radius.')].map((k) => (
          <div
            key={k}
            className="token-item"
            data-ds-token={k}
            data-ds-name={k}
          >
            {k.startsWith('space.') ? (
              <span
                className="token-space"
                style={{ width: `${tokens[k].$value}px` }}
              />
            ) : (
              <span
                className="token-radius"
                style={{ borderRadius: `${tokens[k].$value}px` }}
              />
            )}
            <small>
              {k} · {tokens[k].$value} px
            </small>
          </div>
        ))}
      </div>
    </div>
  );
}
export function Catalogue({
  tokens,
  doc,
  preview,
}: {
  tokens: Tokens;
  doc: Doc;
  preview?: PreviewState | null;
}) {
  return (
    <DSProvider tokens={tokens}>
      <div className="catalogue">
        <section>
          <div className="section-label">00 / TOKENS</div>
          <TokenBoard tokens={tokens} />
        </section>
        <NodeTree doc={doc} root={doc.components} preview={preview} />
      </div>
    </DSProvider>
  );
}
// Écrans de l'aperçu : « scenario » est l'écran de départ. En mode Test, les
// interactions naviguent et changent les variantes (état propre à l'onglet).
export function Scenario({
  tokens,
  doc,
  scenario,
  preview,
}: {
  tokens: Tokens;
  doc: Doc;
  scenario: string;
  preview?: PreviewState | null;
}) {
  const [trail, setTrail] = useState<string[]>([screenOf(doc, scenario)]);
  const [runtime, setRuntime] = useState<Runtime>({});
  const screen = trail.at(-1)!;
  const behaviour = useMemo(
    () => ({
      runtime,
      setVariant: (key: string, v: Record<string, string>) =>
        setRuntime((r) => ({ ...r, [key]: { ...r[key], ...v } })),
      navigate: (id: string) => doc.nodes[id] && setTrail((t) => [...t, id]),
      back: () => setTrail((t) => (t.length > 1 ? t.slice(0, -1) : t)),
    }),
    [runtime, doc],
  );
  return (
    <DSProvider tokens={tokens}>
      <div className="scenario" data-screen={screenSlug(screen)}>
        <NodeTree
          doc={doc}
          root={screen}
          behaviour={behaviour}
          preview={preview}
        />
      </div>
    </DSProvider>
  );
}
// Planche d'export Figma : chaque composant du document isolé, puis les
// composants créés à la main.
export function ExportSheet({ tokens, doc }: { tokens: Tokens; doc: Doc }) {
  const ids = Object.values(doc.nodes)
    .filter((n) => n.type === 'component')
    .map((n) => n.id);
  return (
    <DSProvider tokens={tokens}>
      <div className="export-sheet">
        {ids.map((id) => (
          <div className="export-item" key={id}>
            <NodeTree doc={doc} root={id} />
          </div>
        ))}
      </div>
    </DSProvider>
  );
}
