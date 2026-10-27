import { useEffect, useState } from 'react';
import {
  tokenKeys,
  type Proposal,
  type TokenKey,
  type Tokens,
} from '../shared/model.js';
import { compatible, type ImportItem } from '../shared/figma.js';
import { request } from './api.js';
import { captureScreen } from './figmaExport.js';

interface FigmaInfo {
  pairCode: string;
  server: string;
  import: null | {
    date: string;
    fileName: string;
    items: ImportItem[];
    images: { id: string; name: string; width: number; height: number }[];
  };
  export: null | { date: string; screens: string[] };
}
const SCENARIOS = [
  { id: 'cards', label: 'Découvrir' },
  { id: 'form', label: 'Inscription' },
];
const WIDTHS = [375, 1024];
const when = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

export default function FigmaPanel({
  tokens,
  revision,
  onProposal,
}: {
  tokens: Tokens;
  revision: number;
  onProposal: (p: Proposal) => void;
}) {
  const [info, setInfo] = useState<FigmaInfo>();
  const [mapping, setMapping] = useState<(TokenKey | '')[]>([]);
  const [widths, setWidths] = useState<number[]>([375]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function load() {
    try {
      const next = await request<FigmaInfo>('figma');
      setInfo(next);
      setMapping(next.import?.items.map((i) => i.suggested ?? '') ?? []);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  const items = info?.import?.items ?? [];
  const changes = items
    .map((item, i) => ({ key: mapping[i], value: item.value }))
    .filter((c): c is { key: TokenKey; value: string | number } => !!c.key)
    .filter((c) => tokens[c.key].$value !== c.value);
  const duplicate = changes.find(
    (c, i) => changes.findIndex((d) => d.key === c.key) !== i,
  );

  return (
    <details className="project-brief figma-panel">
      <summary>Figma · import / export</summary>
      <p>
        Le plugin <strong>DS-Studio Bridge</strong> fait le lien. Il n’agit que
        lorsque vous le lancez dans Figma, et rien n’est appliqué ici sans le
        diff.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {info && (
        <>
          <h4>1 · Appairage</h4>
          <p>
            Collez ce code dans le plugin (une seule fois) :{' '}
            <code className="pair-code">{info.pairCode}</code>
          </p>
          <div className="figma-actions">
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard
                  .writeText(info.pairCode)
                  .then(() => setNotice('Code copié.'))
                  .catch(() =>
                    setError('Copie impossible : sélectionnez le code.'),
                  )
              }
            >
              Copier le code
            </button>
            <button
              type="button"
              disabled={!!busy}
              onClick={() =>
                void run('pair', async () => {
                  await request('figma/pair-reset', {});
                  await load();
                  setNotice('Nouveau code : l’ancien ne fonctionne plus.');
                })
              }
            >
              Nouveau code
            </button>
          </div>

          <h4>2 · Import depuis Figma</h4>
          {!info.import ? (
            <p>
              Aucun import. Dans Figma : plugin DS-Studio Bridge &gt;{' '}
              <em>Importer</em>, puis « Actualiser ».
            </p>
          ) : (
            <>
              <p>
                <strong>{info.import.fileName}</strong> ·{' '}
                {when(info.import.date)} · {items.length} élément(s)
              </p>
              {items.length > 0 && (
                <div className="figma-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Figma</th>
                        <th>Valeur</th>
                        <th>Token DS-Studio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, i) => (
                        <tr key={i}>
                          <td>{item.label}</td>
                          <td>
                            {typeof item.value === 'string' &&
                              /^#[0-9a-fA-F]{6}$/.test(item.value) && (
                                <span
                                  className="swatch"
                                  style={{ background: item.value }}
                                />
                              )}
                            {String(item.value)}
                          </td>
                          <td>
                            <select
                              aria-label={`Token pour ${item.label}`}
                              value={mapping[i] ?? ''}
                              onChange={(e) => {
                                const next = [...mapping];
                                next[i] = e.target.value as TokenKey | '';
                                setMapping(next);
                              }}
                            >
                              <option value="">— Ignorer —</option>
                              {tokenKeys
                                .filter((k) =>
                                  compatible(tokens, k, item.value),
                                )
                                .map((k) => (
                                  <option key={k} value={k}>
                                    {k}
                                  </option>
                                ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {duplicate && (
                <p role="alert" className="error">
                  {duplicate.key} est choisi deux fois : gardez une seule
                  source.
                </p>
              )}
              <button
                type="button"
                className="studio-primary"
                disabled={!!busy || !changes.length || !!duplicate}
                onClick={() =>
                  void run('propose', async () => {
                    onProposal(
                      await request<Proposal>('figma/propose', {
                        revision,
                        changes,
                      }),
                    );
                  })
                }
              >
                {changes.length
                  ? `Proposer ${changes.length} changement(s)`
                  : 'Tokens déjà à jour'}
              </button>
              {info.import.images.length > 0 && (
                <>
                  <h4>Composants importés</h4>
                  <div className="figma-gallery">
                    {info.import.images.map((img) => (
                      <figure key={img.id}>
                        <img
                          src={`/api/figma/image/${img.id}`}
                          alt={img.name}
                          loading="lazy"
                        />
                        <figcaption>{img.name}</figcaption>
                      </figure>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          <button type="button" disabled={!!busy} onClick={() => void load()}>
            Actualiser
          </button>

          <h4>3 · Export vers Figma</h4>
          <p>
            Écrans : {SCENARIOS.map((s) => s.label).join(', ')}. Frames natives,
            auto-layout et variables « DS-Studio ».
          </p>
          <fieldset className="figma-widths">
            <legend>Largeurs</legend>
            {WIDTHS.map((w) => (
              <label key={w}>
                <input
                  type="checkbox"
                  checked={widths.includes(w)}
                  onChange={(e) =>
                    setWidths(
                      e.target.checked
                        ? [...widths, w].sort((a, b) => a - b)
                        : widths.filter((x) => x !== w),
                    )
                  }
                />{' '}
                {w} px
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            className="studio-primary"
            disabled={!!busy || !widths.length}
            onClick={() =>
              void run('export', async () => {
                const screens = [];
                for (const s of SCENARIOS)
                  for (const w of widths)
                    screens.push(await captureScreen(s.id, s.label, w, tokens));
                await request('figma/screens', { screens });
                await load();
                setNotice(
                  `${screens.length} écran(s) prêts. Dans Figma : plugin DS-Studio Bridge > Exporter.`,
                );
              })
            }
          >
            {busy === 'export' ? 'Préparation…' : 'Préparer l’export Figma'}
          </button>
          {info.export && (
            <p>
              Dernier export préparé : {when(info.export.date)} ·{' '}
              {info.export.screens.length} écran(s).
            </p>
          )}
        </>
      )}
    </details>
  );
}
